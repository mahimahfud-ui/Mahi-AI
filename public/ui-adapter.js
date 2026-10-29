/* Small presentation adapter: reuse the existing persisted theme action. */
(() => {
  "use strict";
  const quickTheme = document.getElementById("quickThemeToggle");
  const existingThemeToggle = document.getElementById("themeToggle");
  if (!quickTheme || !existingThemeToggle) return;

  const syncThemeControl = () => {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    quickTheme.textContent = isLight ? "☼" : "◐";
    quickTheme.setAttribute("aria-pressed", String(isLight));
    quickTheme.setAttribute("aria-label", isLight ? "Switch to dark appearance" : "Switch to light appearance");
    quickTheme.setAttribute("title", isLight ? "Switch to dark appearance" : "Switch to light appearance");
  };

  quickTheme.addEventListener("click", () => existingThemeToggle.click());
  new MutationObserver(syncThemeControl).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"]
  });
  syncThemeControl();
})();
