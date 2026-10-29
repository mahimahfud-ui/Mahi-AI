import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const allowedOrigins = new Set([
  "https://mahi-ai-kdm2.onrender.com",
  "https://mahi-ai.onrender.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

function headersFor(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin"
  };
  if (origin && (allowedOrigins.has(origin) || /^https:\/\/mahi-ai(?:-[a-z0-9-]+)?\.onrender\.com$/.test(origin))) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function respond(body: Record<string, unknown>, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = headersFor(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405, headers);
  if (origin && !headers["Access-Control-Allow-Origin"]) return respond({ error: "Origin not allowed." }, 403, headers);

  // Supabase JWT verification is enabled for this function. Keep the long-lived key server-side.
  const apiKey = (Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_GEMINI_API_KEY") || "").trim();
  if (!apiKey) return respond({ error: "Live Voice is not configured. Add GEMINI_API_KEY to Supabase Edge Function Secrets." }, 503, headers);

  const now = Date.now();
  const instructions = "You are MahiCloud, a warm real-time voice assistant. Automatically detect the user's language. Reply naturally in Bangla when the user speaks Bangla, in English when they speak English, and match mixed Bangla-English naturally. Keep spoken replies conversational and concise unless asked for detail. The user may interrupt at any time; stop speaking and listen to the new request.";
  const tokenRequest = {
    uses: 1,
    expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
    newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
    liveConnectConstraints: {
      model: "models/gemini-3.8-live",
      config: {
        responseModalities: ["AUDIO"],
        systemInstruction: { parts: [{ text: instructions }] },
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } },
        inputAudioTranscription: {},
        outputAudioTranscription: {}
      }
    }
  };

  try {
    const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(tokenRequest)
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok || typeof payload.name !== "string" || !payload.name) {
      console.error("Gemini Live token provisioning failed", { status: upstream.status });
      return respond({
        error: upstream.status === 401 || upstream.status === 403
          ? "Gemini Live rejected the configured key. Check that the key and Live API access are enabled."
          : "Gemini Live is temporarily unavailable. Please try again."
      }, upstream.status === 401 || upstream.status === 403 ? 502 : 503, headers);
    }
    return respond({ token: payload.name, model: "gemini-3.8-live", expiresAt: payload.expireTime || new Date(now + 30 * 60 * 1000).toISOString() }, 200, headers);
  } catch (_) {
    return respond({ error: "Could not reach Gemini Live. Check the connection and try again." }, 502, headers);
  }
});
