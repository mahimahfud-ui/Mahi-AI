# Mahi AI

Mahi AI is a dark, responsive chat app with automatic server-side task routing and Supabase-backed guest sessions, conversation history, and usage limits.

## Architecture

- Frontend: static HTML/CSS/JavaScript in \`public/\`.
- Authentication and data: Supabase Auth guest sessions and Postgres tables with Row Level Security.
- AI backend: Supabase Edge Function \`mahi-ai-chat\`. Provider selection happens on the server; the UI never receives the provider name or API key.
- Providers supported by the router: Google Gemini, Groq, OpenRouter, and Mistral. Optional paid fallback adapters for OpenAI and Anthropic are disabled unless explicitly enabled.
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
- Text and common source/code files are read as UTF-8 and included as prompt context.
- Images, PDFs, audio, and video (inline media total up to 12 MB) route to Gemini multimodal input. Unsupported binary file types can still be attached, but the current backend only tells the model their name/type; it does not claim to understand their binary contents.
- Requests to generate or edit an image route to Gemini's `gemini-3.1-flash-image` model. Generated image outputs are stored privately and displayed through expiring signed links.
- Image generation needs a Gemini API key/account with access and quota for the image model. Generation is not guaranteed to be free.
- API roles: coding routes to OpenRouter first, with optional OpenAI fallback only when `ENABLE_PAID_FALLBACK=true`; ordinary chat prefers Groq/Gemini; multimodal file analysis routes to Gemini. Paid providers remain disabled by default.

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

The router is best-effort: it classifies each prompt (for example, coding, reasoning, writing, or general use), tries configured providers in task-specific order, then falls back after a failed request. It cannot guarantee a single objectively “best” model for every task, and it cannot create free API quota. OpenAI and Anthropic API use is disabled by default because their API access is not generally free.

## Security

- Conversation reads/deletes are scoped to \`auth.uid()\` through RLS.
- The function verifies the caller's Supabase JWT and checks per-user request limits.
- Provider credentials stay in Supabase Edge Function secrets.
- Guest accounts do not carry across browsers/devices unless users later link a sign-in identity.
