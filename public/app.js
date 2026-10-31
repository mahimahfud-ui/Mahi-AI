(() => {
  "use strict";
  const cfg = window.MAHI_AI_CONFIG;
  const $ = (id) => document.getElementById(id);
  const mahiStepPanels = new WeakMap();
  const mahiSteps = {
    update(typing, payload) {
      const host = typing && typing.querySelector(".message-content");
      if (!host || !payload) return;
      let state = mahiStepPanels.get(host);
      if (!state) {
        const panel = document.createElement("section");
        panel.className = "mahi-steps is-open";
        const header = document.createElement("button");
        header.type = "button";
        header.className = "mahi-steps-head";
        header.setAttribute("aria-expanded", "true");
        const title = document.createElement("span");
        title.className = "mahi-steps-title";
        title.textContent = "Working…";
        const list = document.createElement("ol");
        list.className = "mahi-steps-list";
        header.append(title);
        header.addEventListener("click", event => {
          const open = panel.classList.toggle("is-open");
          event.currentTarget.setAttribute("aria-expanded", String(open));
        });
        panel.append(header, list);
        host.before(panel);
        state = { panel, header, title, list, items: new Map() };
        mahiStepPanels.set(host, state);
      }
      const id = String(payload.id || "step-" + state.items.size);
      const label = String(payload.label || payload.message || "");
      if (!label) return;
      let item = state.items.get(id);
      if (!item) {
        item = document.createElement("li");
        state.items.set(id, item);
        state.list.append(item);
      }
      item.className = "mahi-step is-" + String(payload.state || "running");
      item.textContent = label;
      if (payload.detail) item.title = String(payload.detail);
      state.title.textContent = label;
    },
    finish(typing) {
      const host = typing && typing.querySelector(".message-content");
      const state = host && mahiStepPanels.get(host);
      if (!state) return;
      state.list.querySelectorAll(".is-running").forEach(item => item.classList.replace("is-running", "is-done"));
      state.title.textContent = "Completed · " + state.items.size + " steps";
      state.panel.classList.add("is-finished");
      state.panel.classList.remove("is-open");
      state.header.setAttribute("aria-expanded", "false");
    }
  };
  const OFFICIAL_LOGO_URL = "https://raw.githubusercontent.com/mahimahfud-ui/Mahi-AI/main/Cybernetic%20Half-Face%20Portrait.png";
  const THEME_STORAGE_KEY = "mahi-ai-theme";
  const DISPLAY_NAME_STORAGE_KEY = "mahi-ai-display-name";
  const CHAT_PREFERENCES_STORAGE_KEY = "mahi-ai-chat-preferences";
  const DEFAULT_CHAT_PREFERENCES = Object.freeze({
    enterToSend: true, autoScroll: true, density: "comfortable", fontSize: "default",
    responseStyle: "default", customInstructions: "", autoReadAloud: false
  });
  let chatPreferences = { ...DEFAULT_CHAT_PREFERENCES };
  const ui = {
    sidebar: $("sidebar"), scrim: $("mobileScrim"), chatList: $("chatList"),
    welcome: $("welcome"), messages: $("messages"), form: $("chatForm"),
    input: $("promptInput"), send: $("sendButton"), error: $("errorBanner"),
    session: $("sessionLabel"), charCount: $("charCount"),
    fileInput: $("fileInput"), attachButton: $("attachButton"), attachmentList: $("attachmentList"),
    chatSearch: $("chatSearch"), stop: $("stopButton"), draftNotice: $("draftNotice"),
    temporaryChatButton: $("temporaryChatButton"), exportMarkdownButton: $("exportMarkdownButton"), exportJsonButton: $("exportJsonButton"),
    accountButton: $("accountButton"), accountModal: $("accountModal"), voiceModeButton: $("voiceModeButton"), thinkModeButton: $("thinkModeButton"), modelPicker: $("modelPicker")
  };
  const voiceUI = {
    overlay: $("voiceOverlay"), stage: $("voiceStage"), status: $("voiceStatus"), transcript: $("voiceTranscript"),
    interim: $("voiceInterim"), mic: $("voiceMicButton"), end: $("voiceEndButton"), language: $("voiceLanguage")
  };
  let voiceModeActive = false, voicePaused = false, voiceIsListening = false, voiceIsSpeaking = false;
  let voiceRecognition = null, voiceCurrentUtterance = null, voiceRestartTimer = null;
  let voiceForceRecorder = false, voiceRecorder = null, voiceMediaStream = null, voiceMediaChunks = [];
  let voiceRecorderSubmitOnStop = true, voiceRecorderStopTimer = null, voiceNoSpeechCount = 0;
  let voiceAudioContext = null, voiceAnalyser = null, voiceAudioSource = null, voiceMonitorFrame = null;
  let voiceHasSpeech = false, voiceSpeechStartedAt = 0, voiceSilenceStartedAt = 0;
  let voiceResponseLanguage = "";
  let client = null, session = null, conversationId = null, conversations = [];
  let busy = false, currentMessages = [], pendingFiles = [], previewUrls = [];
  let thinkModeEnabled = false;
  let selectedModel = "auto";
  let activeRequestController = null, pendingEdit = null, temporaryChatMode = false;
  let branchSeedMessages = null, branchOrigin = null;
  let chatSearchMatches = null, chatSearchSequence = 0;
  let accountMethod = "email", accountMode = "register";
  let phoneOtpPending = false, pendingPhone = "", phoneOtpType = "sms", accountReturnFocus = null;
  const MAX_FILES = 5, MAX_FILE_BYTES = 15 * 1024 * 1024, MAX_TOTAL_BYTES = 20 * 1024 * 1024;
  const MAX_HISTORY = 24;
  // Keep the app frame matched to the visible viewport, including mobile browser
  // chrome, soft keyboards, orientation changes, and restored browser tabs.
  let viewportSyncFrame = 0;
  function syncVisibleViewport() {
    const viewport = window.visualViewport;
    const visibleHeight = viewport && Number.isFinite(viewport.height) && viewport.height > 0
      ? viewport.height
      : window.innerHeight;
    if (!Number.isFinite(visibleHeight) || visibleHeight <= 0) return;

    const heightValue = Math.round(visibleHeight) + "px";
    const root = document.documentElement;
    if (root.style.getPropertyValue("--app-height") !== heightValue) {
      root.style.setProperty("--app-height", heightValue);
    }
  }
  function scheduleVisibleViewportSync() {
    if (viewportSyncFrame) return;
    viewportSyncFrame = window.requestAnimationFrame(() => {
      viewportSyncFrame = 0;
      syncVisibleViewport();
    });
  }
  syncVisibleViewport();
  window.addEventListener("resize", scheduleVisibleViewportSync, { passive: true });
  window.addEventListener("orientationchange", scheduleVisibleViewportSync, { passive: true });
  window.addEventListener("pageshow", scheduleVisibleViewportSync, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleVisibleViewportSync();
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", scheduleVisibleViewportSync, { passive: true });
    window.visualViewport.addEventListener("scroll", scheduleVisibleViewportSync, { passive: true });
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
    const origin = typeof location !== "undefined" ? location.origin : "";
    if (/origin not allowed|cors/i.test(msg)) {
      return "MahiCloud blocked this page origin" + (origin ? " (" + origin + ")" : "") +
        ". Add the exact origin to MAHI_AI_ALLOWED_ORIGINS in Supabase → Edge Functions → mahi-ai-chat → Secrets, then redeploy the function and hard-refresh this page.";
    }
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return "You appear to be offline. Check your internet connection and try again.";
      }
      return "Could not reach MahiCloud" + (origin ? " from " + origin : "") +
        ". This is often a CORS/origin allowlist issue or the Edge Function being unavailable — not necessarily your internet. Check MAHI_AI_ALLOWED_ORIGINS in Supabase → Edge Functions → mahi-ai-chat → Secrets, redeploy the function, then hard-refresh this page.";
    }
    return "MahiCloud could not complete that request. Please try again in a moment.";
  }
  function setThinkModeEnabled(enabled) {
    thinkModeEnabled = !!enabled;
    if (ui.thinkModeButton) {
      ui.thinkModeButton.setAttribute("aria-pressed", String(thinkModeEnabled));
      ui.thinkModeButton.classList.toggle("is-active", thinkModeEnabled);
      ui.thinkModeButton.title = thinkModeEnabled
        ? "Think mode is on: compare candidate answers and choose the strongest response"
        : "Think mode is off: use the normal fast response route";
    }
  }

  function setBusy(value) {
    busy = value;
    ui.send.disabled = value || (!ui.input.value.trim() && !pendingFiles.length);
    ui.input.disabled = value;
    ui.attachButton.disabled = value;
    ui.fileInput.disabled = value;
    if (ui.stop) {
      ui.stop.hidden = !value;
      ui.stop.disabled = !value;
    }
    if (ui.temporaryChatButton) ui.temporaryChatButton.disabled = value;
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
    const clean = DOMPurify.sanitize(parsed, { USE_PROFILES: { html: true } });

    // Normalize headings inside chat messages: the page already has its own H1,
    // and message headings should never skip a level.
    const template = document.createElement("template");
    template.innerHTML = clean;
    let previousLevel = 1;
    template.content.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((heading) => {
      const requestedLevel = Number(heading.tagName.slice(1));
      const nextLevel = Math.min(requestedLevel + 1, previousLevel + 1, 6);
      if (nextLevel !== requestedLevel) {
        const replacement = document.createElement("h" + nextLevel);
        for (const attribute of Array.from(heading.attributes)) {
          replacement.setAttribute(attribute.name, attribute.value);
        }
        replacement.append(...Array.from(heading.childNodes));
        heading.replaceWith(replacement);
      }
      previousLevel = nextLevel;
    });
    return template.innerHTML;
  }

  function buildLivePreviewDocument(html, cssBlocks, jsBlocks) {
    let doc = String(html || "").trim();
    if (!doc) return "";
    if (!/<html\b/i.test(doc)) {
      doc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + doc + '</body></html>';
    } else {
      if (!/<!doctype\s+html/i.test(doc)) doc = "<!doctype html>\n" + doc;
      if (!/<head\b/i.test(doc)) {
        doc = doc.replace(/<html\b[^>]*>/i, (htmlTag) =>
          htmlTag + '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>'
        );
      } else {
        const headOpen = /<head\b[^>]*>/i;
        if (!/<meta\b[^>]*charset\s*=/i.test(doc)) {
          doc = doc.replace(headOpen, (headTag) => headTag + '<meta charset="utf-8">');
        }
        if (!/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(doc)) {
          doc = doc.replace(headOpen, (headTag) => headTag + '<meta name="viewport" content="width=device-width, initial-scale=1">');
        }
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
        '<div class="live-preview-browserbar"><span class="live-preview-window-dots" aria-hidden="true"><i></i><i></i><i></i></span><div class="live-preview-address"><span aria-hidden="true">⌕</span> mahicloud.local / preview</div><span class="live-preview-sandbox-tag">SANDBOX</span></div>' +
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
    if (Number.isInteger(opts.messageIndex)) node.dataset.messageIndex = String(opts.messageIndex);
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    if (role === "user") {
      avatar.textContent = "M";
    } else {
      const logo = document.createElement("img");
      logo.className = "message-logo";
      logo.src = OFFICIAL_LOGO_URL;
      logo.alt = "";
      logo.decoding = "async";
      avatar.appendChild(logo);
    }
    avatar.setAttribute("aria-hidden", "true");
    const body = document.createElement("div");
    body.className = "message-body";
    const heading = document.createElement("div");
    heading.className = "message-heading";
    heading.textContent = role === "user" ? getDisplayName() : "MahiCloud";
    const article = document.createElement("div");
    article.className = "message-content";
    if (opts.typing) {
      article.innerHTML = '<span class="thinking-label">Thinking</span><span class="typing-dots" aria-hidden="true"><span></span><span></span><span></span></span>';
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
    if (role !== "user" && !opts.typing) addSpeechActions(node, content);
    if (!opts.typing) addMessageControls(node, role, content, opts.messageIndex);
    node.append(avatar, body);
    ui.messages.appendChild(node);
    scrollToBottom(role === "user");
    return node;
  }
  function speechRecognitionConstructor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }
  function setVoiceStatus(message, state) {
    if (voiceUI.status) voiceUI.status.textContent = message || "";
    if (voiceUI.stage) voiceUI.stage.dataset.state = state || "idle";
    if (voiceUI.mic) {
      const recording = !!(voiceRecorder && voiceRecorder.state === "recording");
      const label = recording ? "Stop and send recording"
        : (voiceIsListening ? (voiceRecognition ? "Pause listening" : "Stop and send recording") : "Start listening");
      voiceUI.mic.setAttribute("aria-label", label);
      voiceUI.mic.title = label;
      voiceUI.mic.classList.toggle("is-listening", voiceIsListening);
      voiceUI.mic.classList.toggle("is-recording", recording);
    }
  }
  function speechTextFromMarkdown(value) {
    return String(value || "")
      .replace(/!\[([^\]]*)\]\(mahi-storage:\/\/[^)]+\)/gi, "$1")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\x60{3}[\s\S]*?\x60{3}/g, "Code is included in the chat.")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")
      .replace(/https?:\/\/\S+/g, "link")
      .replace(/\x60([^\x60]+)\x60/g, "$1")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/[>*_~|]/g, "")
      .replace(/\bmahi-storage:\/\/[^\s)]+/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  function spokenLanguage(text, detectedLanguage) {
    const requestedLocale = String(detectedLanguage || "").trim();
    if (/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/i.test(requestedLocale)) return requestedLocale;
    const value = String(text || "");
    const lower = value.toLowerCase();
    if (/[\u0980-\u09FF]/.test(value)) return "bn-BD";
    if (/[\u0A00-\u0A7F]/.test(value)) return "pa-IN";
    if (/[\u0B80-\u0BFF]/.test(value)) return "ta-IN";
    if (/[\u0C00-\u0C7F]/.test(value)) return "te-IN";
    if (/[\u0C80-\u0CFF]/.test(value)) return "kn-IN";
    if (/[\u0D00-\u0D7F]/.test(value)) return "ml-IN";
    if (/[\u0B00-\u0B7F]/.test(value)) return "or-IN";
    if (/[\u0900-\u097F]/.test(value)) return "hi-IN";
    if (/[\u0E00-\u0E7F]/.test(value)) return "th-TH";
    if (/[\u0400-\u04FF]/.test(value)) return "ru-RU";
    if (/[\u0370-\u03FF]/.test(value)) return "el-GR";
    if (/[\u3040-\u30FF]/.test(value)) return "ja-JP";
    if (/[\uAC00-\uD7AF]/.test(value)) return "ko-KR";
    if (/[\u4E00-\u9FFF]/.test(value)) return "zh-CN";
    if (/[\u0679\u0688\u0691\u06BA\u06BE\u0686\u0698\u06AF\u067E\u06CC\u06D2]/.test(value)) return "ur-PK";
    if (/[\u0600-\u06FF]/.test(value)) return "ar-SA";
    if (/[\u0E80-\u0EFF]/.test(value)) return "lo-LA";
    if (/[\u0F00-\u0FFF]/.test(value)) return "bo-CN";
    if (/[\u1000-\u109F]/.test(value)) return "my-MM";
    if (/[\u1780-\u17FF]/.test(value)) return "km-KH";
    if (/[đăâêôơư]/i.test(value)) return "vi-VN";
    if (/[çğıİöşü]/i.test(value) && /[ıİşğ]/i.test(value)) return "tr-TR";
    if (/[ãõ]/i.test(value) || /\b(você|vocês|não|obrigado|obrigada|olá|também|está|estão)\b/i.test(value)) return "pt-BR";
    if (/[ñ¿¡]/i.test(value) || /\b(hola|gracias|estás|están|también|buenos|buenas|quiero|puedes|pero|porque|cómo|qué)\b/i.test(value)) return "es-ES";
    if (/[œÿ]/i.test(value) || /\b(bonjour|merci|avec|vous|nous|pour|suis|une|des|quoi|comment)\b/i.test(value)) return "fr-FR";
    if (/[ß]/i.test(value) || /\b(der|die|das|und|nicht|mit|für|ich|bin|eine|einen|danke|bitte)\b/i.test(value)) return "de-DE";
    if (/\b(ciao|grazie|buongiorno|buonasera|perché|anche|molto|vorrei)\b/i.test(value)) return "it-IT";
    if (/\b(hello|the|this|that|please|thanks|what|how|can|would|you|your)\b/i.test(lower)) return "en-US";
    return "en-US";
  }
  function speakText(value, inVoiceMode, detectedLanguage) {
    const synth = window.speechSynthesis;
    const Utterance = window.SpeechSynthesisUtterance;
    if (!synth || !Utterance) return Promise.resolve(false);
    const text = speechTextFromMarkdown(value).slice(0, 12000);
    if (!text) return Promise.resolve(false);
    try { synth.cancel(); } catch (_) {}
    return new Promise((resolve) => {
      const utterance = new Utterance(text);
      const language = spokenLanguage(text, detectedLanguage || (inVoiceMode ? voiceResponseLanguage : ""));
      utterance.lang = language;
      utterance.rate = 1;
      utterance.pitch = 1;
      const voices = typeof synth.getVoices === "function" ? synth.getVoices() : [];
      const exactVoice = voices.find((voice) => String(voice.lang || "").toLowerCase() === language.toLowerCase());
      const languageVoice = voices.find((voice) => String(voice.lang || "").toLowerCase().startsWith(language.split("-")[0].toLowerCase()));
      if (exactVoice || languageVoice) utterance.voice = exactVoice || languageVoice;
      let settled = false;
      let speechWatchdog = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (speechWatchdog) window.clearTimeout(speechWatchdog);
        if (voiceCurrentUtterance === utterance) {
          voiceCurrentUtterance = null;
          voiceIsSpeaking = false;
        }
        if (inVoiceMode && voiceModeActive && !voicePaused) setVoiceStatus("Ready for your next message", "idle");
        resolve(true);
      };
      utterance.onstart = () => {
        voiceCurrentUtterance = utterance;
        voiceIsSpeaking = true;
        if (inVoiceMode && voiceModeActive) setVoiceStatus("MahiCloud is speaking…", "speaking");
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      voiceCurrentUtterance = utterance;
      voiceIsSpeaking = true;
      if (inVoiceMode && voiceModeActive) setVoiceStatus("MahiCloud is speaking…", "speaking");
      // Some browser/OS speech engines omit onend after an interrupted utterance.
      // Prevent that from leaving voice mode stuck in "speaking" forever.
      speechWatchdog = window.setTimeout(() => {
        if (!settled) {
          try { synth.cancel(); } catch (_) {}
          finish();
        }
      }, Math.min(120000, Math.max(12000, text.length * 90)));
      try { synth.speak(utterance); } catch (_) { finish(); }
    });
  }
  function addSpeechActions(node, content) {
    if (!node || node.querySelector(".speech-actions")) return;
    const body = node.querySelector(".message-body");
    if (!body) return;
    const actions = document.createElement("div");
    actions.className = "message-actions speech-actions";
    const button = document.createElement("button");
    button.className = "message-action speech-action";
    button.type = "button";
    button.title = "Read this answer aloud";
    button.setAttribute("aria-label", "Read MahiCloud's answer aloud");
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16 9a5 5 0 0 1 0 6M18.5 6.5a9 9 0 0 1 0 11"/></svg><span>Listen</span>';
    button.addEventListener("click", () => {
      if (voiceIsSpeaking) {
        try { window.speechSynthesis.cancel(); } catch (_) {}
        voiceIsSpeaking = false;
        voiceCurrentUtterance = null;
      } else {
        void speakText(content, false);
      }
    });
    actions.appendChild(button);
    body.appendChild(actions);
  }
  async function copyTextToClipboard(value) {
    const text = String(value == null ? "" : value);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.left = "-9999px";
    field.style.top = "0";
    document.body.appendChild(field);
    field.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (_) {}
    field.remove();
    return ok;
  }
  function isAttachmentTurn(message) {
    return !!(message && /\n\nAttached files:/i.test(String(message.content || "")));
  }
  function addMessageControls(node, role, content, messageIndex) {
    if (!node) return;
    const body = node.querySelector(".message-body");
    if (!body) return;
    const existing = body.querySelector(".message-controls");
    if (existing) existing.remove();
    const actions = document.createElement("div");
    actions.className = "message-actions message-controls";
    const addButton = (label, title, callback) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "message-action";
      button.textContent = label;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.addEventListener("click", callback);
      actions.appendChild(button);
      return button;
    };
    const copy = addButton("Copy", "Copy this message", async () => {
      const ok = await copyTextToClipboard(content);
      if (ok) {
        copy.textContent = "Copied";
        copy.classList.add("is-complete");
        window.setTimeout(() => { if (copy.isConnected) { copy.textContent = "Copy"; copy.classList.remove("is-complete"); } }, 1400);
      } else setError("Could not copy automatically. Select the message text and copy it manually.");
    });
    const index = Number.isInteger(messageIndex) ? messageIndex : Number(node.dataset.messageIndex);
    const item = Number.isInteger(index) ? currentMessages[index] : null;
    if (!item || item.role !== role || item.content !== content) {
      body.appendChild(actions);
      return;
    }
    if (role === "assistant") {
      const shareButton = addButton("Share", "Share this answer", async () => {
        try {
          if (typeof navigator.share === "function") {
            await navigator.share({ title: "MahiCloud response", text: content });
          } else {
            const ok = await copyTextToClipboard(content);
            if (!ok) throw new Error("copy_failed");
            shareButton.textContent = "Copied";
            shareButton.classList.add("is-complete");
            window.setTimeout(() => { if (shareButton.isConnected) { shareButton.textContent = "Share"; shareButton.classList.remove("is-complete"); } }, 1500);
          }
        } catch (error) {
          if (error && error.name === "AbortError") return;
          try {
            const ok = await copyTextToClipboard(content);
            if (ok) {
              shareButton.textContent = "Copied";
              shareButton.classList.add("is-complete");
              window.setTimeout(() => { if (shareButton.isConnected) { shareButton.textContent = "Share"; shareButton.classList.remove("is-complete"); } }, 1500);
              return;
            }
          } catch (_) {}
          setError("Could not share automatically. Copy the answer and share it manually.");
        }
      });
    }
    if (role === "assistant" && !temporaryChatMode && !branchSeedMessages && item.created_at) {
      addButton("Branch", "Continue this conversation in a separate chat", () => beginBranchFromMessage(index));
    }
    if (role === "user" && !temporaryChatMode && !branchSeedMessages && item.created_at && !isAttachmentTurn(item)) {
      addButton("Edit", "Edit this prompt and replace the following conversation", () => {
        if (busy) return;
        pendingEdit = { index, createdAt: item.created_at, content: item.content, previousMessages: currentMessages.slice() };
        ui.input.value = item.content;
        if (ui.draftNotice) {
          const notice = ui.draftNotice.querySelector("span");
          if (notice) notice.textContent = "Editing a previous message. Sending replaces that turn and the conversation after it.";
          ui.draftNotice.hidden = false;
        }
        updateCounter();
        ui.input.focus();
        const composer = document.querySelector(".composer-wrap");
        if (composer) composer.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    }
    if (role === "assistant" && !temporaryChatMode && !branchSeedMessages && item.created_at && index === currentMessages.length - 1) {
      let userIndex = index - 1;
      while (userIndex >= 0 && currentMessages[userIndex].role !== "user") userIndex--;
      const userMessage = currentMessages[userIndex];
      if (userMessage && userMessage.created_at && !isAttachmentTurn(userMessage)) {
        addButton("Regenerate", "Generate a new answer to the previous prompt", () => {
          if (busy) return;
          void sendMessage(userMessage.content, {
            replacement: { index: userIndex, createdAt: userMessage.created_at, content: userMessage.content },
            previousMessages: currentMessages.slice(),
            displayText: userMessage.content
          });
        });
      }
    }
    body.appendChild(actions);
  }
  function refreshMessageControls() {
    ui.messages.querySelectorAll(".message").forEach((node) => {
      const index = Number(node.dataset.messageIndex);
      if (!Number.isInteger(index) || !currentMessages[index]) return;
      const item = currentMessages[index];
      addMessageControls(node, item.role, item.content, index);
    });
  }
  function renderCurrentMessages() {
    ui.messages.replaceChildren();
    ui.welcome.hidden = true;
    ui.messages.hidden = false;
    currentMessages.forEach((message, index) => addMessage(message.role, message.content, { messageIndex: index }));
    refreshMessageControls();
  }
  function setTemporaryChatMode(enabled) {
    temporaryChatMode = !!enabled;
    if (ui.temporaryChatButton) {
      ui.temporaryChatButton.setAttribute("aria-pressed", String(temporaryChatMode));
      ui.temporaryChatButton.title = temporaryChatMode
        ? "Temporary chat is on. Messages and long-term memory are not saved."
        : "Start a temporary chat that is not saved to chat history or long-term memory";
      ui.temporaryChatButton.setAttribute("aria-label", temporaryChatMode ? "Turn off temporary chat" : "Turn on temporary chat");
    }
  }
  function exportConversation(format) {
    const title = (conversations.find((item) => item.id === conversationId)?.title || "MahiCloud conversation").trim();
    if (!currentMessages.length) {
      setError("There are no messages to export yet.");
      return;
    }
    const exportedAt = new Date().toISOString();
    let body, mime, extension;
    if (format === "json") {
      body = JSON.stringify({
        title, exportedAt, temporary: temporaryChatMode,
        messages: currentMessages.map((message) => ({ role: message.role, content: message.content }))
      }, null, 2);
      mime = "application/json;charset=utf-8";
      extension = "json";
    } else {
      body = "# " + title + "\n\nExported: " + exportedAt + (temporaryChatMode ? "\nTemporary chat: yes" : "") + "\n\n" +
        currentMessages.map((message) => (message.role === "assistant" ? "## MahiCloud" : "## " + getDisplayName()) + "\n\n" + message.content).join("\n\n---\n\n") + "\n";
      mime = "text/markdown;charset=utf-8";
      extension = "md";
    }
    const safeName = title.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "mahicloud-chat";
    const url = URL.createObjectURL(new Blob([body], { type: mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = safeName + "." + extension;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setError("");
  }
  async function handleConversationSearch() {
    const query = ui.chatSearch ? ui.chatSearch.value.trim() : "";
    const searchId = ++chatSearchSequence;
    const normalized = query.toLocaleLowerCase();
    chatSearchMatches = new Set(conversations
      .filter((item) => String(item.title || "New chat").toLocaleLowerCase().includes(normalized))
      .map((item) => item.id));
    renderConversationList();
    if (query.length < 2 || !session) return;
    try {
      const { data, error } = await client.from("mahi_ai_messages")
        .select("conversation_id")
        .ilike("content", "%" + query + "%")
        .limit(500);
      if (error) throw error;
      if (searchId !== chatSearchSequence) return;
      (data || []).forEach((row) => {
        if (row && typeof row.conversation_id === "string") chatSearchMatches.add(row.conversation_id);
      });
      renderConversationList();
    } catch (error) {
      if (searchId === chatSearchSequence) {
        // Keep title search usable when message search is unavailable.
        console.warn("MahiCloud message search failed:", error instanceof Error ? error.message.slice(0, 120) : "Unknown error");
      }
    }
  }
  async function renameConversation(conversation) {
    const currentTitle = conversation.title || "New chat";
    const value = window.prompt("Rename this conversation (1–120 characters):", currentTitle);
    if (value === null) return;
    const title = value.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!title) return setError("A conversation title cannot be empty.");
    if (title === currentTitle) return;
    try {
      const { error } = await client.from("mahi_ai_conversations").update({ title }).eq("id", conversation.id);
      if (error) throw error;
      await refreshConversations();
      setError("");
    } catch (_) {
      setError("Could not rename this conversation. Please try again.");
    }
  }
  async function refreshMessageMetadata() {
    if (!conversationId || !session || temporaryChatMode) return;
    const { data, error } = await client.from("mahi_ai_messages")
      .select("id,role,content,created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    const rows = (data || []).slice().reverse();
    const offset = Math.max(0, rows.length - currentMessages.length);
    currentMessages.forEach((message, index) => {
      const row = rows[offset + index];
      if (row && row.role === message.role && row.content === message.content) {
        message.id = row.id;
        message.created_at = row.created_at;
      }
    });
    refreshMessageControls();
  }
  function beginBranchFromMessage(index) {
    if (busy || temporaryChatMode || branchSeedMessages || !Number.isInteger(index)) return;
    if (index < 0 || index >= currentMessages.length || currentMessages[index]?.role !== "assistant") return;
    branchOrigin = { conversationId, messages: currentMessages.slice() };
    branchSeedMessages = currentMessages.slice(0, index + 1).map((message) => ({ ...message }));
    conversationId = null;
    currentMessages = branchSeedMessages.slice();
    pendingEdit = null;
    ui.input.value = "";
    if (ui.draftNotice) {
      const notice = ui.draftNotice.querySelector("span");
      if (notice) notice.textContent = "Separate branch: send a message to save this context as a new conversation. The original chat stays unchanged.";
      ui.draftNotice.hidden = false;
    }
    updateCounter();
    renderCurrentMessages();
    renderConversationList();
    setError("");
    ui.input.focus();
  }
  function cancelPendingEdit() {
    if (branchSeedMessages && branchOrigin) {
      conversationId = branchOrigin.conversationId;
      currentMessages = branchOrigin.messages;
      branchSeedMessages = null;
      branchOrigin = null;
      renderCurrentMessages();
      renderConversationList();
    }
    pendingEdit = null;
    if (ui.draftNotice) ui.draftNotice.hidden = true;
    const notice = ui.draftNotice && ui.draftNotice.querySelector("span");
    if (notice) notice.textContent = "Editing a previous message. Sending replaces that turn and the conversation after it.";
    ui.input.value = "";
    updateCounter();
  }
  function monitorVoiceActivity(recorder, analyser) {
    const samples = new Uint8Array(analyser.fftSize);
    const tick = () => {
      if (!voiceModeActive || voiceRecorder !== recorder || recorder.state !== "recording" || voiceAnalyser !== analyser) return;
      analyser.getByteTimeDomainData(samples);
      let squareTotal = 0;
      for (let i = 0; i < samples.length; i++) {
        const sample = (samples[i] - 128) / 128;
        squareTotal += sample * sample;
      }
      const volume = Math.sqrt(squareTotal / samples.length);
      const now = Date.now();
      if (volume >= 0.018) {
        if (!voiceHasSpeech) {
          voiceHasSpeech = true;
          voiceSpeechStartedAt = now;
          if (voiceUI.transcript) voiceUI.transcript.textContent = "I’m listening. Finish speaking naturally; I’ll detect your language automatically.";
        }
        voiceSilenceStartedAt = 0;
      } else if (voiceHasSpeech) {
        if (!voiceSilenceStartedAt) voiceSilenceStartedAt = now;
        if (now - voiceSilenceStartedAt >= 1350 && now - voiceSpeechStartedAt >= 700) {
          stopVoiceMediaRecording(true);
          return;
        }
      }
      if (voiceHasSpeech && now - voiceSpeechStartedAt >= 45000) {
        stopVoiceMediaRecording(true);
        return;
      }
      voiceMonitorFrame = window.requestAnimationFrame(tick);
    };
    voiceMonitorFrame = window.requestAnimationFrame(tick);
  }

  async function startMediaRecording() {
    if (!voiceModeActive || voicePaused || busy || voiceIsSpeaking || voiceIsListening) return;
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function" ||
        typeof window.MediaRecorder !== "function") {
      voicePaused = true;
      setVoiceStatus("Voice input is unavailable here. Open MahiCloud in the latest Chrome or Edge over HTTPS.", "error");
      if (voiceUI.transcript) voiceUI.transcript.textContent = "This browser does not support speech recognition or microphone recording.";
      return;
    }
    let stream = null;
    try {
      setVoiceStatus("Requesting microphone access…", "idle");
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      if (!voiceModeActive || voicePaused || busy) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const mimeOptions = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
      const mimeType = mimeOptions.find((type) => typeof MediaRecorder.isTypeSupported !== "function" || MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      voiceMediaStream = stream;
      voiceRecorder = recorder;
      voiceMediaChunks = [];
      voiceRecorderSubmitOnStop = true;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) voiceMediaChunks.push(event.data);
      };
      recorder.onerror = () => {
        voicePaused = true;
        voiceIsListening = false;
        stopVoiceMediaTracks();
        setVoiceStatus("Microphone recording failed. Tap the mic to try again.", "error");
      };
      recorder.onstop = () => {
        const chunks = voiceMediaChunks.slice();
        voiceMediaChunks = [];
        const actualType = recorder.mimeType || (chunks[0] && chunks[0].type) || "audio/webm";
        const blob = new Blob(chunks, { type: actualType });
        const shouldSubmit = voiceRecorderSubmitOnStop;
        if (voiceRecorder === recorder) voiceRecorder = null;
        voiceIsListening = false;
        stopVoiceMediaTracks();
        if (!voiceModeActive) return;
        if (shouldSubmit && blob.size >= 1200) {
          setVoiceStatus("Processing your voice message…", "thinking");
          if (voiceUI.transcript) voiceUI.transcript.textContent = "Voice message captured. MahiCloud is listening…";
          void submitVoiceRecording(blob, actualType);
        } else {
          voicePaused = true;
          setVoiceStatus(blob.size < 1200 ? "No clear audio captured" : "Recording stopped", blob.size < 1200 ? "error" : "paused");
          if (voiceUI.transcript) voiceUI.transcript.textContent = blob.size < 1200
            ? "No usable audio was captured. Tap the microphone to record again."
            : "Recording stopped. Tap the microphone when you’re ready.";
        }
      };
      voiceHasSpeech = false;
      voiceSpeechStartedAt = 0;
      voiceSilenceStartedAt = 0;
      recorder.start(250);
      voiceIsListening = true;
      setVoiceStatus("Listening… speak naturally", "listening");
      if (voiceUI.transcript) voiceUI.transcript.textContent = "Language detection is automatic. Pause briefly when you finish speaking; MahiCloud will answer aloud.";
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      if (AudioContextConstructor) {
        try {
          voiceAudioContext = new AudioContextConstructor();
          voiceAnalyser = voiceAudioContext.createAnalyser();
          voiceAnalyser.fftSize = 2048;
          voiceAudioSource = voiceAudioContext.createMediaStreamSource(stream);
          voiceAudioSource.connect(voiceAnalyser);
          if (voiceAudioContext.state === "suspended" && typeof voiceAudioContext.resume === "function") {
            void voiceAudioContext.resume().catch(() => {});
          }
          monitorVoiceActivity(recorder, voiceAnalyser);
        } catch (_) {
          if (voiceUI.transcript) voiceUI.transcript.textContent = "Speak, then tap the microphone to send. Automatic silence detection is unavailable in this browser.";
        }
      }
      voiceRecorderStopTimer = window.setTimeout(() => {
        if (voiceRecorder && voiceRecorder.state === "recording") stopVoiceMediaRecording(voiceHasSpeech);
      }, 60000);
    } catch (error) {
      if (stream) stream.getTracks().forEach((track) => track.stop());
      voiceMediaStream = null;
      voiceRecorder = null;
      voiceIsListening = false;
      voicePaused = true;
      const denied = error && (error.name === "NotAllowedError" || error.name === "SecurityError");
      setVoiceStatus(denied ? "Microphone permission is blocked" : "Could not start microphone recording", "error");
      if (voiceUI.transcript) voiceUI.transcript.textContent = denied
        ? "Allow microphone access for this website in the browser address-bar settings, then tap the mic again."
        : "Check that a microphone is connected and no other app is blocking it.";
    }
  }
  function stopVoiceMediaTracks() {
    if (voiceRecorderStopTimer) window.clearTimeout(voiceRecorderStopTimer);
    voiceRecorderStopTimer = null;
    if (voiceMonitorFrame !== null && typeof window.cancelAnimationFrame === "function") {
      try { window.cancelAnimationFrame(voiceMonitorFrame); } catch (_) {}
    }
    voiceMonitorFrame = null;
    if (voiceAudioSource) {
      try { voiceAudioSource.disconnect(); } catch (_) {}
    }
    voiceAudioSource = null;
    voiceAnalyser = null;
    if (voiceAudioContext && voiceAudioContext.state !== "closed") {
      try { void voiceAudioContext.close(); } catch (_) {}
    }
    voiceAudioContext = null;
    if (voiceMediaStream) {
      try { voiceMediaStream.getTracks().forEach((track) => track.stop()); } catch (_) {}
    }
    voiceMediaStream = null;
  }
  async function submitVoiceRecording(blob, mimeType) {
    if (!voiceModeActive) return;
    const extension = /mp4/i.test(mimeType) ? "m4a" : (/ogg/i.test(mimeType) ? "ogg" : "webm");
    const audioFile = new File([blob], "mahi-voice-message." + extension, { type: mimeType || "audio/webm" });
    const previousCount = pendingFiles.length;
    addPendingFiles([audioFile]);
    if (pendingFiles.length === previousCount) {
      voicePaused = true;
      setVoiceStatus("Could not attach the recording", "error");
      if (voiceUI.transcript) voiceUI.transcript.textContent = "There is no room for another attachment. Remove an attachment in the chat and try again.";
      return;
    }
    voiceResponseLanguage = "";
    const instruction = "Listen to the attached audio recording and identify the language or languages spoken without asking the user to choose a language. Understand the actual request and respond conversationally in the same language the user used; if the user mixes languages, naturally match that mix. Do not merely transcribe or describe the recording unless asked. Keep the reply natural to say aloud. If the audio is unclear, ask one short clarification in the language most likely spoken. For this voice turn only, append a final machine-readable language marker in the exact format [[MAHI_LANG:xx-YY]] after the answer, using the best matching BCP-47 locale for the language you detected (examples: bn-BD, en-US, hi-IN, ur-PK, es-ES, fr-FR). The marker is internal metadata and must not be part of the spoken answer. Do not apply this marker instruction to later non-voice turns."; 
    if (voiceUI.transcript) voiceUI.transcript.textContent = "Voice message received. Detecting your language and preparing a reply…";
    voicePaused = false;
    try {
      await sendMessage(instruction, { displayText: "🎙️ Voice message — language detected automatically" });
      // Do not automatically re-send the same failed recording on the next listening cycle.
      if (ui.error && !ui.error.hidden && pendingFiles.includes(audioFile)) {
        pendingFiles = pendingFiles.filter((file) => file !== audioFile);
        renderAttachmentList();
        updateCounter();
        voicePaused = true;
        setVoiceStatus("Voice reply failed", "error");
        if (voiceUI.transcript) voiceUI.transcript.textContent = "I couldn’t reach MahiCloud for that turn. Check your connection, then tap the mic to try again.";
      }
    } catch (_) {
      voicePaused = true;
    }
  }
  function startVoiceListening() {
    if (!voiceModeActive || voicePaused || busy || voiceIsSpeaking || voiceIsListening) return;
    voiceForceRecorder = true;
    void startMediaRecording();
  }

  function openVoiceMode() {
    if (!voiceUI.overlay) return;
    voiceModeActive = true;
    voicePaused = false;
    voiceForceRecorder = true;
    voiceUI.overlay.hidden = false;
    if (voiceUI.transcript) voiceUI.transcript.textContent = "Allow microphone access when your browser asks. Speak in any language; MahiCloud will detect it and reply aloud.";
    if (voiceUI.interim) voiceUI.interim.textContent = "";
    setVoiceStatus("Connecting to your microphone…", "idle");
    closeMobileSidebar();
    startVoiceListening();
    if (voiceUI.mic) voiceUI.mic.focus();
  }
  function closeVoiceMode() {
    voiceModeActive = false;
    voicePaused = true;
    if (voiceRestartTimer) window.clearTimeout(voiceRestartTimer);
    voiceRestartTimer = null;
    if (voiceRecorderStopTimer) window.clearTimeout(voiceRecorderStopTimer);
    voiceRecorderStopTimer = null;
    if (voiceRecognition) {
      try { voiceRecognition.onend = null; voiceRecognition.stop(); } catch (_) {}
      voiceRecognition = null;
    }
    if (voiceRecorder && voiceRecorder.state !== "inactive") {
      try { voiceRecorder.onstop = null; voiceRecorder.stop(); } catch (_) {}
    }
    voiceRecorder = null;
    voiceMediaChunks = [];
    stopVoiceMediaTracks();
    voiceIsListening = false;
    voiceIsSpeaking = false;
    voiceCurrentUtterance = null;
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) {}
    if (voiceUI.overlay) voiceUI.overlay.hidden = true;
    setVoiceStatus("Voice mode ended", "idle");
    if (ui.voiceModeButton) ui.voiceModeButton.focus();
  }
  function toggleVoiceMicrophone() {
    if (!voiceModeActive) return;
    if (voiceIsSpeaking) {
      try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) {}
      voiceIsSpeaking = false;
      voiceCurrentUtterance = null;
      voicePaused = false;
      startVoiceListening();
      return;
    }
    if (voiceRecorder && voiceRecorder.state === "recording") {
      stopVoiceMediaRecording(true);
      return;
    }
    if (voiceIsListening && voiceRecognition) {
      voicePaused = true;
      try { voiceRecognition.stop(); } catch (_) {}
      voiceIsListening = false;
      setVoiceStatus("Listening paused. Tap the mic when you’re ready.", "paused");
      return;
    }
    voicePaused = false;
    startVoiceListening();
  }
  function stopVoiceMediaRecording(submit) {
    if (!voiceRecorder || voiceRecorder.state === "inactive") return;
    voiceRecorderSubmitOnStop = submit === true;
    if (voiceRecorderStopTimer) window.clearTimeout(voiceRecorderStopTimer);
    voiceRecorderStopTimer = null;
    setVoiceStatus(submit ? "Processing your recording…" : "Recording stopped", submit ? "thinking" : "paused");
    try { voiceRecorder.requestData(); } catch (_) {}
    try { voiceRecorder.stop(); } catch (_) {
      voicePaused = true;
      setVoiceStatus("Could not finish the audio recording. Please try again.", "error");
    }
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
      script.onload = () => window[globalName] ? resolve(window[globalName]) : reject(new Error("Document parser failed to load."));
      script.onerror = () => reject(new Error("Could not load the document parser. Try a PDF or plain-text export instead."));
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

  async function uploadPendingAttachments(files) {
    const uploaded = [];
    let totalExtracted = 0;
    try {
      for (const file of files) {
        let extractedText = "";
        try {
          extractedText = await extractDocumentText(file);
        } catch (error) {
          // Any file type remains attachable even when its optional text extractor is unavailable.
          console.warn("MahiCloud could not extract document text:", file.name, error);
          extractedText = "";
        }
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
        if (result.error) throw new Error("MahiCloud: Could not upload " + file.name + ". Check the Supabase attachment bucket setup and try again.");
        uploaded.push({
          path: result.data.path, name: file.name, mime_type: file.type || "application/octet-stream",
          size: file.size, extracted_text: extractedText
        });
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

  function scrollToBottom(force) {
    const area = $("conversationArea");
    if (!area) return;
    const distanceFromBottom = area.scrollHeight - area.scrollTop - area.clientHeight;
    if (!force && !chatPreferences.autoScroll && distanceFromBottom > 140) return;
    requestAnimationFrame(() => {
      // If the user scrolled away while the frame was waiting, respect that choice.
      const currentDistance = area.scrollHeight - area.scrollTop - area.clientHeight;
      if (!force && !chatPreferences.autoScroll && currentDistance > 140) return;
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
    const button = $("openSidebar");
    if (button && window.matchMedia("(max-width: 760px)").matches) button.setAttribute("aria-expanded", "false");
  }
  function openMobileSidebar() {
    ui.sidebar.classList.add("open");
    ui.scrim.classList.add("show");
    const button = $("openSidebar");
    if (button) button.setAttribute("aria-expanded", "true");
  }
  function toggleSidebar() {
    const button = $("openSidebar");
    if (window.matchMedia("(max-width: 760px)").matches) {
      if (ui.sidebar.classList.contains("open")) closeMobileSidebar();
      else openMobileSidebar();
      return;
    }
    const shell = document.querySelector(".app-shell");
    if (shell) {
      const collapsed = shell.classList.toggle("sidebar-collapsed");
      if (button) button.setAttribute("aria-expanded", String(!collapsed));
    }
  }
  function readPreference(key) {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  }
  function writePreference(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_) { /* Private browsing may disable local storage. */ }
  }
  function getDisplayName() {
    return (readPreference(DISPLAY_NAME_STORAGE_KEY) || "You").trim() || "You";
  }
  function applyDisplayName(value, persist) {
    const clean = String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 32) || "You";
    if (persist !== false) writePreference(DISPLAY_NAME_STORAGE_KEY, clean);
    const input = $("displayNameInput");
    if (input && input.value !== clean) input.value = clean;
    const profile = $("profileDisplayName");
    if (profile) profile.textContent = clean;
    const avatar = $("profileAvatar");
    if (avatar) {
      if (avatar.tagName === "IMG") {
        avatar.alt = clean === "You" ? "MahiCloud profile logo" : `${clean} profile logo`;
      } else {
        avatar.textContent = clean === "You" ? "Y" : Array.from(clean)[0].toLocaleUpperCase();
      }
    }
    document.querySelectorAll(".message.user .message-heading").forEach((heading) => { heading.textContent = clean; });
  }
  function applyTheme(theme, persist) {
    const value = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", value);
    if (persist !== false) writePreference(THEME_STORAGE_KEY, value);
    const toggle = $("themeToggle");
    if (toggle) toggle.setAttribute("aria-checked", String(value === "light"));
    const label = $("themeToggleLabel");
    if (label) label.textContent = value === "light" ? "Light" : "Dark";
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute("content", value === "light" ? "#f7f8fc" : "#090b10");
  }
  function normalizeChatPreferences(value) {
    const input = value && typeof value === "object" ? value : {};
    const responseStyles = ["default", "friendly", "concise", "detailed", "professional"];
    return {
      enterToSend: input.enterToSend !== false,
      autoScroll: input.autoScroll !== false,
      density: input.density === "compact" ? "compact" : "comfortable",
      fontSize: ["small", "default", "large"].includes(input.fontSize) ? input.fontSize : "default",
      responseStyle: responseStyles.includes(input.responseStyle) ? input.responseStyle : "default",
      customInstructions: typeof input.customInstructions === "string"
        ? input.customInstructions.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").slice(0, 3000)
        : "",
      autoReadAloud: input.autoReadAloud === true
    };
  }
  function persistChatPreferences() {
    writePreference(CHAT_PREFERENCES_STORAGE_KEY, JSON.stringify(chatPreferences));
  }
  function applyChatPreferences(value, persist) {
    chatPreferences = normalizeChatPreferences(value);
    const root = document.documentElement;
    root.dataset.chatDensity = chatPreferences.density;
    root.dataset.chatFontSize = chatPreferences.fontSize;
    const syncSwitch = (id, checked) => {
      const button = $(id);
      if (button) button.setAttribute("aria-checked", String(checked));
    };
    syncSwitch("enterToSendToggle", chatPreferences.enterToSend);
    syncSwitch("autoScrollToggle", chatPreferences.autoScroll);
    syncSwitch("autoReadAloudToggle", chatPreferences.autoReadAloud);
    [["chatDensitySelect", chatPreferences.density], ["chatFontSizeSelect", chatPreferences.fontSize],
      ["responseStyleSelect", chatPreferences.responseStyle]]
      .forEach(([id, val]) => { const field = $(id); if (field && field.value !== val) field.value = val; });
    if (persist !== false) persistChatPreferences();
  }
  function setupSidebarResize() {
    const handle = $("sidebarResizeHandle");
    if (!handle || !ui.sidebar) return;
    const root = document.documentElement;
    const minWidth = 220;
    const maxWidth = () => Math.max(minWidth, Math.min(440, Math.floor(window.innerWidth * 0.42)));
    const clamp = (value) => Math.min(maxWidth(), Math.max(minWidth, Math.round(value)));
    const setWidth = (value, persist) => {
      const width = clamp(value);
      root.style.setProperty("--sidebar-width", width + "px");
      handle.setAttribute("aria-valuenow", String(width));
      handle.setAttribute("aria-valuemax", String(maxWidth()));
      if (persist) writePreference("mahi-ai-sidebar-width", String(width));
    };
    const savedWidth = Number(readPreference("mahi-ai-sidebar-width"));
    if (Number.isFinite(savedWidth) && savedWidth >= minWidth) setWidth(savedWidth, false);
    else setWidth(260, false);
    let pointerStartX = 0, widthStart = 260, dragging = false;
    handle.addEventListener("pointerdown", (event) => {
      if (window.matchMedia("(max-width: 760px)").matches || document.querySelector(".app-shell.sidebar-collapsed")) return;
      if (event.button !== 0) return;
      dragging = true;
      pointerStartX = event.clientX;
      widthStart = ui.sidebar.getBoundingClientRect().width;
      handle.classList.add("is-dragging");
      document.body.classList.add("is-resizing-sidebar");
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      setWidth(widthStart + event.clientX - pointerStartX, false);
    });
    const stop = (event) => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove("is-dragging");
      document.body.classList.remove("is-resizing-sidebar");
      if (event && handle.hasPointerCapture && handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      const match = getComputedStyle(root).getPropertyValue("--sidebar-width").match(/[0-9.]+/);
      setWidth(match ? Number(match[0]) : widthStart, true);
    };
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
    handle.addEventListener("lostpointercapture", () => { if (dragging) stop(); });
    handle.addEventListener("keydown", (event) => {
      if (window.matchMedia("(max-width: 760px)").matches) return;
      const current = ui.sidebar.getBoundingClientRect().width;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        setWidth(current + (event.key === "ArrowRight" ? 16 : -16), true);
      } else if (event.key === "Home") {
        event.preventDefault();
        setWidth(minWidth, true);
      } else if (event.key === "End") {
        event.preventDefault();
        setWidth(maxWidth(), true);
      }
    });
    window.addEventListener("resize", () => {
      if (!window.matchMedia("(max-width: 760px)").matches) setWidth(ui.sidebar.getBoundingClientRect().width, false);
    }, { passive: true });
  }
  function setupPreferences() {
    const sidebarButton = $("openSidebar");
    if (sidebarButton) sidebarButton.setAttribute("aria-expanded", String(!window.matchMedia("(max-width: 760px)").matches));
    setupSidebarResize();
    const storedPreferences = readPreference(CHAT_PREFERENCES_STORAGE_KEY);
    let parsedPreferences = {};
    try { parsedPreferences = storedPreferences ? JSON.parse(storedPreferences) : {}; } catch (_) {}
    applyChatPreferences(parsedPreferences, false);
    if ($("customInstructionsInput")) $("customInstructionsInput").value = chatPreferences.customInstructions;
    const settingsButton = $("toggleSettings");
    const settingsPanel = $("settingsPanel");
    if (settingsButton && settingsPanel) {
      settingsButton.addEventListener("click", () => {
        const opening = settingsPanel.hidden;
        settingsPanel.hidden = !opening;
        settingsButton.setAttribute("aria-expanded", String(opening));
      });
    }
    const themeToggle = $("themeToggle");
    if (themeToggle) themeToggle.addEventListener("click", () => {
      applyTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light");
    });
    const nameForm = $("displayNameForm");
    if (nameForm) nameForm.addEventListener("submit", (event) => {
      event.preventDefault();
      applyDisplayName($("displayNameInput") ? $("displayNameInput").value : "You", true);
      const status = $("nameSaveStatus");
      if (status) status.textContent = "Saved on this device.";
    });
    const customForm = $("customInstructionsForm");
    if (customForm) customForm.addEventListener("submit", (event) => {
      event.preventDefault();
      chatPreferences.customInstructions = $("customInstructionsInput") ? $("customInstructionsInput").value.trim().slice(0, 3000) : "";
      persistChatPreferences();
      const status = $("customInstructionsStatus");
      if (status) status.textContent = "Saved on this device. Applies to new replies.";
    });
    const updatePreference = (key, value) => {
      chatPreferences = normalizeChatPreferences({ ...chatPreferences, [key]: value });
      applyChatPreferences(chatPreferences, true);
    };
    [["enterToSendToggle", "enterToSend"], ["autoScrollToggle", "autoScroll"], ["autoReadAloudToggle", "autoReadAloud"]]
      .forEach(([id, key]) => {
        const toggle = $(id);
        if (toggle) toggle.addEventListener("click", () => updatePreference(key, toggle.getAttribute("aria-checked") !== "true"));
      });
    [["chatDensitySelect", "density"], ["chatFontSizeSelect", "fontSize"], ["responseStyleSelect", "responseStyle"]]
      .forEach(([id, key]) => {
        const field = $(id);
        if (field) field.addEventListener("change", () => updatePreference(key, field.value));
      });
    const exportMarkdown = $("settingsExportMarkdown");
    if (exportMarkdown) exportMarkdown.addEventListener("click", () => exportConversation("md"));
    const exportJson = $("settingsExportJson");
    if (exportJson) exportJson.addEventListener("click", () => exportConversation("json"));
    const resetButton = $("resetChatPreferences");
    if (resetButton) resetButton.addEventListener("click", () => {
      if (!window.confirm("Reset chat preferences on this device? Your conversations, display name, and theme will not be deleted.")) return;
      applyChatPreferences({ ...DEFAULT_CHAT_PREFERENCES }, true);
      if ($("customInstructionsInput")) $("customInstructionsInput").value = "";
      const status = $("customInstructionsStatus");
      if (status) status.textContent = "Chat preferences reset.";
    });
    applyTheme(readPreference(THEME_STORAGE_KEY) === "light" ? "light" : "dark", false);
    applyDisplayName(readPreference(DISPLAY_NAME_STORAGE_KEY) || "You", false);
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
  function isGuestAccount() {
    const user = session && session.user;
    if (!user) return true;
    if (user.is_anonymous === true) return true;
    return !user.email && !user.phone;
  }

  function setAccountStatus(message, kind) {
    const status = $("accountStatus");
    if (!status) return;
    status.textContent = message || "";
    status.hidden = !message;
    status.className = "account-status" + (kind ? " is-" + kind : "");
  }

  function renderAccountStatus() {
    const user = session && session.user;
    const guest = isGuestAccount();
    const label = $("accountButtonLabel");
    if (label) label.textContent = guest ? "Sign in" : "My account";
    if (ui.accountButton) {
      ui.accountButton.setAttribute("aria-label", guest ? "Sign in or create an account" : "Manage your account");
      ui.accountButton.setAttribute("title", guest ? "Sign in or create an account" : "Manage your account");
    }
    if (ui.session) ui.session.textContent = guest ? "Guest workspace" : (user.email || user.phone || "Account saved");
    if (!guest && user.user_metadata && user.user_metadata.display_name) {
      applyDisplayName(user.user_metadata.display_name, true);
    }
  }

  function renderAccountModal() {
    const guest = isGuestAccount();
    const authPanel = $("accountAuthPanel");
    const summary = $("accountSummary");
    const title = $("accountDialogTitle");
    const description = $("accountDialogDescription");
    if (authPanel) authPanel.hidden = !guest;
    if (summary) summary.hidden = guest;
    if (title) title.textContent = guest
      ? (accountMode === "register" ? "Save your chats" : "Welcome back")
      : "Your account";
    if (description) description.textContent = guest
      ? "Use any valid email address or a phone number with its international country code."
      : "Your conversations are linked to this account and can be opened on another device.";
    const methodSwitch = $("accountMethodSwitch");
    const modeSwitch = $("accountModeSwitch");
    if (methodSwitch) methodSwitch.hidden = !guest;
    if (modeSwitch) modeSwitch.hidden = !guest;
    if (!guest) {
      const user = session && session.user;
      const identity = $("accountSummaryIdentity");
      const display = $("accountSummaryName");
      if (identity) identity.textContent = user ? (user.email || user.phone || "Signed-in account") : "Signed-in account";
      if (display) display.textContent = user && user.user_metadata && user.user_metadata.display_name
        ? user.user_metadata.display_name
        : "Your chat history is saved to your account.";
      return;
    }

    document.querySelectorAll("[data-account-method]").forEach((button) => {
      const active = button.getAttribute("data-account-method") === accountMethod;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll("[data-account-mode]").forEach((button) => {
      const active = button.getAttribute("data-account-mode") === accountMode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const emailFields = $("accountEmailFields");
    const phoneFields = $("accountPhoneFields");
    const passwordConfirmWrap = $("accountPasswordConfirmWrap");
    const phoneOtpGroup = $("accountOtpGroup");
    const emailInput = $("accountEmailInput");
    const passwordInput = $("accountPasswordInput");
    const confirmInput = $("accountPasswordConfirm");
    const phoneInput = $("accountPhoneInput");
    const otpInput = $("accountOtpInput");
    const submit = $("accountSubmitButton");
    const resend = $("accountResendCode");
    const forgot = $("accountForgotPassword");

    if (emailFields) emailFields.hidden = accountMethod !== "email";
    if (phoneFields) phoneFields.hidden = accountMethod !== "phone";
    if (passwordConfirmWrap) passwordConfirmWrap.hidden = accountMethod !== "email" || accountMode !== "register";
    if (phoneOtpGroup) phoneOtpGroup.hidden = accountMethod !== "phone" || !phoneOtpPending;
    if (emailInput) emailInput.required = accountMethod === "email";
    if (passwordInput) {
      passwordInput.required = accountMethod === "email";
      passwordInput.autocomplete = accountMode === "register" ? "new-password" : "current-password";
    }
    if (confirmInput) confirmInput.required = accountMethod === "email" && accountMode === "register";
    if (phoneInput) {
      phoneInput.required = accountMethod === "phone";
      phoneInput.readOnly = phoneOtpPending;
      if (phoneOtpPending && pendingPhone) phoneInput.value = pendingPhone;
    }
    if (otpInput) otpInput.required = accountMethod === "phone" && phoneOtpPending;
    if (resend) resend.hidden = accountMethod !== "phone" || !phoneOtpPending;
    if (forgot) forgot.hidden = accountMethod !== "email" || accountMode !== "login";
    if (submit) {
      if (accountMethod === "phone") submit.textContent = phoneOtpPending
        ? "Verify code"
        : (accountMode === "register" ? "Send verification code" : "Send sign-in code");
      else submit.textContent = accountMode === "register" ? "Create account" : "Sign in";
    }
  }

  function openAccountModal() {
    if (!ui.accountModal) return;
    accountReturnFocus = document.activeElement;
    phoneOtpPending = false;
    pendingPhone = "";
    phoneOtpType = "sms";
    accountMethod = "email";
    accountMode = isGuestAccount() ? "register" : "login";
    setAccountStatus("", "");
    renderAccountModal();
    ui.accountModal.hidden = false;
    const focusTarget = isGuestAccount() ? $("accountEmailInput") : $("accountSignOut");
    if (focusTarget) window.setTimeout(() => focusTarget.focus(), 0);
  }

  function closeAccountModal() {
    if (!ui.accountModal || ui.accountModal.hidden) return;
    ui.accountModal.hidden = true;
    if (accountReturnFocus && typeof accountReturnFocus.focus === "function") accountReturnFocus.focus();
    else if (ui.accountButton) ui.accountButton.focus();
  }

  function setAccountMethod(method) {
    accountMethod = method === "phone" ? "phone" : "email";
    phoneOtpPending = false;
    pendingPhone = "";
    const otp = $("accountOtpInput");
    const phone = $("accountPhoneInput");
    if (otp) otp.value = "";
    if (phone) phone.readOnly = false;
    setAccountStatus("", "");
    renderAccountModal();
  }

  function setAccountMode(mode) {
    accountMode = mode === "login" ? "login" : "register";
    phoneOtpPending = false;
    pendingPhone = "";
    const otp = $("accountOtpInput");
    const phone = $("accountPhoneInput");
    const password = $("accountPasswordInput");
    const confirm = $("accountPasswordConfirm");
    if (otp) otp.value = "";
    if (phone) phone.readOnly = false;
    if (password) password.value = "";
    if (confirm) confirm.value = "";
    setAccountStatus("", "");
    renderAccountModal();
  }

  function normalizeInternationalPhone(value) {
    let phone = String(value || "").trim().replace(/[\s().-]/g, "");
    if (phone.startsWith("00")) phone = "+" + phone.slice(2);
    return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : "";
  }

  function readableAuthError(error) {
    const message = String(error && error.message || error || "");
    const lower = message.toLowerCase();
    if (/phone provider is not enabled|phone.*not enabled|sms.*not configured|sms provider|phone auth.*disabled|phone sign.?in.*disabled/.test(lower)) {
      return "Phone verification is not configured yet. In Supabase, enable Phone under Authentication → Sign In / Providers and configure an SMS provider. Then try again.";
    }
    if (/invalid login credentials|invalid credentials/.test(lower)) {
      return "That email/phone or password is incorrect. Check your details and try again.";
    }
    if (/user already registered|already been registered|phone number.*already/.test(lower)) {
      return "This email or phone number is already linked to an account. Switch to Log in instead.";
    }
    if (/invalid.*otp|otp.*expired|token has expired|token is invalid/.test(lower)) {
      return "That verification code is incorrect or expired. Check the latest code or choose Resend code.";
    }
    if (/email not confirmed/.test(lower)) {
      return "Please confirm your email address from the verification message before signing in.";
    }
    return message || "Authentication failed. Please try again.";
  }

  async function loadAccountWorkspace(closeModalAfter) {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    session = data.session;
    renderAccountStatus();
    const savedName = session && session.user && session.user.user_metadata && session.user.user_metadata.display_name;
    if (savedName && !isGuestAccount()) applyDisplayName(savedName, true);
    try {
      await refreshConversations();
      if (conversations.length) {
        await loadConversation(conversations[0].id);
      } else {
        conversationId = null;
        showWelcome(true);
      }
    } catch (error) {
      setError(plainError(error));
    }
    if (closeModalAfter) closeAccountModal();
  }

  async function handleAccountSubmit(event) {
    event.preventDefault();
    if (!client) {
      setAccountStatus("MahiCloud is still connecting. Please try again in a moment.", "error");
      return;
    }
    const submit = $("accountSubmitButton");
    if (submit) submit.disabled = true;
    try {
      if (accountMethod === "email") {
        const email = String($("accountEmailInput").value || "").trim();
        const password = String($("accountPasswordInput").value || "");
        if (accountMode === "register") {
          const confirmPassword = String($("accountPasswordConfirm").value || "");
          if (password.length < 8) throw new Error("Choose a password with at least 8 characters.");
          if (password !== confirmPassword) throw new Error("The passwords do not match.");
          if (!isGuestAccount()) throw new Error("You are already signed in. Sign out first to create or use another account.");
          const { data, error } = await client.auth.updateUser({
            email,
            password,
            data: { display_name: getDisplayName() }
          });
          if (error) throw error;
          await loadAccountWorkspace(false);
          renderAccountModal();
          if (data && data.user && data.user.email_confirmed_at) {
            setAccountStatus("Your account is ready. Your existing chats are still attached to this account.", "success");
          } else {
            setAccountStatus("Check your inbox for the email confirmation link. Confirm the address before signing in on another device. Your existing chats remain attached to this account.", "success");
          }
        } else {
          const { data, error } = await client.auth.signInWithPassword({ email, password });
          if (error) throw error;
          if (!data || !data.session) throw new Error("Sign-in succeeded but no session was returned. Please try again.");
          session = data.session;
          await loadAccountWorkspace(true);
        }
        return;
      }

      if (phoneOtpPending) {
        const token = String($("accountOtpInput").value || "").trim().replace(/\s/g, "");
        if (!/^\d{4,8}$/.test(token)) throw new Error("Enter the verification code from the SMS.");
        const { data, error } = await client.auth.verifyOtp({
          phone: pendingPhone,
          token,
          type: phoneOtpType
        });
        if (error) throw error;
        session = data.session || null;
        phoneOtpPending = false;
        await loadAccountWorkspace(true);
        return;
      }

      const phone = normalizeInternationalPhone($("accountPhoneInput").value);
      if (!phone) throw new Error("Enter a full international phone number, including + and your country code (for example, +8801712345678).");
      pendingPhone = phone;
      if (accountMode === "register") {
        if (!isGuestAccount()) throw new Error("You are already signed in. Sign out first to create or use another account.");
        const { error } = await client.auth.updateUser({
          phone,
          data: { display_name: getDisplayName() }
        });
        if (error) throw error;
        phoneOtpType = "phone_change";
      } else {
        const { error } = await client.auth.signInWithOtp({
          phone,
          options: { shouldCreateUser: false }
        });
        if (error) throw error;
        phoneOtpType = "sms";
      }
      phoneOtpPending = true;
      renderAccountModal();
      setAccountStatus("A one-time verification code was requested for " + phone + ". Enter the latest code from your SMS.", "success");
      const otp = $("accountOtpInput");
      if (otp) otp.focus();
    } catch (error) {
      setAccountStatus(readableAuthError(error), "error");
    } finally {
      if (submit) submit.disabled = false;
      renderAccountModal();
    }
  }

  async function resendAccountPhoneCode() {
    if (!phoneOtpPending || !pendingPhone || !client) return;
    const resend = $("accountResendCode");
    if (resend) resend.disabled = true;
    try {
      if (phoneOtpType === "phone_change") {
        const { error } = await client.auth.updateUser({ phone: pendingPhone });
        if (error) throw error;
      } else {
        const { error } = await client.auth.signInWithOtp({
          phone: pendingPhone,
          options: { shouldCreateUser: false }
        });
        if (error) throw error;
      }
      setAccountStatus("A fresh code was requested for " + pendingPhone + ". Use the newest SMS.", "success");
    } catch (error) {
      setAccountStatus(readableAuthError(error), "error");
    } finally {
      if (resend) resend.disabled = false;
    }
  }

  async function signOutAndSwitchAccount() {
    const button = $("accountSignOut");
    if (button) button.disabled = true;
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      session = null;
      await ensureSession();
      accountMethod = "email";
      accountMode = "login";
      phoneOtpPending = false;
      pendingPhone = "";
      renderAccountStatus();
      renderAccountModal();
      setAccountStatus("You are signed out. Sign in with your email or phone number.", "success");
      const email = $("accountEmailInput");
      if (email) email.focus();
    } catch (error) {
      setAccountStatus(readableAuthError(error), "error");
    } finally {
      if (button) button.disabled = false;
    }
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
    const query = ui.chatSearch ? ui.chatSearch.value.trim().toLocaleLowerCase() : "";
    const visible = conversations.filter((conversation) =>
      String(conversation.title || "New chat").toLocaleLowerCase().includes(query) ||
      (chatSearchMatches && chatSearchMatches.has(conversation.id))
    );
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "empty-history";
      empty.textContent = query ? "No conversations match this search." : "Your conversations will appear here.";
      ui.chatList.appendChild(empty);
      return;
    }
    visible.forEach((conversation) => {
      const title = conversation.title || "New chat";
      const row = document.createElement("div");
      row.className = "chat-item" + (conversation.id === conversationId ? " active" : "");
      const open = document.createElement("button");
      open.className = "chat-item";
      open.style.cssText = "padding:0;border:0;min-width:0;flex:1;background:transparent;color:inherit";
      open.innerHTML = '<span class="chat-icon">◌</span><span class="chat-title"></span>';
      open.querySelector(".chat-title").textContent = title;
      open.title = title;
      open.setAttribute("aria-label", "Open " + title);
      open.addEventListener("click", () => loadConversation(conversation.id));
      const rename = document.createElement("button");
      rename.className = "rename-chat";
      rename.type = "button";
      rename.textContent = "✎";
      rename.title = "Rename conversation";
      rename.setAttribute("aria-label", "Rename " + title);
      rename.addEventListener("click", (event) => { event.stopPropagation(); void renameConversation(conversation); });
      const del = document.createElement("button");
      del.className = "delete-chat";
      del.type = "button";
      del.textContent = "×";
      del.title = "Delete conversation";
      del.setAttribute("aria-label", "Delete " + title);
      del.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!confirm("Delete this conversation? This cannot be undone.")) return;
        const { error } = await client.from("mahi_ai_conversations").delete().eq("id", conversation.id);
        if (error) return setError("Could not delete that conversation. Please try again.");
        if (conversationId === conversation.id) {
          conversationId = null;
          showWelcome(true);
          pendingEdit = null;
          if (ui.draftNotice) ui.draftNotice.hidden = true;
        }
        await refreshConversations();
      });
      row.append(open, rename, del);
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
        .select("id,role,content,created_at").eq("conversation_id", id)
        .order("created_at", { ascending: false }).limit(200);
      if (messageError) throw messageError;
      conversationId = rows.id;
      pendingEdit = null;
      branchSeedMessages = null;
      branchOrigin = null;
      setTemporaryChatMode(false);
      if (ui.draftNotice) ui.draftNotice.hidden = true;
      ui.input.value = "";
      updateCounter();
      currentMessages = (data || []).slice().reverse().map((m) => ({ id: m.id, role: m.role, content: m.content, created_at: m.created_at }));
      ui.messages.replaceChildren();
      ui.welcome.hidden = true;
      ui.messages.hidden = false;
      currentMessages.forEach((m, index) => addMessage(m.role, m.content, { messageIndex: index, userPrompt: m.role === "assistant" ? [...currentMessages.slice(0, index)].reverse().find((item) => item.role === "user")?.content || "" : "" }));
      renderConversationList();
      closeMobileSidebar();
    } catch (error) {
      setError(error instanceof Error && error.message.startsWith("MahiCloud: ")
        ? error.message.slice(9) : plainError(error));
    }
  }
  function beginNewChat() {
    if (busy) return;
    conversationId = null;
    pendingEdit = null;
    branchSeedMessages = null;
    branchOrigin = null;
    if (ui.draftNotice) ui.draftNotice.hidden = true;
    ui.input.value = "";
    updateCounter();
    showWelcome(true);
    setError("");
    renderConversationList();
    ui.input.focus();
    closeMobileSidebar();
  }
  async function sendMessage(text, options) {
    const sendOptions = options || {};
    const useThinkMode = typeof sendOptions.thinkMode === "boolean" ? sendOptions.thinkMode : thinkModeEnabled;
    const editRequest = sendOptions.replacement || pendingEdit;
    const rollbackMessages = editRequest
      ? (sendOptions.previousMessages || pendingEdit?.previousMessages || currentMessages.slice())
      : null;
    const branchRequest = !!branchSeedMessages;
    const typedText = String(text == null ? "" : text);
    if (busy || (!typedText.trim() && !pendingFiles.length)) return;
    if (editRequest && pendingFiles.length) {
      setError("Remove selected attachments before editing or regenerating a saved message.");
      return;
    }
    if (editRequest && (!editRequest.createdAt || !editRequest.content || !Number.isInteger(editRequest.index))) {
      setError("This message cannot be replaced. Refresh the chat and try again.");
      return;
    }
    setError("");
    const selectedFiles = pendingFiles.slice();
    const userText = typedText.trim() || (selectedFiles.length === 1
      ? "Please analyze the attached file."
      : "Please analyze the attached files.");
    if (editRequest) {
      currentMessages = rollbackMessages.slice(0, editRequest.index);
      renderCurrentMessages();
      pendingEdit = null;
      if (ui.draftNotice) ui.draftNotice.hidden = true;
    }
    ui.input.value = "";
    ui.input.style.height = "auto";
    updateCounter();
    showWelcome(false);
    currentMessages.push({ role: "user", content: userText });
    addMessage("user", sendOptions.displayText || userText, { files: selectedFiles, messageIndex: currentMessages.length - 1 });
    const typing = addMessage("assistant", "", { typing: true, messageIndex: currentMessages.length });
    if (useThinkMode) {
      const thinkLabel = typing.querySelector(".thinking-label");
      if (thinkLabel) thinkLabel.textContent = "Think mode · checking AI answers";
    }
    setBusy(true);
    activeRequestController = new AbortController();
    let uploadedAttachments = [];
    let responseCompleted = false;
    let fullText = ""; 
    try {
      if (!session) await ensureSession();
      uploadedAttachments = await uploadPendingAttachments(selectedFiles);
      const { data: authData, error: authError } = await client.auth.getSession();
      if (authError) throw authError;
      const accessToken = authData?.session?.access_token;
      if (!accessToken) throw new Error("MahiCloud: Your guest session expired. Reload the page and try again.");
      const response = await fetch(cfg.supabaseUrl + "/functions/v1/mahi-ai-chat", {
        method: "POST",
        signal: activeRequestController.signal,
        headers: {
          "Content-Type": "application/json",
          "apikey": cfg.supabasePublishableKey,
          "Authorization": "Bearer " + accessToken
        },
        body: JSON.stringify({
          conversation_id: temporaryChatMode ? null : conversationId,
          temporary_chat: temporaryChatMode,
          think_mode: useThinkMode && selectedModel === "auto",
          selected_model: selectedModel === "auto" ? "" : selectedModel,
          branch_context: branchRequest,
          custom_instructions: chatPreferences.customInstructions,
          response_style: chatPreferences.responseStyle,
          ...(editRequest ? {
            edit_from_created_at: editRequest.createdAt,
            edit_from_content: editRequest.content
          } : {}),
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
        throw new Error("MahiCloud: " + (detail || "Request failed. Please try again."));
      }
      if (!response.body) throw new Error("MahiCloud: Streaming is not supported by this browser.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      const messageContent = typing.querySelector(".message-content");
      messageContent.classList.add("streaming-text");

      let paintQueued = false;
      const paintStream = () => {
        paintQueued = false;
        messageContent.textContent = fullText.indexOf("[[MAHI_LANG") === -1
          ? fullText
          : fullText.replace(/\s*\[\[MAHI_LANG:[\s\S]*$/i, "");
        scrollToBottom();
      };
      const scheduleStreamPaint = () => { if (!paintQueued) { paintQueued = true; requestAnimationFrame(paintStream); } };
      const handleStreamEvent = (block) => {
        const payloadLines = block.split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim());
        if (!payloadLines.length) return;
        let payload;
        try { payload = JSON.parse(payloadLines.join("\n")); } catch (_) { return; }
        if (payload.type === "meta" && payload.conversation_id) {
          conversationId = payload.conversation_id;
        } else if (payload.type === "reset") {
          fullText = "";
          messageContent.textContent = "Thinking";
        } else if (payload.type === "delta" && typeof payload.text === "string") {
          if (!fullText) messageContent.textContent = "";
          fullText += payload.text;
          scheduleStreamPaint();
        } else if (payload.type === "step") {
          mahiSteps.update(typing, payload);
        } else if (payload.type === "done") {
          if (payload.conversation_id) conversationId = payload.conversation_id;
          completed = true;
          mahiSteps.finish(typing);
        } else if (payload.type === "error") {
          throw new Error("MahiCloud: " + (payload.message || "The response was interrupted. Please try again."));
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
        throw new Error("MahiCloud: The connection ended before the answer finished. Please try again.");
      }
      if (!fullText.trim()) throw new Error("MahiCloud: No response was returned. Please try again.");
      fullText = fullText.trim();
      let detectedVoiceLanguage = "";
      if (voiceModeActive) {
        const languageMarker = fullText.match(/\[\[MAHI_LANG:([a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2})\]\]\s*$/i);
        if (languageMarker) {
          detectedVoiceLanguage = languageMarker[1];
          fullText = fullText.slice(0, languageMarker.index).trim();
        }
        voiceResponseLanguage = detectedVoiceLanguage;
      }
      if (!fullText) throw new Error("MahiCloud: The answer contained no readable text. Please try again.");
      responseCompleted = true;
      messageContent.classList.remove("streaming-text");
      const resolvedReply = await resolveStoredImageMarkers(fullText);
      messageContent.innerHTML = safeMarkdown(resolvedReply);
      renderLivePreview(typing, messageContent, fullText);
      delete typing.dataset.typing;
      addSpeechActions(typing, fullText);
      currentMessages.push({ role: "assistant", content: fullText });
      typing.dataset.messageIndex = String(currentMessages.length - 1);
      branchSeedMessages = null;
      branchOrigin = null;
      addMessageControls(typing, "assistant", fullText, currentMessages.length - 1);
      pendingEdit = null;
      if (ui.draftNotice) ui.draftNotice.hidden = true;
      if (voiceModeActive) await speakText(fullText, true, detectedVoiceLanguage);
      else if (chatPreferences.autoReadAloud) void speakText(fullText, false, detectedVoiceLanguage);
      pendingFiles = [];
      renderAttachmentList();
      updateCounter();
      if (temporaryChatMode) {
        if (uploadedAttachments.length) {
          try {
            await client.storage.from("mahi-ai-attachments").remove(uploadedAttachments.map((item) => item.path));
          } catch (cleanupError) {
            console.warn("Temporary chat attachment cleanup failed:", cleanupError instanceof Error ? cleanupError.message.slice(0, 120) : "Unknown error");
          }
        }
      } else {
        try {
          await refreshConversations();
          await refreshMessageMetadata();
        } catch (historyError) {
          // A delivered answer must not be rolled back just because history refresh failed.
          console.warn("MahiCloud reply delivered; conversation history refresh failed:",
            historyError instanceof Error ? historyError.message.slice(0, 160) : "Unknown error");
        }
      }
    } catch (error) {
      if (responseCompleted) {
        // Preserve a successfully received answer if image-marker resolution or another
        // non-critical UI step failed after the stream already finished.
        const messageContent = typing.querySelector(".message-content");
        if (messageContent) {
          messageContent.classList.remove("streaming-text");
          messageContent.innerHTML = safeMarkdown(fullText.replace(/!\[Generated image\]\(mahi-storage:\/\/[^)]+\)/g, "[Generated image is stored in this chat.]"));
          delete typing.dataset.typing;
        }
        if (currentMessages[currentMessages.length - 1]?.role !== "assistant") {
          currentMessages.push({ role: "assistant", content: fullText });
        }
        typing.dataset.messageIndex = String(currentMessages.length - 1);
        branchSeedMessages = null;
        branchOrigin = null;
        addMessageControls(typing, "assistant", fullText, currentMessages.length - 1);
        pendingEdit = null;
        if (ui.draftNotice) ui.draftNotice.hidden = true;
        pendingFiles = [];
        renderAttachmentList();
        updateCounter();
        console.warn("MahiCloud reply was received; a post-response UI step failed:",
          error instanceof Error ? error.message.slice(0, 160) : "Unknown error");
        return;
      }
      typing.remove();
      if (uploadedAttachments.length) {
        try { await client.storage.from("mahi-ai-attachments").remove(uploadedAttachments.map((item) => item.path)); } catch (_) {}
      }
      if (rollbackMessages) {
        currentMessages = rollbackMessages.slice();
        pendingEdit = editRequest;
        if (ui.draftNotice) ui.draftNotice.hidden = false;
        renderCurrentMessages();
      } else {
        currentMessages.pop();
        if (!currentMessages.length) {
          showWelcome(true);
        } else {
          renderCurrentMessages();
        }
      }
      setError(error && error.name === "AbortError"
        ? "Generation stopped. Your draft is available to retry."
        : (error instanceof Error && error.message.startsWith("MahiCloud: ")
          ? error.message.slice(9) : plainError(error)));
      // Keep the draft and selected files available so the user can retry.
      ui.input.value = userText;
      updateCounter();
    } finally {
      activeRequestController = null;
      setBusy(false);
      ui.input.disabled = false;
      if (voiceModeActive) {
        if (!voicePaused && !voiceIsSpeaking && !voiceIsListening) {
          if (voiceRestartTimer) window.clearTimeout(voiceRestartTimer);
          voiceRestartTimer = window.setTimeout(() => { voiceRestartTimer = null; startVoiceListening(); }, 350);
        }
      } else {
        ui.input.focus();
      }
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
    ui.send.disabled = busy || (!ui.input.value.trim() && !pendingFiles.length);
    ui.input.style.height = "auto";
    ui.input.style.height = Math.min(ui.input.scrollHeight, 180) + "px";
  }
  async function boot() {
    if (!cfg || !cfg.supabaseUrl || !cfg.supabasePublishableKey ||
        !window.supabase || !window.supabase.createClient) {
      ui.session.textContent = "Configuration missing";
      setError("MahiCloud is missing its Supabase public configuration. Check public/config.js.");
      ui.send.disabled = true;
      return;
    }
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    client.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession;
      renderAccountStatus();
    });
    try {
      await ensureSession();
      renderAccountStatus();
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
    void sendMessage(ui.input.value);
  });
  if (ui.modelPicker) {
    selectedModel = ui.modelPicker.value || "auto";
    ui.modelPicker.addEventListener("change", () => {
      selectedModel = ui.modelPicker.value || "auto";
      if (selectedModel !== "auto") setThinkModeEnabled(false);
      if (ui.thinkModeButton) {
        ui.thinkModeButton.disabled = selectedModel !== "auto";
        ui.thinkModeButton.title = selectedModel !== "auto" ? "Think mode is available when Auto is selected" : "Think mode compares answers from connected models";
      }
    });
    if (ui.thinkModeButton) ui.thinkModeButton.disabled = selectedModel !== "auto";
  }
  if (ui.thinkModeButton) ui.thinkModeButton.addEventListener("click", () => {
    if (selectedModel === "auto") setThinkModeEnabled(!thinkModeEnabled);
  });
  if (ui.stop) ui.stop.addEventListener("click", () => {
    if (activeRequestController && busy) activeRequestController.abort();
  });
  if (ui.chatSearch) ui.chatSearch.addEventListener("input", () => { void handleConversationSearch(); });
  if (ui.exportMarkdownButton) ui.exportMarkdownButton.addEventListener("click", () => exportConversation("md"));
  if (ui.exportJsonButton) ui.exportJsonButton.addEventListener("click", () => exportConversation("json"));
  if (ui.temporaryChatButton) ui.temporaryChatButton.addEventListener("click", () => {
    if (busy) return;
    if (currentMessages.length && !window.confirm("Switching chat mode starts a new chat. The current temporary chat is only in this browser session. Continue?")) return;
    setTemporaryChatMode(!temporaryChatMode);
    beginNewChat();
  });
  if ($("cancelEditButton")) $("cancelEditButton").addEventListener("click", cancelPendingEdit);
  if (ui.voiceModeButton) ui.voiceModeButton.addEventListener("click", openVoiceMode);
  if (voiceUI.mic) voiceUI.mic.addEventListener("click", toggleVoiceMicrophone);
  if (voiceUI.end) voiceUI.end.addEventListener("click", closeVoiceMode);
  document.querySelectorAll("[data-voice-close]").forEach((element) => element.addEventListener("click", closeVoiceMode));
  if (voiceUI.language) voiceUI.language.addEventListener("change", () => {
    if (voiceModeActive && voiceIsListening && voiceRecognition) {
      try { voiceRecognition.stop(); } catch (_) {}
    }
  });
  if (ui.accountButton) ui.accountButton.addEventListener("click", openAccountModal);
  if ($("accountForm")) $("accountForm").addEventListener("submit", handleAccountSubmit);
  document.querySelectorAll("[data-account-method]").forEach((button) => {
    button.addEventListener("click", () => setAccountMethod(button.getAttribute("data-account-method")));
  });
  document.querySelectorAll("[data-account-mode]").forEach((button) => {
    button.addEventListener("click", () => setAccountMode(button.getAttribute("data-account-mode")));
  });
  document.querySelectorAll("[data-account-close]").forEach((el) => {
    el.addEventListener("click", closeAccountModal);
  });
  if ($("accountSignOut")) $("accountSignOut").addEventListener("click", signOutAndSwitchAccount);
  if ($("accountResendCode")) $("accountResendCode").addEventListener("click", resendAccountPhoneCode);
  ui.attachButton.addEventListener("click", () => ui.fileInput.click());
  ui.fileInput.addEventListener("change", () => {
    addPendingFiles(Array.from(ui.fileInput.files || []));
    ui.fileInput.value = "";
  });
  ui.input.addEventListener("input", updateCounter);
  // Enter sends when enabled. Otherwise Ctrl/Command+Enter sends and plain Enter adds a line.
  // Shift+Enter always adds a line; composition/IME input is never intercepted.
  ui.input.addEventListener("keydown", (event) => {
    const isEnter = event.key === "Enter" || event.keyCode === 13 || event.which === 13;
    const isComposing = event.isComposing || event.keyCode === 229;
    const sendShortcut = event.ctrlKey || event.metaKey;
    const shouldSend = !event.shiftKey && (chatPreferences.enterToSend || sendShortcut);
    if (isEnter && shouldSend && !isComposing) {
      event.preventDefault();
      if (!busy && (ui.input.value.trim() || pendingFiles.length)) sendMessage(ui.input.value);
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
  $("openSidebar").addEventListener("click", toggleSidebar);
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
    if (event.key === "Escape") { closeApiDirectory(); closeMobileSidebar(); closeAccountModal(); if (voiceModeActive) closeVoiceMode(); }
  });
  window.addEventListener("online", () => { if (!busy) setError(""); });
  // Expose only a short-lived Gemini Live session token to the dedicated voice UI.
  // The permanent provider API key remains in Supabase Edge Function Secrets.
  window.MahiCloudRequestLiveVoiceToken = async function () {
    if (!client) throw new Error("MahiCloud is still starting. Please try again in a moment.");
    const authSession = await ensureSession();
    const response = await fetch(cfg.supabaseUrl.replace(/\/+$/, "") + "/functions/v1/mahi-ai-live-token", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + authSession.access_token,
        "apikey": cfg.supabasePublishableKey,
        "Content-Type": "application/json"
      },
      body: "{}"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.token) throw new Error(payload.error || "Could not prepare a secure Live Voice session.");
    return payload;
  };

  setupPreferences();
  boot();
})();