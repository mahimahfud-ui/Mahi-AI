/* MahiCloud themes: collection + custom-theme picker.
   Install: add  <script src="./themes.js"></script>  in <head> of public/index.html (after config.js).
   Each theme is only 3 colours; theme.css derives the rest. Add a theme = add one line below. */
(() => {
  "use strict";
  const KEY = "mahicloud-theme";
  const root = document.documentElement;

  /* ---------- 1. THEME COLLECTION: [id, name, mode, background, text, accent] ---------- */
  const THEMES = [
    // dark
    ["midnight", "Midnight", "dark", "#0f1117", "#e6e8ef", "#8ab4ff"],
    ["graphite", "Graphite", "dark", "#1c1c1e", "#f2f2f7", "#0a84ff"],
    ["ocean",    "Ocean",    "dark", "#0b1d2a", "#e3f2fd", "#4dd0e1"],
    ["forest",   "Forest",   "dark", "#101a14", "#e6f0e8", "#6fcf97"],
    ["sunset",   "Sunset",   "dark", "#1f1416", "#fbeee9", "#ff8a65"],
    ["rose",     "Rose",     "dark", "#1d1218", "#fce8f1", "#f472b6"],
    ["violet",   "Violet",   "dark", "#16121f", "#ece8fa", "#a78bfa"],
    // light
    ["paper",    "Paper",    "light", "#fbf8f3", "#2b2723", "#c2410c"],
    ["snow",     "Snow",     "light", "#ffffff", "#1f1f1f", "#2563eb"],
    ["mint",     "Mint",     "light", "#f3faf6", "#16302a", "#10b981"],
    ["lavender", "Lavender", "light", "#f6f3ff", "#2a2340", "#7c3aed"],
    ["peach",    "Peach",    "light", "#fff6f0", "#3a2a22", "#f97316"]
  ].map(([id, name, mode, bg, text, accent]) => ({ id, name, mode, bg, text, accent }));

  /* ---------- 2. STORAGE ---------- */
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; } };
  const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };

  /* ---------- 3. APPLY ---------- */
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16), f = (c) => { c /= 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
    return .2126 * f(n >> 16 & 255) + .7152 * f(n >> 8 & 255) + .0722 * f(n & 255);
  };
  let prevMode;
  const resolve = (s) => s.id === "custom" && s.custom ? { ...s.custom, name: "Custom", mode: lum(s.custom.bg) > .4 ? "light" : "dark" } : THEMES.find((t) => t.id === s.id);

  function apply(s) {
    const t = s && s.id ? resolve(s) : null;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!t) {                                   // Default: hand control back to the Dark/Light switch
      root.removeAttribute("data-mytheme");
      ["--c-bg", "--c-text", "--c-accent"].forEach((p) => root.style.removeProperty(p));
      root.style.colorScheme = "";
      if (prevMode !== undefined) { prevMode ? root.dataset.theme = prevMode : root.removeAttribute("data-theme"); prevMode = undefined; }
      return;
    }
    if (prevMode === undefined) prevMode = root.dataset.theme || "";
    root.dataset.mytheme = s.id;
    root.style.setProperty("--c-bg", t.bg);
    root.style.setProperty("--c-text", t.text);
    root.style.setProperty("--c-accent", t.accent);
    root.style.colorScheme = t.mode;
    root.dataset.theme = t.mode;                // keeps older light/dark-specific panels in sync
    if (meta) meta.content = t.bg;
  }

  /* ---------- 4. PICKER UI (injected into Settings panel) ---------- */
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };

  function build() {
    const panel = document.getElementById("settingsPanel");
    if (!panel || panel.querySelector(".theme-picker")) return;
    let state = load();
    const box = el("section", "theme-picker");
    box.append(el("h4", "", "Theme"), el("small", "", "Pick a theme or make your own."));
    const grid = el("div", "theme-grid"), name = el("div", "theme-label");
    const swatches = [];
    const mk = (id, label, bg, ac) => {
      const b = el("button", "theme-swatch"); b.type = "button"; b.title = label; b.setAttribute("aria-label", label + " theme");
      b.style.setProperty("--sw-bg", bg); b.style.setProperty("--sw-ac", ac);
      b.onclick = () => choose(id); swatches.push([id, b]); grid.append(b);
    };
    mk("", "Blue Black", "#060a14", "#4f8cff");
    THEMES.forEach((t) => mk(t.id, t.name, t.bg, t.accent));

    const custom = el("div", "theme-custom"), inputs = {};
    [["bg", "Background"], ["text", "Text"], ["accent", "Accent"]].forEach(([k, label]) => {
      const l = el("label", "", label), i = el("input"); i.type = "color"; i.value = "#212121"; inputs[k] = i;
      i.oninput = () => { state = { id: "custom", custom: { bg: inputs.bg.value, text: inputs.text.value, accent: inputs.accent.value } }; apply(state); save(state); mark(); };
      l.append(i); custom.append(l);
    });

    function mark() {
      const cur = state.id || "";
      swatches.forEach(([id, b]) => b.setAttribute("aria-pressed", String(id === cur)));
      const t = cur ? resolve(state) : null;
      name.replaceChildren("Active: ", Object.assign(el("b"), { textContent: t ? t.name : "Blue Black" }));
      if (t) { inputs.bg.value = t.bg; inputs.text.value = t.text; inputs.accent.value = t.accent; }
    }
    function choose(id) { state = id ? { id } : {}; apply(state); save(state); mark(); }

    box.append(grid, name, custom);
    panel.append(box);
    mark();
  }

  /* ---------- 5. BOOT ---------- */
  const boot = load();
  apply(boot);                                  // early: avoids a flash of the old theme
  const ready = () => { apply(load()); build(); };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", ready) : ready();
  window.addEventListener("load", () => apply(load()));
})();
