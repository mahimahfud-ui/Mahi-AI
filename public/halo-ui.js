/* MahiCloud Halo UI helpers — presentation state only. */
(() => {
  "use strict";
  const shell = document.querySelector(".app-shell");
  const collapseButton = document.getElementById("desktopSidebarToggle");
  const topbarToggle = document.getElementById("openSidebar");
  if (!shell || !collapseButton) return;

  const key = "mahi-ai-sidebar-collapsed";
  const mobile = window.matchMedia("(max-width: 760px)");
  const read = () => {
    try { return window.localStorage.getItem(key) === "1"; } catch (_) { return false; }
  };
  const write = (collapsed) => {
    try { window.localStorage.setItem(key, collapsed ? "1" : "0"); } catch (_) {}
  };
  const sync = () => {
    if (mobile.matches) {
      shell.classList.remove("sidebar-collapsed");
      return;
    }
    shell.classList.toggle("sidebar-collapsed", read());
    if (topbarToggle) topbarToggle.setAttribute("aria-expanded", String(!shell.classList.contains("sidebar-collapsed")));
  };
  collapseButton.addEventListener("click", () => {
    if (mobile.matches) return;
    const collapsed = shell.classList.toggle("sidebar-collapsed");
    write(collapsed);
    if (topbarToggle) topbarToggle.setAttribute("aria-expanded", String(!collapsed));
    collapseButton.setAttribute("aria-label", collapsed ? "Sidebar collapsed" : "Collapse sidebar");
  });
  if (topbarToggle) topbarToggle.addEventListener("click", () => {
    if (mobile.matches) return;
    window.requestAnimationFrame(() => write(shell.classList.contains("sidebar-collapsed")));
  });
  if (mobile.addEventListener) mobile.addEventListener("change", sync);
  else if (mobile.addListener) mobile.addListener(sync);
  sync();
})();
