# Mahi AI

Mahi AI is a dark, responsive multilingual chat app with task-aware provider routing, whole-response failover, and Supabase-backed guest sessions and conversation history.

## Architecture

- Frontend: static HTML/CSS/JavaScript in \`public/\`.
- Authentication and data: Supabase Auth guest sessions and Postgres tables with Row Level Security.
- AI backend: Supabase Edge Function \`mahi-ai-chat\`. Provider selection happens on the server; the UI never receives the provider name or API key.
- Providers supported by the router: Google Gemini, Groq, OpenRouter, Mistral, NVIDIA, Cloudflare, DeepSeek, OpenAI, and Anthropic. Provider eligibility follows server-side opt-in flags: paid fallbacks, NVIDIA/Cloudflare, and image generation stay disabled unless explicitly enabled.
- Hosting: Node 18+; \`npm start\` serves the frontend. \`render.yaml\` configures Render to deploy commits on \`main\`.

## Supabase setup

The database schema is in \`supabase/migrations/20261023075646_mahi_ai_core_schema.sql\`. It has already been applied to the connected Supabase project as the migration \`mahi_ai_core_schema\`.

1. Open the [Supabase project](https://supabase.com/dashboard/project/husydmiujigyonlxbuuj).
2. In **Authentication → Sign In / Providers**, enable **Anonymous Sign-Ins**. Guest chats are tied to the browser session; clearing site data or changing devices loses access to that guest account.
3. Open **Edge Functions → Secrets** and add provider keys. Keys must be added there, not to GitHub or \`public/config.js\`.

Recommended free-tier provider secrets (add one or more):
- `GEMINI_API_KEY` — [Google AI Studio](https://aistudio.google.com/app/apikey)
- `GROQ_API_KEY` — [Groq Console](https://console.groq.com/keys)
- `OPENROUTER_API_KEY` — [OpenRouter](https://openrouter.ai/settings/keys)
- `MISTRAL_API_KEY` — [Mistral La Plateforme](https://console.mistral.ai/api-keys)

Optional providers and opt-in flags:
- `DEEPSEEK_API_KEY` (or legacy `DeepSeek`), `OPENAI_API_KEY`, and/or `ANTHROPIC_API_KEY` are treated as possible paid fallbacks. They are ignored unless `ENABLE_PAID_FALLBACK=true` is set in Supabase Edge Function Secrets.
- `NVIDIA_API_KEY` is ignored unless `ENABLE_NVIDIA_FALLBACK=true` is set after checking your account's allowance and billing settings.
- `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are ignored unless `ENABLE_CLOUDFLARE_FALLBACK=true` is set after checking your Workers AI allowance and billing settings.
- Image generation is disabled by default because the supported image APIs may incur charges. Set `ENABLE_PAID_IMAGE_GENERATION=true` only if you intentionally accept those charges. The current Gemini 3.1 Flash Image API model has no free tier; see [Google's API pricing](https://ai.google.dev/gemini-api/docs/pricing). When enabled, image routing tries Gemini, then Grok (if `XAI_API_KEY` or `GROK_API_KEY` is configured), then OpenAI (if `OPENAI_API_KEY` is configured).

The router classifies the actual request intent (coding, reasoning, creative writing, or general use) instead of classifying every question that merely mentions HTML/API/Python as coding. It uses task-specific provider priority, whole-response failover, and short-lived failure cooldowns. OpenRouter defaults to `openrouter/free`; free model overrides remain allowed while paid fallback is off, and non-free model overrides require `ENABLE_PAID_FALLBACK=true`. The free router selects a model from the currently available free set and can change its selection over time. Provider names and keys stay server-side. Free API tiers have changing quotas and do not imply unlimited usage. Never add credentials to GitHub.

## Attachments and media routing

- The composer accepts up to 5 files per message, any file type, up to 15 MB per file and 20 MB total.
- Attachments are uploaded to a private Supabase Storage bucket and are scoped to the authenticated guest user by Storage RLS.
- Text and common source/code files are read as UTF-8 and included as prompt context. DOCX, XLSX/XLS/ODS, PPTX/ODP/ODT, and ZIP archives have best-effort client-side text extraction using on-demand browser libraries.
- Images, PDFs, audio, and video (inline media total up to 12 MB) route to Gemini multimodal input. Any file type can be selected and uploaded, but unsupported binary types may only pass their name/type unless their contents can be extracted.
- Requests to generate or edit an image are disabled by default to prevent accidental paid API calls. Set `ENABLE_PAID_IMAGE_GENERATION=true` in Supabase Edge Function Secrets only when you accept possible charges. The route tries Gemini, then Grok, then OpenAI for configured keys. Set `OPENAI_IMAGE_MODEL` or `XAI_IMAGE_MODEL` to override the respective model. Generated images are stored privately and shown through expiring signed links.
- Google's Gemini 3.1 Flash Image API model has no free tier. Image generation still depends on provider account access, model availability, quota, and billing status.
- API roles: task-specific routing tries eligible providers until a complete response succeeds. OpenAI, Anthropic, DeepSeek, non-free OpenRouter model overrides, and image generation require explicit opt-in flags before they can be used automatically. Image attachments can also be passed to OpenRouter/Gemini vision routes when a selected model supports them.

## Deploy the Edge Function

The function source is \`supabase/functions/mahi-ai-chat/index.ts\`; it is deployed with JWT verification enabled. The deployed function name is \`mahi-ai-chat\`.

If deploying from the CLI instead of the integrated Supabase connection:
\`\`\`sh
supabase functions deploy mahi-ai-chat
\`\`\`

## Run locally

Install Node.js 18 or newer, then:
\`\`\`sh
npm start
\`\`\`
Open http://localhost:3000. The public Supabase URL and publishable key are in \`public/config.js\`; publishable keys are intended for browser use when RLS is configured. Never place a Supabase secret/service-role key or AI-provider API key in the browser.

## Render

The root \`render.yaml\` targets the \`main\` branch and sets auto-deploy to commit. Render account quota previously prevented creating a new service, so a service must be created/applied in the Render Dashboard when the account allows it. The existing unrelated Render service was not modified.

## Free-tier notes

The router is best-effort: it fully buffers each provider response and then falls back on errors, timeouts, empty output, or known truncation. It follows the user's language and writing style where the selected model supports it. There is currently no app-defined per-user daily or per-minute request cap; provider quotas, context/output token caps, file-processing constraints, and Supabase runtime limits still apply. Paid chat fallbacks require `ENABLE_PAID_FALLBACK=true`; image-generation APIs require `ENABLE_PAID_IMAGE_GENERATION=true`.

## Security

- Conversation reads/deletes are scoped to \`auth.uid()\` through RLS.
- The function verifies the caller's Supabase JWT. It does not enforce an app-defined daily or per-minute usage cap; provider and platform limits still apply.
- Provider credentials stay in Supabase Edge Function secrets.
- Guest accounts do not carry across browsers/devices unless users later link a sign-in identity.


### Banglish image generation
Image intents recognize English, Bangla and Banglish requests (for example `bongobondhur image genarate koro`) and route them to image generation. The image prompt is normalized to avoid an unwanted code/tutorial answer. For cost safety, image generation is disabled by default; after setting `ENABLE_PAID_IMAGE_GENERATION=true`, the provider order is Gemini → Grok Imagine → OpenAI for configured keys. Set `XAI_API_KEY` in Supabase Edge Function secrets to enable Grok.


## Accuracy and limitations

The assistant uses an accuracy-first instruction and, when another eligible non-paid provider is available, a second-pass reviewer. The reviewer tries alternate providers after request errors and applies a correction only when it returns a valid structured decision; timeout or invalid output retains the original draft. The router can request Gemini's built-in Google Search grounding, URL Context, or sandboxed code execution for eligible prompts when the selected model/account supports those tools. Other fallback providers do not automatically inherit those tools, so a fallback answer must not claim live verification or code execution unless it actually occurred. These features depend on model availability and quota and do not guarantee error-free output.


## Live web research

Mahi AI detects requests for current/latest information, news, prices, releases, explicit online search, and source links. It prefers Gemini and enables the built-in Google Search grounding tool for text-only requests; the streaming response includes a **Sources** list from Gemini grounding metadata when provided. Ordinary questions do not trigger web search. If the search provider fails and another provider is used, the answer must not pretend it performed live verification. Google Search grounding is subject to the Gemini model/account's availability, quota, and applicable terms.


## Advanced retrieval and computation tools

- Current/latest/news/source requests enable Gemini Google Search grounding when no inline attachment is being analyzed; grounded citations are collected from Gemini response metadata and appended as source links.
- Prompts containing public `https://` URLs enable Gemini URL Context so it can read supported public pages and PDFs. URLs requiring login, paywalled content, private-network URLs, and some media/document types may not be retrievable.
- Explicit arithmetic, numerical, statistics, or execution requests may enable Gemini's sandboxed Python code-execution tool. Requests to write a script remain code-generation tasks unless the user asks to run/test it.
- These built-in tools depend on the selected Gemini model, API access, quota, and service terms. When retrieval is not available, the assistant must not claim a live search or execution occurred.
