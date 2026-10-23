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
  return /(?:generate|create|draw|make|design|illustrate|render|produce)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|illustration|poster|logo|wallpaper|thumbnail|artwork|visual|graphic|icon|banner)/i.test(text) ||
    /(?:image|picture|photo|illustration|poster|logo|wallpaper|thumbnail|artwork)\s+(?:generation|generator|please|of\b)/i.test(text) ||
    /(?:ছবি|ইমেজ|লোগো|পোস্টার|ওয়ালপেপার|ওয়ালপেপার|থাম্বনেইল).{0,40}(?:তৈরি|বানাও|আঁক|জেনারেট|generate|করো|দাও)/i.test(text) ||
    /(?:তৈরি|বানাও|আঁক|জেনারেট).{0,35}(?:ছবি|ইমেজ|লোগো|পোস্টার|ওয়ালপেপার|ওয়ালপেপার)/i.test(text) ||
    /(?:remove|replace|change|edit)\s+(?:the\s+)?(?:background|style|objects?)\b/i.test(text) &&
      /(?:image|photo|picture|attached|uploaded|ছবি|ইমেজ)/i.test(text);
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
      details.push("[Attached media available to the Gemini multimodal model: " + item.name + " | " + item.mimeType + "]");
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
  if (/(debug|stack trace|typescript|javascript|python|html|css|react|sql|api|function|compiler|program|code|bug|কোড|প্রোগ্রামিং|বাগ|এরর|ত্রুটি)/i.test(s)) return "coding";
  if (/(prove|proof|derive|equation|calculate|math|logic|reason|compare|evaluate|analy[sz]e|step by step|সমাধান|গণিত|যুক্তি|বিশ্লেষণ|হিসাব)/i.test(s)) return "reasoning";
  if (/(story|poem|creative|rewrite|write a|blog|script|caption|lyrics|গল্প|কবিতা|লিখে দাও|রচনা|ক্যাপশন)/i.test(s)) return "creative";
  return "general";
}
function providerOrder(task: string, hasInlineAttachments = false) {
  if (hasInlineAttachments) return ["gemini"];
  const base = task === "coding"
    ? ["openrouter", "groq", "gemini", "mistral", "nvidia", "cloudflare"]
    : task === "reasoning"
    ? ["gemini", "openrouter", "groq", "mistral", "nvidia", "cloudflare"]
    : task === "creative"
    ? ["gemini", "groq", "openrouter", "mistral", "nvidia", "cloudflare"]
    : ["groq", "gemini", "openrouter", "mistral", "nvidia", "cloudflare"];
  const enabled = base.filter((name) => {
    if (name === "nvidia") return Deno.env.get("ENABLE_NVIDIA_FALLBACK") === "true";
    if (name === "cloudflare") return Deno.env.get("ENABLE_CLOUDFLARE_FALLBACK") === "true";
    return true;
  });
  if (Deno.env.get("ENABLE_PAID_FALLBACK") === "true") {
    return task === "coding"
      ? ["openrouter", "openai", ...enabled.filter((x) => x !== "openrouter"), "anthropic"]
      : [...enabled, "openai", "anthropic"];
  }
  return enabled;
}
function openRouterModel(task: string): string {
  if (task === "coding") return envFirst(["OPENROUTER_CODING_MODEL"]) || "cohere/north-mini-code:free";
  if (task === "reasoning") return envFirst(["OPENROUTER_REASONING_MODEL"]) || "nvidia/nemotron-3.5-lightning:free";
  return envFirst(["OPENROUTER_MODEL"]) || "nvidia/nemotron-3.5-lightning:free";
}
function systemPrompt(task: string): string {
  return "You are Mahi AI, a helpful and accurate general assistant. Reply in the language used by the user. Use clear Markdown. Be concise unless the user asks for detail. For code, provide working solutions and explain important assumptions. For uncertain claims, state uncertainty and do not invent facts. The task routing category is " + task + ". Do not mention internal providers, routing, or API infrastructure.";
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
      max_tokens: 3000,
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
        generationConfig: { temperature: 0.4, maxOutputTokens: 3000 }
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
        max_tokens: 3000,
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
        const value = event?.choices?.[0]?.delta?.content;
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
          const value = event?.choices?.[0]?.delta?.content;
          const text = typeof value === "string" ? value : "";
          if (text) yield text;
        } catch (_) {}
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
          const text = (event?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || "").join("");
          if (text) yield text;
        } catch (_) {}
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
          const text = event?.type === "content_block_delta" ? event?.delta?.text : "";
          if (typeof text === "string" && text) yield text;
        } catch (_) {}
      }
      if (part.done) break;
    }
  } finally {
    try { reader.releaseLock(); } catch (_) {}
  }
}

