const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

function envFirst(names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value && value.trim()) return value.trim();
  }
  return "";
}
function secretFromJson(name: string): string {
  try {
    const value = JSON.parse(Deno.env.get(name) || "{}");
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      if (typeof value.default === "string") return value.default;
      const found = Object.values(value).find((x) => typeof x === "string" && x);
      if (typeof found === "string") return found;
    }
  } catch (_) {}
  return "";
}
const baseUrl = envFirst(["SUPABASE_URL"]);
const anonKey = envFirst(["SUPABASE_ANON_KEY"]) || secretFromJson("SUPABASE_PUBLISHABLE_KEYS");
const serviceKey = envFirst(["SUPABASE_SERVICE_ROLE_KEY"]) || secretFromJson("SUPABASE_SECRET_KEYS");

function adminHeaders(extra: Record<string, string> = {}): HeadersInit {
  return { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json", ...extra };
}
async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(baseUrl + "/rest/v1/" + path, { ...init, headers: adminHeaders((init.headers || {}) as Record<string, string>) });
}
async function verifyUser(req: Request): Promise<{ id: string } | null> {
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token || !baseUrl || !anonKey) return null;
  const response = await fetch(baseUrl + "/auth/v1/user", {
    headers: { apikey: anonKey, Authorization: "Bearer " + token }
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user.id === "string" ? { id: user.id } : null;
}

type StoredAttachment = {
  path: string;
  name: string;
  mime_type?: string;
  size?: number;
  extracted_text?: string;
};
type PreparedAttachment = StoredAttachment & {
  mimeType: string;
  bytes?: Uint8Array;
  base64?: string;
  inline: boolean;
  extractedText?: string;
  unsupported?: boolean;
};

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}
function isTextLikeFile(name: string, mimeType: string): boolean {
  const extension = name.toLowerCase().split(".").pop() || "";
  return mimeType.startsWith("text/") ||
    ["application/json", "application/xml", "application/javascript", "application/x-yaml"].includes(mimeType) ||
    ["txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "xml", "html", "htm", "css", "js", "mjs", "cjs",
     "ts", "tsx", "jsx", "py", "pyi", "java", "kt", "go", "rs", "c", "h", "cpp", "hpp", "cs", "php", "rb",
     "sql", "sh", "bash", "zsh", "bat", "ps1", "yaml", "yml", "toml", "ini", "conf", "log", "diff", "patch",
     "env", "gitignore", "dockerfile", "makefile", "tf", "graphql", "proto"].includes(extension) ||
    ["Dockerfile", "Makefile", ".gitignore", ".env"].includes(name);
}
function isCodeAttachment(name: string): boolean {
  return /\.(py|js|mjs|cjs|ts|tsx|jsx|java|kt|go|rs|c|h|cpp|hpp|cs|php|rb|sql|sh|bash|zsh|bat|ps1|css|html|xml|yaml|yml|toml|tf|graphql|proto|diff|patch)$/i.test(name) ||
    /^(Dockerfile|Makefile|\.gitignore|\.env)$/i.test(name);
}
function isGeminiInlineMime(mimeType: string): boolean {
  return /^image\/(png|jpeg|webp|heic|heif|gif|avif)$/i.test(mimeType) ||
    mimeType === "application/pdf" ||
    /^audio\/(mpeg|mp3|wav|ogg|opus|webm|flac|aac|mp4|m4a|3gpp)$/i.test(mimeType) ||
    /^video\/(mp4|mpeg|quicktime|webm|x-msvideo|x-flv|3gpp|x-ms-wmv)$/i.test(mimeType);
}
function isImageGenerationTask(prompt: string): boolean {
  const text = prompt.toLowerCase();
  const visual = /(?:image|picture|photo|pic|img|illustration|poster|logo|wallpaper|thumbnail|artwork|visual|graphic|icon|banner|chobi|chhobi|chobi-ta|imagen|foto|ilustraci[oó]n|cartel|logotipo|imagem|cartaz|bild|immagine|изображение|картинк[ауи]|صورة|छवि|तस्वीर|चित्र|تصویر|عکس|图片|图像|照片|画像|写真|이미지|사진|resim|fotoğraf|gambar|ilustrasi|ảnh|hình|ছবি|ইমেজ|লোগো|পোস্টার|ওয়ালপেপার|ওয়ালপেপার|থাম্বনেইল)/i.test(text);
  const create = /(?:generat|genarate|gen(?:e|a)rate|creat|draw|mak(?:e|ing)|design|illustrat|render|produc|dibuja|dibujar|diseñ|genera|crear|crea|haz\b|hacer|créer|génér|dessine|dessiner|concevoir|erstelle|generiere|zeichne|gestalte|creare|disegna|gerar|cria|desenha|сгенерируй|создай|создать|нарисуй|нарисовать|сделай|изобрази|أنشئ|اصنع|ارسم|صمم|ولّد|انشئ|बनाओ|बनाएं|बनाना|तैयार करो|खींचो|ڈیزائن|بناؤ|بنائیں|画像生成|画像を作|写真を作|生成して|描いて|设计|生成|制作|画一张|画|만들어|생성|그려|디자인|oluştur|çiz|tasarla|buat|ciptakan|tạo|vẽ|thiết kế|তৈরি|বানাও|আঁক|জেনারেট|banao|banaw|banai|baniye|toiri|koro|kor|kore\s+dao|dao|bana\s+do|bana\s+de|banake\s+do)/i.test(text);
  const edit = /(?:edit|remove|replace|change|modify|retouch|cambia|cambiar|editar|modifica|modifier|ändern|bearbeiten|измен|удали|замени|عدّل|عدل|غيّر|غير|تعديل|बदल|संपादित|बदलें|編集|修正|改变|修改|编辑|편집|수정|değiştir|ubah|sửa|পরিবর্তন|এডিট|change\s+kore\s+dao|edit\s+kore\s+dao)/i.test(text);
  return (create && visual) || (edit && visual);
}

