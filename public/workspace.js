(function () {
  "use strict";
  let api = null, toast = () => {}, getUserId = async () => null, ask = async () => null;
  let root = null, state = { userId: "", files: [], memories: [], tasks: [], branches: [], tab: "files", fileId: "", memoryId: "", taskId: "", branchId: "", activeTask: null, fileVersions: [], memoryVersions: [], branchVersions: [], events: [] };
  const $ = (selector, scope = root) => scope && scope.querySelector(selector);
  const esc = value => String(value == null ? "" : value);
  const activeKey = () => "mahicloud.workspace.active:" + state.userId;
  const activeTask = () => {
    try {
      const value = JSON.parse(localStorage.getItem(activeKey()) || "null");
      return value && value.task_id && value.branch_id ? value : null;
    } catch (_) { return null; }
  };
  function node(tag, cls, text) {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (text != null) element.textContent = text;
    return element;
  }
  function button(label, action, cls) {
    const b = node("button", cls || "btn", label);
    b.type = "button";
    b.addEventListener("click", action);
    return b;
  }
  function field(labelText, control) {
    const wrap = node("label", "ws-field");
    wrap.append(node("span", "ws-label", labelText), control);
    return wrap;
  }
  function input(value, placeholder, maxLength) {
    const el = node("input", "ws-input");
    el.value = value || "";
    el.placeholder = placeholder || "";
    if (maxLength) el.maxLength = maxLength;
    return el;
  }
  function textarea(value, placeholder, rows) {
    const el = node("textarea", "ws-textarea");
    el.value = value || "";
    el.placeholder = placeholder || "";
    el.rows = rows || 8;
    return el;
  }
  function select(options, value) {
    const el = node("select", "ws-input");
    options.forEach(item => {
      const option = node("option", "", item[1]);
      option.value = item[0];
      el.append(option);
    });
    el.value = value || options[0][0];
    return el;
  }
  function status(text, bad) {
    const el = $("#wsStatus");
    if (!el) return;
    el.textContent = text || "";
    el.dataset.error = bad ? "true" : "false";
  }
  async function call(action, payload) {
    status("Saving…");
    const result = await api.workspaceAction(action, payload || {});
    status("Saved");
    return result;
  }
  async function refresh() {
    const data = await call("list");
    state.files = data.files || [];
    state.memories = data.memories || [];
    state.tasks = data.tasks || [];
    state.branches = data.branches || [];
    state.memoryEnabled = data.memory_enabled !== false;
    state.activeTask = activeTask();
    render();
  }
  function open() {
    if (!root) return;
    root.classList.add("on");
    document.body.classList.add("workspace-open");
    state.tab = "files";
    status("Loading your private workspace…");
    Promise.resolve(getUserId()).then(id => {
      if (!id) throw new Error("Your account session is not ready.");
      state.userId = id;
      state.activeTask = activeTask();
      return refresh();
    }).catch(error => {
      status(error.message || "Workspace could not be loaded.", true);
      toast("Workspace could not be loaded.");
    });
  }
  function close() {
    if (!root) return;
    root.classList.remove("on");
    document.body.classList.remove("workspace-open");
  }
  function setUserId(id) {
    state.userId = id || "";
    state.activeTask = state.userId ? activeTask() : null;
  }
  function getActiveTask() {
    if (!state.userId) return null;
    const selected = activeTask();
    return selected ? {
      workspace_task_id: selected.task_id,
      workspace_branch_id: selected.branch_id
    } : null;
  }
  function makeShell() {
    if (root) return;
    root = node("div", "ov workspace-ov");
    root.id = "ovWorkspace";
    const dialog = node("section", "dlg workspace-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "wsTitle");
    const head = node("header", "ws-head");
    const copy = node("div", "ws-heading");
    copy.append(node("h2", "", "Workspace"), node("p", "", "Your private files, editable memory and resumable tasks"));
    head.append(copy, button("Close", close, "ib ws-close"));
    const nav = node("nav", "ws-tabs");
    [["files","Files"],["memory","Memory"],["tasks","Tasks"]].forEach(([id,label]) => {
      const b = button(label, () => { state.tab = id; render(); }, "ws-tab");
      b.dataset.tab = id;
      nav.append(b);
    });
    const statusLine = node("div", "ws-status");
    statusLine.id = "wsStatus";
    const body = node("div", "ws-body");
    body.id = "wsBody";
    dialog.append(head, nav, statusLine, body);
    root.append(dialog);
    root.addEventListener("pointerdown", event => { if (event.target === root) close(); });
    root.addEventListener("keydown", event => { if (event.key === "Escape") { event.stopPropagation(); close(); } });
    document.body.append(root);
  }
  function render() {
    if (!root) makeShell();
    root.querySelectorAll(".ws-tab").forEach(b => b.classList.toggle("on", b.dataset.tab === state.tab));
    const body = $("#wsBody");
    body.replaceChildren();
    if (state.tab === "files") renderFiles(body);
    else if (state.tab === "memory") renderMemory(body);
    else renderTasks(body);
  }
  function renderFiles(body) {
    const layout = node("div", "ws-layout");
    const side = node("aside", "ws-list");
    const sideHead = node("div", "ws-list-head");
    sideHead.append(node("strong", "", "Files"), button("+ New", newFile, "btn pri"));
    side.append(sideHead);
    if (!state.files.length) side.append(node("div", "ws-empty", "No files yet. Create a note, spec, plan or code file."));
    state.files.forEach(file => {
      const b = button("", () => loadFile(file.id), "ws-list-item");
      b.classList.toggle("on", file.id === state.fileId);
      b.append(node("b", "", file.path), node("small", "", "r" + file.revision + (file.index_for_ai ? " · AI enabled" : " · private to you")));
      side.append(b);
    });
    const editor = node("section", "ws-editor");
    layout.append(side, editor);
    body.append(layout);
    if (state.fileId) {
      loadFileContent(state.fileId, editor);
    } else {
      editor.append(node("div", "ws-placeholder", "Choose a file or create a new one."));
    }
  }
  async function loadFile(id) {
    state.fileId = id;
    const body = $("#wsBody");
    if (body) renderFiles(body);
  }
  async function loadFileContent(id, editor) {
    editor.replaceChildren(node("div", "ws-loading", "Loading file…"));
    try {
      const result = await call("file_get", { id });
      if (state.fileId !== id) return;
      const file = result.file;
      editor.replaceChildren();
      const path = input(file.path, "docs/plan.md", 240);
      const mime = node("div", "ws-muted", file.mime_type + " · revision " + file.revision);
      const content = textarea(file.content, "Write Markdown, code, JSON, SQL or plain text…", 20);
      const index = node("input");
      index.type = "checkbox";
      index.checked = file.index_for_ai === true;
      const aiToggle = field("Allow MahiCloud to use this file in relevant chats", index);
      aiToggle.classList.add("ws-check");
      const actions = node("div", "ws-actions");
      actions.append(
        button("Save changes", () => saveFile(file.id, path, content, index), "btn pri"),
        button("Version history", () => showFileVersions(file.id), "btn"),
        button("Delete", () => removeFile(file.path), "btn dng")
      );
      const history = node("div", "ws-history");
      history.id = "wsFileHistory";
      editor.append(field("File path", path), mime, aiToggle, field("Contents", content), actions, history);
      state.fileEditor = { file, path, content, index };
    } catch (error) {
      editor.replaceChildren(node("div", "ws-empty", error.message || "Could not load this file."));
    }
  }
  function newFile() {
    state.fileId = "";
    const body = $("#wsBody");
    const editor = body.querySelector(".ws-editor");
    editor.replaceChildren();
    const path = input("notes/untitled.md", "docs/plan.md", 240);
    const content = textarea("", "Start writing…", 20);
    const index = node("input"); index.type = "checkbox"; index.checked = true;
    const toggle = field("Allow MahiCloud to use this file in relevant chats", index); toggle.classList.add("ws-check");
    const actions = node("div", "ws-actions");
    actions.append(button("Create file", async () => {
      try {
        const result = await call("file_save", { path: path.value, content: content.value, index_for_ai: index.checked });
        state.fileId = result.file.id;
        await refresh();
        toast("File created");
      } catch (error) { status(error.message, true); }
    }, "btn pri"));
    editor.append(field("File path", path), toggle, field("Contents", content), actions);
  }
  async function saveFile(id, path, content, index) {
    try {
      const result = await call("file_save", { id, path: path.value, content: content.value, index_for_ai: index.checked });
      state.fileId = result.file.id;
      await refresh();
      toast("File saved · revision " + result.file.revision);
    } catch (error) { status(error.message, true); }
  }
  async function removeFile(path) {
    if (!window.confirm("Move " + path + " to deleted state? Its version history will remain available.")) return;
    try {
      await call("file_delete", { path });
      state.fileId = "";
      await refresh();
      toast("File deleted");
    } catch (error) { status(error.message, true); }
  }
  async function showFileVersions(id) {
    try {
      const data = await call("file_versions", { id });
      const box = $("#wsFileHistory");
      box.replaceChildren(node("b", "", "Version history"));
      (data.versions || []).forEach(version => {
        const row = node("div", "ws-history-row");
        row.append(node("span", "", "Revision " + version.revision + " · " + new Date(version.created_at).toLocaleString()));
        row.append(button("Restore", async () => {
          try { await call("file_restore", { id, version_id: version.id }); await refresh(); toast("Version restored"); }
          catch (error) { status(error.message, true); }
        }, "btn"));
        box.append(row);
      });
      if (!(data.versions || []).length) box.append(node("p", "ws-muted", "No versions yet."));
    } catch (error) { status(error.message, true); }
  }
  function renderMemory(body) {
    const layout = node("div", "ws-layout");
    const side = node("aside", "ws-list");
    const sideHead = node("div", "ws-list-head");
    sideHead.append(node("strong", "", "Memories"), button("+ New", newMemory, "btn pri"));
    const enabled = node("input"); enabled.type = "checkbox"; enabled.checked = state.memoryEnabled !== false;
    enabled.addEventListener("change", async () => {
      try { await call("memory_settings", { enabled: enabled.checked }); toast(enabled.checked ? "Memory enabled" : "Memory paused"); }
      catch (error) { enabled.checked = !enabled.checked; status(error.message, true); }
    });
    side.append(sideHead, field("Allow AI to use saved memory", enabled));
    state.memories.filter(m => !m.is_archived).forEach(memory => {
      const b = button("", () => loadMemory(memory.id), "ws-list-item");
      b.classList.toggle("on", memory.id === state.memoryId);
      b.append(node("b", "", memory.title), node("small", "", memory.category + " · r" + memory.revision));
      side.append(b);
    });
    const editor = node("section", "ws-editor");
    layout.append(side, editor); body.append(layout);
    if (state.memoryId) loadMemoryContent(state.memoryId, editor);
    else editor.append(node("div", "ws-placeholder", "Choose a memory entry or create a new one."));
  }
  async function loadMemory(id) {
    state.memoryId = id;
    const body = $("#wsBody"); if (body) renderMemory(body);
  }
  async function loadMemoryContent(id, editor) {
    const memory = state.memories.find(m => m.id === id);
    if (!memory) { editor.append(node("div", "ws-empty", "Memory entry not found.")); return; }
    const title = input(memory.title, "Title", 120);
    const category = select([["profile","Profile"],["preference","Preference"],["project","Project"],["goal","Goal"],["context","Context"],["note","Note"],["decision","Decision"],["workflow","Workflow"]], memory.category);
    const content = textarea(memory.content, "What should MahiCloud remember?", 8);
    const tags = input((memory.tags || []).join(", "), "tags, separated, by commas", 400);
    const data = textarea(JSON.stringify(memory.data || {}, null, 2), "{}", 5);
    const confidence = input(memory.confidence == null ? "1" : String(memory.confidence), "0.0 to 1.0", 5);
    confidence.type = "number"; confidence.min = "0"; confidence.max = "1"; confidence.step = "0.05";
    const actions = node("div", "ws-actions");
    actions.append(
      button("Save", async () => {
        try {
          let parsed = {};
          try { parsed = JSON.parse(data.value || "{}"); } catch (_) { throw new Error("Structured data must be valid JSON."); }
          if (!parsed || typeof parsed !== "object") throw new Error("Structured data must be a JSON object or array.");
          const result = await call("memory_save", {
            id, title: title.value, category: category.value, content: content.value,
            tags: tags.value.split(",").map(s => s.trim()).filter(Boolean),
            data: parsed, confidence: Number(confidence.value), source_kind: "user"
          });
          state.memoryId = result.memory.id;
          await refresh(); toast("Memory saved · revision " + result.memory.revision);
        } catch (error) { status(error.message, true); }
      }, "btn pri"),
      button("Versions", () => showMemoryVersions(id), "btn"),
      button("Archive", () => archiveMemory(id), "btn"),
      button("Delete", () => deleteMemory(id), "btn dng")
    );
    const history = node("div", "ws-history"); history.id = "wsMemoryHistory";
    editor.append(
      field("Title", title), field("Category", category), field("Memory", content),
      field("Tags", tags), field("Structured data (JSON)", data), field("Confidence (0–1)", confidence),
      node("div", "ws-muted", "Source: " + memory.source_kind + " · Revision " + memory.revision + " · Updated " + new Date(memory.updated_at).toLocaleString()),
      actions, history
    );
  }
  function newMemory() {
    state.memoryId = "";
    const body = $("#wsBody"), editor = body.querySelector(".ws-editor");
    editor.replaceChildren();
    const title = input("", "e.g. Preferred response style", 120);
    const category = select([["note","Note"],["profile","Profile"],["preference","Preference"],["project","Project"],["goal","Goal"],["context","Context"],["decision","Decision"],["workflow","Workflow"]], "note");
    const content = textarea("", "Store one clear fact or preference…", 8);
    const tags = input("", "tags separated by commas", 400);
    const data = textarea("{}", "{}", 5);
    const actions = node("div", "ws-actions");
    actions.append(button("Create memory", async () => {
      try {
        const parsed = JSON.parse(data.value || "{}");
        const result = await call("memory_save", {
          title: title.value, category: category.value, content: content.value,
          tags: tags.value.split(",").map(s => s.trim()).filter(Boolean), data: parsed, confidence: 1, source_kind: "user"
        });
        state.memoryId = result.memory.id; await refresh(); toast("Memory created");
      } catch (error) { status(error.message || "Invalid memory data.", true); }
    }, "btn pri"));
    editor.append(field("Title", title), field("Category", category), field("Memory", content), field("Tags", tags), field("Structured data (JSON)", data), actions);
  }
  async function showMemoryVersions(id) {
    try {
      const data = await call("memory_versions", { id });
      const box = $("#wsMemoryHistory"); box.replaceChildren(node("b", "", "Version history"));
      (data.versions || []).forEach(version => {
        const snapshot = version.snapshot || {};
        const row = node("div", "ws-history-row");
        row.append(node("span", "", "r" + version.revision + " · " + version.change_kind + " · " + new Date(version.created_at).toLocaleString() + " · " + (snapshot.title || "")));
        row.append(button("Restore", async () => {
          try { await call("memory_restore", { id, version_id: version.id }); await refresh(); toast("Memory restored"); }
          catch (error) { status(error.message, true); }
        }, "btn"));
        box.append(row);
      });
      if (!(data.versions || []).length) box.append(node("p", "ws-muted", "No versions yet."));
    } catch (error) { status(error.message, true); }
  }
  async function archiveMemory(id) {
    try { await call("memory_archive", { id }); state.memoryId = ""; await refresh(); toast("Memory archived"); }
    catch (error) { status(error.message, true); }
  }
  async function deleteMemory(id) {
    if (!window.confirm("Delete this memory entry and keep the remaining history for this entry?")) return;
    try { await call("memory_delete", { id }); state.memoryId = ""; await refresh(); toast("Memory deleted"); }
    catch (error) { status(error.message, true); }
  }
  function renderTasks(body) {
    const layout = node("div", "ws-layout");
    const side = node("aside", "ws-list");
    const sideHead = node("div", "ws-list-head");
    sideHead.append(node("strong", "", "Tasks"), button("+ New", newTask, "btn pri"));
    side.append(sideHead);
    if (!state.tasks.length) side.append(node("div", "ws-empty", "No saved tasks. Create one for work you need to resume later."));
    state.tasks.forEach(task => {
      const b = button("", () => chooseTask(task.id), "ws-list-item");
      b.classList.toggle("on", task.id === state.taskId);
      b.append(node("b", "", task.title), node("small", "", task.status + " · " + (state.branches.filter(x => x.task_id === task.id).length) + " branches"));
      side.append(b);
    });
    const editor = node("section", "ws-editor");
    layout.append(side, editor); body.append(layout);
    const task = state.tasks.find(t => t.id === state.taskId);
    if (!task) { editor.append(node("div", "ws-placeholder", "Choose a saved task or create a new one.")); return; }
    const title = input(task.title, "Task title", 160);
    const objective = textarea(task.objective, "What needs to be completed?", 4);
    const branches = state.branches.filter(b => b.task_id === task.id);
    const branchSelect = select(branches.map(b => [b.id, b.name + " · " + b.status + " · r" + b.revision]), state.branchId);
    branchSelect.addEventListener("change", () => { state.branchId = branchSelect.value; setActiveTask(false); render(); });
    const selected = branches.find(b => b.id === branchSelect.value) || branches[0];
    state.branchId = selected ? selected.id : "";
    const isActive = state.activeTask && state.activeTask.task_id === task.id && state.activeTask.branch_id === state.branchId;
    const stateBox = textarea(selected ? JSON.stringify(selected.state || {}, null, 2) : "{}", "Checkpoint state JSON", 12);
    const summary = textarea(selected ? selected.summary : "", "Current status, decisions and next steps…", 4);
    const actions = node("div", "ws-actions ws-task-actions");
    actions.append(
      button("Save task details", async () => {
        try {
          const result = await call("task_update", { id: task.id, title: title.value, objective: objective.value });
          Object.assign(task, result.task); await refresh(); toast("Task details saved");
        } catch (error) { status(error.message, true); }
      }, "btn"),
      button(isActive ? "Stop using in chats" : "Use in chats", () => setActiveTask(!isActive), isActive ? "btn pri" : "btn"),
      button("Fork branch", forkBranch, "btn"),
      button(task.status === "paused" ? "Resume task" : "Pause task", async () => {
        try { await call("task_update", { id: task.id, status: task.status === "paused" ? "active" : "paused" }); await refresh(); }
        catch (error) { status(error.message, true); }
      }, "btn"),
      button(task.status === "archived" ? "Restore task" : "Archive task", async () => {
        const nextStatus = task.status === "archived" ? "active" : "archived";
        try {
          await call("task_update", { id: task.id, status: nextStatus });
          const active = getActiveTask();
          if (nextStatus === "archived" && active?.task_id === task.id) {
            localStorage.removeItem(activeKey());
            state.activeTask = null;
          }
          await refresh();
          toast(nextStatus === "archived" ? "Task archived" : "Task restored");
        } catch (error) { status(error.message, true); }
      }, "btn")
    );
    actions.append(
      button("Checkpoint now", async () => {
        try {
          const parsed = JSON.parse(stateBox.value || "{}");
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Checkpoint state must be a JSON object.");
          const result = await call("task_checkpoint", { task_id: task.id, branch_id: state.branchId, state: parsed, summary: summary.value, note: "Manual checkpoint" });
          Object.assign(selected, result.branch); await refresh(); toast("Checkpoint saved · revision " + result.branch.revision);
        } catch (error) { status(error.message || "Invalid checkpoint JSON.", true); }
      }, "btn pri"),
      button("Checkpoint history", () => showTaskVersions(task.id, state.branchId), "btn"),
      button("Timeline", () => showTaskEvents(task.id, state.branchId), "btn"),
      button(selected?.status === "archived" ? "Restore branch" : "Archive branch", async () => {
        const nextStatus = selected?.status === "archived" ? "active" : "archived";
        try {
          await call("task_branch_update", { task_id: task.id, branch_id: state.branchId, status: nextStatus });
          const active = getActiveTask();
          if (nextStatus === "archived" && active?.task_id === task.id && active?.branch_id === state.branchId) {
            localStorage.removeItem(activeKey());
            state.activeTask = null;
          }
          await refresh();
          toast(nextStatus === "archived" ? "Branch archived" : "Branch restored");
        } catch (error) { status(error.message, true); }
      }, "btn")
    );
    const history = node("div", "ws-history"); history.id = "wsTaskHistory";
    editor.append(
      field("Task title", title), field("Objective", objective), field("Branch", branchSelect),
      node("div", "ws-muted", "Task state is versioned per branch. A new branch starts from the selected branch's last checkpoint."),
      field("Checkpoint state (JSON)", stateBox), field("Progress summary", summary),
      actions, history
    );
  }
  async function newTask() {
    const title = await ask({ title: "Create a persistent task", text: "Give this work a name. You can add the objective after creation.", input: "", ok: "Create task" });
    if (title == null || !String(title).trim()) return;
    try {
      const made = await call("task_create", { title: String(title).trim(), objective: "" });
      await refresh(); state.taskId = made.task.id; state.branchId = made.branch.id; render();
      toast("Task created with a main branch");
    } catch (error) { status(error.message, true); }
  }
  function chooseTask(id) {
    const current = getActiveTask();
    state.taskId = id;
    const preferred = current?.task_id === id
      ? state.branches.find(branch => branch.task_id === id && branch.id === current.branch_id && branch.status !== "archived")
      : null;
    const first = preferred || state.branches.find(branch => branch.task_id === id && branch.status !== "archived");
    state.branchId = first ? first.id : "";
    if (current && current.task_id !== id) {
      localStorage.removeItem(activeKey());
      state.activeTask = null;
      toast("Task context disabled for chats");
    }
    render();
  }
  async function forkBranch() {
    const task = state.tasks.find(item => item.id === state.taskId);
    const source = state.branches.find(item => item.id === state.branchId && item.task_id === state.taskId);
    if (!task || task.status === "archived" || !source || source.status === "archived") {
      return status("Restore the task and source branch before forking.", true);
    }
    const name = await ask({ title: "Create a parallel branch", text: "Name this alternative work track.", input: "experiment", ok: "Fork branch" });
    if (name == null || !String(name).trim()) return;
    try {
      const made = await call("task_branch_create", { task_id: state.taskId, parent_branch_id: state.branchId, name: String(name).trim() });
      await refresh(); state.branchId = made.branch.id; render(); toast("Branch created from the selected checkpoint");
    } catch (error) { status(error.message, true); }
  }
  function setActiveTask(enabled) {
    if (enabled) {
      const task = state.tasks.find(item => item.id === state.taskId);
      const branch = state.branches.find(item => item.id === state.branchId && item.task_id === state.taskId);
      if (!task || task.status === "archived") return status("Restore this task before using it in chats.", true);
      if (!branch || branch.status === "archived") return status("Restore this branch before using it in chats.", true);
      localStorage.setItem(activeKey(), JSON.stringify({ task_id: state.taskId, branch_id: state.branchId }));
      state.activeTask = activeTask();
      toast("This task branch will be included in relevant chats");
    } else {
      localStorage.removeItem(activeKey()); state.activeTask = null;
      toast("Task context disabled for chats");
    }
    const body = $("#wsBody"); if (body) renderTasks(body);
  }
  async function showTaskVersions(taskId, branchId) {
    try {
      const data = await call("task_branch_versions", { task_id: taskId, branch_id: branchId });
      const box = $("#wsTaskHistory"); box.replaceChildren(node("b", "", "Checkpoint history"));
      (data.versions || []).forEach(version => {
        const row = node("div", "ws-history-row");
        row.append(node("span", "", "r" + version.revision + " · " + new Date(version.created_at).toLocaleString() + " · " + String(version.summary || "").slice(0, 100)));
        row.append(button("Restore", async () => {
          try { await call("task_branch_restore", { task_id: taskId, branch_id: branchId, version_id: version.id }); await refresh(); toast("Checkpoint restored"); }
          catch (error) { status(error.message, true); }
        }, "btn"));
        box.append(row);
      });
      if (!(data.versions || []).length) box.append(node("p", "ws-muted", "No checkpoints yet."));
    } catch (error) { status(error.message, true); }
  }
  async function showTaskEvents(taskId, branchId) {
    try {
      const data = await call("task_events", { task_id: taskId, branch_id: branchId });
      const box = $("#wsTaskHistory"); box.replaceChildren(node("b", "", "Saved timeline"));
      (data.events || []).forEach(event => {
        const payload = event.payload || {};
        const label = event.event_type === "chat_turn"
          ? "Chat turn · " + String(payload.user_prompt || "").slice(0, 140)
          : event.event_type + " · " + String(payload.note || "").slice(0, 140);
        box.append(node("div", "ws-timeline-item", new Date(event.created_at).toLocaleString() + " — " + label));
      });
      if (!(data.events || []).length) box.append(node("p", "ws-muted", "No timeline events yet."));
    } catch (error) { status(error.message, true); }
  }
  function init(options) {
    api = options.api; toast = options.toast || toast; ask = options.ask || ask; getUserId = options.getUserId || getUserId;
    makeShell();
    const trigger = document.getElementById("openWorkspace");
    if (trigger) trigger.addEventListener("click", open);
  }
  window.MahiWorkspace = { init, open, close, setUserId, getActiveTask };
})();