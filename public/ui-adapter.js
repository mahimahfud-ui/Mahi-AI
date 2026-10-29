/* Small presentation adapter: reuse the existing persisted theme action. */
(() => {
  "use strict";
  const quickTheme = document.getElementById("quickThemeToggle");
  const existingThemeToggle = document.getElementById("themeToggle");
  const chatTitle = document.getElementById("chatTitle");
  const chatList = document.getElementById("chatList");
  if (!quickTheme || !existingThemeToggle) return;

  const syncChatTitle = () => {
    if (!chatTitle || !chatList) return;
    const activeTitle = chatList.querySelector(".chat-item.active .chat-title");
    const value = activeTitle && activeTitle.textContent.trim();
    chatTitle.textContent = value || "MahiCloud";
    chatTitle.title = value || "MahiCloud";
  };

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
  if (chatList) {
    new MutationObserver(syncChatTitle).observe(chatList, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }
  syncThemeControl();
  syncChatTitle();
})();