async function prepareAttachments(userId: string, values: unknown): Promise<PreparedAttachment[]> {
  if (!Array.isArray(values)) return [];
  if (values.length > 5) throw new Error("Please attach no more than 5 files per message.");
  let totalBytes = 0;
  let inlineBytes = 0;
  const result: PreparedAttachment[] = [];
  for (const raw of values) {
    const item = raw as Partial<StoredAttachment>;
    if (typeof item.path !== "string" || typeof item.name !== "string") throw new Error("An attachment reference is invalid.");
    if (!item.path.startsWith(userId + "/") || item.path.includes("..") || item.path.startsWith("/")) {
      throw new Error("An attachment reference is invalid.");
    }
    const declared = Number(item.size || 0);
    if (declared > 15 * 1024 * 1024) throw new Error("Each attachment must be 15 MB or smaller.");
    totalBytes += declared;
    if (totalBytes > 20 * 1024 * 1024) throw new Error("All attachments together must be 20 MB or smaller.");
    const encodedPath = item.path.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(baseUrl + "/storage/v1/object/mahi-ai-attachments/" + encodedPath, {
      headers: adminHeaders()
    });
    if (!response.ok) throw new Error("Could not read attachment " + item.name + ". Please remove it and upload again.");
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > 15 * 1024 * 1024) throw new Error("Each attachment must be 15 MB or smaller.");
    totalBytes = totalBytes - declared + buffer.byteLength;
    if (totalBytes > 20 * 1024 * 1024) throw new Error("All attachments together must be 20 MB or smaller.");
    const mimeType = String(item.mime_type || response.headers.get("content-type") || "application/octet-stream").split(";")[0].toLowerCase();
    const attachment: PreparedAttachment = {
      path: item.path, name: item.name.slice(0, 160), mime_type: mimeType, mimeType,
      size: buffer.byteLength, bytes: buffer, inline: false
    };
    const suppliedText = typeof item.extracted_text === "string" ? item.extracted_text.slice(0, 30000) : "";
    if (suppliedText) {
      attachment.extractedText = suppliedText;
    } else if (isTextLikeFile(attachment.name, mimeType)) {
      const decoded = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      attachment.extractedText = decoded.slice(0, 18000);
    } else if (isGeminiInlineMime(mimeType)) {
      inlineBytes += buffer.byteLength;
      if (inlineBytes > 12 * 1024 * 1024) throw new Error("Images, PDFs, audio, and video attachments must total 12 MB or less for reliable AI analysis. Remove a file or compress it.");
      attachment.inline = true;
      attachment.base64 = encodeBase64(buffer);
    } else {
      attachment.unsupported = true;
    }
    result.push(attachment);
  }
  return result;
}
function applyAttachmentContext(messages: ChatMessage[], attachments: PreparedAttachment[]): ChatMessage[] {
  if (!attachments.length) return messages;
  const prepared = [...messages];
  const lastIndex = prepared.length - 1;
  const details: string[] = [];
  for (const item of attachments) {
    if (item.extractedText) {
      details.push("[Attached file: " + item.name + " | " + item.mimeType + "]\n" +
        item.extractedText + "\n[End attached file]");
    } else if (item.unsupported) {
      details.push("[Attached file received: " + item.name + " | " + item.mimeType + " | " +
        formatFileSize(item.size || 0) + ". Its binary format is not directly readable by the selected AI route.]");
    } else if (item.inline) {
      details.push("[Attached media: " + item.name + " | " + item.mimeType +
        ". Inspect it only if its actual binary data is present in this provider's input; otherwise, clearly say that this provider could not access its contents.]");
    }
  }
  const combined = (prepared[lastIndex].content + "\n\n" + details.join("\n\n") +
    "\n\nWhen discussing attachments, use only content you can actually inspect. If a binary format could not be read, say that clearly.").slice(0, 55000);
  prepared[lastIndex] = { ...prepared[lastIndex], content: combined };
  return prepared;
}
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
async function createConversationIfNeeded(userId: string, initialConversationId: string, titlePrompt: string): Promise<string> {
  if (initialConversationId) return initialConversationId;
  const title = titlePrompt.replace(/\s+/g, " ").trim().slice(0, 56) || "New chat";
  const created = await rest("mahi_ai_conversations", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ user_id: userId, title })
  });
  if (!created.ok) throw new Error("Could not create conversation");
  const rows = await created.json();
  const conversationId = rows?.[0]?.id || "";
  if (!conversationId) throw new Error("No conversation id");
  return conversationId;
}
async function saveChatTurn(userId: string, conversationId: string, userContent: string, assistantContent: string): Promise<void> {
  const saved = await rest("mahi_ai_messages", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([
      { conversation_id: conversationId, user_id: userId, role: "user", content: userContent.slice(0, 60000) },
      { conversation_id: conversationId, user_id: userId, role: "assistant", content: assistantContent.slice(0, 60000) }
    ])
  });
  if (!saved.ok) throw new Error("Mahi AI could not save the response");
  await rest("mahi_ai_conversations?id=eq." + encodeURIComponent(conversationId) + "&user_id=eq." + encodeURIComponent(userId), {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ updated_at: new Date().toISOString() })
  });
}