async function startProviderStream(name: string, messages: ChatMessage[], task: string, attachments: PreparedAttachment[] = []): Promise<ProviderStream> {
  const controller = new AbortController();
  const totalTimer = setTimeout(() => controller.abort(), 40000);
  const cleanup = () => { clearTimeout(totalTimer); controller.abort(); };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let url = "";
  let body: Record<string, unknown> = {};
  let useGemini = false;
  let useAnthropic = false;

  const chatMessages = [
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
      generationConfig: { temperature: 0.3, maxOutputTokens: 1800 }
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
      max_tokens: 1800,
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
    body = { model, messages: chatMessages, temperature: 0.3, max_tokens: 1800, stream: true };
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
        }, 5000);
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

async function generateGeminiImage(prompt: string, attachments: PreparedAttachment[]): Promise<{ text: string; bytes: Uint8Array; mimeType: string }> {
  const key = envFirst(["GEMINI_API_KEY", "GOOGLE_GEMINI_API_KEY"]);
  if (!key) throw new Error("Gemini image generation is not configured.");
  const parts: Record<string, unknown>[] = [{ text: prompt }];
  for (const attachment of attachments) {
    if (attachment.inline && attachment.base64 && attachment.mimeType.startsWith("image/")) {
      parts.push({ inline_data: { mime_type: attachment.mimeType, data: attachment.base64 } });
    }
  }
  const aspectRatio = /(?:banner|thumbnail|landscape|wide|16:9)/i.test(prompt) ? "16:9"
    : /(?:phone wallpaper|mobile wallpaper|portrait|9:16|story format)/i.test(prompt) ? "9:16" : "1:1";
  const response = await fetchWithTimeout(
    "https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          responseFormat: { image: { aspectRatio, imageSize: "1K" } }
        }
      })
    },
    90000
  );
  if (!response.ok) throw new Error(await readProviderError(response));
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
  if (!imageData) throw new Error("Gemini did not return an image. Check the API key, quota, and image model availability.");
  const bytes = Uint8Array.from(atob(imageData), (char) => char.charCodeAt(0));
  return { text: text.trim() || "Here is the image you requested.", bytes, mimeType };
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
        sseEvent(controller, encoder, { type: "status", message: "Gemini is creating your image…" });
        const result = await generateGeminiImage(messages[messages.length - 1].content, attachments);
        const imagePath = await storeGeneratedImage(userId, result.bytes, result.mimeType);
        const reply = result.text + "\n\n![Generated image](mahi-storage://" + imagePath + ")";
        await saveChatTurn(userId, conversationId, displayUserText, reply);
        await updateUsage(usageId, { success: true, provider: "gemini-image", task_type: "image_generation", error_code: null });
        sseEvent(controller, encoder, { type: "delta", text: reply });
        sseEvent(controller, encoder, { type: "done", conversation_id: conversationId });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error("Mahi AI image generation failed:", reason.slice(0, 300));
        await updateUsage(usageId, { success: false, provider: "gemini-image", task_type: "image_generation", error_code: "image_generation_failed" });
        sseEvent(controller, encoder, {
          type: "error",
          message: "I couldn't generate the image. Check that your Gemini API key has image-generation access and available quota, then try again."
        });
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
  const available = providerOrder(task, hasInlineAttachments);
  const failures: string[] = [];
  let chosen: ProviderStream | null = null;
  let firstText = "";
  for (const provider of available) {
    let candidate: ProviderStream | null = null;
    try {
      candidate = await startProviderStream(provider, messages, task, attachments);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const first = await Promise.race([
        candidate.iterator.next(),
        new Promise<IteratorResult<string>>((_, reject) => {
          timer = setTimeout(() => reject(new Error("First token timeout")), 4500);
        })
      ]);
      if (timer) clearTimeout(timer);
      if (!first.done && first.value) {
        chosen = candidate;
        firstText = first.value;
        break;
      }
      candidate.cleanup();
      failures.push(provider + ":empty stream");
    } catch (error) {
      if (candidate) candidate.cleanup();
      const reason = error instanceof Error ? error.message : String(error);
      if (reason !== "Not configured") console.warn("Mahi AI provider attempt failed:", provider, reason.slice(0, 140));
      failures.push(provider + ":" + reason.slice(0, 90));
    }
  }
  if (!chosen) {
    await updateUsage(usageId, { success: false, error_code: "free_providers_unavailable" });
    const configured = ["GEMINI_API_KEY", "GOOGLE_GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "MISTRAL_API_KEY"].some((key) => !!envFirst([key])) ||
      (!!envFirst(["CLOUDFLARE_API_TOKEN"]) && !!envFirst(["CLOUDFLARE_ACCOUNT_ID"])) ||
      Deno.env.get("ENABLE_NVIDIA_FALLBACK") === "true" && !!envFirst(["NVIDIA_API_KEY"]) ||
      Deno.env.get("ENABLE_PAID_FALLBACK") === "true" && ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"].some((key) => !!envFirst([key]));
    if (!configured) return json(503, { error: "Mahi AI is being set up. Please try again later." });
    console.error("All stream providers failed:", failures.join(" | ").slice(0, 1000));
    return json(502, { error: "Mahi AI could not complete that request. Please try again." });
  }

  let conversationId = initialConversationId;
  try {
    conversationId = await createConversationIfNeeded(
      userId, conversationId, displayUserText || messages.find((m) => m.role === "user")?.content || "New chat"
    );
  } catch (_) {
    chosen.cleanup();
    await updateUsage(usageId, { success: false, provider: chosen.provider, error_code: "database_unavailable" });
    return json(503, { error: "Mahi AI could not save this conversation. Please try again." });
  }

  const encoder = new TextEncoder();
  const selected = chosen;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      sseEvent(controller, encoder, { type: "meta", conversation_id: conversationId });
      (async () => {
        let completeText = firstText;
        try {
          sseEvent(controller, encoder, { type: "delta", text: firstText });
          while (true) {
            const next = await selected.iterator.next();
            if (next.done) break;
            if (!next.value) continue;
            completeText += next.value;
            sseEvent(controller, encoder, { type: "delta", text: next.value });
          }
          if (!completeText.trim()) throw new Error("Empty provider response");
          await saveChatTurn(userId, conversationId, displayUserText, completeText);
          await updateUsage(usageId, { success: true, provider: selected.provider, task_type: task, error_code: null });
          sseEvent(controller, encoder, { type: "done", conversation_id: conversationId });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          console.error("Mahi AI streaming completion failed:", selected.provider, reason.slice(0, 180));
          await updateUsage(usageId, { success: false, provider: selected.provider, error_code: "stream_or_save_failed" });
          sseEvent(controller, encoder, { type: "error", message: "The response was interrupted. Please try again." });
        } finally {
          selected.cleanup();
          try { controller.close(); } catch (_) {}
        }
      })();
    },
    cancel() { selected.cleanup(); }
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!baseUrl || !anonKey || !serviceKey) return json(503, { error: "Service is not configured yet." });

  const user = await verifyUser(req);
  if (!user) return json(401, { error: "Please reload the app to renew your guest session." });

  let input: any;
  try {
    const length = Number(req.headers.get("content-length") || "0");
    if (length > 200000) return json(413, { error: "That message is too large." });
    input = await req.json();
  } catch (_) {
    return json(400, { error: "Invalid request." });
  }
  const incoming = Array.isArray(input?.messages) ? input.messages : [];
  const messages: ChatMessage[] = incoming
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-18)
    .map((m: any) => ({ role: m.role, content: m.content.trim().slice(0, 12000) }))
    .filter((m: ChatMessage) => m.content.length > 0);
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
  if (lastUserIndex < 0 || lastUserIndex !== messages.length - 1) return json(400, { error: "Send a message to begin." });
  if (messages.reduce((sum, m) => sum + m.content.length, 0) > 50000) return json(413, { error: "Trim your message history and try again." });

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
  const displayUserText = (displayPrompt + attachmentLabels).slice(0, 12000);
  const contextualMessages = applyAttachmentContext(messages, attachments);
  const hasCodeAttachment = attachments.some((item) => isCodeAttachment(item.name));
  const task = isImageGenerationTask(displayPrompt) ? "image_generation"
    : hasCodeAttachment ? "coding" : classifyTask(displayPrompt);
  const now = new Date();
  const minuteAgo = new Date(now.getTime() - 60 * 1000).toISOString();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const [recentResponse, dailyResponse] = await Promise.all([
    rest("mahi_ai_usage_events?select=id&user_id=eq." + encodeURIComponent(user.id) + "&created_at=gte." + encodeURIComponent(minuteAgo) + "&limit=6"),
    rest("mahi_ai_usage_events?select=id&user_id=eq." + encodeURIComponent(user.id) + "&created_at=gte." + encodeURIComponent(dayAgo) + "&limit=81")
  ]);
  if (!recentResponse.ok || !dailyResponse.ok) return json(503, { error: "Mahi AI is temporarily unavailable." });
  const [recent, daily] = await Promise.all([recentResponse.json(), dailyResponse.json()]);
  if (recent.length >= 5 || daily.length >= 80) return json(429, { error: "You have reached the current usage limit. Please try again later." });

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