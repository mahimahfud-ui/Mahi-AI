/* MahiCloud Settings Hub. Preferences remain local except response defaults sent with chat requests. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const panel = $("settingsPanel");
  const trigger = $("toggleSettings");
  const dialog = panel?.querySelector(".settings-dialog");
  if (!panel || !trigger || !dialog) return;

  const STORAGE_KEY = "mahi-ai-settings-v1";
  const defaults = Object.freeze({
    theme: "system", accent: "terracotta", textSize: "standard", font: "serif",
    contentWidth: "standard", density: "comfortable",
    language: "auto", responseLength: "balanced", tone: "neutral", format: "auto",
    sendOnEnter: true, autoScroll: true, showCharCount: true,
    reduceMotion: false, highContrast: false
  });
  const choices = {
    theme: ["system", "dark", "light"], accent: ["terracotta", "violet", "blue", "green", "rose"],
    textSize: ["small", "standard", "large"], font: ["serif", "sans"],
    contentWidth: ["standard", "wide"], density: ["comfortable", "compact"],
    language: ["auto", "en", "bn"], responseLength: ["concise", "balanced", "detailed"],
    tone: ["neutral", "friendly", "professional", "creative"], format: ["auto", "markdown", "plain"]
  };
  let prefs = loadPrefs();
  let returnFocus = null;
  let priorOverflow = "";
  let statusTimer = null;

  function readStorage(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }
  function writeStorage(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (_) { return false; }
  }
  function loadPrefs() {
    let raw = null;
    const saved = readStorage(STORAGE_KEY);
    try { raw = JSON.parse(saved || "{}"); } catch (_) {}
    // Preserve a theme choice made before this Settings Hub existed.
    if (!saved) {
      const legacyTheme = readStorage("mahi-ai-theme");
      if (legacyTheme === "light" || legacyTheme === "dark") raw = { theme: legacyTheme };
    }
    return normalize(raw);
  }
  function normalize(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const result = { ...defaults };
    for (const [key, allowed] of Object.entries(choices)) {
      if (allowed.includes(source[key])) result[key] = source[key];
    }
    for (const key of ["sendOnEnter", "autoScroll", "showCharCount", "reduceMotion", "highContrast"]) {
      if (typeof source[key] === "boolean") result[key] = source[key];
    }
    return result;
  }
  function savePrefs() {
    const ok = writeStorage(STORAGE_KEY, JSON.stringify(prefs));
    const state = $("settingsSaveState");
    if (state) state.textContent = ok ? "Saved on this device" : "Storage unavailable";
    if ($("settingsStatus")) $("settingsStatus").textContent = ok
      ? "Changes saved on this device."
      : "Browser storage is blocked; these settings may reset when you reload.";
    writeStorage("mahi-ai-theme", prefs.theme);
  }
  function applyPrefs() {
    const systemLight = !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches);
    const effectiveTheme = prefs.theme === "system" ? (systemLight ? "light" : "dark") : prefs.theme;
    root.setAttribute("data-theme", effectiveTheme);
    root.setAttribute("data-theme-mode", prefs.theme);
    root.setAttribute("data-accent", prefs.accent);
    root.setAttribute("data-text-size", prefs.textSize);
    root.setAttribute("data-font", prefs.font);
    root.setAttribute("data-content-width", prefs.contentWidth);
    root.setAttribute("data-density", prefs.density);
    root.setAttribute("data-reduced-motion", String(prefs.reduceMotion));
    root.setAttribute("data-high-contrast", String(prefs.highContrast));
    root.setAttribute("data-char-counter", String(prefs.showCharCount));
  }
  function syncControls() {
    const tabList = panel.querySelector('[role="tablist"]');
    if (tabList) tabList.setAttribute("aria-orientation",
      window.matchMedia && window.matchMedia("(max-width: 760px)").matches ? "horizontal" : "vertical");
    panel.querySelectorAll("[data-pref]").forEach((control) => {
      const key = control.getAttribute("data-pref");
      if (!(key in prefs)) return;
      if (control instanceof HTMLInputElement && control.type === "checkbox") control.checked = !!prefs[key];
      else if (control instanceof HTMLSelectElement || control instanceof HTMLInputElement) control.value = String(prefs[key]);
    });
    panel.querySelectorAll("[data-setting-choice]").forEach((button) => {
      const key = button.getAttribute("data-setting-choice");
      button.setAttribute("aria-pressed", String(prefs[key] === button.getAttribute("data-value")));
    });
    panel.querySelectorAll("[data-settings-tab]").forEach((button) => {
      const active = button.getAttribute("data-settings-tab") === (panel.dataset.activeTab || "general");
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    panel.querySelectorAll("[data-settings-page]").forEach((page) => {
      page.hidden = page.getAttribute("data-settings-page") !== (panel.dataset.activeTab || "general");
    });
  }
  function showTab(name, focusTab) {
    const allowed = [...panel.querySelectorAll("[data-settings-tab]")].map((el) => el.getAttribute("data-settings-tab"));
    panel.dataset.activeTab = allowed.includes(name) ? name : "general";
    syncControls();
    if (focusTab) panel.querySelector('[data-settings-tab="' + panel.dataset.activeTab + '"]')?.focus();
  }
  function announce(message) {
    const status = $("settingsStatus");
    if (status) status.textContent = message;
    const state = $("settingsSaveState");
    if (state) state.textContent = message;
    if (statusTimer) window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => {
      const current = $("settingsSaveState");
      if (current && !panel.hidden) current.textContent = "Saved on this device";
    }, 2400);
  }
  function focusables() {
    return [...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')]
      .filter((el) => !el.hidden && el.getAttribute("aria-hidden") !== "true" && el.getClientRects().length);
  }
  function openSettings() {
    returnFocus = document.activeElement || trigger;
    if (panel.hidden) panel.hidden = false;
    root.classList.add("settings-open");
    priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    trigger.setAttribute("aria-expanded", "true");
    syncControls();
    window.setTimeout(() => {
      const first = focusables().find((el) => el.id === "closeSettings") || focusables()[0];
      first?.focus();
    }, 0);
  }
  function closeSettings() {
    if (panel.hidden) return;
    panel.hidden = true;
    root.classList.remove("settings-open");
    document.body.style.overflow = priorOverflow;
    trigger.setAttribute("aria-expanded", "false");
    if (returnFocus && typeof returnFocus.focus === "function") returnFocus.focus();
    else trigger.focus();
  }
  function applyAndSave(message) {
    applyPrefs();
    savePrefs();
    syncControls();
    if (message) announce(message);
  }

  panel.querySelectorAll("[data-settings-tab]").forEach((button) => {
    button.addEventListener("click", () => showTab(button.getAttribute("data-settings-tab"), false));
    button.addEventListener("keydown", (event) => {
      const horizontal = !!(window.matchMedia && window.matchMedia("(max-width: 760px)").matches);
      const previousKey = horizontal ? "ArrowLeft" : "ArrowUp";
      const nextKey = horizontal ? "ArrowRight" : "ArrowDown";
      if (![previousKey, nextKey, "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...panel.querySelectorAll("[data-settings-tab]")];
      let index = tabs.indexOf(button);
      if (event.key === "Home") index = 0;
      else if (event.key === "End") index = tabs.length - 1;
      else index = (index + (event.key === nextKey ? 1 : -1) + tabs.length) % tabs.length;
      showTab(tabs[index].getAttribute("data-settings-tab"), true);
    });
  });

  panel.addEventListener("change", (event) => {
    const control = event.target;
    if (!(control instanceof HTMLElement) || !control.hasAttribute("data-pref")) return;
    const key = control.getAttribute("data-pref");
    if (!(key in defaults)) return;
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
      prefs[key] = control.checked;
    } else {
      const value = control.value;
      if (choices[key]?.includes(value)) prefs[key] = value;
    }
    applyAndSave("Saved just now");
  });
  panel.querySelectorAll("[data-setting-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-setting-choice");
      const value = button.getAttribute("data-value");
      if (choices[key]?.includes(value)) {
        prefs[key] = value;
        applyAndSave("Saved just now");
      }
    });
  });

  trigger.addEventListener("click", () => {
    window.requestAnimationFrame(() => {
      if (panel.hidden) {
        root.classList.remove("settings-open");
        document.body.style.overflow = priorOverflow;
      } else {
        returnFocus = trigger;
        root.classList.add("settings-open");
        priorOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        syncControls();
        window.setTimeout(() => $("closeSettings")?.focus(), 0);
      }
    });
  });
  panel.querySelectorAll("[data-settings-close]").forEach((element) => {
    element.addEventListener("click", closeSettings);
  });

  document.addEventListener("keydown", (event) => {
    if (!panel.hidden && event.key === "Escape") {
      event.preventDefault();
      closeSettings();
      return;
    }
    if (!panel.hidden && event.key === "Tab") {
      const items = focusables();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "," && panel.hidden) {
      event.preventDefault();
      trigger.click();
    }
  });

  const exportButton = $("exportSettings");
  if (exportButton) exportButton.addEventListener("click", () => {
    const payload = {
      schema: 1,
      exportedAt: new Date().toISOString(),
      preferences: prefs,
      displayName: readStorage("mahi-ai-display-name") || "You"
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "mahicloud-settings.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce("Settings exported as JSON.");
  });

  const importButton = $("importSettings");
  const importFile = $("settingsImportFile");
  if (importButton && importFile) {
    importButton.addEventListener("click", () => importFile.click());
    importFile.addEventListener("change", async () => {
      const file = importFile.files && importFile.files[0];
      importFile.value = "";
      if (!file) return;
      if (file.size > 256000) { announce("That file is too large to be a settings file."); return; }
      try {
        const parsed = JSON.parse(await file.text());
        const source = parsed && parsed.preferences ? parsed.preferences : parsed;
        prefs = normalize(source);
        applyAndSave("Settings imported.");
        if (typeof parsed.displayName === "string" && $("displayNameInput")) {
          const cleanName = parsed.displayName.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 32) || "You";
          $("displayNameInput").value = cleanName;
          $("displayNameForm")?.requestSubmit();
        }
      } catch (_) {
        announce("Could not import that file. Choose a valid MahiCloud settings JSON.");
      }
    });
  }

  const resetButton = $("resetSettings");
  if (resetButton) resetButton.addEventListener("click", () => {
    if (!window.confirm("Restore the default settings on this device? This will not delete chats or your account.")) return;
    prefs = { ...defaults };
    applyAndSave("Default settings restored.");
    if ($("displayNameInput")) {
      $("displayNameInput").value = "You";
      $("displayNameForm")?.requestSubmit();
    }
  });

  if (window.matchMedia) {
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const onSystemTheme = () => { if (prefs.theme === "system") applyPrefs(); };
    if (query.addEventListener) query.addEventListener("change", onSystemTheme);
    else if (query.addListener) query.addListener(onSystemTheme);
  }
  prefs = loadPrefs();
  applyPrefs();
  syncControls();
})();