function classifyTask(prompt: string): string {
  const s = prompt.toLowerCase();
  if (/(debug|stack trace|typescript|javascript|python|html|css|react|sql|api|function|compiler|program|code|bug|c[oó]digo|programar|depurar|erro de c[oó]digo|c[oó]digo fuente|programmieren|debuggen|код|программирование|отладка|代码|编程|调试|プログラム|コード|デバッグ|코드|프로그래밍|디버그|كود|برمجة|تصحيح|कोड|प्रोग्रामिंग|त्रुटि|کد|برنامه‌نویسی|কোড|প্রোগ্রামিং|বাগ|এরর|ত্রুটি)/i.test(s)) return "coding";
  if (/(prove|proof|derive|equation|calculate|math|logic|reason|compare|evaluate|analy[sz]e|step by step|matem[aá]tica|calcular|analizar|raisonnement|calculer|mathematik|berechnen|ragionamento|calcolare|вычисл|доказательств|数学|推理|计算|数学|論理|推論|계산|추론|منطق|حساب|गणित|तर्क|गणনা|যুক্তি|বিশ্লেষণ|হিসাব|সমাধান)/i.test(s)) return "reasoning";
  if (/(story|poem|creative|rewrite|write a|blog|script|caption|lyrics|cuento|poema|escribir|historia|histoire|po[eè]me|schreiben|geschichte|racconto|poesia|история|стихотвор|故事|诗|寫作|物語|詩|이야기|시|قصة|شعر|कहानी|कविता|গল্প|কবিতা|লিখে দাও|রচনা|ক্যাপশন)/i.test(s)) return "creative";
  return "general";
}
function providerIsConfigured(name: string): boolean {
  if (name === "gemini") return !!envFirst(["GEMINI_API_KEY", "GOOGLE_GEMINI_API_KEY"]);
  if (name === "groq") return !!envFirst(["GROQ_API_KEY"]);
  if (name === "openrouter") return !!envFirst(["OPENROUTER_API_KEY"]);
  if (name === "mistral") return !!envFirst(["MISTRAL_API_KEY"]);
  if (name === "nvidia") return !!envFirst(["NVIDIA_API_KEY"]);
  if (name === "cloudflare") return !!envFirst(["CLOUDFLARE_API_TOKEN"]) && !!envFirst(["CLOUDFLARE_ACCOUNT_ID"]);
  if (name === "openai") return !!envFirst(["OPENAI_API_KEY"]);
  if (name === "anthropic") return !!envFirst(["ANTHROPIC_API_KEY"]);
  return false;
}
function providerOrder(task: string, hasInlineAttachments = false, hasInlineImages = false): string[] {
  let preferred: string[];
  if (hasInlineAttachments) {
    preferred = ["gemini", ...(hasInlineImages
      ? ["openai", "openrouter", "mistral", "groq", "nvidia", "cloudflare", "anthropic"]
      : ["openai", "openrouter", "groq", "mistral", "nvidia", "cloudflare", "anthropic"])];
  } else if (task === "coding") {
    preferred = ["openrouter", "openai", "nvidia", "groq", "gemini", "mistral", "cloudflare", "anthropic"];
  } else if (task === "reasoning") {
    preferred = ["gemini", "openrouter", "openai", "anthropic", "nvidia", "groq", "mistral", "cloudflare"];
  } else if (task === "creative") {
    preferred = ["gemini", "openai", "anthropic", "groq", "openrouter", "mistral", "nvidia", "cloudflare"];
  } else {
    preferred = ["groq", "gemini", "openrouter", "openai", "mistral", "nvidia", "cloudflare", "anthropic"];
  }
  // Every configured key is eligible for automatic fallback. Paid API calls may incur charges.
  const all = [...preferred, "gemini", "groq", "openrouter", "mistral", "nvidia", "cloudflare", "openai", "anthropic"];
  return [...new Set(all)].filter(providerIsConfigured);
}

function openRouterModel(task: string): string {
  if (task === "coding") return envFirst(["OPENROUTER_CODING_MODEL"]) || "cohere/north-mini-code:free";
  if (task === "reasoning") return envFirst(["OPENROUTER_REASONING_MODEL"]) || "nvidia/nemotron-3.5-lightning:free";
  return envFirst(["OPENROUTER_MODEL"]) || "nvidia/nemotron-3.5-lightning:free";
}
function systemPrompt(task: string): string {
  return "You are Mahi AI, a capable multilingual assistant. Understand and respond in any language or script you can process, including non-Latin writing systems, regional languages, transliteration, dialects, and mixed-language messages. Automatically detect the language and style of the latest user message, and reply in that language and style unless the user explicitly requests another. Do not translate or switch to English unless asked. Preserve meaning, names, formatting, code, and technical terms carefully. Complete the requested task as fully as possible; for multi-step tasks, work through the steps instead of stopping at a superficial answer. For code, provide working solutions or a concrete patch. Never invent facts or claim to have inspected an attachment whose contents were not actually passed to this provider. If an approach fails, try the next available provider. The task routing category is " + task + ". Do not mention internal providers, routing, or API infrastructure.";
}
type ChatMessage = { role: "user" | "assistant"; content: string };
async function fetchWithTimeout(url: string, init: RequestInit, ms = 45000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
async function readProviderError(response: Response): Promise<string> {
  try {
    const body = await response.text();
    return response.status + " " + body.slice(0, 500);
  } catch (_) { return "Provider request failed with status " + response.status; }
}
async function openAICompatible(provider: string, url: string, key: string, model: string, messages: ChatMessage[], extraHeaders: Record<string, string> = {}): Promise<string> {
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: systemPrompt(classifyTask(messages[messages.length - 1]?.content || "")) }, ...messages],
      temperature: 0.4,
      max_tokens: 8192,
      stream: false
    })
  });
  if (!response.ok) throw new Error(await readProviderError(response));
  const result = await response.json();
  const content = result?.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((part: any) => part.text || "").join("") : "";
  if (!text.trim()) throw new Error(provider + " returned no text");
  return text.trim();
}
async function callGemini(messages: ChatMessage[], task: string): Promise<string> {
  const key = envFirst(["GEMINI_API_KEY", "GOOGLE_GEMINI_API_KEY"]);
  if (!key) throw new Error("Not configured");
  const model = envFirst(["GEMINI_MODEL"]) || "gemini-3.5-flash-lite";
  const normalizedMessages = messages[0]?.role === "assistant" ? messages.slice(1) : messages;
  const contents = normalizedMessages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }]
  }));
  const response = await fetchWithTimeout(
    "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt(task) }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 8192 }
      })
    }
  );
  if (!response.ok) throw new Error(await readProviderError(response));
  const result = await response.json();
  const text = (result?.candidates?.[0]?.content?.parts || []).map((part: any) => part.text || "").join("");
  if (!text.trim()) throw new Error("Gemini returned no text");
  return text.trim();
}
async function callProvider(name: string, messages: ChatMessage[], task: string): Promise<{ text: string; provider: string }> {
  if (name === "gemini") return { text: await callGemini(messages, task), provider: name };
  if (name === "groq") {
    const key = envFirst(["GROQ_API_KEY"]);
    if (!key) throw new Error("Not configured");
    return { text: await openAICompatible(name, "https://api.groq.com/openai/v1/chat/completions", key, envFirst(["GROQ_MODEL"]) || "openai/gpt-oss-20b", messages), provider: name };
  }
  if (name === "openrouter") {
    const key = envFirst(["OPENROUTER_API_KEY"]);
    if (!key) throw new Error("Not configured");
    return { text: await openAICompatible(name, "https://openrouter.ai/api/v1/chat/completions", key, openRouterModel(task), messages, { "HTTP-Referer": "https://github.com/mahimahfud-ui/Mahi-AI", "X-Title": "Mahi AI" }), provider: name };
  }
  if (name === "nvidia") {
    const key = envFirst(["NVIDIA_API_KEY"]);
    if (!key) throw new Error("Not configured");
    const model = task === "coding"
      ? envFirst(["NVIDIA_CODING_MODEL"]) || "qwen/qwen2.5-coder-32b-instruct"
      : envFirst(["NVIDIA_MODEL"]) || "openai/gpt-oss-20b";
    return { text: await openAICompatible(name, "https://integrate.api.nvidia.com/v1/chat/completions", key, model, messages), provider: name };
  }
  if (name === "cloudflare") {
    const key = envFirst(["CLOUDFLARE_API_TOKEN"]);
    const accountId = envFirst(["CLOUDFLARE_ACCOUNT_ID"]);
    if (!key || !accountId) throw new Error("Not configured");
    const url = "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(accountId) + "/ai/v1/chat/completions";
    const model = envFirst(["CLOUDFLARE_MODEL"]) || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
    return { text: await openAICompatible(name, url, key, model, messages), provider: name };
  }
  if (name === "mistral") {
    const key = envFirst(["MISTRAL_API_KEY"]);
    if (!key) throw new Error("Not configured");
    return { text: await openAICompatible(name, "https://api.mistral.ai/v1/chat/completions", key, envFirst(["MISTRAL_MODEL"]) || "mistral-small-latest", messages), provider: name };
  }
  if (name === "openai") {
    const key = envFirst(["OPENAI_API_KEY"]);
    if (!key) throw new Error("Not configured");
    return { text: await openAICompatible(name, "https://api.openai.com/v1/chat/completions", key, envFirst(["OPENAI_MODEL"]) || "gpt-4.1-mini", messages), provider: name };
  }
  if (name === "anthropic") {
    const key = envFirst(["ANTHROPIC_API_KEY"]);
    if (!key) throw new Error("Not configured");
    const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: envFirst(["ANTHROPIC_MODEL"]) || "claude-sonnet-4-5",
        max_tokens: 8192,
        system: systemPrompt(task),
        messages: messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }))
      })
    });
    if (!response.ok) throw new Error(await readProviderError(response));
    const result = await response.json();
    const text = (result?.content || []).map((part: any) => part.text || "").join("");
    if (!text.trim()) throw new Error("Anthropic returned no text");
    return { text: text.trim(), provider: name };
  }
  throw new Error("Unknown provider");
}

