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
    ? ["openrouter", "groq", "gemini", "mistral", "nvidia", "cloudflare"]
    : task === "reasoning"
    ? ["gemini", "openrouter", "groq", "mistral", "nvidia", "cloudflare"]
    : task === "creative"
    ? ["gemini", "groq", "openrouter", "mistral", "nvidia", "cloudflare"]
    : ["groq", "gemini", "openrouter", "mistral", "nvidia", "cloudflare"];
  return base.filter((name) => {
    if (name === "nvidia") return Deno.env.get("ENABLE_NVIDIA_FALLBACK") === "true";
    if (name === "cloudflare") return Deno.env.get("ENABLE_CLOUDFLARE_FALLBACK") === "true";
    return true;
  }).concat(Deno.env.get("ENABLE_PAID_FALLBACK") === "true" ? ["openai", "anthropic"] : []);
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

async function startProviderStream(name: string, messages: ChatMessage[], task: string): Promise<ProviderStream> {
  const controller = new AbortController();
  const totalTimer = setTimeout(() => controller.abort(), 45000);
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
      contents: normalized.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
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
        }, 9000);
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

async function streamChatResponse(
  userId: string, messages: ChatMessage[], task: string, initialConversationId: string, usageId: string | null
): Promise<Response> {
  const available = providerOrder(task);
  const failures: string[] = [];
  let chosen: ProviderStream | null = null;
  let firstText = "";
  for (const provider of available) {
    let candidate: ProviderStream | null = null;
    try {
      candidate = await startProviderStream(provider, messages, task);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const first = await Promise.race([
        candidate.iterator.next(),
        new Promise<IteratorResult<string>>((_, reject) => {
          timer = setTimeout(() => reject(new Error("First token timeout")), 8000);
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
  if (!conversationId) {
    const firstPrompt = messages.find((m) => m.role === "user")?.content || "New chat";
    const title = firstPrompt.replace(/\s+/g, " ").trim().slice(0, 56) || "New chat";
    try {
      const created = await rest("mahi_ai_conversations", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ user_id: userId, title })
      });
      if (!created.ok) throw new Error("Could not create conversation");
      const rows = await created.json();
      conversationId = rows?.[0]?.id || "";
      if (!conversationId) throw new Error("No conversation id");
    } catch (_) {
      chosen.cleanup();
      await updateUsage(usageId, { success: false, provider: chosen.provider, error_code: "database_unavailable" });
      return json(503, { error: "Mahi AI could not save this conversation. Please try again." });
    }
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
          const lastUser = messages[messages.length - 1].content;
          const saved = await rest("mahi_ai_messages", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify([
              { conversation_id: conversationId, user_id: userId, role: "user", content: lastUser },
              { conversation_id: conversationId, user_id: userId, role: "assistant", content: completeText }
            ])
          });
          if (!saved.ok) throw new Error("Mahi AI could not save the response");
          await Promise.all([
            rest("mahi_ai_conversations?id=eq." + encodeURIComponent(conversationId) + "&user_id=eq." + encodeURIComponent(userId), {
              method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ updated_at: new Date().toISOString() })
            }),
            updateUsage(usageId, { success: true, provider: selected.provider, task_type: task, error_code: null })
          ]);
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
  return await streamChatResponse(user.id, messages, task, conversationId, usageId);
});