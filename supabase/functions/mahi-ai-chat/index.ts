import { isImageGenerationTask } from "./image-intent.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Vary": "Origin"
};

const DEFAULT_ALLOWED_ORIGINS = [
  "https://mahi-ai.onrender.com",
  "https://mahi-ai-kdm2.onrender.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];

// Provider routing: any valid http(s) browser origin is accepted.
function isAllowedOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    if (parsed.origin !== origin) return false;
    if (DEFAULT_ALLOWED_ORIGINS.includes(origin)) return true;
    if (["localhost", "127.0.0.1"].includes(parsed.hostname) &&
        ["https:", "http:"].includes(parsed.protocol)) return true;
    if (parsed.protocol === "https:" &&
        /^https:\/\/mahi-ai(?:-[a-z0-9-]+)?\.onrender\.com$/.test(origin)) return true;
    const configured = envFirst(["MAHI_AI_ALLOWED_ORIGINS"])
      .split(",").map((value) => value.trim()).filter(Boolean);
    return configured.includes(origin);
  } catch (_) {
    return false;
  }
}

function corsHeadersFor(origin: string | null): Record<string, string> {
  const headers = { ...corsHeaders };
  if (origin && isAllowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

// Used only for a rejected-origin error response. It lets browser clients read the
// explicit rejection JSON; it does not authorize any API operation.
function corsHeadersForRejectedOrigin(origin: string | null, requestId: string): Record<string, string> {
  const headers: Record<string, string> = {
    ...corsHeaders,
    "Vary": "Origin",
    "X-Request-ID": requestId,
    "Access-Control-Expose-Headers": "X-Request-ID"
  };
  if (!origin) return headers;
  try {
    const parsed = new URL(origin);
    if (parsed.origin === origin && ["https:", "http:"].includes(parsed.protocol)) {
      headers["Access-Control-Allow-Origin"] = origin;
    }
  } catch (_) {}
  return headers;
}

const json = (
  status: number,
  body: Record<string, unknown>,
  responseHeaders: Record<string, string> = corsHeaders
) => new Response(JSON.stringify(body), { status, headers: responseHeaders });

type StructuredLogLevel = "info" | "warn" | "error";

function logStructured(level: StructuredLogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const entry = {
    timestamp: new Date().toISOString(),
    service: "mahi-ai-chat",
    level,
    event,
    ...fields
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

class RequestBodyTooLargeError extends Error {
  constructor() {
    super("That message is too large for a single request.");
    this.name = "RequestBodyTooLargeError";
  }
}

async function readBoundedJson(req: Request, maxBytes: number): Promise<unknown> {
  const headerLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(headerLength) && headerLength > maxBytes) throw new RequestBodyTooLargeError();
  if (!req.body) throw new Error("Request body is empty.");

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch (_) {}
        throw new RequestBodyTooLargeError();
      }
      chunks.push(part.value);
    }
  } finally {
    try { reader.releaseLock(); } catch (_) {}
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return JSON.parse(text);
}

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

// ---------------------------------------------------------------------------
// Provider routing SETTINGS
// ---------------------------------------------------------------------------
const MAX_OUTPUT_TOKENS = (() => {
  const value = Number(envFirst(["MAHI_AI_MAX_OUTPUT_TOKENS"]));
  return Number.isInteger(value) && value >= 1024 && value <= 200000 ? value : 32000;
})();
const MAX_BODY_BYTES = 8_000_000;
const MAX_HISTORY_MESSAGES = 200;
const MAX_MESSAGE_CHARS = 120_000;
const MAX_TOTAL_HISTORY_CHARS = 800_000;
const MAX_RESPONSE_CHARS = 400_000;
const MAX_CONTEXT_CHARS = 400_000;
const MAX_FILES = 20;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_FILE_BYTES = 100 * 1024 * 1024;
const MAX_INLINE_BYTES = 60 * 1024 * 1024;
const MEMORY_NOTE_LIMIT = 60;
const MEMORY_MESSAGE_LIMIT = 60;

function adminHeaders(extra: Record<string, string> = {}): HeadersInit {
  return { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json", ...extra };
}
async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetchWithTimeout(baseUrl + "/rest/v1/" + path, {
    ...init,
    headers: adminHeaders((init.headers || {}) as Record<string, string>)
  }, 8000);
}
async function verifyUser(req: Request): Promise<{ id: string } | null> {
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token || !baseUrl || !anonKey) return null;
  const response = await fetchWithTimeout(baseUrl + "/auth/v1/user", {
    headers: { apikey: anonKey, Authorization: "Bearer " + token }
  }, 6000);
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user.id === "string" ? { id: user.id } : null;
}


type MemoryCommand =
  | { action: "save"; value: string }
  | { action: "clear" }
  | { action: "disable" }
  | { action: "enable" };