async function logUsage(userId: string, body: Record<string, unknown>): Promise<string | null> {
  const response = await rest("mahi_ai_usage_events", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ user_id: userId, ...body })
  });
  if (!response.ok) {
    console.error("Mahi AI usage audit insert failed", response.status);
    return null;
  }
  try { const data = await response.json(); return data?.[0]?.id ? String(data[0].id) : null; }
  catch (_) { return null; }
}
async function updateUsage(id: string | null, body: Record<string, unknown>) {
  if (!id) return;
  const response = await rest("mahi_ai_usage_events?id=eq." + encodeURIComponent(id), {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(body)
  });
  if (!response.ok) console.error("Mahi AI usage audit update failed", response.status);
}
async function getConversation(userId: string, id: string): Promise<boolean> {
  const path = "mahi_ai_conversations?select=id&id=eq." + encodeURIComponent(id) +
    "&user_id=eq." + encodeURIComponent(userId) + "&limit=1";
  const response = await rest(path);
  if (!response.ok) throw new Error("Database unavailable");
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0;
}


type ProviderStream = {
  provider: string;
  iterator: AsyncGenerator<string, void, unknown>;
  cleanup: () => void;
};

async function* readOpenAIEventStream(response: Response): AsyncGenerator<string, void, unknown> {
  if (!response.body) throw new Error("Provider returned an empty stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const part = await reader.read();
      buffer += decoder.decode(part.value, { stream: !part.done }).replace(/\r\n/g, "\n");
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        if (raw === "[DONE]") return;
        let event: any;
        try { event = JSON.parse(raw); } catch (_) { continue; }
        if (event?.error) throw new Error("Provider stream returned an error");
        const choice = event?.choices?.[0];
        if (choice?.finish_reason === "length") throw new Error("Provider response was truncated at its output limit");
        const value = choice?.delta?.content;
        const text = typeof value === "string"
          ? value
          : Array.isArray(value) ? value.map((p: any) => p?.text || "").join("") : "";
        if (text) yield text;
      }
      if (part.done) break;
    }
    if (buffer.startsWith("data:")) {
      const raw = buffer.slice(5).trim();
      if (raw && raw !== "[DONE]") {
        try {
          const event = JSON.parse(raw);
          if (event?.error) throw new Error("Provider stream returned an error");
          if (event?.choices?.[0]?.finish_reason === "length") throw new Error("Provider response was truncated at its output limit");
          const value = event?.choices?.[0]?.delta?.content;
          const text = typeof value === "string" ? value : "";
          if (text) yield text;
        } catch (error) {
          if (error instanceof Error && (error.message.includes("truncated") || error.message.includes("stream returned an error"))) throw error;
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch (_) {}
  }
}

async function* readGeminiEventStream(response: Response): AsyncGenerator<string, void, unknown> {
  if (!response.body) throw new Error("Gemini returned an empty stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const part = await reader.read();
      buffer += decoder.decode(part.value, { stream: !part.done }).replace(/\r\n/g, "\n");
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        try {
          const event = JSON.parse(raw);
          const candidate = event?.candidates?.[0];
          if (candidate?.finishReason === "MAX_TOKENS") throw new Error("Gemini response was truncated at its output limit");
          const text = (candidate?.content?.parts || []).map((p: any) => p?.text || "").join("");
          if (text) yield text;
        } catch (error) {
          if (error instanceof Error && error.message.includes("truncated")) throw error;
        }
      }
      if (part.done) break;
    }
  } finally {
    try { reader.releaseLock(); } catch (_) {}
  }
}

async function* readAnthropicEventStream(response: Response): AsyncGenerator<string, void, unknown> {
  if (!response.body) throw new Error("Anthropic returned an empty stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const part = await reader.read();
      buffer += decoder.decode(part.value, { stream: !part.done }).replace(/\r\n/g, "\n");
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const event = JSON.parse(raw);
          if (event?.type === "error") throw new Error("Anthropic stream returned an error");
          if (event?.type === "message_delta" && event?.delta?.stop_reason === "max_tokens") {
            throw new Error("Anthropic response was truncated at its output limit");
          }
          const text = event?.type === "content_block_delta" ? event?.delta?.text : "";
          if (typeof text === "string" && text) yield text;
        } catch (error) {
          if (error instanceof Error && (error.message.includes("truncated") || error.message.includes("stream returned an error"))) throw error;
        }
      }
      if (part.done) break;
    }
  } finally {
    try { reader.releaseLock(); } catch (_) {}
  }
}

