/* MahiCloud NEXORA shell interactions. Does not own chat, auth, or provider state. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const shell = $("appShell");
  if (!shell) return;

  const navItems = Array.from(document.querySelectorAll("[data-nx-nav]"));
  const setActive = (name) => navItems.forEach((item) => item.classList.toggle("active", item.dataset.nxNav === name));

  navItems.forEach((item) => item.addEventListener("click", () => {
    const action = item.dataset.nxNav;
    setActive(action);
    if (action === "discover") $("newChat")?.click();
    if (action === "recent") {
      $("chatSearch")?.focus({ preventScroll: true });
      $("chatList")?.scrollTo({ top: 0, behavior: "smooth" });
    }
    if (action === "api") $("openApiExplorer")?.click();
    if (action === "settings") {
      const toggle = $("toggleSettings");
      const panel = $("settingsPanel");
      if (toggle && panel && panel.hidden) toggle.click();
      else if (toggle && panel && !panel.hidden) toggle.click();
    }
  }));

  const toggleDesktopSidebar = () => {
    if (window.matchMedia("(max-width: 760px)").matches) return;
    const collapsed = shell.classList.toggle("sidebar-collapsed");
    const expand = $("desktopSidebarExpand");
    if (expand) expand.setAttribute("aria-expanded", String(!collapsed));
  };
  $("desktopSidebarToggle")?.addEventListener("click", toggleDesktopSidebar);
  $("desktopSidebarExpand")?.addEventListener("click", toggleDesktopSidebar);

  const list = $("chatList"), count = $("nxRecentCount");
  if (list && count) {
    const updateCount = () => {
      const rows = list.querySelectorAll(":scope > .chat-item").length;
      count.textContent = rows ? String(rows) : "";
    };
    new MutationObserver(updateCount).observe(list, { childList: true, subtree: false });
    updateCount();
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!reduceMotion && canHover) {
    document.querySelectorAll(".nx-suggestion-card").forEach((card) => {
      card.addEventListener("pointermove", (event) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--mx", (event.clientX - rect.left) + "px");
        card.style.setProperty("--my", (event.clientY - rect.top) + "px");
      });
    });
  }

  if (window.gsap && !reduceMotion) {
    const gsap = window.gsap;
    gsap.fromTo(".nx-brand-mark", { scale: .72, rotate: -15, opacity: 0 }, { scale: 1, rotate: 0, opacity: 1, duration: .9, ease: "expo.out", delay: .08 });
    gsap.fromTo(".nx-nav-item", { x: -10, opacity: 0 }, { x: 0, opacity: 1, duration: .65, stagger: .055, ease: "expo.out", delay: .12 });
    gsap.fromTo(".nx-topbar", { y: -8, opacity: 0 }, { y: 0, opacity: 1, duration: .75, ease: "expo.out" });
    gsap.fromTo(".nx-composer", { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: .8, ease: "expo.out", delay: .16 });
    const welcome = $(".nx-welcome");
    if (welcome) {
      gsap.fromTo(".nx-eyebrow", { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: .8, ease: "expo.out", delay: .15 });
      gsap.fromTo(".nx-welcome h1", { y: 16, opacity: 0, filter: "blur(5px)" }, { y: 0, opacity: 1, filter: "blur(0px)", duration: .95, ease: "expo.out", delay: .22 });
      gsap.fromTo(".nx-hero-copy", { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: .8, ease: "expo.out", delay: .34 });
      gsap.fromTo(".nx-suggestion-card", { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: .75, stagger: .08, ease: "expo.out", delay: .45 });
    }
  }

  // The app's existing Ctrl/⌘+K shortcut starts a new chat. Keep it intact;
  // this secondary shortcut opens history search without stealing that binding.
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "f") {
      event.preventDefault();
      $("chatSearch")?.focus();
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "o") {
      event.preventDefault();
      $("newChat")?.click();
    }
  });
})();
