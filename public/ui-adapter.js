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
    quickTheme.textContent = "☾";
    quickTheme.disabled = true;
    quickTheme.setAttribute("aria-pressed", "true");
    quickTheme.setAttribute("aria-label", "Dark theme is permanently enabled");
    quickTheme.setAttribute("title", "Dark theme is permanently enabled");
  };

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