async function startProviderStream(name: string, messages: ChatMessage[], task: string, attachments: PreparedAttachment[] = [], timeoutMs = 25000): Promise<ProviderStream> {
  const controller = new AbortController();
  const totalTimer = setTimeout(() => controller.abort(), timeoutMs);
  const cleanup = () => { clearTimeout(totalTimer); controller.abort(); };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let url = "";
  let body: Record<string, unknown> = {};
  let useGemini = false;
  let useAnthropic = false;

  const chatMessages: any[] = [
    { role: "system", content: systemPrompt(task) },
    ...messages
  ];
  if (name === "gemini") {
    const key = envFirst(["GEMINI_API_KEY", "GOOGLE_GEMINI_API_KEY"]);
    if (!key) { cleanup(); throw new Error("Not configured"); }
    const model = envFirst(["GEMINI_MODEL"]) || "gemini-3.5-flash-lite";
    const normalized = messages[0]?.role === "assistant" ? messages.slice(1) : messages;
    url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) +
      ":streamGenerateContent?alt=sse&key=" + encodeURIComponent(key);
    body = {
      systemInstruction: { parts: [{ text: systemPrompt(task) }] },
      contents: normalized.map((m, index) => {
        const parts: Record<string, unknown>[] = [{ text: m.content }];
        if (m.role === "user" && index === normalized.length - 1) {
          for (const attachment of attachments) {
            if (attachment.inline && attachment.base64 && attachment.mimeType) {
              parts.push({ inline_data: { mime_type: attachment.mimeType, data: attachment.base64 } });
            }
          }
        }
        return { role: m.role === "assistant" ? "model" : "user", parts };
      }),
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192 }
    };
    useGemini = true;
  } else if (name === "anthropic") {
    const key = envFirst(["ANTHROPIC_API_KEY"]);
    if (!key) { cleanup(); throw new Error("Not configured"); }
    url = "https://api.anthropic.com/v1/messages";
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
    body = {
      model: envFirst(["ANTHROPIC_MODEL"]) || "claude-sonnet-4-5",
      max_tokens: 8192,
      system: systemPrompt(task),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true
    };
    useAnthropic = true;
  } else {
    let key = "";
    if (name === "groq") { key = envFirst(["GROQ_API_KEY"]); url = "https://api.groq.com/openai/v1/chat/completions"; }
    else if (name === "openrouter") {
      key = envFirst(["OPENROUTER_API_KEY"]);
      url = "https://openrouter.ai/api/v1/chat/completions";
      headers["HTTP-Referer"] = "https://github.com/mahimahfud-ui/Mahi-AI";
      headers["X-Title"] = "Mahi AI";
    } else if (name === "mistral") { key = envFirst(["MISTRAL_API_KEY"]); url = "https://api.mistral.ai/v1/chat/completions"; }
    else if (name === "openai") { key = envFirst(["OPENAI_API_KEY"]); url = "https://api.openai.com/v1/chat/completions"; }
    else if (name === "nvidia") {
      key = envFirst(["NVIDIA_API_KEY"]);
      url = "https://integrate.api.nvidia.com/v1/chat/completions";
    } else if (name === "cloudflare") {
      key = envFirst(["CLOUDFLARE_API_TOKEN"]);
      const accountId = envFirst(["CLOUDFLARE_ACCOUNT_ID"]);
      if (key && accountId) url = "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(accountId) + "/ai/v1/chat/completions";
      else key = "";
    }
    if (!key) { cleanup(); throw new Error("Not configured"); }
    headers.Authorization = "Bearer " + key;
    let model = "";
    if (name === "groq") model = envFirst(["GROQ_MODEL"]) || "openai/gpt-oss-20b";
    else if (name === "openrouter") model = openRouterModel(task);
    else if (name === "mistral") model = envFirst(["MISTRAL_MODEL"]) || "mistral-small-latest";
    else if (name === "openai") model = envFirst(["OPENAI_MODEL"]) || "gpt-4.1-mini";
    else if (name === "nvidia") model = task === "coding"
      ? envFirst(["NVIDIA_CODING_MODEL"]) || "qwen/qwen2.5-coder-32b-instruct"
      : envFirst(["NVIDIA_MODEL"]) || "openai/gpt-oss-20b";
    else if (name === "cloudflare") model = envFirst(["CLOUDFLARE_MODEL"]) || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
    if ((name === "openai" || name === "openrouter") && attachments.some((item) =>
      item.inline && item.base64 && item.mimeType.startsWith("image/"))) {
      const lastUserIndex = chatMessages.map((message: any) => message.role).lastIndexOf("user");
      if (lastUserIndex >= 0) {
        const imageInputs = attachments
          .filter((item) => item.inline && item.base64 && item.mimeType.startsWith("image/"))
          .map((item) => ({
            type: "image_url",
            image_url: { url: "data:" + item.mimeType + ";base64," + item.base64 }
          }));
        chatMessages[lastUserIndex].content = [
          { type: "text", text: String(chatMessages[lastUserIndex].content || "") },
          ...imageInputs
        ];
      }
    }
    body = { model, messages: chatMessages, temperature: 0.3, max_tokens: 8192, stream: true };
  }

  let headerTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const request = fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
    const response = await Promise.race([
      request,
      new Promise<Response>((_, reject) => {
        headerTimer = setTimeout(() => {
          controller.abort();
          reject(new Error("Provider connection timeout"));
        }, Math.min(8000, timeoutMs));
      })
    ]);
    if (headerTimer) clearTimeout(headerTimer);
    if (!response.ok) {
      const reason = await readProviderError(response);
      cleanup();
      throw new Error(reason);
    }
    const iterator = useGemini ? readGeminiEventStream(response)
      : useAnthropic ? readAnthropicEventStream(response)
      : readOpenAIEventStream(response);
    return { provider: name, iterator, cleanup };
  } catch (error) {
    if (headerTimer) clearTimeout(headerTimer);
    cleanup();
    throw error;
  }
}

function sseEvent(controller: ReadableStreamDefaultController<Uint8Array>, encoder: TextEncoder, value: Record<string, unknown>) {
  controller.enqueue(encoder.encode("data: " + JSON.stringify(value) + "\n\n"));
}