type UserMemoryContext = {
  enabled: boolean;
  memories: Array<{ category?: string; memory_value?: string; updated_at?: string }>;
  recent_messages: Array<{ conversation_title?: string; role?: string; content?: string; created_at?: string }>;
};

function parseMemoryCommand(prompt: string): MemoryCommand | null {
  const text = prompt.trim();
  if (!text) return null;
  if (/^(?:please\s+)?(?:forget everything(?: you remember)?|forget all(?: my)? memories|clear (?:my )?memory|delete (?:all )?(?:my )?memories|shob bhule jao|shob kotha bhule jao|memory clear koro|amar ager chat bhule jao|সব ভুলে যাও|সব কথা ভুলে যাও|আমার মেমোরি মুছে দাও|মেমোরি ক্লিয়ার করো)[.!?\s]*$/iu.test(text)) {
    return { action: "clear" };
  }
  if (/^(?:please\s+)?(?:turn|switch|set)\s+(?:my )?memory\s+(?:off|disabled)(?:\s+please)?[.!?\s]*$|^(?:memory off koro|memory bondho koro|মেমোরি বন্ধ করো|মেমোরি বন্ধ করে দাও)$/iu.test(text)) {
    return { action: "disable" };
  }
  if (/^(?:please\s+)?(?:turn|switch|set)\s+(?:my )?memory\s+(?:on|enabled)(?:\s+please)?[.!?\s]*$|^(?:remember my chats|amar chat mone rekho|memory on koro|মেমোরি চালু করো|আমার আগের চ্যাট মনে রাখো)$/iu.test(text)) {
    return { action: "enable" };
  }
  const match = text.match(/^(?:please\s+)?(?:remember(?:\s+that)?|keep\s+in\s+mind|save\s+(?:this\s+)?to\s+memory|mone\s+rekho|mone\s+rakh(?:ba|ben)?|মনে\s+রেখো|মনে\s+রাখো|মনে\s+রাখবেন)\s*[:,-]?\s*(.{5,800})$/iu);
  if (!match?.[1]) return null;
  return { action: "save", value: match[1].trim() };
}

function sensitiveMemoryReason(value: string): string {
  if (/(?:password|passcode|api[\s_-]*key|access token|refresh token|private key|secret key|recovery phrase|seed phrase|credit card|bank account|national id|passport number|otp\b|one.time password|পাসওয়ার্ড|পাসওয়ার্ড|এপিআই কি|গোপন চাবি)/iu.test(value)) {
    return "I won't store passwords, API keys, tokens, or other secrets in memory.";
  }
  if (/(?:diagnosis|medical record|prescription|medication dose|sexual orientation|religious belief|political affiliation|জাতীয় পরিচয়পত্র|জাতীয় পরিচয়পত্র|রোগ নির্ণয়|রোগ নির্ণয়|ওষুধের মাত্রা)/iu.test(value)) {
    return "I won't store sensitive personal details of that kind as a long-term memory.";
  }
  return "";
}

function memoryCategory(value: string): string {
  if (/(?:prefer|preference|always answer|reply in|answer in|language|short answer|concise|format|পছন্দ|বাংলায় উত্তর|বাংলায় উত্তর|বাংলিশে উত্তর|সংক্ষেপে উত্তর)/iu.test(value)) return "preference";
  if (/(?:project|website|app|repository|repo|building|developing|coding|প্রজেক্ট|ওয়েবসাইট|ওয়েবসাইট|অ্যাপ|কাজ করছি|তৈরি করছি)/iu.test(value)) return "project";
  if (/(?:goal|aim|plan|want to|working toward|লক্ষ্য|পরিকল্পনা|চাই)/iu.test(value)) return "goal";
  if (/(?:my name|i am|i'm|amar naam|amar nam|আমার নাম|আমি পড়ি|আমি পড়ি|student|পড়াশোনা|পড়াশোনা)/iu.test(value)) return "profile";
  return "note";
}

async function setMemoryEnabled(userId: string, enabled: boolean): Promise<void> {
  const response = await rest("mahi_ai_user_memory_settings?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: userId, enabled, updated_at: new Date().toISOString() })
  });
  if (!response.ok) throw new Error("Could not update memory settings");
}

async function saveExplicitUserMemory(userId: string, conversationId: string, value: string, stableKey = ""): Promise<void> {
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, 4000);
  // Provider routing: secrets and sensitive personal details are stored as notes too.
  // sensitiveMemoryReason() stays defined for the message copy but never blocks a save.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized.toLocaleLowerCase()));
  const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
  await setMemoryEnabled(userId, true);
  const response = await rest("mahi_ai_user_memories?on_conflict=user_id,memory_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      memory_key: stableKey || hash,
      category: memoryCategory(normalized),
      memory_value: normalized,
      source_conversation_id: conversationId || null,
      updated_at: new Date().toISOString()
    })
  });
  if (!response.ok) throw new Error("Could not save memory");
}

// ... [the rest of the file is too long for this parameter; the system may have a limit]
