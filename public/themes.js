/* MahiCloud themes v2: collection + advanced appearance panel (injected into Settings).
   A theme is 3 colours; theme.css derives the rest. Add a theme = add one line to THEMES.
   Saved state: { id, custom?, accent?, fs, radius, fx } in localStorage. */
(() => {
  "use strict";
  const KEY = "mahicloud-theme", root = document.documentElement, HEX = /^#[0-9a-f]{6}$/i;

  /* ---------- 1. COLLECTION: [id, name, mode, background, text, accent] ---------- */
  const THEMES = [
    ["midnight", "Midnight", "dark", "#0f1117", "#e6e8ef", "#8ab4ff"],
    ["graphite", "Graphite", "dark", "#1c1c1e", "#f2f2f7", "#0a84ff"],
    ["ocean",    "Ocean",    "dark", "#0b1d2a", "#e3f2fd", "#4dd0e1"],
    ["forest",   "Forest",   "dark", "#101a14", "#e6f0e8", "#6fcf97"],
    ["sunset",   "Sunset",   "dark", "#1f1416", "#fbeee9", "#ff8a65"],
    ["rose",     "Rose",     "dark", "#1d1218", "#fce8f1", "#f472b6"],
    ["violet",   "Violet",   "dark", "#16121f", "#ece8fa", "#a78bfa"],
    ["paper",    "Paper",    "light", "#fbf8f3", "#2b2723", "#c2410c"],
    ["snow",     "Snow",     "light", "#ffffff", "#1f1f1f", "#2563eb"],
    ["mint",     "Mint",     "light", "#f3faf6", "#16302a", "#10b981"],
    ["lavender", "Lavender", "light", "#f6f3ff", "#2a2340", "#7c3aed"],
    ["peach",    "Peach",    "light", "#fff6f0", "#3a2a22", "#f97316"]
  ].map(([id, name, mode, bg, text, accent]) => ({ id, name, mode, bg, text, accent }));
  const ACCENTS = ["#4f8cff", "#38bdf8", "#22d3ee", "#34d399", "#a78bfa", "#f472b6", "#fb923c", "#facc15"];
  const FS = [["s", "Small"], ["m", "Medium"], ["l", "Large"]], RADII = [["sharp", "Sharp"], ["soft", "Soft"], ["round", "Round"]];

  /* ---------- 2. STATE (always validated, so imported codes can't inject CSS) ---------- */
  const clean = (o) => {
    o = o || {}; const s = { id: "", fs: "m", radius: "soft", fx: true };
    if (o.id === "custom" && o.custom && ["bg", "text", "accent"].every((k) => HEX.test(o.custom[k])))
      { s.id = "custom"; s.custom = { bg: o.custom.bg, text: o.custom.text, accent: o.custom.accent }; }
    else if (THEMES.some((t) => t.id === o.id)) s.id = o.id;
    if (HEX.test(o.accent)) s.accent = o.accent;
    if (FS.some((f) => f[0] === o.fs)) s.fs = o.fs;
    if (RADII.some((r) => r[0] === o.radius)) s.radius = o.radius;
    if (o.fx === false) s.fx = false;
    return s;
  };
  const load = () => { try { return clean(JSON.parse(localStorage.getItem(KEY))); } catch (_) { return clean(); } };
  const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };

  /* ---------- 3. APPLY ---------- */
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16), f = (c) => { c /= 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }; return .2126 * f(n >> 16 & 255) + .7152 * f(n >> 8 & 255) + .0722 * f(n & 255); };
  const resolve = (s) => s.id === "custom" ? { name: "Custom", ...s.custom, mode: lum(s.custom.bg) > .4 ? "light" : "dark" } : THEMES.find((t) => t.id === s.id);
  let prevMode;
  function apply(s) {
    const t = s.id ? resolve(s) : null, meta = document.querySelector('meta[name="theme-color"]'), set = (k, v) => root.style.setProperty(k, v), del = (k) => root.style.removeProperty(k);
    root.dataset.fs = s.fs; root.dataset.radius = s.radius; root.dataset.fx = s.fx ? "on" : "off";
    if (!t) {                                     // Blue Black: Dark/Light switch stays in control
      root.removeAttribute("data-mytheme"); ["--c-bg", "--c-text", "--c-accent"].forEach(del); root.style.colorScheme = "";
      if (prevMode !== undefined) { prevMode ? root.dataset.theme = prevMode : root.removeAttribute("data-theme"); prevMode = undefined; }
      if (s.accent) { set("--accent", s.accent); set("--m-send", s.accent); } else { del("--accent"); del("--m-send"); }
      return;
    }
    del("--accent"); del("--m-send");
    if (prevMode === undefined) prevMode = root.dataset.theme || "";
    root.dataset.mytheme = s.id || "x";
    set("--c-bg", t.bg); set("--c-text", t.text); set("--c-accent", s.accent || t.accent);
    root.style.colorScheme = t.mode; root.dataset.theme = t.mode;
    if (meta) meta.content = t.bg;
  }

  /* ---------- 4. PICKER UI ---------- */
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  let markFn = () => {};

  function build() {
    const panel = document.getElementById("settingsPanel");
    if (!panel || panel.querySelector(".theme-picker")) return;
    let st = load();
    const box = el("section", "theme-picker"), active = el("small", "tp-active");
    box.append(el("h4", "", "Appearance"), active);
    const cards = [], segs = [], dots = [], inputs = {};
    const upd = (patch) => { st = clean({ ...st, ...patch }); save(st); apply(st); mark(); };
    const group = (label, ...kids) => { const g = el("div", "tp-group"); g.append(el("span", "tp-label", label), ...kids); box.append(g); return g; };

    const grid = (list) => {
      const g = el("div", "tp-cards");
      list.forEach(([id, name, bg, tx, ac]) => {
        const b = el("button", "tp-card"); b.type = "button"; b.setAttribute("aria-label", name + " theme");
        b.style.setProperty("--sw-bg", bg); b.style.setProperty("--sw-tx", tx); b.style.setProperty("--sw-ac", ac);
        b.append(el("i", "tp-prev"), el("span", "", name)); b.onclick = () => upd({ id }); cards.push([id, b, name]); g.append(b);
      }); return g;
    };
    const row = (t) => [t.id, t.name, t.bg, t.text, t.accent];
    group("Dark", grid([["", "Blue Black", "#060a14", "#e8eefc", "#4f8cff"], ...THEMES.filter((t) => t.mode === "dark").map(row)]));
    group("Light", grid(THEMES.filter((t) => t.mode === "light").map(row)));

    const dg = el("div", "tp-accents");
    ACCENTS.forEach((c) => { const d = el("button", "tp-dot"); d.type = "button"; d.title = c; d.setAttribute("aria-label", "Accent " + c); d.style.setProperty("--c", c); d.onclick = () => upd({ accent: c }); dots.push([c, d]); dg.append(d); });
    const clr = el("button", "tp-dot tp-clear", "×"); clr.type = "button"; clr.title = "Use the theme's own accent"; clr.setAttribute("aria-label", "Reset accent"); clr.onclick = () => upd({ accent: undefined }); dg.append(clr);
    group("Accent color", dg);

    const cu = el("div", "theme-custom");
    [["bg", "Background"], ["text", "Text"], ["accent", "Accent"]].forEach(([k, label]) => {
      const l = el("label", "", label), i = el("input"); i.type = "color"; inputs[k] = i;
      i.oninput = () => upd({ id: "custom", accent: undefined, custom: { bg: inputs.bg.value, text: inputs.text.value, accent: inputs.accent.value } });
      l.append(i); cu.append(l);
    });
    group("Custom theme", cu);

    const seg = (opts, key) => { const w = el("div", "tp-seg"), bs = opts.map(([v, l]) => { const b = el("button", "", l); b.type = "button"; b.onclick = () => upd({ [key]: v }); w.append(b); return [v, b]; }); segs.push([key, bs]); return w; };
    group("Text size", seg(FS, "fs"));
    group("Corners", seg(RADII, "radius"));

    const sw = el("button", "tp-switch"); sw.type = "button"; sw.setAttribute("role", "switch"); sw.setAttribute("aria-label", "Glow and effects"); sw.onclick = () => upd({ fx: !st.fx });
    const fxRow = group("Glow & effects", sw); fxRow.classList.add("tp-inline");

    const acts = el("div", "tp-actions"), btn = (label, fn) => { const b = el("button", "", label); b.type = "button"; b.onclick = fn; acts.append(b); };
    btn("Copy theme", () => { const j = JSON.stringify(st); (navigator.clipboard ? navigator.clipboard.writeText(j) : Promise.reject()).catch(() => window.prompt("Copy your theme code", j)); });
    btn("Import", () => { const v = window.prompt("Paste a theme code"); if (!v) return; try { st = clean(JSON.parse(v)); save(st); apply(st); mark(); } catch (_) { window.alert("That theme code is not valid."); } });
    btn("Reset", () => { st = clean(); save(st); apply(st); mark(); });
    box.append(acts);

    function mark() {
      cards.forEach(([id, b, n]) => { const on = id === st.id; b.setAttribute("aria-pressed", String(on)); if (on) active.textContent = "Active: " + n; });
      if (st.id === "custom") active.textContent = "Active: Custom";
      dots.forEach(([c, d]) => d.setAttribute("aria-pressed", String(st.accent === c)));
      segs.forEach(([k, bs]) => bs.forEach(([v, b]) => b.setAttribute("aria-pressed", String(st[k] === v))));
      sw.setAttribute("aria-checked", String(st.fx));
      const t = st.id ? resolve(st) : { bg: "#060a14", text: "#e8eefc", accent: "#4f8cff" };
      inputs.bg.value = t.bg; inputs.text.value = t.text; inputs.accent.value = st.accent || t.accent;
    }
    markFn = mark; panel.append(box); mark();
  }

  /* ---------- 5. BOOT ---------- */
  apply(load());                                  // early: no flash of the old theme
  const ready = () => { apply(load()); build(); };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", ready) : ready();
  window.addEventListener("load", () => apply(load()));
  // Using the app's own Dark/Light switch hands control back to it (fixes "button does nothing" with a theme active).
  document.addEventListener("click", (e) => {
    if (!(e.target.closest && e.target.closest("#themeToggle"))) return;
    const s = load(); if (!s.id) return; s.id = ""; delete s.custom; save(s); apply(s); markFn();
  }, true);
})();