function prepareImagePrompt(rawPrompt: string): string {
  let prompt = rawPrompt.trim();
  const banglish = /\b(?:chobi|chhobi|genarate|banao|banaw|banai|baniye|toiri|koro|kore\s+dao|bongobondhu)\b/i.test(prompt);
  prompt = prompt.replace(/\bbongobondhu(?:r|er|ke)?\b/gi, "Bangabandhu Sheikh Mujibur Rahman");
  prompt = prompt.replace(/\bgenarate\b/gi, "generate").replace(/\b(chobi|chhobi)\b/gi, "picture");
  prompt = prompt.replace(/\s+/g, " ").trim();
  const banglishRequest = prompt.match(/^(.+?)\s+(?:image|picture|photo)\s+(?:generate|create|make|draw)\s+(?:koro|kor|kore\s+dao|dao|banao|banaw)$/i);
  if (banglishRequest) prompt = "Create an image of " + banglishRequest[1].trim();
  return banglish
    ? "Interpret this as a Banglish request (Bengali written in Latin letters, possibly with spelling mistakes). Translate the meaning into a clear visual prompt and generate the image directly. Do not answer with code, Python, SVG, or instructions. User's image request: " + prompt
    : "Generate the requested image directly. Do not answer with code or instructions. User's image request: " + prompt;
}

async function generateGeminiImage(rawPrompt: string, attachments: PreparedAttachment[]): Promise<{ text: string; bytes: Uint8Array; mimeType: string }> {
  const prompt = prepareImagePrompt(rawPrompt);
  const key = envFirst(["GEMINI_API_KEY", "GOOGLE_GEMINI_API_KEY"]);
  if (!key) throw new Error("Gemini image generation is not configured.");
  const parts: Record<string, unknown>[] = [{ text: prompt }];
  for (const attachment of attachments) {
    if (attachment.inline && attachment.base64 && attachment.mimeType.startsWith("image/")) {
      parts.push({ inline_data: { mime_type: attachment.mimeType, data: attachment.base64 } });
    }
  }
  // Let Gemini use its native square default unless the prompt clearly asks for a wide or tall image.
  // If the API rejects an explicit aspect-ratio enum, retry without the optional image format settings.
  const aspectRatio = /(?:banner|thumbnail|landscape|wide|16:9)/i.test(prompt) ? "16:9"
    : /(?:phone wallpaper|mobile wallpaper|portrait|9:16|story format)/i.test(prompt) ? "9:16" : "";
  const generationConfig: Record<string, unknown> = {
    responseModalities: ["TEXT", "IMAGE"]
  };
  if (aspectRatio) {
    generationConfig.responseFormat = { image: { aspectRatio, imageSize: "1K" } };
  }
  const url = "https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent";
  const requestBody = {
    contents: [{ role: "user", parts }],
    generationConfig
  };
  let response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(requestBody)
  }, 70000);
  if (!response.ok) {
    const status = response.status;
    const body = await response.text().catch(() => "");
    if (status === 400 && generationConfig.responseFormat &&
        /response_format.*aspect_ratio|aspect_ratio/i.test(body)) {
      console.warn("Gemini rejected the requested image aspect ratio; retrying with its default image format.");
      response = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
        })
      }, 70000);
      if (!response.ok) throw new Error(await readProviderError(response));
    } else {
      throw new Error(status + " " + body.slice(0, 500));
    }
  }
  const data = await response.json();
  let text = "";
  let imageData = "";
  let mimeType = "image/png";
  for (const part of data?.candidates?.[0]?.content?.parts || []) {
    if (typeof part.text === "string") text += part.text;
    const inline = part.inlineData || part.inline_data;
    if (inline?.data) {
      imageData = inline.data;
      mimeType = inline.mimeType || inline.mime_type || mimeType;
    }
  }
  if (!imageData) throw new Error("Gemini did not return an image. Check model access, API quota, and safety feedback.");
  const bytes = Uint8Array.from(atob(imageData), (char) => char.charCodeAt(0));
  return { text: text.trim() || "Here is the image you requested.", bytes, mimeType };
}
async function generateGrokImage(rawPrompt: string, attachments: PreparedAttachment[]): Promise<{ text: string; bytes: Uint8Array; mimeType: string }> {
  const key = envFirst(["XAI_API_KEY", "GROK_API_KEY"]);
  if (!key) throw new Error("Grok image generation is not configured.");
  const prompt = prepareImagePrompt(rawPrompt);
  const imageInput = attachments.find((item) =>
    item.inline && item.base64 && item.mimeType.startsWith("image/") &&
    /^(image\/(png|jpeg|webp))$/i.test(item.mimeType)
  );
  const model = envFirst(["XAI_IMAGE_MODEL"]) || "grok-imagine-image-2.0";
  const endpoint = imageInput ? "https://api.x.ai/v1/images/edits" : "https://api.x.ai/v1/images/generations";
  const body: Record<string, unknown> = { model, prompt: prompt.slice(0, 32000), n: 1 };
  if (imageInput?.base64) {
    body.image = { url: "data:" + imageInput.mimeType + ";base64," + imageInput.base64, type: "image_url" };
  }
  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }, 45000);
  if (!response.ok) throw new Error(await readProviderError(response));
  const result = await response.json();
  const item = result?.data?.[0];
  if (!item) throw new Error("Grok image API returned no image.");
  let bytes: Uint8Array;
  let mimeType = String(item.mime_type || "image/jpeg").split(";")[0].toLowerCase();
  if (typeof item.b64_json === "string" && item.b64_json) {
    bytes = Uint8Array.from(atob(item.b64_json), (char) => char.charCodeAt(0));
  } else if (typeof item.url === "string" && item.url) {
    const imageUrl = new URL(item.url);
    if (imageUrl.protocol !== "https:" || imageUrl.hostname !== "imgen.x.ai" || !imageUrl.pathname.startsWith("/xai-imgen/")) {
      throw new Error("Grok returned an unexpected image URL.");
    }
    const imageResponse = await fetchWithTimeout(imageUrl.toString(), {}, 12000);
    if (!imageResponse.ok) throw new Error("Could not download the image generated by Grok.");
    mimeType = String(imageResponse.headers.get("content-type") || mimeType).split(";")[0].toLowerCase();
    if (!/^image\/(jpeg|png|webp)$/i.test(mimeType)) throw new Error("Grok returned an unsupported image format.");
    bytes = new Uint8Array(await imageResponse.arrayBuffer());
  } else {
    throw new Error("Grok image API returned neither image data nor a download URL.");
  }
  if (!/^image\/(jpeg|png|webp)$/i.test(mimeType)) mimeType = "image/jpeg";
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error("Grok image output is empty or exceeds the storage limit.");
  return {
    text: typeof item.revised_prompt === "string" && item.revised_prompt.trim() ? item.revised_prompt.trim() : "Here is the image you requested.",
    bytes, mimeType
  };
}

