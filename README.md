# Mahi AI

Mahi AI is a dark, responsive multilingual chat app with task-aware provider routing, whole-response failover, and Supabase-backed guest sessions and conversation history.

## Architecture

- Frontend: static HTML/CSS/JavaScript in \`public/\`.
- Authentication and data: Supabase Auth guest sessions and Postgres tables with Row Level Security.
- AI backend: Supabase Edge Function \`mahi-ai-chat\`. Provider selection happens on the server; the UI never receives the provider name or API key.
- Providers supported by the router: Google Gemini, Groq, OpenRouter, Mistral, NVIDIA, Cloudflare, OpenAI, and Anthropic. Every provider with a configured API key is eligible for automatic fallback.
- Hosting: Node 18+; \`npm start\` serves the frontend. \`render.yaml\` configures Render to deploy commits on \`main\`.

## Supabase setup

The database schema is in \`supabase/migrations/20261023075646_mahi_ai_core_schema.sql\`. It has already been applied to the connected Supabase project as the migration \`mahi_ai_core_schema\`.

1. Open the [Supabase project](https://supabase.com/dashboard/project/husydmiujigyonlxbuuj).
2. In **Authentication → Sign In / Providers**, enable **Anonymous Sign-Ins**. Guest chats are tied to the browser session; clearing site data or changing devices loses access to that guest account.
3. Open **Edge Functions → Secrets** and add provider keys. Keys must be added there, not to GitHub or \`public/config.js\`.

Recommended free-tier provider secrets (add one or more):
- \`GEMINI_API_KEY\` — [Google AI Studio](https://aistudio.google.com/app/apikey)
- \`GROQ_API_KEY\` — [Groq Console](https://console.groq.com/keys)
- \`OPENROUTER_API_KEY\` — [OpenRouter](https://openrouter.ai/settings/keys)
- \`MISTRAL_API_KEY\` — [Mistral La Plateforme](https://console.mistral.ai/api-keys)

Optional providers:
- \`NVIDIA_API_KEY\` — [NVIDIA API Catalog](https://build.nvidia.com/); set \`ENABLE_NVIDIA_FALLBACK=true\` only after checking your account's free allowance and billing settings.
- \`CLOUDFLARE_API_TOKEN\` and \`CLOUDFLARE_ACCOUNT_ID\` — [Cloudflare Dashboard](https://dash.cloudflare.com/); set \`ENABLE_CLOUDFLARE_FALLBACK=true\` only after checking your Workers AI allowance and billing settings.
- \`OPENAI_API_KEY\` and/or \`ANTHROPIC_API_KEY\` — paid API fallback adapters. Set \`ENABLE_PAID_FALLBACK=true\` only if you intentionally accept possible charges. It defaults to off.

The router works with any subset of the enabled providers, classifies the prompt (coding, reasoning, creative writing, or general use), and tries provider/model combinations in a task-specific order. Provider names and keys are never sent to the browser. It retries other configured providers after errors and rate limits. You can override model IDs with \`GEMINI_MODEL\`, \`GROQ_MODEL\`, \`OPENROUTER_MODEL\`, \`OPENROUTER_CODING_MODEL\`, \`OPENROUTER_REASONING_MODEL\`, \`MISTRAL_MODEL\`, \`NVIDIA_MODEL\`, \`NVIDIA_CODING_MODEL\`, and \`CLOUDFLARE_MODEL\`.

Free tiers have strict and changing quotas. OpenRouter currently lists 50 requests/day on its free plan; its \`openrouter/free\` route selects a model from its free set. Free access is not unlimited, and some providers may retain inputs for service improvement. A provider's free chat website does not imply free API usage. Do not add credentials to GitHub.

## Attachments and media routing

- The composer accepts up to 5 files per message, any file type, up to 15 MB per file and 20 MB total.
- Attachments are uploaded to a private Supabase Storage bucket and are scoped to the authenticated guest user by Storage RLS.
- Text and common source/code files are read as UTF-8 and included as prompt context. DOCX, XLSX/XLS/ODS, PPTX/ODP/ODT, and ZIP archives have best-effort client-side text extraction using on-demand browser libraries.
- Images, PDFs, audio, and video (inline media total up to 12 MB) route to Gemini multimodal input. Any file type can be selected and uploaded, but unsupported binary types may only pass their name/type unless their contents can be extracted.
- Requests to generate or edit an image try Gemini first, then OpenAI Image API if `OPENAI_API_KEY` is configured. Set `OPENAI_IMAGE_MODEL` to override its image model. Generated images are stored privately and shown through expiring signed links.
- Image generation may incur charges and still depends on provider account access, model availability, and quota.
- API roles: task-specific routing tries configured providers until a complete response succeeds. OpenAI and Anthropic can incur charges when earlier providers fail. Image attachments can also be passed to OpenAI/OpenRouter vision routes when a configured model supports them.

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

The router is best-effort: it fully buffers each provider response and then falls back on errors, timeouts, empty output, or known truncation. It follows the user's language and writing style where the selected model supports it. There is no app-defined daily/per-minute usage cap, but provider quota, billing, context/output token caps, file-processing constraints, and Supabase runtime limits still exist. Configured OpenAI/Anthropic/image APIs may charge.

## Security

- Conversation reads/deletes are scoped to \`auth.uid()\` through RLS.
- The function verifies the caller's Supabase JWT. It does not enforce an app-defined daily or per-minute usage cap; provider and platform limits still apply.
- Provider credentials stay in Supabase Edge Function secrets.
- Guest accounts do not carry across browsers/devices unless users later link a sign-in identity.


### Banglish image generation
Image intents recognize English, Bangla and Banglish requests (for example `bongobondhur image genarate koro`) and route them to image generation. The image prompt is normalized to avoid an unwanted code/tutorial answer. Image provider order is Gemini → Grok Imagine → OpenAI (when each API key is configured). Set `XAI_API_KEY` in Supabase Edge Function secrets to enable Grok.


## Accuracy and limitations

The assistant now uses an accuracy-first instruction and, when another configured non-paid provider is available, a second-pass reviewer. The reviewer applies a correction only when it returns a valid structured decision; timeout or invalid output retains the original draft. This improves reliability but does not guarantee error-free output. The app does not provide a live web-search tool or execute generated code, so it must not describe current facts or code as externally verified/executed unless a tool actually did that. Google's guidance recommends search grounding for obscure/recent facts and code execution for calculations, but those tools are not automatically available in this chat router.


## Live web research

Mahi AI detects requests for current/latest information, news, prices, releases, explicit online search, and source links. It prefers Gemini and enables the built-in Google Search grounding tool for text-only requests; the streaming response includes a **Sources** list from Gemini grounding metadata when provided. Ordinary questions do not trigger web search. If the search provider fails and another provider is used, the answer must not pretend it performed live verification. Google Search grounding is subject to the Gemini model/account's availability, quota, and applicable terms.
