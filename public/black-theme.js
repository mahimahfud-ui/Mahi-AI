/* Permanent MahiCloud dark theme.
   The legacy theme engine remains loaded for text size/corner preferences, but can
   no longer switch the application to a light/custom colour scheme. */
(() => {
  "use strict";
  const root = document.documentElement;
  const THEME_PREF = "mahi-ai-theme";
  const THEME_ENGINE_PREF = "mahicloud-theme";
  const SAFE_THEME_ENGINE_STATE = Object.freeze({ id: "", fs: "m", radius: "soft", fx: true });
  const ROOT_COLOUR_VARS = ["--c-bg", "--c-text", "--c-accent"];

  function forceBlackTheme() {
    try {
      window.localStorage.setItem(THEME_PREF, "dark");
      // Clear saved light/custom palettes across future loads while preserving
      // the existing theme engine's non-colour preferences.
      const current = JSON.parse(window.localStorage.getItem(THEME_ENGINE_PREF) || "{}");
      const safe = {
        id: "",
        fs: ["s", "m", "l"].includes(current.fs) ? current.fs : "m",
        radius: ["sharp", "soft", "round"].includes(current.radius) ? current.radius : "soft",
        fx: current.fx !== false
      };
      window.localStorage.setItem(THEME_ENGINE_PREF, JSON.stringify(safe));
    } catch (_) {
      // Storage may be disabled; the in-memory theme remains locked below.
    }

    root.setAttribute("data-theme", "dark");
    root.removeAttribute("data-mytheme");
    root.style.setProperty("color-scheme", "dark");
    ROOT_COLOUR_VARS.forEach((name) => root.style.removeProperty(name));

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute("content", "#060a14");

    const settingsToggle = document.getElementById("themeToggle");
    if (settingsToggle) {
      settingsToggle.setAttribute("aria-checked", "false");
      settingsToggle.setAttribute("aria-label", "Dark theme is permanently enabled");
      settingsToggle.setAttribute("title", "Dark theme is permanently enabled");
    }
    const settingsLabel = document.getElementById("themeToggleLabel");
    if (settingsLabel) settingsLabel.textContent = "Dark · Always on";

    const quickIndicator = document.getElementById("quickThemeToggle");
    if (quickIndicator) {
      quickIndicator.disabled = true;
      quickIndicator.setAttribute("aria-pressed", "true");
      quickIndicator.setAttribute("aria-label", "Dark theme is permanently enabled");
      quickIndicator.setAttribute("title", "Dark theme is permanently enabled");
      quickIndicator.textContent = "☾";
    }
  }

  // Prevent the old light/dark switch, light/custom palette cards and import/reset
  // theme actions from changing the production colour scheme. Other preference
  // controls (message size, corners and effects) continue to work.
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!target || typeof target.closest !== "function") return;
    const blocked = target.closest(
      "#themeToggle, #quickThemeToggle, .theme-picker .tp-group:nth-of-type(-n+4), .theme-picker .tp-actions"
    );
    if (!blocked) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    forceBlackTheme();
  }, true);

  const observer = new MutationObserver(() => {
    if (
      root.getAttribute("data-theme") !== "dark" ||
      root.hasAttribute("data-mytheme") ||
      root.style.colorScheme !== "dark"
    ) forceBlackTheme();
  });
  observer.observe(root, {
    attributes: true,
    attributeFilter: ["data-theme", "data-mytheme"]
  });

  window.addEventListener("storage", (event) => {
    if (event.key === THEME_PREF || event.key === THEME_ENGINE_PREF) forceBlackTheme();
  });

  document.addEventListener("DOMContentLoaded", forceBlackTheme, { once: true });
  window.addEventListener("load", forceBlackTheme, { once: true });
  forceBlackTheme();
})();
