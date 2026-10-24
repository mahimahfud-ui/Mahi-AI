/*!
 * Mahi AI · Motion System — Part B (behaviour layer)
 * ---------------------------------------------------------------------
 * Load AFTER app.js:  <script src="./motion-b.js" defer></script>
 *
 * This file never edits app.js, never calls Supabase, and never reads or
 * writes chat data. It watches the DOM that app.js already produces and
 * toggles classes / CSS variables that motion-b.css animates. If this file
 * fails to load, the app works exactly as before.
 *
 * Contents
 *   1. Intelligent auto-scroll + "Jump to latest" pill
 *   2. Message lifecycle hooks (reload stagger, stream → markdown settle)
 *   3. Composer / attachment polish + virtual keyboard handling
 *   4. File dropzone
 *   5. Toasts (window.MahiToast) + offline/online feedback
 *   6. Error-banner ghost text (so it can animate out)
 *   7. Skeletons (chat list, conversation switch, API directory)
 *   8. Mobile drawer: drag-to-close
 */
(() => {
  "use strict";

  const doc = document;
  const root = doc.documentElement;
  const $ = (id) => doc.getElementById(id);

  const area = $("conversationArea");
  const messages = $("messages");
  if (!area || !messages) return;                         // unexpected markup: do nothing

  const mainPanel = doc.querySelector(".main-panel");
  const chatList = $("chatList");
  const banner = $("errorBanner");
  const input = $("promptInput");
  const form = $("chatForm");
  const fileInput = $("fileInput");
  const attachList = $("attachmentList");
  const sidebar = $("sidebar");
  const scrim = $("mobileScrim");

  const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mqCoarse = window.matchMedia("(pointer: coarse)");
  const mqMobile = window.matchMedia("(max-width: 760px)");
  const reduced = () => mqReduce.matches;
  const now = () => performance.now();

  function el(tag, className, html) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  }
  const raf2 = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));

  /* ===================================================================
     1. INTELLIGENT AUTO-SCROLL
     -------------------------------------------------------------------
     app.js calls `area.scrollTop = area.scrollHeight` on every streamed
     chunk. That is a hard yank: it fights anyone who scrolled up to read.
     Instead of editing app.js we shadow `scrollTop` on this ONE element:

       • reader is at the bottom  → we ease toward the bottom (no jitter)
       • reader scrolled up       → request ignored, pill appears instead
       • any other scrollTop write (e.g. our own) passes straight through

     A ResizeObserver also keeps a pinned reader at the bottom when content
     grows without app.js asking (markdown re-render, images, errors).
     =================================================================== */
  const NEAR = 96;                                        // px from bottom that still counts as "at the bottom"
  const nativeTop = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");
  const getTop = () => nativeTop.get.call(area);
  const setTop = (v) => nativeTop.set.call(area, v);
  const maxTop = () => Math.max(0, area.scrollHeight - area.clientHeight);
  const distance = () => maxTop() - getTop();

  let pinned = true;                                      // is the reader following the conversation?
  let unseen = false;                                     // did content arrive while they were scrolled up?
  let rafId = 0;
  let intentAt = 0;
  let bulkUntil = 0;                                      // inside this window, jump instantly (history loads)
  let lastHeight = area.scrollHeight;

  // --- "Jump to latest" pill
  const jump = el("button", "m-jump",
    '<span class="m-jump-dot" aria-hidden="true"></span>' +
    '<span class="m-jump-label">Jump to latest</span>' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6.5 13.5 12 19l5.5-5.5"/></svg>');
  jump.type = "button";
  jump.setAttribute("aria-label", "Jump to latest message");
  jump.tabIndex = -1;
  (mainPanel || doc.body).appendChild(jump);
  const jumpLabel = jump.querySelector(".m-jump-label");

  function updatePill() {
    const show = !pinned && distance() > NEAR * 1.5;
    jump.classList.toggle("is-visible", show);
    jump.classList.toggle("has-new", show && unseen);
    jump.tabIndex = show ? 0 : -1;
    jumpLabel.textContent = unseen ? "New messages" : "Jump to latest";
  }

  function cancelEase() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }

  // Frame-rate independent ease-out: ~20% of the remaining distance per 60Hz frame.
  function ease() {
    if (rafId) return;
    let last = now();
    const tick = (t) => {
      rafId = 0;
      if (!pinned) return;
      const dt = Math.min(48, Math.max(8, t - last));
      last = t;
      const remaining = maxTop() - getTop();
      if (remaining <= 0.5) { setTop(maxTop()); return; }
      const k = 1 - Math.pow(0.8, dt / 16.67);
      setTop(getTop() + Math.max(1, remaining * k));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function stick(instant) {
    pinned = true;
    unseen = false;
    if (instant || reduced()) { cancelEase(); setTop(maxTop()); } else ease();
    updatePill();
  }

  try {
    Object.defineProperty(area, "scrollTop", {
      configurable: true,
      get() { return nativeTop.get.call(this); },
      set(value) {
        const wantsBottom = Number(value) >= maxTop() - 2;
        if (!wantsBottom) { nativeTop.set.call(this, value); return; }
        if (!pinned) { unseen = true; updatePill(); return; }          // reader is reading: don't yank
        if (reduced() || now() < bulkUntil) { cancelEase(); setTop(maxTop()); }
        else ease();
      }
    });
  } catch (_) { /* very old engine: app.js falls back to its own behaviour */ }

  // Any real user input interrupts the ease immediately.
  const userIntent = () => { intentAt = now(); cancelEase(); };
  ["wheel", "touchstart", "pointerdown"].forEach((type) =>
    area.addEventListener(type, userIntent, { passive: true }));
  area.addEventListener("keydown", (e) => {
    if (["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", " "].includes(e.key)) userIntent();
  });

  area.addEventListener("scroll", () => {
    if (rafId && now() - intentAt > 120) return;          // that's our own easing, not the reader
    if (distance() < NEAR) { pinned = true; unseen = false; } else { pinned = false; }
    updatePill();
  }, { passive: true });

  jump.addEventListener("click", () => { stick(false); input && input.focus({ preventScroll: true }); });

  // Sending always re-pins: you just spoke, you want to see the reply.
  if (form) form.addEventListener("submit", () => stick(false), true);
  if (input) input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) stick(false);
  }, true);

  // Content growth (stream, markdown swap, images, banner) / viewport changes.
  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver((entries) => {
      const resizedArea = entries.some((e) => e.target === area);
      const h = area.scrollHeight;
      if (resizedArea && pinned) setTop(maxTop());        // keyboard / composer growth: stay put, no easing
      else if (h > lastHeight) {
        if (pinned) ease(); else { unseen = true; updatePill(); }
      }
      lastHeight = h;
    });
    ro.observe(area);
    ro.observe(messages);
    if (banner) ro.observe(banner);
  }

  /* ===================================================================
     2. MESSAGE LIFECYCLE
     =================================================================== */
  // 2a. Whole-conversation reloads get a quiet fade (not 200 slide-ins).
  new MutationObserver((records) => {
    const added = [];
    let removed = 0;
    records.forEach((r) => {
      removed += r.removedNodes.length;
      r.addedNodes.forEach((n) => { if (n.nodeType === 1 && n.classList.contains("message")) added.push(n); });
    });
    if (added.length >= 3 || (removed > 0 && added.length > 0)) {
      const tail = Math.max(0, added.length - 6);          // only the last few (the visible ones) stagger
      added.forEach((n, i) => { n.classList.add("is-bulk"); n.style.setProperty("--i", Math.max(0, i - tail)); });
      bulkUntil = now() + 700;
      pinned = true;
      raf2(() => stick(true));
    }
    if (records.length) hideSwitchSkeleton();
  }).observe(messages, { childList: true });

  // 2b. app.js deletes data-typing when the stream finishes and markdown renders.
  new MutationObserver((records) => {
    records.forEach((r) => {
      const node = r.target;
      if (!(node instanceof Element) || node.hasAttribute("data-typing") || !node.classList.contains("message")) return;
      node.classList.add("is-settling");
      node.addEventListener("animationend", function done(e) {
        if (e.target !== node.querySelector(".message-content")) return;
        node.classList.remove("is-settling");
        node.removeEventListener("animationend", done);
      });
      setTimeout(() => node.classList.remove("is-settling"), 800);   // safety net (reduced motion = no animationend)
    });
  }).observe(messages, { attributes: true, subtree: true, attributeFilter: ["data-typing"] });

  /* ===================================================================
     3. COMPOSER, ATTACHMENTS, VIRTUAL KEYBOARD
     =================================================================== */
  // 3a. Keep the pill clear of the composer whatever its height.
  const composerWrap = doc.querySelector(".composer-wrap");
  if (composerWrap && "ResizeObserver" in window) {
    new ResizeObserver(() => root.style.setProperty("--composer-h", composerWrap.offsetHeight + "px"))
      .observe(composerWrap);
  }

  // 3b. Chips pop in once; re-renders (add/remove another file) don't replay them.
  if (attachList) {
    let previous = new Set();
    new MutationObserver(() => {
      const keys = new Set();
      attachList.querySelectorAll(".attachment-chip").forEach((chip) => {
        const key = (chip.querySelector(".attachment-chip-name") || {}).textContent + "|" +
                    (chip.querySelector(".attachment-chip-size") || {}).textContent;
        keys.add(key);
        if (previous.has(key)) chip.classList.add("is-seen");
      });
      previous = keys;
    }).observe(attachList, { childList: true });
  }

  // 3c. Virtual keyboard. app.js already tracks --app-height; we add:
  //     • stay pinned to the latest message as the viewport resizes
  //     • collapse the footer note while the keyboard is up
  //     • undo iOS "scroll the page to reveal the input" (body is overflow:hidden)
  const vv = window.visualViewport;
  if (vv) {
    let tallest = vv.height;
    const syncKeyboard = () => {
      tallest = Math.max(tallest, vv.height);
      const open = mqCoarse.matches && vv.height < tallest - 120;
      if (open) root.setAttribute("data-keyboard", "open"); else root.removeAttribute("data-keyboard");
    };
    vv.addEventListener("resize", () => {
      syncKeyboard();
      if (pinned) raf2(() => { setTop(maxTop()); updatePill(); });
    }, { passive: true });
    vv.addEventListener("scroll", () => {
      if (mqCoarse.matches && (window.scrollX || window.scrollY)) window.scrollTo(0, 0);
    }, { passive: true });
    window.addEventListener("orientationchange", () => { tallest = 0; setTimeout(syncKeyboard, 350); });
  }

  /* ===================================================================
     4. FILE DROPZONE
     -------------------------------------------------------------------
     Dropped files are handed to the app's EXISTING file input (same
     validation, same limits, same chips) by setting input.files and
     firing its normal `change` event. No upload logic lives here.
     =================================================================== */
  const dropzone = el("div", "m-dropzone",
    '<div class="m-dropzone-frame"></div>' +
    '<div class="m-dropzone-card">' +
      '<div class="m-dropzone-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/></svg></div>' +
      '<strong>Drop to attach</strong><span>Up to 5 files · 15 MB each</span>' +
    '</div>');
  dropzone.setAttribute("aria-hidden", "true");
  (mainPanel || doc.body).appendChild(dropzone);
  const dropTitle = dropzone.querySelector("strong");
  const dropSub = dropzone.querySelector("span");

  const hasFiles = (e) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf("Files") !== -1;
  const modalOpen = () => { const m = $("apiExplorer"); return !!m && !m.hidden; };
  const locked = () => !fileInput || fileInput.disabled;
  let dragDepth = 0;

  function setDragging(on) {
    if (on) {
      const isLocked = locked();
      dropzone.classList.toggle("is-rejected", isLocked);
      dropTitle.textContent = isLocked ? "Finish the current reply first" : "Drop to attach";
      dropSub.textContent = isLocked ? "You can attach files once Mahi AI is done" : "Up to 5 files · 15 MB each";
      dropzone.classList.add("is-active");
      root.setAttribute("data-m-drag", "");
    } else {
      dragDepth = 0;
      dropzone.classList.remove("is-active");
      root.removeAttribute("data-m-drag");
    }
  }

  function receiveFiles(files) {
    try {
      const transfer = new DataTransfer();
      files.forEach((f) => transfer.items.add(f));
      fileInput.files = transfer.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      const composer = doc.querySelector(".composer");
      if (composer && !reduced()) {
        composer.classList.remove("m-received");
        void composer.offsetWidth;                         // restart the pulse
        composer.classList.add("m-received");
        composer.addEventListener("animationend", () => composer.classList.remove("m-received"), { once: true });
      }
    } catch (_) {
      toast({ type: "info", message: "Drag and drop isn’t supported here. Use the Attach button instead." });
    }
  }

  doc.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (modalOpen()) return;
    if (++dragDepth === 1) setDragging(true);
  });
  doc.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();                                    // required, or the browser opens the file
    e.dataTransfer.dropEffect = locked() || modalOpen() ? "none" : "copy";
  });
  doc.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0 || e.relatedTarget === null) setDragging(false);
  });
  doc.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    setDragging(false);
    if (!files.length || modalOpen() || locked()) return;
    receiveFiles(files);
  });
  window.addEventListener("blur", () => setDragging(false));
  doc.addEventListener("dragend", () => setDragging(false));

  /* ===================================================================
     5. TOASTS   window.MahiToast.success|error|info("message")
     =================================================================== */
  const toastRoot = el("div", "m-toasts");
  doc.body.appendChild(toastRoot);
  const ICONS = {
    success: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    error:   '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v6M12 17h.01"/></svg>',
    info:    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 11v6M12 7h.01"/></svg>'
  };
  const MAX_TOASTS = 3;

  function toast(options) {
    const opts = options || {};
    const type = ICONS[opts.type] ? opts.type : "info";
    const duration = Math.max(1500, opts.duration || (type === "error" ? 6500 : 4200));

    const node = el("div", "m-toast");
    node.dataset.type = type;
    node.setAttribute("role", type === "error" ? "alert" : "status");
    node.style.setProperty("--dur", duration + "ms");
    node.innerHTML =
      '<span class="m-toast-icon">' + ICONS[type] + '</span>' +
      '<span class="m-toast-msg"></span>' +
      '<button type="button" class="m-toast-close" aria-label="Dismiss notification">×</button>' +
      '<span class="m-toast-bar" aria-hidden="true"></span>';
    node.querySelector(".m-toast-msg").textContent = String(opts.message || "");

    let remaining = duration, startedAt = Date.now(), timer = 0, closed = false;
    const arm = () => { startedAt = Date.now(); timer = setTimeout(close, remaining); };
    const pause = () => { if (closed) return; clearTimeout(timer); remaining -= Date.now() - startedAt; node.classList.add("is-paused"); };
    const resume = () => { if (closed) return; node.classList.remove("is-paused"); arm(); };

    function close() {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      node.style.setProperty("--h", node.offsetHeight + "px");
      node.classList.add("is-leaving");
      const remove = () => node.remove();
      node.addEventListener("animationend", remove, { once: true });
      setTimeout(remove, 450);                             // safety net
    }

    node.addEventListener("mouseenter", pause);
    node.addEventListener("mouseleave", resume);
    node.addEventListener("focusin", pause);
    node.addEventListener("focusout", resume);
    node.querySelector(".m-toast-close").addEventListener("click", close);

    // Oldest toast leaves when a fourth arrives.
    const live = toastRoot.querySelectorAll(".m-toast:not(.is-leaving)");
    if (live.length >= MAX_TOASTS) live[0].querySelector(".m-toast-close").click();

    toastRoot.appendChild(node);
    arm();
    return { close };
  }

  window.MahiToast = {
    show: toast,
    success: (message, o) => toast(Object.assign({ type: "success", message }, o)),
    error:   (message, o) => toast(Object.assign({ type: "error", message }, o)),
    info:    (message, o) => toast(Object.assign({ type: "info", message }, o))
  };

  // Real signals the browser already gives us.
  window.addEventListener("offline", () => window.MahiToast.error("You’re offline. Check your connection."));
  window.addEventListener("online", () => window.MahiToast.success("Back online."));

  /* ===================================================================
     6. ERROR BANNER — keep the last message while it animates away
     =================================================================== */
  if (banner) {
    new MutationObserver(() => {
      const text = banner.textContent;
      if (text) banner.dataset.ghost = text;               // CSS paints this inside the [hidden] state
      if (!banner.hidden && text) {                        // a real error: nothing is loading any more
        const sk = chatList && chatList.querySelector(".chat-skeleton");
        if (sk) sk.remove();
        hideSwitchSkeleton();
      }
    }).observe(banner, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  }

  /* ===================================================================
     7. SKELETONS
     =================================================================== */
  // 7a. Sidebar: skeleton markup lives in index.html and is replaced by the
  //     app's own render. Safety net so it can never spin forever.
  if (chatList) {
    setTimeout(() => { const sk = chatList.querySelector(".chat-skeleton"); if (sk) sk.remove(); }, 12000);

    // Rows slide in once; the refresh after every reply doesn't replay them.
    let seen = new Set();
    new MutationObserver(() => {
      const keys = new Set();
      let order = 0;
      chatList.querySelectorAll(":scope > .chat-item").forEach((row) => {
        const title = row.querySelector(".chat-title");
        const key = title ? title.textContent : "";
        keys.add(key);
        if (!seen.has(key)) { row.classList.add("is-entering"); row.style.setProperty("--i", order++); }
      });
      seen = keys;
      stopRefreshSpin();
    }).observe(chatList, { childList: true });
  }

  // 7b. Refresh button spins until the list actually re-renders.
  const refreshBtn = $("refreshChats");
  let spinSince = 0, spinTimer = 0;
  function stopRefreshSpin() {
    if (!refreshBtn || !spinSince) return;
    const wait = Math.max(0, 600 - (now() - spinSince));
    setTimeout(() => refreshBtn.classList.remove("is-spinning"), wait);
    spinSince = 0;
    clearTimeout(spinTimer);
  }
  if (refreshBtn) refreshBtn.addEventListener("click", () => {
    if (reduced()) return;
    refreshBtn.classList.add("is-spinning");
    spinSince = now();
    clearTimeout(spinTimer);
    spinTimer = setTimeout(() => { spinSince = now() - 1000; stopRefreshSpin(); }, 4000);
  });

  // 7c. Conversation switch: skeleton bubbles cover the old thread only if
  //     loading takes longer than ~140ms (CSS delay), then fade out.
  let switchSkeleton = null, switchShownAt = 0, switchTimer = 0;
  function skeletonMessages() {
    const widths = [["62%", "88%", "46%"], ["38%", "72%"], ["70%", "92%", "84%", "40%"]];
    const wrap = el("div", "m-msg-skeleton");
    wrap.setAttribute("role", "status");
    const inner = el("div", "m-msg-skeleton-inner");
    inner.appendChild(el("span", "sr-only", "Loading conversation…"));
    widths.forEach((rows) => {
      const msg = el("div", "skel-msg");
      msg.setAttribute("aria-hidden", "true");
      msg.appendChild(el("span", "skel skel-avatar"));
      const lines = el("div", "skel-lines");
      lines.appendChild(el("span", "skel h"));
      rows.forEach((w) => { const l = el("span", "skel"); l.style.width = w; lines.appendChild(l); });
      msg.appendChild(lines);
      inner.appendChild(msg);
    });
    wrap.appendChild(inner);
    return wrap;
  }
  function showSwitchSkeleton() {
    if (switchSkeleton) return;
    switchSkeleton = skeletonMessages();
    switchShownAt = now();
    switchSkeleton.style.top = getTop() + "px";            // overlay follows the current scroll offset
    switchSkeleton.style.height = area.clientHeight + "px";
    area.classList.add("is-switching");
    area.appendChild(switchSkeleton);
    clearTimeout(switchTimer);
    switchTimer = setTimeout(hideSwitchSkeleton, 8000);    // never get stuck
  }
  function hideSwitchSkeleton() {
    if (!switchSkeleton) return;
    const node = switchSkeleton;
    switchSkeleton = null;
    clearTimeout(switchTimer);
    area.classList.remove("is-switching");
    if (now() - switchShownAt < 150) { node.remove(); return; }   // it never became visible
    node.classList.add("is-leaving");
    node.addEventListener("animationend", () => node.remove(), { once: true });
    setTimeout(() => node.remove(), 400);
  }
  if (chatList) chatList.addEventListener("click", (e) => {
    const open = e.target.closest("button.chat-item");
    if (!open || e.target.closest(".delete-chat")) return;
    if (input && input.disabled) return;                   // app ignores switches while a reply is streaming
    showSwitchSkeleton();
  }, true);

  // 7d. API directory skeleton while the catalogue loads.
  const apiStatus = $("apiExplorerStatus");
  const apiResults = $("apiExplorerResults");
  const apiBody = doc.querySelector(".api-explorer-body");
  if (apiStatus && apiResults && apiBody) {
    const grid = el("div", "api-skel-grid");
    grid.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 6; i++) {
      grid.appendChild(el("div", "api-skel-card",
        '<span class="skel h"></span><span class="skel" style="width:92%"></span>' +
        '<span class="skel" style="width:70%"></span><span class="skel b"></span>'));
    }
    apiBody.insertBefore(grid, apiResults);
    const sync = () => grid.classList.toggle("is-on", /^\s*loading/i.test(apiStatus.textContent || ""));
    new MutationObserver(sync).observe(apiStatus, { childList: true, characterData: true, subtree: true });
    sync();
  }

  /* ===================================================================
     8. MOBILE DRAWER — drag left to close
     -------------------------------------------------------------------
     The finger moves the drawer directly. On release we clear the inline
     transform so the CSS transition carries it the rest of the way, and
     "close" is performed by clicking the app's own close button.
     =================================================================== */
  if (sidebar) {
    const closeBtn = $("closeSidebar");
    let startX = 0, startY = 0, dx = 0, width = 0, axis = null, tracking = false;

    sidebar.addEventListener("touchstart", (e) => {
      if (!mqMobile.matches || !sidebar.classList.contains("open") || e.touches.length !== 1) return;
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      dx = 0; axis = null; tracking = true; width = sidebar.offsetWidth;
    }, { passive: true });

    sidebar.addEventListener("touchmove", (e) => {
      if (!tracking) return;
      const t = e.touches[0];
      dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (!axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) axis = (dx < 0 && Math.abs(dx) > Math.abs(dy) * 1.2) ? "x" : "y";
      if (axis !== "x") return;
      sidebar.classList.add("is-dragging");
      const offset = Math.min(0, dx);
      sidebar.style.transform = "translate3d(" + offset + "px,0,0)";
      if (scrim) { scrim.style.transition = "none"; scrim.style.opacity = String(Math.max(0, 1 + offset / width)); }
    }, { passive: true });

    const release = () => {
      if (!tracking) return;
      tracking = false;
      if (axis !== "x") return;
      const shouldClose = dx < -width * 0.3;
      sidebar.classList.remove("is-dragging");
      sidebar.style.transform = "";
      if (scrim) { scrim.style.transition = ""; scrim.style.opacity = ""; }
      if (shouldClose && closeBtn) closeBtn.click();
    };
    sidebar.addEventListener("touchend", release, { passive: true });
    sidebar.addEventListener("touchcancel", release, { passive: true });
  }

  // Initial state
  updatePill();
  window.MahiMotion = { scrollToLatest: () => stick(false), toast };
})();