async function generateOpenAIImage(rawPrompt: string, attachments: PreparedAttachment[]): Promise<{ text: string; bytes: Uint8Array; mimeType: string }> {
  const prompt = prepareImagePrompt(rawPrompt);
  const key = envFirst(["OPENAI_API_KEY"]);
  if (!key) throw new Error("OpenAI image generation is not configured.");
  const model = envFirst(["OPENAI_IMAGE_MODEL"]) || "gpt-image-2";
  const images = attachments.filter((item) =>
    item.inline && item.bytes && item.mimeType.startsWith("image/") &&
    /^(image\/(png|jpeg|webp))$/i.test(item.mimeType)
  );
  const editing = images.length > 0;
  const url = editing ? "https://api.openai.com/v1/images/edits" : "https://api.openai.com/v1/images/generations";
  let body: BodyInit;
  const headers: Record<string, string> = { "Authorization": "Bearer " + key };
  if (editing) {
    const form = new FormData();
    form.set("model", model);
    form.set("prompt", prompt.slice(0, 32000));
    form.set("size", "1024x1024");
    form.set("quality", "medium");
    form.set("output_format", "png");
    const inputImage = images[0];
    form.append("image", new Blob([inputImage.bytes!.buffer as ArrayBuffer], { type: inputImage.mimeType }), inputImage.name);
    body = form;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({
      model, prompt: prompt.slice(0, 32000), size: "1024x1024",
      quality: "medium", output_format: "png", n: 1
    });
  }
  const response = await fetchWithTimeout(url, { method: "POST", headers, body }, 55000);
  if (!response.ok) throw new Error(await readProviderError(response));
  const result = await response.json();
  const encoded = result?.data?.[0]?.b64_json;
  if (typeof encoded !== "string" || !encoded) throw new Error("OpenAI image API returned no image data");
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  return {
    text: typeof result?.data?.[0]?.revised_prompt === "string" ? result.data[0].revised_prompt : "Here is the image you requested.",
    bytes, mimeType: "image/png"
  };
}

async function generateImageWithFallback(prompt: string, attachments: PreparedAttachment[]): Promise<{ text: string; bytes: Uint8Array; mimeType: string; provider: string }> {
  const failures: string[] = [];
  if (envFirst(["GEMINI_API_KEY", "GOOGLE_GEMINI_API_KEY"])) {
    try {
      return { ...(await generateGeminiImage(prompt, attachments)), provider: "gemini-image" };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push("Gemini: " + reason.slice(0, 160));
      console.warn("Mahi AI Gemini image generation failed; trying Grok:", reason.slice(0, 180));
    }
  }
  if (envFirst(["XAI_API_KEY", "GROK_API_KEY"])) {
    try {
      return { ...(await generateGrokImage(prompt, attachments)), provider: "grok-image" };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push("Grok: " + reason.slice(0, 160));
      console.warn("Mahi AI Grok image generation failed; trying OpenAI fallback:", reason.slice(0, 180));
    }
  }
  if (envFirst(["OPENAI_API_KEY"])) {
    try {
      return { ...(await generateOpenAIImage(prompt, attachments)), provider: "openai-image" };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push("OpenAI: " + reason.slice(0, 160));
      console.warn("Mahi AI OpenAI image generation failed:", reason.slice(0, 180));
    }
  }
  throw new Error("All configured image-generation providers failed: " + (failures.join(" | ") || "no image provider is configured"));
}

async function storeGeneratedImage(userId: string, bytes: Uint8Array, mimeType: string): Promise<string> {
  const ext = mimeType === "image/webp" ? "webp" : mimeType === "image/jpeg" ? "jpg" : "png";
  const path = userId + "/" + crypto.randomUUID() + "." + ext;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(baseUrl + "/storage/v1/object/mahi-ai-generated/" + encodedPath, {
    method: "POST",
    headers: adminHeaders({ "Content-Type": mimeType, "x-upsert": "false" }),
    body: bytes
  });
  if (!response.ok) {
    console.error("Generated image storage failed:", response.status, (await response.text()).slice(0, 300));
    throw new Error("Could not save the generated image.");
  }
  return path;
}

function eventStreamResponse(
  onStart: (controller: ReadableStreamDefaultController<Uint8Array>, encoder: TextEncoder) => void
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { onStart(controller, new TextEncoder()); }
  });
  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no"
    }
  });
}

async function streamImageGenerationResponse(
  userId: string, messages: ChatMessage[], initialConversationId: string, usageId: string | null,
  attachments: PreparedAttachment[], displayUserText: string
): Promise<Response> {
  return eventStreamResponse((controller, encoder) => {
    (async () => {
      let conversationId = initialConversationId;
      try {
        conversationId = await createConversationIfNeeded(
          userId, conversationId, displayUserText || messages[messages.length - 1].content
        );
        sseEvent(controller, encoder, { type: "meta", conversation_id: conversationId });
        sseEvent(controller, encoder, { type: "status", message: "Generating image…" });
        const result = await generateImageWithFallback(messages[messages.length - 1].content, attachments);
        const imagePath = await storeGeneratedImage(userId, result.bytes, result.mimeType);
        const reply = result.text + "\n\n![Generated image](mahi-storage://" + imagePath + ")";
        await saveChatTurn(userId, conversationId, displayUserText, reply);
        await updateUsage(usageId, { success: true, provider: result.provider, task_type: "image_generation", error_code: null });
        sseEvent(controller, encoder, { type: "delta", text: reply });
        sseEvent(controller, encoder, { type: "done", conversation_id: conversationId });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error("Mahi AI image generation failed:", reason.slice(0, 300));
        await updateUsage(usageId, { success: false, provider: "gemini-grok-openai-image", task_type: "image_generation", error_code: "image_generation_failed" });
        const hasGeminiKey = Boolean(envFirst(["GEMINI_API_KEY", "GOOGLE_GEMINI_API_KEY"]));
        const userMessage = hasGeminiKey
          ? "ছবি তৈরি করা যায়নি। Gemini image API request ব্যর্থ হয়েছে। GEMINI_API_KEY আবার যোগ করার দরকার নেই—Gemini image model access/usage limit দেখুন। Backup provider ব্যবহার হলে তার key ও credits আলাদা।"
          : "ছবি তৈরি করা যায়নি। Supabase Edge Function Secrets-এ GEMINI_API_KEY যোগ করুন। Backup image provider optional, তবে সেগুলোর API key ও credits আলাদা।";
        sseEvent(controller, encoder, { type: "error", message: userMessage });
      } finally {
        try { controller.close(); } catch (_) {}
      }
    })();
  });
}

