(() => {
  "use strict";
  const panels = new WeakMap();
  function ensurePanel(host) {
    let state = panels.get(host);
    if (state) return state;
    const panel = document.createElement("section");
    panel.className = "mahi-steps is-open";
    const header = document.createElement("button");
    header.type = "button";
    header.className = "mahi-steps-head";
    header.setAttribute("aria-expanded", "true");
    const spinner = document.createElement("span");
    spinner.className = "mahi-steps-spin";
    const title = document.createElement("span");
    title.className = "mahi-steps-title";
    title.textContent = "Working…";
    const caret = document.createElement("span");
    caret.textContent = "▾";
    header.append(spinner, title, caret);
    const list = document.createElement("ol");
    list.className = "mahi-steps-list";
    header.addEventListener("click", event => {
      const isOpen = panel.classList.toggle("is-open");
      event.currentTarget.setAttribute("aria-expanded", String(isOpen));
    });
    panel.append(header, list);
    host.before(panel);
    state = { panel, list, title, items: new Map() };
    panels.set(host, state);
    return state;
  }
  function update(typing, payload) {
    const host = typing && typing.querySelector(".message-content");
    if (!host || !payload) return;
    const state = ensurePanel(host);
    const id = String(payload.id || "step-" + state.items.size);
    const label = String(payload.label || payload.message || "");
    if (!label) return;
    let item = state.items.get(id);
    if (!item) {
      item = document.createElement("li");
      state.items.set(id, item);
      state.list.appendChild(item);
    }
    item.className = "mahi-step is-" + String(payload.state || "running");
    item.textContent = label;
    if (payload.detail) item.title = String(payload.detail);
    state.title.textContent = payload.state === "failed" ? "Trying another route…" : label;
  }
  function finish(typing) {
    const host = typing && typing.querySelector(".message-content");
    const state = host && panels.get(host);
    if (!state) return;
    state.list.querySelectorAll(".is-running").forEach(item => item.classList.replace("is-running", "is-done"));
    state.title.textContent = "Completed · " + state.items.size + " steps";
    state.panel.classList.add("is-finished");
    state.panel.classList.remove("is-open");
    state.panel.querySelector("button").setAttribute("aria-expanded", "false");
  }
  window.MahiSteps = { update, finish };
})();
