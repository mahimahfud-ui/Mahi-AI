(() => {
  "use strict";
  const cfg = window.MAHI_AI_CONFIG;
  const $ = (id) => document.getElementById(id);
  const ui = {
    sidebar: $("sidebar"), scrim: $("mobileScrim"), chatList: $("chatList"),
    welcome: $("welcome"), messages: $("messages"), form: $("chatForm"),
    input: $("promptInput"), send: $("sendButton"), error: $("errorBanner"),
    session: $("sessionLabel"), charCount: $("charCount"),
    fileInput: $("fileInput"), attachButton: $("attachButton"), attachmentList: $("attachmentList")
  };
  let client = null, session = null, conversationId = null, conversations = [];
  let busy = false, currentMessages = [], pendingFiles = [], previewUrls = [];
  let activeRequestController = null;
  const MAX_FILES = 5, MAX_FILE_BYTES = 15 * 1024 * 1024, MAX_TOTAL_BYTES = 20 * 1024 * 1024;
  const MAX_HISTORY = 24;
  // Use the visible viewport height so mobile browser chrome and virtual keyboards
  // don't push the composer off-screen. CSS dvh remains the fallback.
  function syncVisibleViewport() {
    const visibleHeight = window.visualViewport && window.visualViewport.height
      ? window.visualViewport.height
      : window.innerHeight;
    if (Number.isFinite(visibleHeight) && visibleHeight > 0) {
      document.documentElement.style.setProperty("--app-height", Math.round(visibleHeight) + "px");
    }
  }
  syncVisibleViewport();
  window.addEventListener("resize", syncVisibleViewport, { passive: true });
  window.addEventListener("orientationchange", syncVisibleViewport, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncVisibleViewport, { passive: true });
  }

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
    const canStop = value && !!activeRequestController;
    ui.send.disabled = value ? !canStop : (!ui.input.value.trim() && !pendingFiles.length);
    ui.send.setAttribute("aria-label", canStop ? "Stop generation" : "Send message");
    ui.send.title = canStop ? "Stop generation" : "Send message";
    ui.input.disabled = value;
    ui.attachButton.disabled = value;
    ui.fileInput.disabled = value;
    ui.send.innerHTML = canStop
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10H7z"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6.5 10.5 12 5l5.5 5.5"/></svg>';
  }
  function throwIfAborted(signal) {
    if (signal && signal.aborted) {
      const error = new Error("Request cancelled");
      error.name = "AbortError";
      throw error;
    }
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

  function buildLivePreviewDocument(html, cssBlocks, jsBlocks) {
    let doc = String(html || "").trim();
    if (!doc) return "";
    if (!/<html\b/i.test(doc)) {
      doc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + doc + '</body></html>';
    } else {
      if (!/<!doctype\s+html/i.test(doc)) doc = "<!doctype html>\n" + doc;
      if (!/<head\b/i.test(doc)) {
        doc = doc.replace(/<html\b[^>]*>/i, (htmlTag) => htmlTag + '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>');
      } else {
        if (!/<meta\b[^>]*charset\s*=/i.test(doc)) doc = doc.replace(/<head\b[^>]*>/i, (headTag) => headTag + '<meta charset="utf-8">');
        if (!/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(doc)) doc = doc.replace(/<head\b[^>]*>/i, (headTag) => headTag + '<meta name="viewport" content="width=device-width, initial-scale=1">');
      }
    }
    const styles = (cssBlocks || []).filter(Boolean);
    if (styles.length) {
      const styleText = '<style>\n' + styles.join('\n\n').replace(/<\/style/gi, '<\\/style') + '\n</style>';
      if (/<\/head>/i.test(doc)) doc = doc.replace(/<\/head>/i, styleText + '</head>');
      else if (/<head\b[^>]*>/i.test(doc)) doc = doc.replace(/<head\b[^>]*>/i, (headTag) => headTag + styleText);
      else doc = doc.replace(/<html\b[^>]*>/i, (htmlTag) => htmlTag + '<head>' + styleText + '</head>');
    }
    const scripts = (jsBlocks || []).filter(Boolean);
    if (scripts.length) {
      const jsText = scripts.join('\n\n').replace(/<\/script/gi, '<\\/script');
      const moduleScript = scripts.some((code) => /(^|\n)\s*(?:import|export)\s/m.test(code));
      const scriptTag = '<script' + (moduleScript ? ' type="module"' : '') + '>\n' + jsText + '\n</script>';
      if (/<\/body>/i.test(doc)) doc = doc.replace(/<\/body>/i, scriptTag + '</body>');
      else doc += scriptTag;
    }
    return doc;
  }

  function extractLivePreviewDocument(markdown) {
    const source = String(markdown || "");
    const fence = new RegExp("\\x60{3}([^\\r\\n]*)\\r?\\n([\\s\\S]*?)\\x60{3}", "g");
    const blocks = [];
    let match;
    while ((match = fence.exec(source)) !== null) {
      const info = String(match[1] || "").trim();
      const lang = (info.split(/\s+/)[0] || "").toLowerCase();
      blocks.push({ lang, code: String(match[2] || "").trim() });
    }
    if (!blocks.length) return "";
    const htmlBlock = blocks.find((block) => ["html", "htm", "xhtml"].includes(block.lang))
      || blocks.find((block) => !block.lang && /(?:<!doctype\s+html|<html\b)/i.test(block.code));
    if (!htmlBlock || !htmlBlock.code) return "";
    const styles = blocks.filter((block) => block.lang === "css").map((block) => block.code);
    const scripts = blocks.filter((block) => ["js", "javascript", "mjs"].includes(block.lang)).map((block) => block.code);
    return buildLivePreviewDocument(htmlBlock.code, styles, scripts);
  }

  function renderLivePreview(messageNode, article, markdown) {
    if (!messageNode || !article || messageNode.dataset.livePreviewRendered === "true") return;
    const documentSource = extractLivePreviewDocument(markdown);
    if (!documentSource || documentSource.length > 260000) return;
    const body = article.parentElement;
    if (!body) return;
    messageNode.dataset.livePreviewRendered = "true";
    const card = document.createElement("section");
    card.className = "live-preview-card";
    card.setAttribute("aria-label", "Live website preview");
    card.innerHTML =
      '<div class="live-preview-toolbar">' +
        '<div class="live-preview-label"><span class="live-preview-spark" aria-hidden="true">✦</span><span><strong>Live Preview</strong><small>Runs in an isolated browser</small></span></div>' +
        '<div class="live-preview-controls">' +
          '<button type="button" class="live-preview-mode is-active" data-preview-mode="desktop" aria-pressed="true">Desktop</button>' +
          '<button type="button" class="live-preview-mode" data-preview-mode="tablet" aria-pressed="false">Tablet</button>' +
          '<button type="button" class="live-preview-mode" data-preview-mode="mobile" aria-pressed="false">Mobile</button>' +
          '<button type="button" class="live-preview-icon-button" data-preview-reload title="Reload preview" aria-label="Reload preview">↻</button>' +
          '<button type="button" class="live-preview-expand" data-preview-expand>Expand</button>' +
        '</div>' +
      '</div>' +
      '<div class="live-preview-browser">' +
        '<div class="live-preview-browserbar"><span class="live-preview-window-dots" aria-hidden="true"><i></i><i></i><i></i></span><div class="live-preview-address"><span aria-hidden="true">⌕</span> mahi-ai.local / preview</div><span class="live-preview-sandbox-tag">SANDBOX</span></div>' +
        '<div class="live-preview-stage"><div class="live-preview-viewport" data-device="desktop"><iframe title="Generated website preview" sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy"></iframe></div></div>' +
      '</div>' +
      '<div class="live-preview-footnote"><span class="live-preview-status-dot" aria-hidden="true"></span> Preview generated from the HTML/CSS/JavaScript in this answer.</div>';
    const frame = card.querySelector("iframe");
    const viewport = card.querySelector(".live-preview-viewport");
    const modeButtons = Array.from(card.querySelectorAll("[data-preview-mode]"));
    const expandButton = card.querySelector("[data-preview-expand]");
    const loadPreview = () => { frame.srcdoc = documentSource; };
    modeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        viewport.dataset.device = button.getAttribute("data-preview-mode") || "desktop";
        modeButtons.forEach((item) => {
          const active = item === button;
          item.classList.toggle("is-active", active);
          item.setAttribute("aria-pressed", active ? "true" : "false");
        });
      });
    });
    card.querySelector("[data-preview-reload]").addEventListener("click", loadPreview);
    expandButton.addEventListener("click", () => {
      const expanded = card.classList.toggle("is-expanded");
      expandButton.textContent = expanded ? "Collapse" : "Expand";
      expandButton.setAttribute("aria-expanded", expanded ? "true" : "false");
    });
    body.insertBefore(card, article);
    loadPreview();
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
      if (Array.isArray(opts.files) && opts.files.length) {
        const files = document.createElement("div");
        files.className = "message-attachments";
        opts.files.forEach((file) => {
          const chip = document.createElement("span");
          chip.className = "message-attachment";
          const icon = document.createElement("b");
          icon.textContent = file.type && file.type.startsWith("image/") ? "▧" : "↳";
          const label = document.createElement("span");
          label.textContent = file.name || "Attachment";
          label.title = file.name || "Attachment";
          chip.append(icon, label);
          files.appendChild(chip);
        });
        body.appendChild(files);
      }
      article.textContent = content;
    } else {
      article.textContent = content;
      resolveStoredImageMarkers(content).then((resolved) => {
        if (article.isConnected) {
          article.innerHTML = safeMarkdown(resolved);
          renderLivePreview(node, article, content);
        }
      }).catch(() => {
        if (article.isConnected) {
          article.innerHTML = safeMarkdown(content.replace(/!\[Generated image\]\(mahi-storage:\/\/[^)]+\)/g, "[Generated image is stored in this chat.]"));
          renderLivePreview(node, article, content);
        }
      });
    }
    body.append(heading, article);
    node.append(avatar, body);
    ui.messages.appendChild(node);
    scrollToBottom();
    return node;
  }
  function formatBytes(value) {
    if (value < 1024) return value + " B";
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
    return (value / (1024 * 1024)).toFixed(1) + " MB";
  }
  function renderAttachmentList() {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    previewUrls = [];
    ui.attachmentList.replaceChildren();
    ui.attachmentList.hidden = pendingFiles.length === 0;
    pendingFiles.forEach((file, index) => {
      const chip = document.createElement("div");
      chip.className = "attachment-chip";
      if (file.type && file.type.startsWith("image/")) {
        const image = document.createElement("img");
        const url = URL.createObjectURL(file);
        previewUrls.push(url);
        image.src = url;
        image.alt = "";
        chip.appendChild(image);
      } else {
        const fileIcon = document.createElement("span");
        fileIcon.className = "attachment-file-icon";
        fileIcon.textContent = (file.name.split(".").pop() || "FILE").slice(0, 4).toUpperCase();
        chip.appendChild(fileIcon);
      }
      const details = document.createElement("span");
      details.className = "attachment-chip-info";
      const name = document.createElement("span");
      name.className = "attachment-chip-name";
      name.textContent = file.name;
      name.title = file.name;
      const size = document.createElement("span");
      size.className = "attachment-chip-size";
      size.textContent = formatBytes(file.size);
      details.append(name, size);
      const remove = document.createElement("button");
      remove.className = "attachment-remove";
      remove.type = "button";
      remove.textContent = "×";
      remove.title = "Remove " + file.name;
      remove.setAttribute("aria-label", "Remove " + file.name);
      remove.addEventListener("click", () => {
        pendingFiles.splice(index, 1);
        renderAttachmentList();
        updateCounter();
      });
      chip.append(details, remove);
      ui.attachmentList.appendChild(chip);
    });
  }
  function addPendingFiles(files) {
    let rejected = [];
    for (const file of files) {
      if (pendingFiles.length >= MAX_FILES) {
        rejected.push("Maximum " + MAX_FILES + " files per message.");
        break;
      }
      if (file.size > MAX_FILE_BYTES) {
        rejected.push(file.name + " exceeds the 15 MB per-file limit.");
        continue;
      }
      const total = pendingFiles.reduce((sum, item) => sum + item.size, 0);
      if (total + file.size > MAX_TOTAL_BYTES) {
        rejected.push("Attachments must total 20 MB or less.");
        continue;
      }
      if (pendingFiles.some((item) => item.name === file.name && item.size === file.size)) continue;
      pendingFiles.push(file);
    }
    renderAttachmentList();
    updateCounter();
    setError(rejected.length ? rejected.join(" ") : "");
  }
  const scriptPromises = Object.create(null);
  function loadExternalScript(url, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    if (scriptPromises[url]) return scriptPromises[url];
    scriptPromises[url] = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = () => {
        if (window[globalName]) resolve(window[globalName]);
        else {
          delete scriptPromises[url];
          script.remove();
          reject(new Error("Document parser failed to load."));
        }
      };
      script.onerror = () => {
        delete scriptPromises[url];
        script.remove();
        reject(new Error("Could not load the document parser. Try a PDF or plain-text export instead."));
      };
      document.head.appendChild(script);
    });
    return scriptPromises[url];
  }
  async function extractDocumentText(file) {
    const lower = file.name.toLowerCase();
    const extension = lower.split(".").pop() || "";
    if (extension === "docx") {
      await loadExternalScript("https://unpkg.com/mammoth@1.9.0/mammoth.browser.min.js", "mammoth");
      const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return String(result.value || "").slice(0, 12000);
    }
    if (["xlsx", "xls", "ods"].includes(extension)) {
      await loadExternalScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", "XLSX");
      const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sections = [];
      let total = 0;
      for (const sheetName of workbook.SheetNames || []) {
        if (total >= 16000) break;
        const part = "### Sheet: " + sheetName + "\n" +
          window.XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]).slice(0, 16000 - total);
        sections.push(part);
        total += part.length;
      }
      return sections.join("\n\n").slice(0, 16000);
    }
    if (["pptx", "odp", "odt"].includes(extension)) {
      await loadExternalScript("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js", "JSZip");
      const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
      const targetFiles = Object.keys(zip.files).filter((name) =>
        !zip.files[name].dir &&
        (extension === "pptx" ? /^ppt\/slides\/slide\d+\.xml$/i.test(name) :
          /^(?:content\.xml|word\/document\.xml)$/i.test(name))
      ).sort();
      const parts = [];
      let total = 0;
      for (const name of targetFiles.slice(0, 40)) {
        if (total >= 16000) break;
        const xml = await zip.files[name].async("string");
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        const nodes = extension === "pptx"
          ? doc.getElementsByTagNameNS("*", "t")
          : doc.getElementsByTagNameNS("urn:oasis:names:tc:opendocument:xmlns:text:1.0", "p");
        const text = Array.from(nodes).map((node) => node.textContent || "").join(" ").trim();
        if (text) {
          parts.push((extension === "pptx" ? name.split("/").pop() : "Document text") + ":\n" + text);
          total += text.length;
        }
      }
      return parts.join("\n\n").slice(0, 16000);
    }
    if (extension === "zip") {
      await loadExternalScript("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js", "JSZip");
      const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
      const readable = Object.keys(zip.files).filter((name) =>
        !zip.files[name].dir && /\.(txt|md|csv|json|xml|html|css|js|ts|py|sql|yaml|yml|log|java|go|rs|c|cpp|sh)$/i.test(name)
      ).slice(0, 20);
      const parts = [];
      let total = 0;
      for (const name of readable) {
        if (total >= 12000) break;
        const entry = zip.files[name];
        const size = entry._data && entry._data.uncompressedSize;
        if (typeof size === "number" && size > 1024 * 1024) continue;
        const text = (await entry.async("string")).slice(0, Math.min(4000, 12000 - total));
        parts.push("### " + name + "\n" + text);
        total += text.length;
      }
      return parts.join("\n\n").slice(0, 12000);
    }
    return "";
  }

  async function uploadPendingAttachments(files, signal) {
    const uploaded = [];
    let totalExtracted = 0;
    try {
      for (const file of files) {
        throwIfAborted(signal);
        let extractedText = "";
        try {
          extractedText = await extractDocumentText(file);
        } catch (error) {
          // Any file type remains attachable even when its optional text extractor is unavailable.
          // Extraction is best-effort; the original file can still be uploaded.
          extractedText = "";
        }
        throwIfAborted(signal);
        if (extractedText) {
          const remaining = Math.max(0, 30000 - totalExtracted);
          extractedText = extractedText.slice(0, remaining);
          totalExtracted += extractedText.length;
        }
        const safeName = file.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(-100) || "attachment";
        const path = session.user.id + "/" + crypto.randomUUID() + "/" + safeName;
        const result = await client.storage.from("mahi-ai-attachments").upload(path, file, {
          upsert: false, contentType: file.type || "application/octet-stream", cacheControl: "3600"
        });
        if (result.error) throw new Error("Mahi AI: Could not upload " + file.name + ". Check the Supabase attachment bucket setup and try again.");
        uploaded.push({
          path: result.data.path, name: file.name, mime_type: file.type || "application/octet-stream",
          size: file.size, extracted_text: extractedText
        });
        throwIfAborted(signal);
      }
      return uploaded;
    } catch (error) {
      if (uploaded.length) {
        try { await client.storage.from("mahi-ai-attachments").remove(uploaded.map((item) => item.path)); } catch (_) {}
      }
      throw error;
    }
  }
  async function resolveStoredImageMarkers(content) {
    if (!client || !session || !content) return content;
    const expression = /mahi-storage:\/\/([A-Za-z0-9/_-]+\.(?:png|jpe?g|webp))/gi;
    const matches = [...content.matchAll(expression)];
    let result = content;
    for (const match of matches) {
      const path = match[1];
      if (!path.startsWith(session.user.id + "/")) continue;
      const { data, error } = await client.storage.from("mahi-ai-generated").createSignedUrl(path, 7 * 24 * 60 * 60);
      if (!error && data && data.signedUrl) result = result.replace(match[0], new URL(data.signedUrl, cfg.supabaseUrl).href);
      else result = result.replace("![" + "Generated image" + "](" + match[0] + ")", "[Generated image is stored, but the preview link could not be refreshed.]");
    }
    return result;
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
    session = result.data?.session || null;
    if (!session || !session.access_token || !session.user?.id) {
      throw new Error("Guest sign-in did not return a valid session.");
    }
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
      currentMessages.forEach((m, index) => addMessage(m.role, m.content, { userPrompt: m.role === "assistant" ? [...currentMessages.slice(0, index)].reverse().find((item) => item.role === "user")?.content || "" : "" }));
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
    const draft = String(text || "").trim();
    if (busy || (!draft && !pendingFiles.length)) return;
    const selectedFiles = pendingFiles.slice();
    const userText = draft || (selectedFiles.length === 1
      ? "Please analyze the attached file."
      : "Please analyze the attached files.");
    activeRequestController = new AbortController();
    setBusy(true);
    try {
      // Always re-check auth before a send. This recovers from expired tokens and
      // Supabase auth changes propagated from another tab.
      await ensureSession();
    } catch (error) {
      setError(plainError(error));
      activeRequestController = null;
      setBusy(false);
      return;
    }
    setError("");
    ui.input.value = "";
    ui.input.style.height = "auto";
    updateCounter();
    showWelcome(false);
    currentMessages.push({ role: "user", content: userText });
    addMessage("user", userText, { files: selectedFiles });
    const typing = addMessage("assistant", "", { typing: true });
    let uploadedAttachments = [];
    try {
      uploadedAttachments = await uploadPendingAttachments(selectedFiles, activeRequestController.signal);
      throwIfAborted(activeRequestController.signal);
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
        signal: activeRequestController.signal,
        body: JSON.stringify({
          conversation_id: conversationId,
          messages: currentMessages.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content })),
          attachments: uploadedAttachments
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
        } else if (payload.type === "status" && typeof payload.message === "string") {
          messageContent.textContent = payload.message;
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
      const resolvedReply = await resolveStoredImageMarkers(fullText);
      messageContent.innerHTML = safeMarkdown(resolvedReply);
      renderLivePreview(typing, messageContent, fullText);
      delete typing.dataset.typing;
      currentMessages.push({ role: "assistant", content: fullText });
      pendingFiles = [];
      renderAttachmentList();
      updateCounter();
      try {
        await refreshConversations();
      } catch (_) {
        // The answer has already arrived and was saved. A sidebar refresh failure
        // must not erase that successful response or duplicate the user's draft.
        setError("Your reply was received, but chat history could not refresh. Use Refresh chats to try again.");
      }
    } catch (error) {
      typing.remove();
      currentMessages.pop();
      if (uploadedAttachments.length) {
        try { await client.storage.from("mahi-ai-attachments").remove(uploadedAttachments.map((item) => item.path)); } catch (_) {}
      }
      const cancelled = !!activeRequestController?.signal.aborted || error?.name === "AbortError";
      setError(cancelled
        ? "Generation stopped. Your message and attachments are ready to retry."
        : (error instanceof Error && error.message.startsWith("Mahi AI: ")
          ? error.message.slice(9) : plainError(error)));
      // Keep the draft and selected files available so the user can retry.
      ui.input.value = userText;
      updateCounter();
      if (!currentMessages.length) {
        showWelcome(true);
      } else {
        ui.messages.replaceChildren();
        ui.welcome.hidden = true;
        ui.messages.hidden = false;
        currentMessages.forEach((m, index) => addMessage(m.role, m.content, { userPrompt: m.role === "assistant" ? [...currentMessages.slice(0, index)].reverse().find((item) => item.role === "user")?.content || "" : "" }));
      }
    } finally {
      activeRequestController = null;
      setBusy(false);
      ui.input.disabled = false;
      ui.input.focus();
    }
  }
  // Public API Library: catalogue metadata comes from the community-maintained public-apis README.
  const apiUi = {
    overlay: $("apiExplorer"),
    open: $("openApiExplorer"),
    close: $("closeApiExplorer"),
    search: $("apiSearch"),
    category: $("apiCategory"),
    auth: $("apiAuth"),
    https: $("apiHttps"),
    cors: $("apiCors"),
    status: $("apiExplorerStatus"),
    results: $("apiExplorerResults"),
    count: $("apiResultCount"),
    more: $("apiLoadMore")
  };
  const API_README_URL = "https://raw.githubusercontent.com/public-apis/public-apis/master/README.md";
  const API_PAGE_SIZE = 60;
  let apiEntries = [];
  let apiDirectoryLoaded = false;
  let apiVisibleCount = API_PAGE_SIZE;
  let apiPriorFocus = null;

  function cleanApiMarkdown(value) {
    return String(value || "")
      .replace(/<img\b[^>]*>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")
      .replace(/\u0060([^\u0060]+)\u0060/g, "$1")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/__(.*?)__/g, "$1")
      .replace(/[*_~]/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parsePublicApiReadme(markdown) {
    const lines = String(markdown || "").split(/\r?\n/);
    const entries = [];
    let inIndex = false;
    let category = "";
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (/^##\s+Index\s*$/i.test(line)) {
        inIndex = true;
        continue;
      }
      if (inIndex && /^##\s+/.test(line)) break;
      if (!inIndex) continue;
      const heading = line.match(/^###\s+(.+?)\s*$/);
      if (heading) {
        category = cleanApiMarkdown(heading[1]);
        continue;
      }
      if (!line.startsWith("|")) continue;
      if (/^\|\s*API\s*\|/i.test(line) || /^[|:\-\s]+$/.test(line)) continue;
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      if (cells.length < 5) continue;
      const nameLink = cells[0].match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
      const name = cleanApiMarkdown(nameLink ? nameLink[1] : cells[0]);
      const url = nameLink ? nameLink[2].trim() : "";
      if (!name || !/^https?:\/\//i.test(url)) continue;
      const authLabel = cleanApiMarkdown(cells[2]) || "Unknown";
      const httpsLabel = cleanApiMarkdown(cells[3]) || "Unknown";
      const corsLabel = cleanApiMarkdown(cells[4]) || "Unknown";
      entries.push({
        name,
        url,
        category: category || "Other",
        description: cleanApiMarkdown(cells[1]) || "No description provided.",
        authLabel,
        auth: /^(no|none|n\/a)$/i.test(authLabel) ? "none" : /^(unknown|not sure)$/i.test(authLabel) ? "unknown" : "required",
        httpsLabel,
        https: /^yes$/i.test(httpsLabel) ? "yes" : /^no$/i.test(httpsLabel) ? "no" : "unknown",
        corsLabel,
        cors: /^yes$/i.test(corsLabel) ? "yes" : /^no$/i.test(corsLabel) ? "no" : "unknown"
      });
    }
    return entries;
  }

  function makeApiBadge(label, style) {
    const badge = document.createElement("span");
    badge.className = "api-badge" + (style ? " " + style : "");
    badge.textContent = label;
    return badge;
  }

  function renderApiDirectory() {
    const query = apiUi.search.value.trim().toLowerCase();
    const category = apiUi.category.value;
    const auth = apiUi.auth.value;
    const https = apiUi.https.value;
    const cors = apiUi.cors.value;
    const filtered = apiEntries.filter((api) => {
      if (category && api.category !== category) return false;
      if (auth && (auth === "none" ? api.auth !== "none" : api.auth !== "required")) return false;
      if (https && api.https !== https) return false;
      if (cors && api.cors !== cors) return false;
      if (query && !(api.name + " " + api.description + " " + api.category + " " + api.authLabel).toLowerCase().includes(query)) return false;
      return true;
    });
    const shown = filtered.slice(0, apiVisibleCount);
    apiUi.results.replaceChildren();
    const fragment = document.createDocumentFragment();

    for (const api of shown) {
      const card = document.createElement("article");
      card.className = "api-card";

      const heading = document.createElement("div");
      heading.className = "api-card-heading";
      const name = document.createElement("h3");
      name.textContent = api.name;
      const categoryTag = document.createElement("span");
      categoryTag.className = "api-category-tag";
      categoryTag.textContent = api.category;
      categoryTag.title = api.category;
      heading.append(name, categoryTag);

      const description = document.createElement("p");
      description.className = "api-card-description";
      description.textContent = api.description;

      const badges = document.createElement("div");
      badges.className = "api-card-badges";
      badges.append(
        makeApiBadge("Auth: " + api.authLabel, api.auth === "none" ? "good" : api.auth === "required" ? "warn" : ""),
        makeApiBadge("HTTPS: " + api.httpsLabel, api.https === "yes" ? "good" : api.https === "no" ? "warn" : ""),
        makeApiBadge("CORS: " + api.corsLabel, api.cors === "yes" ? "good" : api.cors === "no" ? "warn" : "")
      );

      const actions = document.createElement("div");
      actions.className = "api-card-actions";
      const openLink = document.createElement("a");
      openLink.className = "api-card-link";
      openLink.href = api.url;
      openLink.target = "_blank";
      openLink.rel = "noopener noreferrer";
      openLink.textContent = "API details ↗";

      const askButton = document.createElement("button");
      askButton.className = "api-card-ask";
      askButton.type = "button";
      askButton.textContent = "Ask AI";
      askButton.addEventListener("click", () => {
        if (busy) {
          closeApiDirectory();
          setError("Please finish the current response before starting a new API integration chat.");
          return;
        }
        closeApiDirectory();
        beginNewChat();
        ui.input.value =
          "Help me understand and safely integrate this public API into my project:\n\n" +
          "API: " + api.name + "\n" +
          "Category: " + api.category + "\n" +
          "Description: " + api.description + "\n" +
          "Documentation/homepage: " + api.url + "\n" +
          "Authentication listed: " + api.authLabel + "\n" +
          "HTTPS: " + api.httpsLabel + "\n" +
          "CORS: " + api.corsLabel + "\n\n" +
          "Explain the API's intended use and show a practical integration approach. Check the official documentation before assuming endpoint paths or parameters. Keep private API keys server-side; do not put secrets in browser code. Mention usage limits and terms where relevant.";
        updateCounter();
        ui.input.focus();
      });

      actions.append(openLink, askButton);
      card.append(heading, description, badges, actions);
      fragment.append(card);
    }
    apiUi.results.append(fragment);

    apiUi.status.textContent = apiEntries.length
      ? "Loaded " + apiEntries.length.toLocaleString() + " community-listed APIs. Filter by category, authentication, HTTPS, or CORS."
      : apiUi.status.textContent;
    apiUi.count.textContent = filtered.length
      ? "Showing " + shown.length.toLocaleString() + " of " + filtered.length.toLocaleString() + " matching APIs"
      : "No APIs match these filters.";
    apiUi.more.hidden = shown.length >= filtered.length;
    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "api-empty-state";
      empty.textContent = "No matches found. Try a different search or reset one of the filters.";
      apiUi.results.append(empty);
    }
  }

  async function loadApiDirectory() {
    if (apiDirectoryLoaded || !apiUi.status) return;
    apiUi.status.textContent = "Loading the latest community API catalogue…";
    apiUi.results.replaceChildren();
    apiUi.count.textContent = "";
    try {
      const response = await fetch(API_README_URL, { cache: "no-cache", headers: { Accept: "text/plain" } });
      if (!response.ok) throw new Error("GitHub returned HTTP " + response.status);
      const markdown = await response.text();
      const parsed = parsePublicApiReadme(markdown);
      if (!parsed.length) throw new Error("The repository returned no parseable API entries.");
      apiEntries = parsed;
      apiDirectoryLoaded = true;
      const categories = Array.from(new Set(apiEntries.map((api) => api.category))).sort((a, b) => a.localeCompare(b));
      apiUi.category.replaceChildren();
      const all = document.createElement("option");
      all.value = "";
      all.textContent = "All categories";
      apiUi.category.append(all);
      for (const label of categories) {
        const option = document.createElement("option");
        option.value = label;
        option.textContent = label;
        apiUi.category.append(option);
      }
      apiUi.status.textContent = "";
      renderApiDirectory();
    } catch (error) {
      apiUi.status.textContent = "Could not load the API list (" + (error instanceof Error ? error.message : "network error") + "). Check your connection and reopen the library to retry, or visit the source repository below.";
      apiUi.results.replaceChildren();
      apiUi.count.textContent = "";
      apiDirectoryLoaded = false;
    }
  }

  function closeApiDirectory() {
    if (!apiUi.overlay) return;
    apiUi.overlay.hidden = true;
    if (apiPriorFocus && typeof apiPriorFocus.focus === "function") apiPriorFocus.focus();
  }

  function openApiDirectory() {
    if (!apiUi.overlay) return;
    apiPriorFocus = document.activeElement;
    closeMobileSidebar();
    apiUi.overlay.hidden = false;
    if (apiDirectoryLoaded) renderApiDirectory();
    else loadApiDirectory();
    window.setTimeout(() => apiUi.search.focus(), 0);
  }

  function updateCounter() {
    ui.charCount.textContent = ui.input.value.length + " / 12000";
    ui.send.disabled = busy ? !activeRequestController : (!ui.input.value.trim() && !pendingFiles.length);
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
    client.auth.onAuthStateChange((event, nextSession) => {
      session = nextSession;
      if (nextSession) ui.session.textContent = "Guest workspace";
      else if (event === "SIGNED_OUT") ui.session.textContent = "Guest session ended";
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
    if (busy) {
      if (activeRequestController && !activeRequestController.signal.aborted) {
        activeRequestController.abort();
      }
      return;
    }
    sendMessage(ui.input.value);
  });
  ui.attachButton.addEventListener("click", () => ui.fileInput.click());
  ui.fileInput.addEventListener("change", () => {
    addPendingFiles(Array.from(ui.fileInput.files || []));
    ui.fileInput.value = "";
  });
  ui.input.addEventListener("input", updateCounter);
  ui.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!busy && ui.input.value.trim()) sendMessage(ui.input.value);
    }
  });
  if (apiUi.open) apiUi.open.addEventListener("click", openApiDirectory);
  if (apiUi.close) apiUi.close.addEventListener("click", closeApiDirectory);
  if (apiUi.overlay) apiUi.overlay.querySelectorAll("[data-api-close]").forEach((el) => el.addEventListener("click", closeApiDirectory));
  if (apiUi.search) apiUi.search.addEventListener("input", () => { apiVisibleCount = API_PAGE_SIZE; if (apiDirectoryLoaded) renderApiDirectory(); });
  [apiUi.category, apiUi.auth, apiUi.https, apiUi.cors].forEach((select) => {
    if (select) select.addEventListener("change", () => { apiVisibleCount = API_PAGE_SIZE; if (apiDirectoryLoaded) renderApiDirectory(); });
  });
  if (apiUi.more) apiUi.more.addEventListener("click", () => { apiVisibleCount += API_PAGE_SIZE; renderApiDirectory(); });
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
    if (event.key === "Escape") { closeApiDirectory(); closeMobileSidebar(); }
  });
  window.addEventListener("online", () => { if (!busy) setError(""); });
  boot();
})();