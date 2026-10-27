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