async function streamChatResponse(
  userId: string, messages: ChatMessage[], task: string, initialConversationId: string, usageId: string | null,
  attachments: PreparedAttachment[], displayUserText: string
): Promise<Response> {
  if (task === "image_generation") {
    return streamImageGenerationResponse(userId, messages, initialConversationId, usageId, attachments, displayUserText);
  }
  const hasInlineAttachments = attachments.some((item) => item.inline && item.base64);
  const hasInlineImages = attachments.some((item) => item.inline && item.base64 && item.mimeType.startsWith("image/"));
  const available = providerOrder(task, hasInlineAttachments, hasInlineImages);
  return eventStreamResponse((controller, encoder) => {
    (async () => {
      let conversationId = initialConversationId;
      const failures: string[] = [];
      let chosen: { provider: string; text: string } | null = null;
      const startedAt = Date.now();
      const totalProviderBudgetMs = 115000;
      try {
        for (let index = 0; index < available.length; index++) {
          const remaining = totalProviderBudgetMs - (Date.now() - startedAt);
          if (remaining < 7000) {
            failures.push("remaining_provider_budget_exhausted");
            break;
          }
          const providersLeft = available.length - index;
          const providerBudget = Math.max(7000, Math.min(30000, Math.floor(remaining / providersLeft)));
          const provider = available[index];
          sseEvent(controller, encoder, {
            type: "status",
            message: index === 0
              ? "Finding a model that can complete your request…"
              : "The previous attempt did not finish. Trying the next available model…"
          });
          let candidate: ProviderStream | null = null;
          try {
            candidate = await startProviderStream(provider, messages, task, attachments, providerBudget);
            let completeText = "";
            while (true) {
              const next = await candidate.iterator.next();
              if (next.done) break;
              if (next.value) completeText += next.value;
              if (completeText.length > 180000) throw new Error("Provider response exceeded the supported response size");
            }
            candidate.cleanup();
            if (!completeText.trim()) throw new Error("Provider returned an empty response");
            chosen = { provider, text: completeText.trim() };
            break;
          } catch (error) {
            if (candidate) candidate.cleanup();
            const reason = error instanceof Error ? error.message : String(error);
            failures.push(provider + ":" + reason.slice(0, 100));
            if (reason !== "Not configured") console.warn("Mahi AI full-response provider attempt failed:", provider, reason.slice(0, 180));
          }
        }
        if (!chosen) {
          await updateUsage(usageId, { success: false, error_code: "all_providers_failed" });
          console.error("All Mahi AI providers failed:", failures.join(" | ").slice(0, 1400));
          sseEvent(controller, encoder, {
            type: "error",
            message: "Mahi AI could not complete this request because the available models failed. Please try again."
          });
          return;
        }
        conversationId = await createConversationIfNeeded(
          userId, conversationId, displayUserText || messages.find((m) => m.role === "user")?.content || "New chat"
        );
        await saveChatTurn(userId, conversationId, displayUserText, chosen.text);
        await updateUsage(usageId, { success: true, provider: chosen.provider, task_type: task, error_code: null });
        sseEvent(controller, encoder, { type: "meta", conversation_id: conversationId });
        for (let offset = 0; offset < chosen.text.length; offset += 700) {
          sseEvent(controller, encoder, { type: "delta", text: chosen.text.slice(offset, offset + 700) });
        }
        sseEvent(controller, encoder, { type: "done", conversation_id: conversationId });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error("Mahi AI response handling failed:", reason.slice(0, 200));
        await updateUsage(usageId, { success: false, error_code: "response_save_failed" });
        sseEvent(controller, encoder, {
          type: "error",
          message: "Mahi AI could not finish or save the response. Please try again."
        });
      } finally {
        try { controller.close(); } catch (_) {}
      }
    })();
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!baseUrl || !anonKey || !serviceKey) return json(503, { error: "Service is not configured yet." });

  const user = await verifyUser(req);
  if (!user) return json(401, { error: "Please reload the app to renew your guest session." });

  let input: any;
  try {
    const length = Number(req.headers.get("content-length") || "0");
    if (length > 1500000) return json(413, { error: "That message is too large for a single request." });
    input = await req.json();
  } catch (_) {
    return json(400, { error: "Invalid request." });
  }
  const incoming = Array.isArray(input?.messages) ? input.messages : [];
  const messages: ChatMessage[] = incoming
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-36)
    .map((m: any) => ({ role: m.role, content: m.content.trim().slice(0, 30000) }))
    .filter((m: ChatMessage) => m.content.length > 0);
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
  if (lastUserIndex < 0 || lastUserIndex !== messages.length - 1) return json(400, { error: "Send a message to begin." });
  if (messages.reduce((sum, m) => sum + m.content.length, 0) > 120000) return json(413, { error: "Trim your message history and try again." });

  const displayPrompt = messages[messages.length - 1].content;
  let attachments: PreparedAttachment[] = [];
  try {
    attachments = await prepareAttachments(user.id, input?.attachments);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "The attachment could not be processed.";
    const status = /15 MB|20 MB|12 MB|no more than 5/i.test(reason) ? 413 : 400;
    return json(status, { error: reason });
  }
  const attachmentLabels = attachments.length
    ? "\n\nAttached files: " + attachments.map((item) => item.name + " (" + item.mimeType + ")").join(", ")
    : "";
  const displayUserText = (displayPrompt + attachmentLabels).slice(0, 40000);
  const contextualMessages = applyAttachmentContext(messages, attachments);
  const hasCodeAttachment = attachments.some((item) => isCodeAttachment(item.name));
  const task = isImageGenerationTask(displayPrompt) ? "image_generation"
    : hasCodeAttachment ? "coding" : classifyTask(displayPrompt);
  let conversationId = typeof input?.conversation_id === "string" ? input.conversation_id : "";
  if (conversationId) {
    try {
      const ok = await getConversation(user.id, conversationId);
      if (!ok) {
        return json(404, { error: "Conversation not found." });
      }
    } catch (_) {
      return json(503, { error: "Mahi AI is temporarily unavailable." });
    }
  }

  const usageId = await logUsage(user.id, { task_type: task, success: false });
  return await streamChatResponse(user.id, contextualMessages, task, conversationId, usageId, attachments, displayUserText);
});