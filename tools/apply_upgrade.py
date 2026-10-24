#!/usr/bin/env python3
"""Applies the MahiCloud engine + UI upgrade as exact, assertion-checked edits.
Idempotent: files that already contain the upgrade marker are left alone."""
import pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MARK_TS = "MahiCloud upgrade: hedged streaming"
MARK_JS = "__mahiAbort"
MARK_HTML = "claude-features.js"

def sub(text, old, new, label):
    n = text.count(old)
    if n != 1:
        sys.exit(f"[{label}] expected exactly 1 match, found {n}")
    return text.replace(old, new, 1)

def patch_backend():
    p = ROOT / "supabase/functions/mahi-ai-chat/index.ts"
    t = p.read_text(encoding="utf-8")
    if MARK_TS in t:
        print("backend already patched"); return
    block = (ROOT / "tools/backend_block.ts").read_text(encoding="utf-8")

    # 1) insert the new helpers right before sseEvent()
    t = sub(t, "function sseEvent(controller: ReadableStreamDefaultController<Uint8Array>",
            block + "function sseEvent(controller: ReadableStreamDefaultController<Uint8Array>", "insert-block")

    # 2) persistent health hooks
    t = sub(t, "function recordProviderOutcome(name: string, success: boolean, elapsedMs: number): void {\n  const previous = providerHealth.get(name);",
            "function recordProviderOutcome(name: string, success: boolean, elapsedMs: number): void {\n  recordProviderOutcomeLocal(name, success, elapsedMs);\n  schedulePersistProvider(name);\n}\n\nfunction recordProviderOutcomeLocal(name: string, success: boolean, elapsedMs: number): void {\n  const previous = providerHealth.get(name);", "health-record")
    t = sub(t, "  if (delay) providerCooldownUntil.set(name, Date.now() + delay);\n}",
            "  if (delay) {\n    providerCooldownUntil.set(name, Date.now() + delay);\n    schedulePersistProvider(name, reason);\n  }\n}", "health-failure")
    t = sub(t, "function rememberProviderSuccess(name: string): void {\n  providerCooldownUntil.delete(name);\n}",
            "function rememberProviderSuccess(name: string): void {\n  if (providerCooldownUntil.delete(name)) schedulePersistProvider(name);\n}", "health-success")
    t = sub(t, "  const available = providerOrder(task, hasInlineAttachments, hasInlineImages, displayUserText);",
            "  await ensureProviderHealthLoaded();\n  const available = providerOrder(task, hasInlineAttachments, hasInlineImages, displayUserText);", "health-load")

    # 3) smart classifier
    t = sub(t, "    : classifyTask(displayPrompt);\n  let conversationId",
            "    : await classifyTaskSmart(displayPrompt);\n  let conversationId", "smart-classify")

    # 4) hedged loop
    t = sub(t, "      const failures: string[] = [];\n      let chosen:",
            "      const failures: string[] = [];\n      const hedgeUsed = new Set<string>();\n      let chosen:", "hedge-set")
    t = sub(t, "        for (let index = 0; index < available.length; index++) {\n          if (cancelled) return;\n",
            "        for (let index = 0; index < available.length; index++) {\n          if (cancelled) return;\n          if (hedgeUsed.has(available[index])) continue;\n", "hedge-skip")
    t = sub(t, "          const provider = available[index];", "          let provider = available[index];", "provider-let")
    t = sub(t, '''          sseEvent(controller, encoder, {
            type: "status",
            message: index === 0
              ? task === "web_research" ? "Checking live web sources and linked pages…"
                : task === "code_execution" ? "Checking the calculation with a computation tool…"
                : "Finding a model that can complete your request…"
              : "The previous model did not pass the check or did not finish. Trying another model…"
          });''', '''          // Model switching stays invisible to the user: one neutral status only.
          if (index === 0) sseEvent(controller, encoder, { type: "status", message: "Thinking…" });''', "status")
    t = sub(t, "            candidate = await startProviderStream(provider, messages, task, attachments, providerBudget);\n            activeCandidate = candidate;",
            "            candidate = await startHedgedStream(available, index, hedgeUsed, messages, task, attachments, providerBudget, taskNeedsLongToolExecution);\n            provider = candidate.provider;\n            activeCandidate = candidate;", "hedge-start")
    p.write_text(t, encoding="utf-8"); print("backend patched")

def patch_app():
    p = ROOT / "public/app.js"
    t = p.read_text(encoding="utf-8")
    if MARK_JS in t:
        print("app.js already patched"); return
    t = sub(t, "    ui.send.disabled = value || (!ui.input.value.trim() && !pendingFiles.length);",
            "    // While busy the send button doubles as a working Stop button.\n    ui.send.disabled = value ? false : (!ui.input.value.trim() && !pendingFiles.length);\n    ui.send.setAttribute(\"aria-label\", value ? \"Stop generating\" : \"Send message\");\n    ui.send.title = value ? \"Stop generating\" : \"Send message\";", "setBusy")
    t = sub(t, "    setBusy(true);\n    let uploadedAttachments = [];",
            "    window.__mahiStopped = false;\n    window.__mahiAbort = new AbortController();\n    setBusy(true);\n    let uploadedAttachments = [];", "abort-init")
    t = sub(t, 'const response = await fetch(cfg.supabaseUrl + "/functions/v1/mahi-ai-chat", {\n        method: "POST",',
            'const response = await fetch(cfg.supabaseUrl + "/functions/v1/mahi-ai-chat", {\n        method: "POST",\n        signal: window.__mahiAbort.signal,', "fetch-signal")
    t = sub(t, "    } catch (error) {\n      if (responseCompleted) {",
            '''    } catch (error) {
      if (window.__mahiStopped && !responseCompleted) {
        // The user pressed Stop: keep whatever text already arrived, or restore the draft.
        window.__mahiStopped = false;
        const stoppedContent = typing.querySelector(".message-content");
        if (fullText.trim() && stoppedContent) {
          fullText = fullText.replace(/\\s*\\[\\[MAHI_LANG:[\\s\\S]*$/i, "").trim();
          stoppedContent.classList.remove("streaming-text");
          stoppedContent.innerHTML = safeMarkdown(fullText);
          delete typing.dataset.typing;
          addSpeechActions(typing, fullText);
          currentMessages.push({ role: "assistant", content: fullText });
        } else {
          typing.remove();
          currentMessages.pop();
          ui.input.value = userText;
          updateCounter();
        }
        return;
      }
      if (responseCompleted) {''', "abort-catch")
    t = sub(t, "    event.preventDefault();\n    sendMessage(ui.input.value);\n  });",
            "    event.preventDefault();\n    if (busy) {\n      window.__mahiStopped = true;\n      try { window.__mahiAbort.abort(); } catch (_) {}\n      return;\n    }\n    sendMessage(ui.input.value);\n  });", "submit-stop")
    p.write_text(t, encoding="utf-8"); print("app.js patched")

def patch_html():
    p = ROOT / "public/index.html"
    t = p.read_text(encoding="utf-8")
    if MARK_HTML in t:
        print("index.html already patched"); return
    t = sub(t, '  <link rel="stylesheet" href="./ui-overrides.css">',
            '  <link rel="stylesheet" href="./ui-overrides.css">\n  <link rel="stylesheet" href="./claude-ui.css">', "html-css")
    t = sub(t, '  <script src="./motion-b.js" defer></script>',
            '  <script src="./motion-b.js" defer></script>\n  <script src="./claude-features.js" defer></script>', "html-js")
    p.write_text(t, encoding="utf-8"); print("index.html patched")

if __name__ == "__main__":
    patch_backend(); patch_app(); patch_html()
