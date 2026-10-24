/* MahiCloud — code block toolbar: Copy + Download (+ Run for html/css/js)
   Loads after app.js. Watches message content and enhances <pre><code> blocks. */
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
    sql: "sql", xml: "xml", yaml: "yml", yml: "yml", toml: "toml",
    go: "go", rs: "rs", rust: "rs", java: "java", kt: "kt", kotlin: "kt",
    c: "c", h: "h", cpp: "cpp", cc: "cpp", cxx: "cpp", cs: "cs", csharp: "cs",
    php: "php", rb: "rb", ruby: "rb", swift: "swift",
    vue: "vue", svelte: "svelte", dart: "dart", lua: "lua", r: "r",
    txt: "txt", text: "txt", plain: "txt", ini: "ini", env: "env",
    dockerfile: "dockerfile", makefile: "makefile"
  };

  const RUNNABLE = new Set(["html", "htm", "xhtml", "css", "js", "javascript", "mjs", "cjs"]);

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
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
      const ta = document.createElement("textarea");
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
    if (/<!doctype\s+html|<html\b/i.test(raw)) return "html";
    if (/^@import|^:root\s*\{|^\.[a-z].*\{/im.test(raw.trim()) && !/function\s|const\s|let\s/.test(raw)) return "css";
    return "text";
  }

  function enhancePre(pre) {
    if (!pre || pre.closest(".mahi-code-block")) return;
    const codeEl = pre.querySelector("code") || pre;
    const raw = codeEl.textContent || "";
    if (!raw.trim()) return;

    const lang = detectLang(pre, codeEl);
    const ext = CODE_EXT[lang] || "txt";
    const runnable = RUNNABLE.has(lang) || (lang === "text" && /<!doctype\s+html|<html\b/i.test(raw));

    const wrap = document.createElement("div");
    wrap.className = "mahi-code-block";
    wrap.dataset.lang = lang;

    const bar = document.createElement("div");
    bar.className = "mahi-code-toolbar";
    bar.innerHTML =
      '<span class="mahi-code-lang">' + escapeHtml(lang || "code") + "</span>" +
      '<div class="mahi-code-actions"></div>';
    const actions = bar.querySelector(".mahi-code-actions");

    function mkBtn(label, title) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mahi-code-btn";
      b.textContent = label;
      b.title = title;
      actions.appendChild(b);
      return b;
    }

    const copyBtn = mkBtn("Copy", "Copy code");
    copyBtn.addEventListener("click", async () => {
      const ok = await copyText(raw);
      copyBtn.textContent = ok ? "Copied" : "Failed";
      setTimeout(() => { copyBtn.textContent = "Copy"; }, 1400);
    });

    const dlBtn = mkBtn("Download", "Download as ." + ext);
    dlBtn.addEventListener("click", () => {
      const blob = new Blob([raw], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "mahicloud-code." + ext;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2500);
    });

    if (runnable) {
      const runBtn = mkBtn("Run", "Preview in MahiCloud");
      runBtn.classList.add("mahi-code-run");
      runBtn.addEventListener("click", () => {
        const existing = wrap.querySelector(".mahi-code-preview");
        if (existing) {
          existing.remove();
          runBtn.textContent = "Run";
          return;
        }
        runBtn.textContent = "Hide";
        const preview = document.createElement("div");
        preview.className = "mahi-code-preview";
        const iframe = document.createElement("iframe");
        iframe.title = "Code preview";
        iframe.sandbox = "allow-scripts";
        iframe.referrerPolicy = "no-referrer";
        iframe.loading = "lazy";
        let doc = raw;
        if (lang === "css") {
          doc = "<!doctype html><html><head><meta charset=\"utf-8\"><style>" +
            raw.replace(/<\/style/gi, "<\\/style") +
            "</style></head><body style=\"font-family:system-ui;background:#111;color:#eee;padding:16px\">" +
            "<p>CSS applied to this preview.</p>" +
            "<div class=\"demo-box\" style=\"margin-top:12px;padding:20px;border:1px dashed #666;border-radius:12px\">Demo element</div>" +
            "</body></html>";
        } else if (lang === "js" || lang === "javascript" || lang === "mjs" || lang === "cjs") {
          doc = "<!doctype html><html><head><meta charset=\"utf-8\"></head>" +
            "<body style=\"font-family:system-ui;background:#111;color:#eee;padding:16px\">" +
            "<pre id=\"out\" style=\"white-space:pre-wrap\"></pre>" +
            "<script>const out=document.getElementById(\"out\");" +
            "const log=(...a)=>{out.textContent+=a.map(x=>typeof x===\"object\"?JSON.stringify(x,null,2):String(x)).join(\" \")+\"\\n\"};" +
            "console.log=log;console.error=log;try{\n" +
            raw.replace(/<\/script/gi, "<\\/script") +
            "\n}catch(e){log(\"Error:\", e&&e.message||e)}<\/script></body></html>";
        } else if (!/<html\b/i.test(doc)) {
          doc = "<!doctype html><html><head><meta charset=\"utf-8\">" +
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"></head><body>" +
            doc + "</body></html>";
        }
        iframe.srcdoc = doc;
        preview.appendChild(iframe);
        wrap.appendChild(preview);
      });
    }

    const parent = pre.parentNode;
    if (!parent) return;
    parent.insertBefore(wrap, pre);
    wrap.appendChild(bar);
    wrap.appendChild(pre);
  }

  function enhanceAll(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll("pre").forEach(enhancePre);
  }

  function boot() {
    enhanceAll(document);
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.matches && node.matches("pre")) enhancePre(node);
          else if (node.querySelectorAll) enhanceAll(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
