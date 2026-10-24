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
    t = sub(t, "function sseEvent(controller", block + "\nfunction sseEvent(controller", "insert-block")

    # status message simplification
    t = sub(t, '''          sseEvent(controller, encoder, {
            type: "status",
            message: index === 0
              ? "Thinking\u2026"
              : "The previous model did not pass the check or did not finish. Trying another model\u2026"
          });''', '''          // Model switching stays invisible to the user: one neutral status only.
          if (index === 0) sseEvent(controller, encoder, { type: "status", message: "Thinking\u2026" });''', "status")
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
    # Note: remaining app.js patches continue in full file from pack
    p.write_text(t, encoding="utf-8"); print("app.js partial - use full apply_upgrade from pack")

if __name__ == "__main__":
    patch_backend()
    patch_app()
    print("done")
