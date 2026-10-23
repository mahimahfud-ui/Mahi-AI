(() => {
  "use strict";
  const cfg = window.MAHI_AI_CONFIG;
  const $ = (id) => document.getElementById(id);
  const ui = {
    sidebar: $("sidebar"), scrim: $("mobileScrim"), chatList: $("chatList"),
    welcome: $("welcome"), messages: $("messages"), form: $("chatForm"),
    input: $("promptInput"), send: $("sendButton"), error: $("errorBanner"),
    session: $("sessionLabel"), charCount: $("charCount")
  };
  let client = null, session = null, conversationId = null, conversations = [];
  let busy = false, currentMessages = [];
  const MAX_HISTORY = 12;

  function setError(message) {
    ui.error.textContent = message || "";
    ui.error.hidden = !message;
  }
  function plainError(error) {
    const msg = error && error.message ? error.message : "";
    if (/anonymous|sign.?in|not enabled|signup/i.test(msg)) {
      return "Guest access is not enabled yet. In Supabase, open Authentication → Sign In / Providers and enable Anonymous Sign-Ins, then reload this page.";
    }
    if (/fetch|network|failed to fetch/i.test(msg)) return "Connection failed. Check your internet connection and try again.";
    return "Mahi AI could not complete that request. Please try again in a moment.";
  }
  function setBusy(value) {
    busy = value;
    ui.send.disabled = value || !ui.input.value.trim();
    ui.input.disabled = value;
    ui.send.innerHTML = value
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h8v8H8z"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6.5 10.5 12 5l5.5 5.5"/></svg>';
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[c]);
  }
  function safeMarkdown(value) {
    if (!window.marked || !window.DOMPurify) return escapeHtml(value).replace(/\n/g,"<br>");
    const renderer = new marked.Renderer();
    renderer.link = ({href, title, text}) => {
      const safeHref = /^(https?:|mailto:)/i.test(href || "") ? href : "#";
      return '<a href="' + escapeHtml(safeHref) + '" target="_blank" rel="noopener noreferrer"' +
        (title ? ' title="' + escapeHtml(title) + '"' : "") + '>' + text + '</a>';
    };
    const parsed = marked.parse(String(value || ""), { breaks: true, gfm: true, renderer });
    return DOMPurify.sanitize(parsed, { USE_PROFILES: { html: true } });
  }
  function addMessage(role, content, options) {
    const opts = options || {};
    const empty = $("welcome");
    if (empty) empty.hidden = true;
    const node = document.createElement("article");
    node.className = "message " + (role === "user" ? "user" : "assistant");
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? "M" : "✦";
    avatar.setAttribute("aria-hidden", "true");
    const body = document.createElement("div");
    body.className = "message-body";
    const heading = document.createElement("div");
    heading.className = "message-heading";
    heading.textContent = role === "user" ? "You" : "Mahi AI";
    const article = document.createElement("div");
    article.className = "message-content";
    if (opts.typing) {
      article.innerHTML = '<div class="typing-dots" aria-label="Thinking"><span></span><span></span><span></span></div>';
      node.dataset.typing = "true";
    } else if (role === "user") {
      article.textContent = content;
    } else {
      article.innerHTML = safeMarkdown(content);
    }
    body.append(heading, article);
    node.append(avatar, body);
    ui.messages.appendChild(node);
    scrollToBottom();
    return node;
  }
  function scrollToBottom() {
    requestAnimationFrame(() => {
      const area = $("conversationArea");
      area.scrollTop = area.scrollHeight;
    });
  }
  function showWelcome(show) {
    ui.welcome.hidden = !show;
    ui.messages.hidden = show;
    if (show) {
      ui.messages.replaceChildren();
      currentMessages = [];
    }
  }
  function closeMobileSidebar() {
    ui.sidebar.classList.remove("open");
    ui.scrim.classList.remove("show");
  }
  function openMobileSidebar() {
    ui.sidebar.classList.add("open");
    ui.scrim.classList.add("show");
  }
  function shortTitle(value) {
    return String(value || "New chat").replace(/\s+/g, " ").trim().slice(0, 56) || "New chat";
  }
  async function ensureSession() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data.session) {
      session = data.session;
      return session;
    }
    const result = await client.auth.signInAnonymously();
    if (result.error) throw result.error;
    session = result.data.session;
    return session;
  }
  async function refreshConversations() {
    if (!session) return;
    const { data, error } = await client.from("mahi_ai_conversations")
      .select("id,title,updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    conversations = data || [];
    renderConversationList();
  }
  function renderConversationList() {
    ui.chatList.replaceChildren();
    if (!conversations.length) {
      const empty = document.createElement("div");
      empty.className = "empty-history";
      empty.textContent = "Your conversations will appear here.";
      ui.chatList.appendChild(empty);
      return;
    }
    conversations.forEach((conversation) => {
      const row = document.createElement("div");
      row.className = "chat-item" + (conversation.id === conversationId ? " active" : "");
      const open = document.createElement("button");
      open.className = "chat-item";
      open.style.cssText = "padding:0;border:0;min-width:0;flex:1;background:transparent;color:inherit";
      open.innerHTML = '<span class="chat-icon">◌</span><span class="chat-title"></span>';
      open.querySelector(".chat-title").textContent = conversation.title || "New chat";
      open.title = conversation.title || "New chat";
      open.addEventListener("click", () => loadConversation(conversation.id));
      const del = document.createElement("button");
      del.className = "delete-chat";
      del.textContent = "×";
      del.title = "Delete conversation";
      del.setAttribute("aria-label", "Delete " + (conversation.title || "conversation"));
      del.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!confirm("Delete this conversation? This cannot be undone.")) return;
        const { error } = await client.from("mahi_ai_conversations").delete().eq("id", conversation.id);
        if (error) return setError("Could not delete that conversation. Please try again.");
        if (conversationId === conversation.id) {
          conversationId = null;
          showWelcome(true);
        }
        await refreshConversations();
      });
      row.append(open, del);
      ui.chatList.appendChild(row);
    });
  }
  async function loadConversation(id) {
    if (busy) return;
    setError("");
    try {
      const { data: rows, error } = await client.from("mahi_ai_conversations")
        .select("id,title").eq("id", id).single();
      if (error) throw error;
      const { data, error: messageError } = await client.from("mahi_ai_messages")
        .select("role,content,created_at").eq("conversation_id", id)
        .order("created_at", { ascending: true }).limit(200);
      if (messageError) throw messageError;
      conversationId = rows.id;
      currentMessages = (data || []).map((m) => ({ role: m.role, content: m.content }));
      ui.messages.replaceChildren();
      ui.welcome.hidden = true;
      ui.messages.hidden = false;
      currentMessages.forEach((m) => addMessage(m.role, m.content));
      renderConversationList();
      closeMobileSidebar();
    } catch (error) {
      setError(error instanceof Error && error.message.startsWith("Mahi AI: ")
        ? error.message.slice(9) : plainError(error));
    }
  }
  function beginNewChat() {
    if (busy) return;
    conversationId = null;
    showWelcome(true);
    setError("");
    renderConversationList();
    ui.input.focus();
    closeMobileSidebar();
  }
  async function sendMessage(text) {
    if (busy || !text.trim()) return;
    if (!session) {
      try { await ensureSession(); } catch (error) { setError(plainError(error)); return; }
    }
    setError("");
    const userText = text.trim();
    ui.input.value = "";
    ui.input.style.height = "auto";
    updateCounter();
    showWelcome(false);
    currentMessages.push({ role: "user", content: userText });
    addMessage("user", userText);
    const typing = addMessage("assistant", "", { typing: true });
    setBusy(true);
    try {
      const { data: authData, error: authError } = await client.auth.getSession();
      if (authError) throw authError;
      const accessToken = authData?.session?.access_token;
      if (!accessToken) throw new Error("Mahi AI: Your guest session expired. Reload the page and try again.");
      const response = await fetch(cfg.supabaseUrl + "/functions/v1/mahi-ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": cfg.supabasePublishableKey,
          "Authorization": "Bearer " + accessToken
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          messages: currentMessages.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content }))
        })
      });
      if (!response.ok) {
        let detail = "";
        try {
          const body = await response.json();
          detail = typeof body?.error === "string" ? body.error : "";
        } catch (_) {}
        throw new Error("Mahi AI: " + (detail || "Request failed. Please try again."));
      }
      if (!response.body) throw new Error("Mahi AI: Streaming is not supported by this browser.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let completed = false;
      const messageContent = typing.querySelector(".message-content");
      messageContent.classList.add("streaming-text");

      const handleStreamEvent = (block) => {
        const payloadLines = block.split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim());
        if (!payloadLines.length) return;
        let payload;
        try { payload = JSON.parse(payloadLines.join("\n")); } catch (_) { return; }
        if (payload.type === "meta" && payload.conversation_id) {
          conversationId = payload.conversation_id;
        } else if (payload.type === "delta" && typeof payload.text === "string") {
          if (!fullText) messageContent.textContent = "";
          fullText += payload.text;
          messageContent.textContent = fullText;
          scrollToBottom();
        } else if (payload.type === "done") {
          if (payload.conversation_id) conversationId = payload.conversation_id;
          completed = true;
        } else if (payload.type === "error") {
          throw new Error("Mahi AI: " + (payload.message || "The response was interrupted. Please try again."));
        }
      };

      while (true) {
        const part = await reader.read();
        buffer += decoder.decode(part.value, { stream: !part.done }).replace(/\r\n/g, "\n");
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          handleStreamEvent(block);
        }
        if (completed || part.done) break;
      }
      if (completed) {
        try { await reader.cancel(); } catch (_) {}
      } else {
        throw new Error("Mahi AI: The connection ended before the answer finished. Please try again.");
      }
      if (!fullText.trim()) throw new Error("Mahi AI: No response was returned. Please try again.");
      messageContent.classList.remove("streaming-text");
      messageContent.innerHTML = safeMarkdown(fullText);
      delete typing.dataset.typing;
      currentMessages.push({ role: "assistant", content: fullText });
      await refreshConversations();
    } catch (error) {
      typing.remove();
      currentMessages.pop();
      setError(plainError(error));
      // Keep the draft available so the user can retry without retyping.
      ui.input.value = userText;
      updateCounter();
      if (!currentMessages.length) {
        showWelcome(true);
      } else {
        ui.messages.replaceChildren();
        ui.welcome.hidden = true;
        ui.messages.hidden = false;
        currentMessages.forEach((m) => addMessage(m.role, m.content));
      }
    } finally {
      setBusy(false);
      ui.input.disabled = false;
      ui.input.focus();
    }
  }
  function updateCounter() {
    ui.charCount.textContent = ui.input.value.length + " / 12000";
    ui.send.disabled = busy || !ui.input.value.trim();
    ui.input.style.height = "auto";
    ui.input.style.height = Math.min(ui.input.scrollHeight, 180) + "px";
  }
  async function boot() {
    if (!cfg || !cfg.supabaseUrl || !cfg.supabasePublishableKey ||
        !window.supabase || !window.supabase.createClient) {
      ui.session.textContent = "Configuration missing";
      setError("Mahi AI is missing its Supabase public configuration. Check public/config.js.");
      ui.send.disabled = true;
      return;
    }
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    try {
      await ensureSession();
      ui.session.textContent = "Guest workspace";
      await refreshConversations();
      if (conversations.length) await loadConversation(conversations[0].id);
      else showWelcome(true);
    } catch (error) {
      ui.session.textContent = "Setup required";
      setError(plainError(error));
    }
  }

  ui.form.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage(ui.input.value);
  });
  ui.input.addEventListener("input", updateCounter);
  ui.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!busy && ui.input.value.trim()) sendMessage(ui.input.value);
    }
  });
  $("newChat").addEventListener("click", beginNewChat);
  $("refreshChats").addEventListener("click", () => refreshConversations().catch((e) => setError(plainError(e))));
  $("openSidebar").addEventListener("click", openMobileSidebar);
  $("closeSidebar").addEventListener("click", closeMobileSidebar);
  ui.scrim.addEventListener("click", closeMobileSidebar);
  document.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.input.value = button.getAttribute("data-prompt") || "";
      updateCounter();
      ui.input.focus();
    });
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      beginNewChat();
    }
    if (event.key === "Escape") closeMobileSidebar();
  });
  window.addEventListener("online", () => { if (!busy) setError(""); });
  boot();
})();