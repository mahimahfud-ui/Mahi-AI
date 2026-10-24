/* MahiCloud layout v2: rearranges existing elements (no markup changes needed).
   Install: add  <script src="./layout.js"></script>  in <head> of public/index.html, next to themes.js.
   1) Instagram + WhatsApp -> icons next to the brand title
   2) MD / JSON / Temporary / Account -> one collapsible menu (top-right)
   3) Settings -> icon-only, bottom-left, on the profile row */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const make = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };

  function socialToBrand() {
    const brand = $("#sidebar .brand-row"), links = [...document.querySelectorAll(".sidebar-social .social-link")];
    if (!brand || !links.length || $(".brand-social")) return;
    const wrap = make("div", "brand-social");
    links.forEach((a) => { const label = a.querySelector("span"); a.title = label ? label.textContent.trim() : "Link"; });
    wrap.append(...links);
    brand.insertBefore(wrap, $(".mobile-close", brand));   // null -> appended at the end
  }

  function toolMenu() {
    const right = $(".topbar-right");
    const tools = ["#exportMarkdownButton", "#exportJsonButton", "#temporaryChatButton", "#accountButton"].map((s) => $(s)).filter(Boolean);
    if (!right || !tools.length || $(".tool-menu")) return;
    const menu = make("div", "tool-menu"), tray = make("div", "tool-tray"), btn = make("button", "tool-toggle");
    btn.type = "button"; btn.title = "Menu"; btn.setAttribute("aria-label", "Open tools menu");
    btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-controls", "toolTray");
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
    tray.id = "toolTray"; tray.inert = true; tray.append(...tools);
    menu.append(btn, tray); right.append(menu);
    const set = (open) => { menu.classList.toggle("open", open); btn.setAttribute("aria-expanded", String(open)); tray.inert = !open; };
    btn.addEventListener("click", () => set(true));
    document.addEventListener("pointerdown", (e) => { if (menu.classList.contains("open") && !menu.contains(e.target)) set(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") set(false); });
  }

  function settingsToProfile() {
    const box = $(".sidebar-settings"), row = $(".profile-row");
    if (box && row && !row.contains(box)) row.append(box);
    const t = $("#toggleSettings");
    if (t) { t.title = "Settings & preferences"; t.setAttribute("aria-label", "Settings & preferences"); }
  }

  function settingsPopover() {            // close Settings on outside click / Esc
    const t = $("#toggleSettings"), p = $("#settingsPanel");
    if (!t || !p) return;
    const close = () => { if (!p.hidden) { p.hidden = true; t.setAttribute("aria-expanded", "false"); } };
    document.addEventListener("pointerdown", (e) => { if (!p.hidden && !p.contains(e.target) && !t.contains(e.target)) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  }

  function fixButtons() {                 // buttons outside forms default to type=button (no accidental submits)
    document.querySelectorAll("button:not([type])").forEach((b) => { if (!b.closest("form")) b.type = "button"; });
  }

  const init = () => { socialToBrand(); toolMenu(); settingsToProfile(); settingsPopover(); fixButtons(); };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
