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

function classifyTask(prompt: string): string {
  const s = prompt.toLowerCase();
  if (/(debug|stack trace|typescript|javascript|python|html|css|react|sql|api|function|compiler|program|code|bug|কোড|প্রোগ্রামিং|বাগ|এরর|ত্রুটি)/i.test(s)) return "coding";
  if (/(prove|proof|derive|equation|calculate|math|logic|reason|compare|evaluate|analy[sz]e|step by step|সমাধান|গণিত|যুক্তি|বিশ্লেষণ|হিসাব)/i.test(s)) return "reasoning";
  if (/(story|poem|creative|rewrite|write a|blog|script|caption|lyrics|গল্প|কবিতা|লিখে দাও|রচনা|ক্যাপশন)/i.test(s)) return "creative";
  return "general";
}
function providerOrder(task: string) {
  const base = task === "coding"
    ? ["openrouter", "nvidia", "groq", "cloudflare", "gemini", "mistral"]
    : task === "reasoning"
    ? ["gemini", "openrouter", "nvidia", "groq", "cloudflare", "mistral"]
    : task === "creative"
    ? ["gemini", "mistral", "openrouter", "cloudflare", "groq", "nvidia"]
    : ["gemini", "openrouter", "groq", "cloudflare", "nvidia", "mistral"];
  return base.filter((name) => {
    if (name === "nvidia") return Deno.env.get("ENABLE_NVIDIA_FALLBACK") === "true";
    if (name === "cloudflare") return Deno.env.get("ENABLE_CLOUDFLARE_FALLBACK") === "true";
    return true;
  }).concat(Deno.env.get("ENABLE_PAID_FALLBACK") === "true" ? ["openai", "anthropic"] : []);
}
function openRouterModel(task: string): string {
  if (task === "coding") return envFirst(["OPENROUTER_CODING_MODEL"]) || "cohere/north-mini-code:free";
  if (task === "reasoning") return envFirst(["OPENROUTER_REASONING_MODEL"]) || "nvidia/nemotron-3-ultra-550b-a55b:free";
  return envFirst(["OPENROUTER_MODEL"]) || "openrouter/free";
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
  const model = envFirst(["GEMINI_MODEL"]) || "gemini-3.8-flash";
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!baseUrl || !anonKey || !serviceKey) return json(503, { error: "Service is not configured yet." });

  const user = await verifyUser(req);
  if (!user) return json(401, { error: "Please reload the app to renew your guest session." });

  let input: any;
  try {
    const length = Number(req.headers.get("content-length") || "0");
    if (length > 100000) return json(413, { error: "That message is too large." });
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

  const task = classifyTask(messages[messages.length - 1].content);
  const now = new Date();
  const minuteAgo = new Date(now.getTime() - 60 * 1000).toISOString();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const recentResponse = await rest("mahi_ai_usage_events?select=id&user_id=eq." + encodeURIComponent(user.id) + "&created_at=gte." + encodeURIComponent(minuteAgo) + "&limit=6");
  const dailyResponse = await rest("mahi_ai_usage_events?select=id&user_id=eq." + encodeURIComponent(user.id) + "&created_at=gte." + encodeURIComponent(dayAgo) + "&limit=81");
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
  const available = providerOrder(task);
  let output: { text: string; provider: string } | null = null;
  const failures: string[] = [];
  for (const provider of available) {
    try {
      output = await callProvider(provider, messages, task);
      if (output.text.trim()) break;
      output = null;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason !== "Not configured") console.warn("Mahi AI provider attempt failed:", provider, reason.slice(0, 180));
      failures.push(provider + ":" + reason.slice(0, 100));
    }
  }
  if (!output) {
    await updateUsage(usageId, { success: false, error_code: available.some((name) => name === "openai" || name === "anthropic") ? "providers_unavailable" : "free_providers_unavailable" });
    const anyConfigured = ["GEMINI_API_KEY", "GOOGLE_GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "MISTRAL_API_KEY", "NVIDIA_API_KEY"].some((key) => !!envFirst([key])) ||
      (!!envFirst(["CLOUDFLARE_API_TOKEN"]) && !!envFirst(["CLOUDFLARE_ACCOUNT_ID"])) ||
      (Deno.env.get("ENABLE_PAID_FALLBACK") === "true" && ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"].some((key) => !!envFirst([key])));
    if (!anyConfigured) return json(503, { error: "Mahi AI is being set up. Please try again later." });
    console.error("All available provider attempts failed:", failures.join(" | ").slice(0, 1200));
    return json(502, { error: "Mahi AI could not complete that request. Please try again." });
  }

  if (!conversationId) {
    const firstPrompt = messages.find((m) => m.role === "user")?.content || "New chat";
    const title = firstPrompt.replace(/\s+/g, " ").trim().slice(0, 56) || "New chat";
    const created = await rest("mahi_ai_conversations", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ user_id: user.id, title })
    });
    if (!created.ok) {
      await updateUsage(usageId, { success: false, provider: output.provider, error_code: "database_unavailable" });
      return json(503, { error: "Mahi AI could not save this conversation. Please try again." });
    }
    const rows = await created.json();
    conversationId = rows?.[0]?.id || "";
    if (!conversationId) return json(503, { error: "Mahi AI could not save this conversation. Please try again." });
  }

  const lastUser = messages[messages.length - 1].content;
  const saved = await rest("mahi_ai_messages", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([
      { conversation_id: conversationId, user_id: user.id, role: "user", content: lastUser },
      { conversation_id: conversationId, user_id: user.id, role: "assistant", content: output.text }
    ])
  });
  if (!saved.ok) {
    console.error("Mahi AI message save failed", saved.status, (await saved.text()).slice(0, 300));
    await updateUsage(usageId, { success: false, provider: output.provider, error_code: "message_save_failed" });
    return json(503, { error: "Mahi AI could not save this response. Please try again." });
  }
  await rest("mahi_ai_conversations?id=eq." + encodeURIComponent(conversationId) + "&user_id=eq." + encodeURIComponent(user.id), {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ updated_at: new Date().toISOString() })
  });
  await updateUsage(usageId, { success: true, provider: output.provider, task_type: task, error_code: null });
  return json(200, { conversation_id: conversationId, reply: output.text });
});