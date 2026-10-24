# MahiCloud

MahiCloud is a dark, responsive multilingual chat app with task-aware provider routing, whole-response failover, and Supabase-backed guest sessions and conversation history.

The public-facing product name is **MahiCloud**. The existing GitHub repository name and Supabase Edge Function slug remain unchanged as technical identifiers to preserve links and deployment.

## Chat features

- Streaming replies with a stop-generation control, per-message copy/share, browser-local helpful/not-helpful feedback, edit-and-replace, and regenerate.
- Search chat titles and message contents, rename or delete a chat, branch from an earlier assistant response into a separate conversation, and export the current conversation as Markdown or JSON.
- Temporary chats stay out of saved conversation history and long-term memory; they remain only in the open browser session until you leave or start another chat.
- Existing capabilities remain available: responsive dark UI, multilingual chats, authenticated history, attachments, voice input/read-aloud, web research and source links, image generation where explicitly enabled, code execution/live previews, public API discovery, and per-user memory controls.

## Architecture

- Frontend: static HTML/CSS/JavaScript in `public/`.
- Authentication and data: Supabase Auth guest sessions and Postgres tables with Row Level Security.
- AI backend: Supabase Edge Function `mahi-ai-chat`. Provider selection happens on the server; the UI never receives the provider name or API key.
- Providers supported by the router: Google Gemini, Groq, OpenRouter, Shannon AI, Mistral, NVIDIA, Cloudflare, DeepSeek, OpenAI, Anthropic, and Venice AI. Provider eligibility is decided server-side; provider names and keys are never sent to the browser. A provider with a configured server-side API key is eligible for the fallback cascade; preferred providers are tried first and additional configured routes are attempted when earlier routes fail, time out, or cool down. Some providers may charge for fallback usage.
- Hosting: Node 18+; `npm start` serves the frontend. `render.yaml` configures Render to deploy commits on `main`.

## Supabase setup

The database schema is in `supabase/migrations/20261023075646_mahi_ai_core_schema.sql`. It has already been applied to the connected Supabase project as the migration `mahi_ai_core_schema`.

