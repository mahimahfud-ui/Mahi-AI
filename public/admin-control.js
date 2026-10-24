/* Secure Mahi-AI owner control panel. Passcode and instructions are never saved to localStorage. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const cfg = window.MAHI_AI_CONFIG || {};
  const overlay = $("adminControlOverlay");
  const openButton = $("openAdminControl");
  const closeButton = $("adminCloseOverlay");
  const loginView = $("adminLoginView");
  const loginForm = $("adminLoginForm");
  const loginStatus = $("adminLoginStatus");
  const loginButton = $("adminLoginButton");
  const consoleView = $("adminConsole");
  const editor = $("adminEditorPane");
  const categoryList = $("adminCategoryList");
  const sessionKey = "mahi-ai-admin-session-v1";
  let adminToken = "";
  let adminConfig = null;
  let selectedCategoryId = "global";
  let dirty = false;
  let saving = false;
  let authClient = null;

  if (!overlay || !openButton || !closeButton || !loginView || !loginForm || !consoleView || !editor || !categoryList) return;

  function readSessionToken() {
    try { return sessionStorage.getItem(sessionKey) || ""; } catch (_) { return ""; }
  }
  function storeSessionToken(token) {
    try {
      if (token) sessionStorage.setItem(sessionKey, token);
      else sessionStorage.removeItem(sessionKey);
    } catch (_) {}
  }
  function setLoginStatus(message) { if (loginStatus) loginStatus.textContent = message; }
  function openAdminOverlay() {
    overlay.hidden = false;
    document.body.classList.add("admin-control-open");
    window.setTimeout(() => {
      const target = consoleView.hidden ? $("adminPinInput") : $("adminRefresh");
      (target || overlay.querySelector("button:not(:disabled),input:not(:disabled)"))?.focus();
    }, 0);
  }
  function closeAdminOverlay() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    document.body.classList.remove("admin-control-open");
    openButton.focus();
  }
  openButton.addEventListener("click", openAdminOverlay);
  closeButton.addEventListener("click", closeAdminOverlay);
  overlay.querySelectorAll("[data-admin-close]").forEach((element) => element.addEventListener("click", closeAdminOverlay));
  document.addEventListener("keydown", (event) => {
    if (overlay.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeAdminOverlay();
      return;
    }
    if (event.key === "Tab") {
      const items = [...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')]
        .filter((element) => !element.hidden && element.getClientRects().length);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  function setConsoleStatus(message) { const node = $("adminConsoleStatus"); if (node) node.textContent = message; }
  function getClient() {
    if (window.MAHI_AI_AUTH_CLIENT) return window.MAHI_AI_AUTH_CLIENT;
    if (authClient) return authClient;
    if (!cfg.supabaseUrl || !cfg.supabasePublishableKey || !window.supabase?.createClient) throw new Error("Mahi-AI authentication is not ready. Refresh the page and try again.");
    authClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    window.MAHI_AI_AUTH_CLIENT = authClient;
    return authClient;
  }
  async function accessToken() {
    const client = getClient();
    let result = await client.auth.getSession();
    if (!result.data?.session?.access_token) {
      const signedIn = await client.auth.signInAnonymously();
      if (signedIn.error) throw new Error("Your chat session is not ready. Reload Mahi-AI and try again.");
      result = await client.auth.getSession();
    }
    const token = result.data?.session?.access_token;
    if (!token) throw new Error("Your chat session is not ready. Reload Mahi-AI and try again.");
    return token;
  }
  async function adminRequest(action, payload) {
    const bearer = await accessToken();
    const response = await fetch(cfg.supabaseUrl + "/functions/v1/mahi-ai-chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": cfg.supabasePublishableKey,
        "Authorization": "Bearer " + bearer
      },
      body: JSON.stringify(Object.assign({ admin_action: action }, payload || {}))
    });
    let body = {};
    try { body = await response.json(); } catch (_) {}
    if (!response.ok) {
      if (response.status === 401 && action !== "login") forgetAdminToken();
      throw new Error(typeof body.error === "string" ? body.error : "Admin request failed (" + response.status + ").");
    }
    return body;
  }
  function forgetAdminToken() {
    adminToken = "";
    storeSessionToken("");
    consoleView.hidden = true;
    loginView.hidden = false;
  }
  function normalizeConfig(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const categories = Array.isArray(source.categories) ? source.categories.slice(0, 25).map((cat, index) => {
      const item = cat && typeof cat === "object" ? cat : {};
      return {
        id: String(item.id || ("category-" + (index + 1))),
        name: String(item.name || "Untitled category"),
        description: String(item.description || ""),
        keywords: Array.isArray(item.keywords) ? item.keywords.map(String) : [],
        instructions: String(item.instructions || ""),
        subcategories: Array.isArray(item.subcategories) ? item.subcategories.slice(0, 12).map((sub, subIndex) => ({
          id: String(sub && sub.id || ("subcategory-" + (subIndex + 1))),
          name: String(sub && sub.name || "Untitled subcategory"),
          description: String(sub && sub.description || ""),
          keywords: Array.isArray(sub && sub.keywords) ? sub.keywords.map(String) : [],
          instructions: String(sub && sub.instructions || "")
        })) : []
      };
    }) : [];
    return { enabled: source.enabled !== false, globalInstructions: String(source.globalInstructions || ""), categories };
  }
  function newId(prefix) {
    let raw = "";
    try { raw = crypto.randomUUID(); } catch (_) { raw = String(Date.now()) + "-" + Math.random().toString(36).slice(2); }
    return (prefix + "-" + raw).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 48);
  }
  function markDirty() {
    dirty = true;
    setConsoleStatus("Unsaved changes · save to apply to new requests.");
    renderStats();
  }
  function renderStats() {
    const engine = $("adminEngineState");
    const count = $("adminCategoryCount");
    const railCount = $("adminRailCount");
    if (engine) engine.textContent = adminConfig?.enabled ? "Enabled" : "Paused";
    if (count) count.textContent = String(adminConfig?.categories?.length || 0);
    if (railCount) railCount.textContent = String(adminConfig?.categories?.length || 0);
  }
  function renderCategoryList() {
    categoryList.textContent = "";
    const globalButton = document.querySelector('[data-admin-select="global"]');
    if (globalButton) globalButton.classList.toggle("is-active", selectedCategoryId === "global");
    (adminConfig?.categories || []).forEach((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "admin-category-item" + (selectedCategoryId === category.id ? " is-active" : "");
      button.setAttribute("data-admin-select", category.id);
      const glyph = document.createElement("span");
      glyph.className = "admin-category-glyph";
      glyph.textContent = "◇";
      const copy = document.createElement("span");
      const strong = document.createElement("strong");
      strong.textContent = category.name || "Untitled category";
      const small = document.createElement("small");
      small.textContent = (category.subcategories || []).length + " subcategories";
      copy.append(strong, small);
      button.append(glyph, copy);
      categoryList.appendChild(button);
    });
    renderStats();
  }
  function field(labelText, tagName, value, fieldName, categoryId, subId, rows, helpText) {
    const wrapper = document.createElement("label");
    wrapper.className = "admin-field";
    const copy = document.createElement("span");
    copy.className = "admin-field-copy";
    const label = document.createElement("span");
    label.className = "admin-field-label";
    label.textContent = labelText;
    copy.appendChild(label);
    if (helpText) {
      const help = document.createElement("span");
      help.className = "admin-field-help";
      help.textContent = helpText;
      copy.appendChild(help);
    }
    const control = document.createElement(tagName);
    if (tagName === "textarea") {
      control.rows = rows || 4;
      control.value = value || "";
    } else {
      control.type = "text";
      control.value = value || "";
    }
    if (subId) {
      control.setAttribute("data-admin-sub-field", fieldName);
      control.setAttribute("data-category-id", categoryId);
      control.setAttribute("data-sub-id", subId);
    } else {
      control.setAttribute("data-admin-field", fieldName);
      if (categoryId) control.setAttribute("data-category-id", categoryId);
    }
    wrapper.append(copy, control);
    return wrapper;
  }
  function renderSubcategoryCards(category, host) {
    host.textContent = "";
    (category.subcategories || []).forEach((subcategory, index) => {
      const card = document.createElement("article");
      card.className = "admin-subcategory-card";
      const head = document.createElement("div");
      head.className = "admin-subcategory-head";
      const title = document.createElement("strong");
      title.textContent = "Subcategory " + (index + 1);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.setAttribute("data-admin-remove-sub", subcategory.id);
      remove.setAttribute("data-category-id", category.id);
      head.append(title, remove);
      card.appendChild(head);
      card.appendChild(field("Subcategory name", "input", subcategory.name, "name", category.id, subcategory.id));
      card.appendChild(field("Description", "textarea", subcategory.description, "description", category.id, subcategory.id, 2, "Explain when this instruction applies."));
      card.appendChild(field("Keywords (comma-separated)", "input", (subcategory.keywords || []).join(", "), "keywords", category.id, subcategory.id));
      card.appendChild(field("Custom instructions", "textarea", subcategory.instructions, "instructions", category.id, subcategory.id, 4, "Rules for this specific subtopic."));
      host.appendChild(card);
    });
    if (!category.subcategories.length) {
      const empty = document.createElement("p");
      empty.className = "admin-field-help";
      empty.textContent = "No subcategories yet. Add one to create more precise rules.";
      host.appendChild(empty);
    }
  }
  function renderEditor() {
    editor.textContent = "";
    if (!adminConfig) return;
    if (selectedCategoryId === "global") {
      editor.innerHTML = '<div class="admin-editor-head"><div><h5>Global instructions</h5><p>These instructions are attached to all new chat and coding requests for all users.</p></div></div><label class="admin-toggle-row"><span><strong>Enable owner instructions</strong><small>Pause or resume global and topic-specific instruction rules without deleting them.</small></span><input id="adminConfigEnabled" type="checkbox"></label><label class="admin-field"><span class="admin-field-copy"><span class="admin-field-label">Global custom instructions</span><span class="admin-field-help">Write the assistant\'s default behavior, response format, tone, preferred language, or project-specific rules. Maximum 12,000 characters.</span></span><textarea id="adminGlobalInstructions" rows="11" maxlength="12000" placeholder="Example: Answer Banglish messages in natural Banglish. Be direct, verify claims, and prioritize the exact task."></textarea></label><div class="admin-security-note">Your global instructions affect every user. They cannot replace platform safety requirements or make the AI claim actions it did not perform.</div>';
      $("adminConfigEnabled").checked = adminConfig.enabled !== false;
      $("adminGlobalInstructions").value = adminConfig.globalInstructions || "";
      return;
    }
    const category = adminConfig.categories.find((item) => item.id === selectedCategoryId);
    if (!category) {
      selectedCategoryId = "global";
      renderCategoryList();
      renderEditor();
      return;
    }
    const head = document.createElement("div");
    head.className = "admin-editor-head";
    const headCopy = document.createElement("div");
    const title = document.createElement("h5");
    title.textContent = "Category settings";
    const subtitle = document.createElement("p");
    subtitle.textContent = "Edit its matching keywords, main instructions and subcategories.";
    headCopy.append(title, subtitle);
    const deleteCategory = document.createElement("button");
    deleteCategory.type = "button";
    deleteCategory.className = "admin-delete-category";
    deleteCategory.textContent = "Delete category";
    deleteCategory.setAttribute("data-admin-delete-category", category.id);
    head.append(headCopy, deleteCategory);
    editor.appendChild(head);
    const form = document.createElement("div");
    form.className = "admin-form-grid";
    form.appendChild(field("Category name", "input", category.name, "name", category.id));
    form.appendChild(field("Description", "textarea", category.description, "description", category.id, null, 2, "Describe the type of task this category should guide."));
    form.appendChild(field("Keywords (comma-separated)", "input", (category.keywords || []).join(", "), "keywords", category.id, null, null, "Words or phrases that help match this category to a task."));
    form.appendChild(field("Category custom instructions", "textarea", category.instructions, "instructions", category.id, null, 5, "These rules apply when this category is relevant."));
    editor.appendChild(form);
    const subHead = document.createElement("div");
    subHead.className = "admin-subcategory-head";
    const subTitle = document.createElement("strong");
    subTitle.textContent = "Subcategories";
    const addSub = document.createElement("button");
    addSub.type = "button";
    addSub.textContent = "＋ Add subcategory";
    addSub.setAttribute("data-admin-add-sub", category.id);
    subHead.append(subTitle, addSub);
    editor.appendChild(subHead);
    const subHost = document.createElement("div");
    subHost.className = "admin-subcategory-list";
    renderSubcategoryCards(category, subHost);
    editor.appendChild(subHost);
  }
  function setAdminView(unlocked) {
    loginView.hidden = !!unlocked;
    consoleView.hidden = !unlocked;
    if (!unlocked) $("adminPinInput")?.focus();
  }
  async function loadConfig() {
    const result = await adminRequest("get", { admin_session: adminToken });
    adminConfig = normalizeConfig(result.config);
    dirty = false;
    renderCategoryList();
    renderEditor();
    setConsoleStatus("Loaded from server · save changes to apply them.");
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const pin = $("adminPinInput")?.value || "";
    if (!pin) { setLoginStatus("Enter the admin passcode."); return; }
    loginButton.disabled = true;
    setLoginStatus("Verifying your admin access on the server…");
    try {
      const result = await adminRequest("login", { pin: pin });
      adminToken = result.admin_session || "";
      if (!adminToken) throw new Error("The server did not create an admin session.");
      storeSessionToken(adminToken);
      $("adminPinInput").value = "";
      await loadConfig();
      setAdminView(true);
      setLoginStatus("Admin access verified.");
    } catch (error) {
      setLoginStatus(error instanceof Error ? error.message : "Admin login failed.");
      $("adminPinInput").select();
    } finally {
      loginButton.disabled = false;
    }
  });
  categoryList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-admin-select]");
    if (!button) return;
    selectedCategoryId = button.getAttribute("data-admin-select") || "global";
    renderCategoryList();
    renderEditor();
  });
  const globalButton = document.querySelector('[data-admin-select="global"]');
  if (globalButton) globalButton.addEventListener("click", () => {
    selectedCategoryId = "global";
    renderCategoryList();
    renderEditor();
  });
  $("adminAddCategory")?.addEventListener("click", () => {
    if (!adminConfig || adminConfig.categories.length >= 25) {
      setConsoleStatus("Maximum of 25 categories reached."); return;
    }
    const id = newId("category");
    adminConfig.categories.push({ id: id, name: "New category", description: "", keywords: [], instructions: "", subcategories: [] });
    selectedCategoryId = id;
    markDirty();
    renderCategoryList();
    renderEditor();
    editor.querySelector('[data-admin-field="name"]')?.focus();
  });
  editor.addEventListener("input", (event) => {
    const control = event.target;
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) return;
    if (control.id === "adminGlobalInstructions") {
      adminConfig.globalInstructions = control.value;
      markDirty(); return;
    }
    const fieldName = control.getAttribute("data-admin-field");
    const subFieldName = control.getAttribute("data-admin-sub-field");
    const categoryId = control.getAttribute("data-category-id");
    if (subFieldName && categoryId) {
      const category = adminConfig.categories.find((item) => item.id === categoryId);
      const sub = category?.subcategories.find((item) => item.id === control.getAttribute("data-sub-id"));
      if (!sub) return;
      sub[subFieldName] = subFieldName === "keywords" ? control.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20) : control.value;
      markDirty(); return;
    }
    if (!fieldName || !categoryId) return;
    const category = adminConfig.categories.find((item) => item.id === categoryId);
    if (!category) return;
    category[fieldName] = fieldName === "keywords" ? control.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20) : control.value;
    if (fieldName === "name") renderCategoryList();
    markDirty();
  });
  editor.addEventListener("change", (event) => {
    const control = event.target;
    if (control instanceof HTMLInputElement && control.id === "adminConfigEnabled") {
      adminConfig.enabled = control.checked;
      markDirty();
    }
  });
  editor.addEventListener("click", (event) => {
    const addSub = event.target.closest("[data-admin-add-sub]");
    if (addSub) {
      const category = adminConfig.categories.find((item) => item.id === addSub.getAttribute("data-admin-add-sub"));
      if (!category) return;
      if (category.subcategories.length >= 12) { setConsoleStatus("Maximum of 12 subcategories per category reached."); return; }
      category.subcategories.push({ id: newId("sub"), name: "New subcategory", description: "", keywords: [], instructions: "" });
      markDirty();
      renderEditor();
      return;
    }
    const removeSub = event.target.closest("[data-admin-remove-sub]");
    if (removeSub) {
      const category = adminConfig.categories.find((item) => item.id === removeSub.getAttribute("data-category-id"));
      if (!category) return;
      category.subcategories = category.subcategories.filter((sub) => sub.id !== removeSub.getAttribute("data-admin-remove-sub"));
      markDirty(); renderEditor(); return;
    }
    const removeCategory = event.target.closest("[data-admin-delete-category]");
    if (removeCategory) {
      const id = removeCategory.getAttribute("data-admin-delete-category");
      const category = adminConfig.categories.find((item) => item.id === id);
      if (!category || !window.confirm('Delete the "' + category.name + '" category and its subcategories?')) return;
      adminConfig.categories = adminConfig.categories.filter((item) => item.id !== id);
      selectedCategoryId = "global";
      markDirty(); renderCategoryList(); renderEditor();
    }
  });
  $("adminSave")?.addEventListener("click", async () => {
    if (!adminConfig || saving || !adminToken) return;
    saving = true;
    $("adminSave").disabled = true;
    setConsoleStatus("Saving your configuration securely…");
    try {
      const result = await adminRequest("save", { admin_session: adminToken, config: adminConfig });
      adminConfig = normalizeConfig(result.config);
      dirty = false;
      renderCategoryList();
      renderEditor();
      setConsoleStatus("Saved to the server. Instructions apply to new requests; an active reply keeps its original settings.");
    } catch (error) {
      setConsoleStatus(error instanceof Error ? error.message : "Could not save the configuration.");
    } finally {
      saving = false;
      $("adminSave").disabled = false;
    }
  });
  $("adminRefresh")?.addEventListener("click", async () => {
    if (dirty && !window.confirm("Discard unsaved changes and reload the server configuration?")) return;
    $("adminRefresh").disabled = true;
    try { await loadConfig(); } catch (error) { setConsoleStatus(error instanceof Error ? error.message : "Could not refresh settings."); }
    finally { $("adminRefresh").disabled = false; }
  });
  $("adminLogout")?.addEventListener("click", async () => {
    if (dirty && !window.confirm("Discard unsaved changes and lock the admin console?")) return;
    try { await adminRequest("logout", { admin_session: adminToken }); } catch (_) {}
    forgetAdminToken();
    adminConfig = null;
    setLoginStatus("Admin console locked. Sign in again to manage AI instructions.");
  });

  adminToken = readSessionToken();
  if (adminToken) {
    adminRequest("get", { admin_session: adminToken }).then((result) => {
      adminConfig = normalizeConfig(result.config);
      dirty = false;
      renderCategoryList();
      renderEditor();
      setAdminView(true);
      setConsoleStatus("Secure admin session restored for this browser tab.");
    }).catch(() => {
      forgetAdminToken();
      setLoginStatus("Sign in to open the administrator control panel.");
    });
  }
})();