/* MahiCloud — Claude-style conveniences. Purely additive: reads/enhances the existing DOM,
   never touches app internals. Safe to remove (delete the <script> tag). */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const messages = $("messages"), form = $("chatForm"), input = $("promptInput"), area = $("conversationArea");
  if (!messages || !form || !input) return;

  const ICON = {
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>',
    retry: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>'
  };

  function toast(text) {
    const el = document.createElement("div");
    el.className = "cf-toast"; el.setAttribute("role", "status"); el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1700);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
    try { // fallback for older browsers / insecure contexts
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta);
      ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok;
    } catch (_) { return false; }
  }
  function button(cls, html, label, onClick) {
    const b = document.createElement("button");
    b.type = "button"; b.className = cls; b.innerHTML = html; b.setAttribute("aria-label", label); b.title = label;
    b.addEventListener("click", onClick);
    return b;
  }
  async function flash(btn, original, ok) {
    btn.innerHTML = ok ? ICON.check + "<span>Copied</span>" : original;
    toast(ok ? "Copied to clipboard" : "Copy failed");
    setTimeout(() => { btn.innerHTML = original; }, 1500);
  }

  // Code blocks: language label + copy button
  function enhanceCode(root) {
    root.querySelectorAll(".message-content pre").forEach((pre) => {
      if (pre.dataset.cf || pre.closest(".streaming-text")) return;
      const code = pre.querySelector("code");
      if (!code) return;
      pre.dataset.cf = "1";
      const lang = (code.className.match(/language-([\w+#.-]+)/) || [])[1] || "code";
      const bar = document.createElement("div");
      bar.className = "cf-code-bar"; bar.contentEditable = "false";
      const label = document.createElement("span"); label.textContent = lang;
      const original = ICON.copy + "<span>Copy</span>";
      const copy = button("cf-code-copy", original, "Copy code", async () => flash(copy, original, await copyText(code.innerText)));
      bar.append(label, copy);
      pre.prepend(bar);
    });
  }

  // Per-answer actions: Copy (all answers) + Retry (latest answer only)
  function messageText(content) {
    content.classList.add("cf-copying"); // hides code-bar chrome so it isn't copied
    const text = content.innerText.trim();
    content.classList.remove("cf-copying");
    return text;
  }
  function lastUserText() {
    const users = messages.querySelectorAll(".message.user .message-content");
    return users.length ? users[users.length - 1].innerText.trim() : "";
  }
  function retryLast() {
    const text = lastUserText();
    if (!text || input.disabled) return;
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    form.requestSubmit();
  }
  function enhanceActions() {
    const answers = [...messages.querySelectorAll(".message.assistant:not([data-typing])")];
    answers.forEach((node, i) => {
      const actions = node.querySelector(".message-actions");
      const content = node.querySelector(".message-content");
      if (!actions || !content) return;
      if (!actions.querySelector(".cf-copy")) {
        const original = ICON.copy + "<span>Copy</span>";
        const b = button("cf-act cf-copy", original, "Copy answer", async () => flash(b, original, await copyText(messageText(content))));
        actions.prepend(b);
      }
      actions.querySelector(".cf-retry")?.remove();
      if (i === answers.length - 1) {
        actions.append(button("cf-act cf-retry", ICON.retry + "<span>Retry</span>", "Ask again", retryLast));
      }
    });
  }

  let queued = false;
  function scan() {
    queued = false;
    enhanceCode(messages);
    enhanceActions();
  }
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(scan); } })
    .observe(messages, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-typing", "class"] });
  scan();

  // Scroll-to-bottom button
  if (area) {
    const down = button("cf-scroll-down", ICON.down, "Scroll to latest message", () => area.scrollTo({ top: area.scrollHeight, behavior: "smooth" }));
    document.body.appendChild(down);
    const update = () => down.classList.toggle("show", area.scrollHeight - area.scrollTop - area.clientHeight > 240);
    area.addEventListener("scroll", update, { passive: true });
    new ResizeObserver(update).observe(area);
  }

  // Chat history search (filters the existing list; no data access)
  const list = $("chatList");
  if (list && list.parentElement) {
    const search = document.createElement("input");
    search.type = "search"; search.className = "cf-chat-search"; search.placeholder = "Search chats…";
    search.setAttribute("aria-label", "Search chats");
    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      [...list.children].forEach((el) => { el.hidden = !!q && !el.textContent.toLowerCase().includes(q); });
    });
    list.parentElement.insertBefore(search, list);
  }

  // Keyboard shortcuts: Ctrl/Cmd+Shift+O new chat · "/" focus input · Esc stop generating
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "") || document.activeElement?.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "o") { e.preventDefault(); $("newChat")?.click(); }
    else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); input.focus(); }
    else if (e.key === "Escape" && input.disabled && $("sendButton") && !$("sendButton").disabled) { $("sendButton").click(); }
  });
})();
