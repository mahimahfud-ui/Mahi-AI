/* ==========================================================================
   Mahi AI — Motion helper (Part A)
   --------------------------------------------------------------------------
   Load BEFORE app.js:  <script src="./motion.js" defer></script>

   This file never touches app logic, state, network or data. It only
   observes the DOM that app.js already produces and sets CSS custom
   properties / classes that motion.css reads. If this file fails to load,
   everything still works — you just lose four refinements:
     1. `.mo-ready`   — shortens the hero replay after first load
     2. `--mo-i`      — staggers messages that are inserted together
     3. `.mo-settle`  — soft settle when streamed text becomes markdown
     4. `.mo-enter`   — one-time entrance for the first conversation list
   ========================================================================== */
(() => {
  "use strict";

  const root = document.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Only the last N messages of a bulk insert animate; the rest are off-screen
  // (app.js scrolls to the bottom), so animating them is wasted work.
  const STAGGER_WINDOW = 6;
  const LIST_STAGGER_MAX = 10;
  // Slightly longer than the longest first-load entrance in motion.css.
  const BOOT_MS = 1500;

  /* 1 ─ Boot flag ───────────────────────────────────────────────────────── */
  const markReady = () => root.classList.add("mo-ready");
  if (reduced.matches) markReady();
  else window.setTimeout(markReady, BOOT_MS);

  if (!("MutationObserver" in window)) return;

  /* 2 ─ Message stagger ─────────────────────────────────────────────────────
     A single new message animates immediately. When several land in the same
     tick (opening a conversation; or the user bubble + "thinking" bubble on
     send) they get ascending --mo-i so they arrive in sequence. */
  const messages = document.getElementById("messages");
  if (messages) {
    new MutationObserver((records) => {
      if (reduced.matches) return;
      const added = [];
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === 1 && node.classList.contains("message")) added.push(node);
        }
      }
      if (added.length < 2) return;
      const cut = Math.max(0, added.length - STAGGER_WINDOW);
      added.forEach((node, index) => {
        if (index < cut) node.dataset.mo = "skip";
        else node.style.setProperty("--mo-i", String(index - cut));
      });
    }).observe(messages, { childList: true });

    /* 3 ─ Streaming → markdown settle ─────────────────────────────────────────
       app.js removes `.streaming-text` from the message body right before it
       swaps in the rendered markdown. Catch that class change and play a short
       fade so the reflow doesn't read as a snap. */
    new MutationObserver((records) => {
      if (reduced.matches) return;
      for (const record of records) {
        const el = record.target;
        if (!(el instanceof HTMLElement) || !el.classList.contains("message-content")) continue;
        const wasStreaming = (record.oldValue || "").split(/\s+/).includes("streaming-text");
        if (!wasStreaming || el.classList.contains("streaming-text")) continue;
        el.classList.remove("mo-settle");
        void el.offsetWidth; // restart the animation if it somehow re-fires
        el.classList.add("mo-settle");
        el.addEventListener("animationend", () => el.classList.remove("mo-settle"), { once: true });
      }
    }).observe(messages, {
      attributes: true,
      attributeFilter: ["class"],
      attributeOldValue: true,
      subtree: true
    });
  }

  /* 4 ─ First conversation-list entrance ────────────────────────────────────
     app.js re-renders the whole list after every reply, so animating on every
     render would replay constantly. Animate once, the first time rows appear. */
  const chatList = document.getElementById("chatList");
  if (chatList) {
    let done = false;
    const listObserver = new MutationObserver(() => {
      if (done) return;
      const rows = Array.from(chatList.children).filter((el) => el.classList.contains("chat-item"));
      if (!rows.length) return; // "Your conversations will appear here." placeholder
      done = true;
      listObserver.disconnect();
      if (reduced.matches) return;
      rows.slice(0, LIST_STAGGER_MAX).forEach((row, index) => {
        row.style.setProperty("--mo-i", String(index));
        row.classList.add("mo-enter");
        row.addEventListener("animationend", () => row.classList.remove("mo-enter"), { once: true });
      });
    });
    listObserver.observe(chatList, { childList: true });
  }
})();