1. Open the [Supabase project](https://supabase.com/dashboard/project/husydmiujigyonlxbuuj).
2. In **Authentication → Sign In / Providers**, enable **Anonymous Sign-Ins**. Guest chats are tied to the browser session; clearing site data or changing devices loses access to that guest account.
3. Open **Edge Functions → Secrets** and add provider keys. Keys must be added there, not to GitHub or `public/config.js`.

Recommended free-tier provider secrets (add one or more):
- `GEMINI_API_KEY` — [Google AI Studio](https://aistudio.google.com/app/apikey)
- `GROQ_API_KEY` — [Groq Console](https://console.groq.com/keys)
- `OPENROUTER_API_KEY` — [OpenRouter](https://openrouter.ai/settings/keys)
- `MISTRAL_API_KEY` — [Mistral La Plateforme](https://console.mistral.ai/api-keys)

Configured fallback keys:
- `DEEPSEEK_API_KEY` (or legacy `DeepSeek`), `ANTHROPIC_API_KEY`, and `OPENAI_API_KEY` activate these providers as later fallback routes. The coding route keeps OpenAI nearer the front of the chain. These APIs may be paid; review pricing and account limits before use.
- `NVIDIA_API_KEY` activates NVIDIA when present. It is not required unless you choose to add this provider key.
- `SHANNON_API_KEY` (or `SHANNONAI_API_KEY` / `SHANNON_AI_API_KEY`) — a configured key enables Shannon as a later fallback. The default model is `shannon-3`; optionally set `SHANNON_MODEL`. [Official API docs](https://shannon-ai.com/docs/api) document the OpenAI-compatible endpoint at `https://api.shannon-ai.com/v1/chat/completions`. Shannon usage may be billed, so check pricing and account balance first. Venice AI is the preferred text route for porn/NSFW/adult-media prompts when configured, but it is no longer locked to them: if Venice is unavailable, out of API balance, or fails, the request falls back to the other configured providers. Venice is also eligible as a normal fallback for ordinary non-porn prompts, so it is part of the regular cascade like any other configured provider. Inline attachments use compatible multimodal providers because Venice is not included for inline media. The current integration is text-only for Shannon; attachment requests continue through other eligible providers.
- `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` enable Cloudflare Workers AI fallback when configured. Check your Workers AI allowance and billing settings before relying on it.
- Image generation is disabled by default because the supported image APIs may incur charges. Set `ENABLE_PAID_IMAGE_GENERATION=true` only if you intentionally accept those charges. The current Gemini 3.1 Flash Image API model has no free tier; see [Google's API pricing](https://ai.google.dev/gemini-api/docs/pricing). When enabled, image routing tries Gemini, then Grok (if `XAI_API_KEY` or `GROK_API_KEY` is configured), then OpenAI (if `OPENAI_API_KEY` is configured).

The router classifies request intent (coding, reasoning, creative writing, or general use) and uses task-specific provider priority, whole-response failover, and short-lived failure cooldowns. OpenRouter defaults to `openrouter/free`; non-free OpenRouter model overrides still require `ENABLE_PAID_FALLBACK=true`. The free router selects from the currently available free set and can change its selection over time. Provider names and keys stay server-side. Free API tiers have changing quotas and do not imply unlimited usage. Never add credentials to GitHub.

## Friendly conversation style and owner profile

MahiCloud uses a relaxed, friendly tone for ordinary casual conversation and may use a few emojis when the moment is playful or cheerful. It avoids forced emojis and keeps coding, serious, sensitive, and professional requests focused.

The public profile identifies Mahi Mahfud (@mahimahfud) as the founder and owner of the MahiCloud assistant. When responding to insults or negative factual claims about the owner, MahiCloud should be confident, fact-based, and assertive but civil: correct unsupported or false claims using known public facts and project information, distinguish opinion from verifiable fact, acknowledge fair criticism when warranted, and never invent evidence, achievements, or personal details or answer with harassment.

For the Abu Bokor alias, the app has an owner-provided mapping to Risky Saif (@risk_taker_saif) and can share [the supplied Instagram profile](https://www.instagram.com/risk_taker_saif/). The mapping is contextual rather than independently verified; the assistant must not present derogatory labels or unverified family, relationship, or biographical claims as facts.

## Long-term memory

MahiCloud now has server-side, per-user cross-chat memory. For each authenticated guest/user, the Edge Function retrieves up to 12 recent messages from earlier conversations (excluding the currently open conversation) plus up to 15 saved notes. It adds only a bounded amount of context to the provider prompt. It also auto-saves clearly stated stable facts, response preferences, and current project context using simple patterns, without making an extra model call. It does not summarize or preserve every line of every old chat, so very old details are best saved explicitly.

Users can control memory in chat:
- `Remember that I prefer Banglish answers` — save a personal preference or note for future chats.
- `Forget everything you remember` — clear saved notes and disable automatic cross-chat memory.
- `Turn memory off` — stop injecting saved notes and old-chat excerpts; existing saved notes remain stored.
- `Turn memory on` or `Remember my chats` — enable memory again.

Passwords, API keys, access tokens, and selected sensitive personal details are not accepted as saved notes. Memory tables have RLS enabled and are inaccessible directly to `anon` and `authenticated`; only the server-side service-role Edge Function can read or write memory. The database function `mahi_ai_get_memory_context` is executable only by `service_role`.

Guest-session limitation: memory is tied to the Supabase Auth user ID. Clearing browser site data, losing a guest session, or switching devices can create a different guest user, so old memories may not follow. Stable cross-device memory requires adding a persistent sign-in/link-account flow.

## Attachments and media routing

- The composer accepts up to 5 files per message, any file type, up to 15 MB per file and 20 MB total.
- Attachments are uploaded to a private Supabase Storage bucket and are scoped to the authenticated guest user by Storage RLS.
- Text and common source/code files are read as UTF-8 and included as prompt context. DOCX, XLSX/XLS/ODS, PPTX/ODP/ODT, and ZIP archives have best-effort client-side text extraction using on-demand browser libraries.
- Images, PDFs, audio, and video (inline media total up to 12 MB) route to Gemini multimodal input. Any file type can be selected and uploaded, but unsupported binary types may only pass their name/type unless their contents can be extracted.
- Requests to generate or edit an image are disabled by default to prevent accidental paid API calls. Set `ENABLE_PAID_IMAGE_GENERATION=true` in Supabase Edge Function Secrets only when you accept possible charges. The route tries Gemini, then Grok, then OpenAI for configured keys. Set `OPENAI_IMAGE_MODEL` or `XAI_IMAGE_MODEL` to override the respective model. Generated images are stored privately and shown through expiring signed links.
- Google's Gemini 3.1 Flash Image API model has no free tier. Image generation still depends on provider account access, model availability, quota, and billing status.
- API roles: task-specific routing tries configured provider routes until a complete response succeeds. DeepSeek, Anthropic, OpenAI, Shannon, and Cloudflare can serve as configured fallbacks without a second provider-enable flag; their paid usage can incur charges. Non-free OpenRouter model overrides and image generation still require explicit opt-in flags. Image attachments can also be passed to supported vision routes.

## Deploy the Edge Function

The function source is `supabase/functions/mahi-ai-chat/index.ts`; it is deployed with JWT verification enabled. The deployed function name is `mahi-ai-chat`.

If deploying from the CLI instead of the integrated Supabase connection:
```sh
supabase functions deploy mahi-ai-chat
```

## Run locally

Install Node.js 18 or newer, then:
```sh
npm start
```
Open http://localhost:3000. The public Supabase URL and publishable key are in `public/config.js`; publishable keys are intended for browser use when RLS is configured. Never place a Supabase secret/service-role key or AI-provider API key in the browser.

## Render

The root `render.yaml` targets the `main` branch and sets auto-deploy to commit. Render account quota previously prevented creating a new service, so a service must be created/applied in the Render Dashboard when the account allows it. The existing unrelated Render service was not modified.

## Free-tier notes

The router is best-effort: it buffers each provider response and falls back on errors, timeouts, empty output, or known truncation. Ordinary chat uses a 60-second overall provider budget with shorter per-provider attempts; research, tool execution, and attachment requests retain a longer budget. A configured paid-provider key makes that provider eligible as a fallback, so monitor pricing and balance. OpenRouter non-free model overrides still require `ENABLE_PAID_FALLBACK=true`; image-generation APIs require `ENABLE_PAID_IMAGE_GENERATION=true`.

## Security

- Conversation reads and deletes are scoped to `auth.uid()` through RLS.
- The Edge Function verifies the caller's Supabase JWT and reserves requests atomically in Postgres before attachment processing. Defaults are 10 requests per guest user per rolling minute and 200 per rolling 24 hours.
- Configure `MAHI_AI_RATE_LIMIT_PER_MINUTE` (1–120) and `MAHI_AI_RATE_LIMIT_PER_DAY` (1–5000) in Supabase Edge Function secrets to adjust the limits.
- For a fresh project, apply both `supabase/migrations/20261024110000_production_hardening.sql` and then `supabase/migrations/20261024130000_mahi_ai_usage_observability.sql` in the Supabase SQL Editor before deploying the updated Edge Function. The second migration adds request IDs, duration, input/output character counts, attachment counts, and updates the service-role-only reservation RPC signature.
- The RPC can only be executed by `service_role`; `anon` and `authenticated` have no execute grant. Usage rows store request metadata and provider status, not raw prompt/answer contents. JSON logs use a request ID to correlate request start, provider attempts, completion, failure, rate limiting, and client cancellation.
- CORS does not use a wildcard: it allows this app's HTTPS Render hosts matching `mahi-ai*.onrender.com`, HTTP(S) localhost/127.0.0.1/IPv6-loopback on any port, and the explicit defaults. For a custom frontend domain, set `MAHI_AI_ALLOWED_ORIGINS` to a comma-separated list of exact origins, including scheme and optional port, without paths or trailing slashes. These custom origins extend (rather than replace) the defaults.
- Rejected origins receive only a safe error response with their origin echoed for CORS visibility; every non-preflight request from a rejected origin still stops with `403 Origin not allowed` before authentication or database work. The frontend distinguishes offline, CORS/origin rejection, and likely function reachability problems.
- Provider keys remain in Supabase Edge Function secrets and must never be placed in GitHub or browser files.
- Provider latency and reliability scores guide routing only within a warm Edge Function isolate and reset after a cold start. Configured keys enable provider fallback routes; request-level cooldowns help move away from routes that recently failed.
- This rate limit is per guest-user ID, not a complete anti-abuse system: anonymous sessions can be recreated. Add a trusted gateway/IP-level limit or require verified accounts before treating it as a hard quota.
- Guest accounts do not carry across browsers or devices unless users later link a sign-in identity.

### Banglish image generation
Image intents recognize English, Bangla and Banglish requests (for example `bongobondhur image genarate koro`) and route them to image generation. The image prompt is normalized to avoid an unwanted code/tutorial answer. For cost safety, image generation is disabled by default; after setting `ENABLE_PAID_IMAGE_GENERATION=true`, the provider order is Gemini → Grok Imagine → OpenAI for configured keys. Set `XAI_API_KEY` in Supabase Edge Function secrets to enable Grok.


## Accuracy and limitations

The assistant uses an accuracy-first instruction and, when another eligible non-paid provider is available, a second-pass reviewer. The reviewer tries alternate providers after request errors and applies a correction only when it returns a valid structured decision; timeout or invalid output retains the original draft. The router can request Gemini's built-in Google Search grounding, URL Context, and sandboxed code execution for eligible prompts when the selected model/account supports those tools; web-research tasks can also use OpenRouter's server-side web search and fetch tools as a fallback. Other providers do not automatically inherit every tool, so a fallback answer must not claim live verification or code execution unless retrieval/execution actually occurred. These features depend on model availability, quota, and applicable usage charges and do not guarantee error-free output.


## Automatic public API tools

MahiCloud can enrich eligible requests with server-side public API data without asking the user to connect an account or paste an API key. Built-in adapters cover Open-Meteo live weather, daily ExchangeRate-API currency rates, Nager.Date public holidays, Open Library book search, Wikipedia reference search, and catalogue discovery from the same community-maintained `public-apis` README used by the in-app Public API Library. Catalogue results are limited to entries marked no-auth and HTTPS.

Only fixed HTTPS hosts in the server-side allowlist are callable. The community catalogue is used for discovery, not to execute arbitrary third-party endpoints. A directory entry is not proof that an API is healthy, free, suitable, or permissionless; verify provider documentation, pricing, terms, and rate limits before relying on it. Results are cached briefly and passed to the model as untrusted reference data with source links. If a public endpoint is slow, unavailable, unsupported, or does not match the request, MahiCloud falls back to its existing response/research path. These integrations do not guarantee error-free or always-current answers.

## Live web research

MahiCloud detects current/latest/news/price queries, explicit online research, source links, references, resources, and common Bangla/Banglish equivalents. With no inline media attachment, Gemini is preferred for native Google Search grounding; public HTTPS URLs additionally enable Gemini URL Context. Retrieved URL-context metadata and grounding metadata are collected into a **Sources** list where the provider returns them.

If Gemini is unavailable for a resource request, the OpenRouter fallback receives its server-side `openrouter:web_search` and `openrouter:web_fetch` tools. These execute inside OpenRouter, so MahiCloud does not need a browser-side search loop. Resource tools are enabled only for web-research tasks and stop after two server-tool steps. Search-engine usage may incur extra charges depending on the engine/provider and account terms; free-model routing does not mean web search is unlimited or always free. URL fetching and search results depend on engine settings, site availability, model support, quota, and applicable terms.

Ordinary questions do not trigger web search. If no configured retrieval-capable provider successfully retrieves sources, the assistant must not claim it verified facts live or invent citations. URLs requiring login, paywalled/private pages, and unsupported pages may not be retrievable.

## Advanced retrieval and computation tools

- Current/latest/news/source requests enable Gemini Google Search grounding when no inline attachment is being analyzed; grounded citations are collected from Gemini response metadata and appended as source links.
- Prompts containing public `https://` URLs enable Gemini URL Context so it can read supported public pages and PDFs. URLs requiring login, paywalled content, private-network URLs, and some media/document types may not be retrievable.
- Explicit arithmetic, numerical, statistics, or execution requests may enable Gemini's sandboxed Python code-execution tool. Requests to write a script remain code-generation tasks unless the user asks to run/test it.
- These built-in tools depend on the selected Gemini model, API access, quota, and service terms. When retrieval is not available, the assistant must not claim a live search or execution occurred.
