/* MahiCloud — isolated in-chat code playground.
   HTML/CSS/JavaScript run in a sandboxed iframe. Python uses Pyodide only when
   the user explicitly enables external web resources. */
(() => {
  "use strict";

  const CODE_EXT = {
    html: "html", htm: "html", xhtml: "html",
    css: "css", scss: "scss", less: "less",
    js: "js", javascript: "js", mjs: "js", cjs: "js",
    ts: "ts", typescript: "ts", tsx: "tsx", jsx: "jsx",
    py: "py", python: "py",
    bat: "bat", cmd: "bat", dos: "bat",
    ps1: "ps1", powershell: "ps1",
    sh: "sh", bash: "sh", zsh: "sh", shell: "sh",
    json: "json", jsonc: "json",
    md: "md", markdown: "md",
    sql: "sql", xml: "xml", svg: "svg", yaml: "yml", yml: "yml", toml: "toml",
    go: "go", rs: "rs", rust: "rs", java: "java", kt: "kt", kotlin: "kt",
    c: "c", h: "h", cpp: "cpp", cc: "cpp", cxx: "cpp", cs: "cs", csharp: "cs",
    php: "php", rb: "rb", ruby: "rb", swift: "swift",
    vue: "vue", svelte: "svelte", dart: "dart", lua: "lua", r: "r",
    txt: "txt", text: "txt", plain: "txt", ini: "ini", env: "env",
    dockerfile: "dockerfile", makefile: "makefile"
  };
  const RUNNABLE = new Set(["html", "htm", "xhtml", "svg", "css", "js", "javascript", "mjs", "cjs", "py", "python"]);
  const PYODIDE_VERSION = "0.27.7";
  const activeFrames = new Map();
  let booted = false;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function makeButton(label, title, className) {
    const button = element("button", "mahi-code-btn" + (className ? " " + className : ""), label);
    button.type = "button";
    button.title = title || label;
    return button;
  }

  function escapeAttr(value) {
    return String(value).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function inlineScript(value) {
    return String(value).replace(/<\/script/gi, "<\\/script");
  }

  function safeString(value) {
    try {
      if (typeof value === "string") return value;
      if (value instanceof Error) return value.stack || value.message || String(value);
      const out = JSON.stringify(value, null, 2);
      return out === undefined ? String(value) : out;
    } catch (_) {
      try { return String(value); } catch (_) { return "[unprintable value]"; }
    }
  }

  function sendCode(lang, text) {
    try {
      parent.postMessage({ __mahiPreview: true, level: lang, text: String(text).slice(0, 12000) }, "*");
    } catch (_) {}
  }

  function consoleBootstrap() {
    return "(function(){'use strict';" +
      "var send=function(level,args){var text=Array.prototype.map.call(args,function(v){try{if(v instanceof Error)return v.stack||v.message; if(typeof v==='string')return v; var x=JSON.stringify(v,null,2);return x===undefined?String(v):x;}catch(e){try{return String(v)}catch(_){return '[unprintable value]'}}}).join(' ');" +
      "try{parent.postMessage({__mahiPreview:true,level:level,text:String(text).slice(0,12000)},'*')}catch(e){}};" +
      "['log','info','debug','warn','error'].forEach(function(level){var old=console[level];console[level]=function(){send(level,arguments);if(typeof old==='function'){try{old.apply(console,arguments)}catch(e){}}}});" +
      "window.addEventListener('error',function(e){send('error',[String(e.message||'Runtime error')+(e.filename?' ('+e.filename+':'+e.lineno+')':'')])});" +
      "window.addEventListener('unhandledrejection',function(e){send('error',['Unhandled promise rejection:',e.reason])});" +
      "})();";
  }

  function makeCsp(allowNetwork) {
    const remote = allowNetwork ? " https: wss:" : "";
    const scripts = "'unsafe-inline' 'wasm-unsafe-eval'" + (allowNetwork ? " https: blob:" : " blob:");
    const styles = "'unsafe-inline' data:" + (allowNetwork ? " https:" : "");
    const images = "data: blob:" + (allowNetwork ? " https:" : "");
    const media = "data: blob:" + (allowNetwork ? " https:" : "");
    const fonts = "data:" + (allowNetwork ? " https:" : "");
    const connect = allowNetwork ? "https: wss:" : "'none'";
    const frames = allowNetwork ? "https:" : "'none'";
    const workers = allowNetwork ? "blob: https:" : "blob:";
    return "default-src 'none'; script-src " + scripts +
      "; style-src " + styles + "; img-src " + images + "; media-src " + media +
      "; font-src " + fonts + "; connect-src " + connect + "; frame-src " + frames +
      "; worker-src " + workers + "; form-action 'none'; base-uri 'none'; object-src 'none'";
  }

  function headBits(allowNetwork, extraHead) {
    const policy = '<meta http-equiv="Content-Security-Policy" content="' + escapeAttr(makeCsp(allowNetwork)) + '">';
    const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">';
    const boot = "<script>" + inlineScript(consoleBootstrap()) + "</script>";
    return policy + viewport + boot + (extraHead || "");
  }

  function injectHead(source, bits) {
    let html = String(source || "");
    if (/<head\b[^>]*>/i.test(html)) {
      return html.replace(/<head\b[^>]*>/i, (match) => match + bits);
    }
    if (/<html\b[^>]*>/i.test(html)) {
      return html.replace(/<html\b[^>]*>/i, (match) => match + "<head>" + bits + "</head>");
    }
    return "<!doctype html><html><head>" + bits + "</head><body>" + html + "</body></html>";
  }

  function buildDocument(code, lang, allowNetwork) {
    const raw = String(code || "");
    if (lang === "python" || lang === "py") {
      if (!allowNetwork) {
        return "<!doctype html><html><head>" + headBits(false) +
          "<style>body{font:14px/1.6 system-ui,sans-serif;padding:24px;background:#10131b;color:#e8eaf3}.notice{padding:16px;border:1px solid #7765cf;border-radius:12px;background:#1b1930}.muted{color:#a8aec2}</style>" +
          "</head><body><div class='notice'><strong>Python browser runtime</strong><p>Enable <b>Allow web resources</b> in the preview toolbar to load the Pyodide runtime. Your Python code will run inside this isolated preview.</p><p class='muted'>The runtime is downloaded from jsDelivr only after you enable the option.</p></div></body></html>";
      }
      const pyLoader = '<script src="https://cdn.jsdelivr.net/pyodide/v' + PYODIDE_VERSION + '/full/pyodide.js"></script>';
      const pythonRunner = "(async function(){try{" +
        "if(typeof loadPyodide!=='function')throw new Error('Could not load Pyodide. Check the network permission or CDN access.');" +
        "parent.postMessage({__mahiPreview:true,level:'info',text:'Loading Python runtime…'},'*');" +
        "var py=await loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v" + PYODIDE_VERSION + "/full/'});" +
        "py.setStdout({batched:function(s){parent.postMessage({__mahiPreview:true,level:'log',text:s},'*')}});" +
        "py.setStderr({batched:function(s){parent.postMessage({__mahiPreview:true,level:'error',text:s},'*')}});" +
        "await py.runPythonAsync(" + JSON.stringify(raw).replace(/<\/script/gi, "<\\/script") + ");" +
        "parent.postMessage({__mahiPreview:true,level:'success',text:'Python execution finished.'},'*');" +
        "}catch(e){parent.postMessage({__mahiPreview:true,level:'error',text:String(e&&e.stack||e&&e.message||e)},'*')}})();";
      return "<!doctype html><html><head>" + headBits(true, pyLoader) +
        "<style>body{font:14px/1.6 system-ui,sans-serif;padding:20px;background:#10131b;color:#e8eaf3}code{color:#c9bdff}</style>" +
        "</head><body><div>Python is running in the isolated Pyodide runtime. Output and errors appear in the preview console.</div><script>" +
        inlineScript(pythonRunner) + "</script></body></html>";
    }

    if (lang === "css") {
      const demo = "<style>html,body{min-height:100%;margin:0}body{font:14px/1.6 system-ui,sans-serif;padding:22px;background:#10131b;color:#eceef7;box-sizing:border-box}*{box-sizing:border-box}.mahi-demo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-top:18px}.mahi-demo-card{padding:18px;border:1px solid #454b62;border-radius:12px;background:#1a1e2b}.mahi-demo-card button{padding:8px 12px;border:0;border-radius:8px;background:#a896ff;color:#171322;font:inherit;cursor:pointer}</style>";
      const customStyle = "<style>" + raw.replace(/<\/style/gi, "<\\/style") + "</style>";
      const body = "<main><p style='font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#a99bff'>CSS playground</p><h1>Style preview</h1><p>Your CSS is applied to this sample page. Edit the code and press Run to refresh.</p><div class='mahi-demo-grid'><article class='mahi-demo-card'><h2>Card one</h2><p>Sample content</p><button type='button'>Action</button></article><article class='mahi-demo-card'><h2>Card two</h2><p>Another component</p><button type='button'>Explore</button></article><article class='mahi-demo-card'><h2>Card three</h2><p>Responsive grid item</p><button type='button'>Open</button></article></div></main>";
      return injectHead("<!doctype html><html><head></head><body>" + body + "</body></html>", headBits(allowNetwork, demo + customStyle));
    }

    if (lang === "svg") {
      const svgBody = /<svg\b/i.test(raw) ? raw : "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 300'>" + raw + "</svg>";
      const svgShell = "<!doctype html><html><head></head><body style='margin:0;padding:20px;background:#10131b;color:#eee;display:grid;place-items:center;min-height:100vh'>" + svgBody + "</body></html>";
      return injectHead(svgShell, headBits(allowNetwork));
    }

    if (["js", "javascript", "mjs", "cjs"].includes(lang)) {
      const body = "<main id='app' style='font:14px/1.6 system-ui,sans-serif;padding:22px;background:#10131b;color:#eceef7;min-height:100vh;box-sizing:border-box'><p style='font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#a99bff'>JavaScript playground</p><h2>Script is running</h2><p>Use <code>console.log(...)</code> to print output. DOM changes appear here.</p><button id='demoButton' style='border:0;border-radius:8px;padding:9px 13px;background:#a896ff;color:#171322'>Demo button</button></main><script>" + inlineScript(raw) + "</script>";
      return injectHead("<!doctype html><html><head></head><body>" + body + "</body></html>", headBits(allowNetwork));
    }

    if (!/<html\b/i.test(raw)) {
      return injectHead("<!doctype html><html><head></head><body>" + raw + "</body></html>", headBits(allowNetwork));
    }
    return injectHead(raw, headBits(allowNetwork));
  }

  async function copyText(value) {
    const text = String(value || "");
    if (!text) return false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}
    try {
      const ta = element("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (_) {
      return false;
    }
  }

  function detectLang(pre, codeEl) {
    const cls = ((codeEl && codeEl.className) || "") + " " + ((pre && pre.className) || "");
    const m = /language-([\w+-]+)/i.exec(cls) || /lang-([\w+-]+)/i.exec(cls);
    if (m) return m[1].toLowerCase();
    const raw = (codeEl && codeEl.textContent) || "";
    if (/^\s*(?:<!doctype\s+html|<html\b|<body\b|<main\b|<div\b|<section\b|<article\b|<svg\b)/i.test(raw)) return /<svg\b/i.test(raw) ? "svg" : "html";
    if (/^\s*(?:@import|:root\s*\{|\.[\w-]+\s*\{|#[\w-]+\s*\{|(?:body|html|button|div|p|h1)\s*\{)/im.test(raw) && !/function\s|const\s|let\s/.test(raw)) return "css";
    if (/^\s*(?:def\s+\w+\s*\(|print\s*\(|import\s+(?:sys|math|os|json|random|re|time)|from\s+\w+\s+import)/m.test(raw)) return "python";
    if (/\b(?:function\s+\w+|const\s+\w+|let\s+\w+|console\.(?:log|error)|document\.|=>)\b/.test(raw)) return "js";
    return "text";
  }

  function findProjectFiles(pre, lang) {
    if (!["html", "htm", "xhtml"].includes(lang)) return null;
    const root = pre.closest(".message-content");
    if (!root) return null;
    const files = { html: null, css: null, js: null };
    root.querySelectorAll("pre").forEach((candidate) => {
      const code = candidate.querySelector("code") || candidate;
      const kind = detectLang(candidate, code);
      if (["html", "htm", "xhtml"].includes(kind)) {
        if (!files.html) files.html = { pre: candidate, lang: kind };
      } else if (kind === "css" && !files.css) {
        files.css = { pre: candidate, lang: kind };
      } else if (["js", "javascript", "mjs", "cjs"].includes(kind) && !files.js) {
        files.js = { pre: candidate, lang: kind };
      }
    });
    return files.html && (files.css || files.js) ? files : null;
  }

  function readSourceFile(file) {
    if (!file || !file.pre) return "";
    const wrapper = file.pre.closest(".mahi-code-block");
    const editor = wrapper && wrapper.querySelector(".mahi-code-editor:not([hidden]) textarea");
    if (editor) return editor.value;
    const code = file.pre.querySelector("code") || file.pre;
    return code.textContent || "";
  }

  function buildProjectDocument(files, allowNetwork) {
    let html = readSourceFile(files.html);
    if (!/<html\b/i.test(html)) {
      html = "<!doctype html><html><head></head><body>" + html + "</body></html>";
    }
    let extras = "";
    const css = files.css ? readSourceFile(files.css) : "";
    if (css.trim()) extras += "<style>" + css.replace(/<\/style/gi, "<\\/style") + "</style>";
    html = injectHead(html, headBits(allowNetwork, extras));
    const js = files.js ? readSourceFile(files.js) : "";
    if (js.trim()) {
      const script = "<script>" + inlineScript(js) + "</script>";
      if (/<\/body\s*>/i.test(html)) html = html.replace(/<\/body\s*>/i, script + "</body>");
      else if (/<\/html\s*>/i.test(html)) html = html.replace(/<\/html\s*>/i, script + "</html>");
      else html += script;
    }
    return html;
  }

  function enhancePre(pre) {
    if (!pre || pre.closest(".mahi-code-block")) return;
    const codeEl = pre.querySelector("code") || pre;
    const initialCode = codeEl.textContent || "";
    if (!initialCode.trim()) return;

    const lang = detectLang(pre, codeEl);
    const ext = CODE_EXT[lang] || "txt";
    const runnable = RUNNABLE.has(lang);
    const projectFiles = findProjectFiles(pre, lang);
    const wrap = element("div", "mahi-code-block");
    wrap.dataset.lang = lang;
    const bar = element("div", "mahi-code-toolbar");
    const label = element("span", "mahi-code-lang", lang || "code");
    const actions = element("div", "mahi-code-actions");
    bar.append(label, actions);

    let currentCode = initialCode;
    let panel = null;
    let iframe = null;
    let consolePanel = null;
    let consoleList = null;
    let consoleToggle = null;
    let networkToggle = null;
    let stage = null;
    let expandedOverlay = null;
    let projectMode = false;
    const originalParent = wrap;

    function getCurrentCode() {
      return editor && !editor.hidden ? editor.value : currentCode;
    }

    function appendConsole(level, text) {
      if (!consoleList || !consolePanel) return;
      if (consoleList.childElementCount >= 250) {
        if (!consoleList.dataset.truncated) {
          consoleList.dataset.truncated = "1";
          consoleList.appendChild(element("div", "mahi-code-console-row warn", "Output capped at 250 lines."));
        }
        consolePanel.hidden = false;
        if (consoleToggle) {
          consoleToggle.textContent = "Hide console";
          consoleToggle.setAttribute("aria-pressed", "true");
        }
        return;
      }
      const row = element("div", "mahi-code-console-row " + (level || "log"), String(text || "").slice(0, 12000));
      row.setAttribute("role", "listitem");
      consoleList.appendChild(row);
      consolePanel.hidden = false;
      if (consoleToggle) {
        consoleToggle.textContent = "Hide console";
        consoleToggle.setAttribute("aria-pressed", "true");
      }
      consoleList.scrollTop = consoleList.scrollHeight;
    }

    function clearConsole() {
      if (consoleList) {
        consoleList.textContent = "";
        delete consoleList.dataset.truncated;
      }
    }

    function collapseExpanded() {
      if (!expandedOverlay) return;
      const overlay = expandedOverlay;
      expandedOverlay = null;
      if (panel) wrap.appendChild(panel);
      overlay.remove();
      document.body.classList.remove("mahi-code-expanded-open");
    }

    function setViewport(mode) {
      if (!stage) return;
      stage.dataset.viewport = mode;
      stage.querySelectorAll("[data-viewport-choice]").forEach((button) => {
        button.setAttribute("aria-pressed", button.dataset.viewportChoice === mode ? "true" : "false");
      });
    }

    function makePreviewPanel() {
      panel = element("section", "mahi-code-playground");
      panel.setAttribute("aria-label", "Interactive code preview");
      const browserBar = element("div", "mahi-code-browserbar");
      const browserLeft = element("div", "mahi-code-browser-left");
      const lights = element("span", "mahi-code-browser-lights");
      lights.setAttribute("aria-hidden", "true");
      lights.append(element("i"), element("i"), element("i"));
      const address = element("span", "mahi-code-address", "mahicloud.local / preview");
      browserLeft.append(lights, address);
      const browserActions = element("div", "mahi-code-browser-actions");
      const reloadBtn = makeButton("Reload", "Run the current code again");
      consoleToggle = makeButton("Console", "Show or hide console output");
      consoleToggle.setAttribute("aria-pressed", "false");
      const expandBtn = makeButton("Expand", "Expand preview");
      browserActions.append(reloadBtn, consoleToggle, expandBtn);
      browserBar.append(browserLeft, browserActions);

      const tools = element("div", "mahi-code-preview-tools");
      const viewportGroup = element("div", "mahi-code-viewport-group");
      viewportGroup.setAttribute("role", "group");
      viewportGroup.setAttribute("aria-label", "Preview viewport");
      [["Desktop", "desktop"], ["Tablet", "tablet"], ["Mobile", "mobile"]].forEach(([title, mode]) => {
        const b = makeButton(title, title + " viewport");
        b.dataset.viewportChoice = mode;
        b.setAttribute("aria-pressed", mode === "desktop" ? "true" : "false");
        b.addEventListener("click", () => setViewport(mode));
        viewportGroup.appendChild(b);
      });
      const networkLabel = element("label", "mahi-code-network-label");
      networkToggle = element("input", "mahi-code-network");
      networkToggle.type = "checkbox";
      networkToggle.checked = false;
      networkToggle.setAttribute("aria-label", "Allow external web resources in this preview");
      networkLabel.append(networkToggle, element("span", "", "Allow web resources"));
      tools.append(viewportGroup, networkLabel);

      stage = element("div", "mahi-code-stage");
      stage.dataset.viewport = "desktop";
      const device = element("div", "mahi-code-device");
      iframe = element("iframe", "mahi-code-iframe");
      iframe.title = "MahiCloud isolated code preview";
      iframe.setAttribute("sandbox", "allow-scripts");
      iframe.referrerPolicy = "no-referrer";
      iframe.loading = "eager";
      device.appendChild(iframe);
      stage.appendChild(device);

      consolePanel = element("section", "mahi-code-console");
      consolePanel.hidden = true;
      const consoleHead = element("div", "mahi-code-console-head");
      consoleHead.append(element("strong", "", "Console output"));
      const clearBtn = makeButton("Clear", "Clear console output");
      clearBtn.addEventListener("click", clearConsole);
      consoleHead.appendChild(clearBtn);
      consoleList = element("div", "mahi-code-console-list");
      consoleList.setAttribute("role", "list");
      consoleList.setAttribute("aria-label", "Preview console messages");
      consolePanel.append(consoleHead, consoleList);

      panel.append(browserBar, tools, stage, consolePanel);
      activeFrames.set(iframe.contentWindow, {
        onMessage(data) {
          if (!data || data.__mahiPreview !== true) return;
          const level = String(data.level || "log");
          appendConsole(level, data.text || "");
          if (level === "error") stage.classList.add("has-runtime-error");
          else if (level === "success") stage.classList.remove("has-runtime-error");
        }
      });

      reloadBtn.addEventListener("click", refreshPreview);
      consoleToggle.addEventListener("click", () => {
        consolePanel.hidden = !consolePanel.hidden;
        consoleToggle.textContent = consolePanel.hidden ? "Console" : "Hide console";
        consoleToggle.setAttribute("aria-pressed", consolePanel.hidden ? "false" : "true");
      });
      networkToggle.addEventListener("change", refreshPreview);
      expandBtn.addEventListener("click", expandPreview);
      return panel;
    }

    function refreshPreview() {
      if (!iframe || !panel) return;
      const code = getCurrentCode();
      currentCode = code;
      clearConsole();
      if (stage) stage.classList.remove("has-runtime-error");
      if (projectMode && projectFiles) {
        appendConsole("info", "Running combined HTML/CSS/JavaScript project in the isolated preview…");
        iframe.srcdoc = buildProjectDocument(projectFiles, networkToggle.checked);
        return;
      }
      if ((lang === "python" || lang === "py") && !networkToggle.checked) {
        appendConsole("warn", "Python requires an external runtime. Enable Allow web resources and press Reload.");
      } else {
        appendConsole("info", "Running " + lang + " in an isolated browser preview…");
      }
      iframe.srcdoc = buildDocument(code, lang, networkToggle.checked);
    }

    function expandPreview() {
      if (!panel || expandedOverlay) return;
      const overlay = element("div", "mahi-code-expand-overlay");
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "Expanded code preview");
      const closeBtn = makeButton("Close preview", "Close expanded preview");
      closeBtn.classList.add("mahi-code-expand-close");
      closeBtn.addEventListener("click", collapseExpanded);
      overlay.appendChild(closeBtn);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);
      expandedOverlay = overlay;
      document.body.classList.add("mahi-code-expanded-open");
      closeBtn.focus();
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") collapseExpanded();
      });
    }

    const copyBtn = makeButton("Copy", "Copy code");
    copyBtn.addEventListener("click", async () => {
      const ok = await copyText(getCurrentCode());
      copyBtn.textContent = ok ? "Copied" : "Failed";
      window.setTimeout(() => { if (copyBtn.isConnected) copyBtn.textContent = "Copy"; }, 1400);
    });
    actions.appendChild(copyBtn);

    const dlBtn = makeButton("Download", "Download as ." + ext);
    dlBtn.addEventListener("click", () => {
      const blob = new Blob([getCurrentCode()], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = element("a");
      a.href = url;
      a.download = "mahicloud-code." + ext;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2500);
    });
    actions.appendChild(dlBtn);

    let editor = null;
    if (runnable) {
      const editBtn = makeButton("Edit", "Edit code before running");
      const runBtn = makeButton("Run", "Run code in the isolated preview", "mahi-code-run");
      actions.append(editBtn, runBtn);
      editor = element("div", "mahi-code-editor");
      editor.hidden = true;
      const editorHint = element("div", "mahi-code-editor-hint", "Edits stay in this preview until you leave the conversation.");
      const textarea = element("textarea", "mahi-code-editor-input");
      textarea.value = currentCode;
      textarea.spellcheck = false;
      textarea.autocapitalize = "off";
      textarea.autocomplete = "off";
      textarea.setAttribute("aria-label", "Edit code for preview");
      const editorActions = element("div", "mahi-code-editor-actions");
      const resetBtn = makeButton("Reset", "Restore the original generated code");
      const applyBtn = makeButton("Apply & Run", "Run the edited code", "mahi-code-run");
      editorActions.append(resetBtn, applyBtn);
      editor.append(editorHint, textarea, editorActions);
      editor.value = currentCode;
      editor._input = textarea;
      editor._setValue = (value) => { textarea.value = value; editor.value = value; };
      textarea.addEventListener("input", () => { editor.value = textarea.value; });
      editBtn.addEventListener("click", () => {
        editor.hidden = !editor.hidden;
        editBtn.textContent = editor.hidden ? "Edit" : "Done";
        if (!editor.hidden) textarea.focus();
      });
      resetBtn.addEventListener("click", () => {
        editor._setValue(initialCode);
        currentCode = initialCode;
      });
      applyBtn.addEventListener("click", () => {
        projectMode = false;
        currentCode = textarea.value;
        if (panel) {
          panel.hidden = false;
          runBtn.textContent = "Hide";
          refreshPreview();
        } else {
          showPreview();
          runBtn.textContent = "Hide";
        }
      });
      runBtn.addEventListener("click", () => {
        projectMode = false;
        if (panel && !panel.hidden) {
          collapseExpanded();
          panel.hidden = true;
          runBtn.textContent = "Run";
          return;
        }
        currentCode = getCurrentCode();
        showPreview();
        runBtn.textContent = "Hide";
        refreshPreview();
      });
    }

    function showPreview() {
      if (!panel) {
        const p = makePreviewPanel();
        wrap.appendChild(p);
      }
      panel.hidden = false;
    }

    if (projectFiles) {
      const projectBtn = makeButton("Run project", "Run this HTML together with CSS and JavaScript code blocks", "mahi-code-run");
      projectBtn.addEventListener("click", () => {
        projectMode = true;
        currentCode = getCurrentCode();
        showPreview();
        refreshPreview();
      });
      actions.appendChild(projectBtn);
    }

    const parent = pre.parentNode;
    if (!parent) return;
    parent.insertBefore(wrap, pre);
    wrap.appendChild(bar);
    if (editor) wrap.appendChild(editor);
    wrap.appendChild(pre);
  }

  function boot() {
    if (booted) return;
    booted = true;
    window.addEventListener("message", (event) => {
      const handler = activeFrames.get(event.source);
      if (!handler || !event.data || event.data.__mahiPreview !== true) return;
      handler.onMessage(event.data);
    });
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.matches && node.matches("pre")) enhancePre(node);
          else if (node.querySelectorAll) node.querySelectorAll("pre").forEach(enhancePre);
        });
        mutation.removedNodes.forEach((node) => {
          if (!node || node.nodeType !== 1) return;
          if (node.matches && node.matches(".mahi-code-block")) {
            const frame = node.querySelector("iframe");
            if (frame) activeFrames.delete(frame.contentWindow);
          }
          if (node.querySelectorAll) node.querySelectorAll(".mahi-code-block iframe").forEach((frame) => activeFrames.delete(frame.contentWindow));
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.querySelectorAll("pre").forEach(enhancePre);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();