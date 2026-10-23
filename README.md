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

Minimum recommended secrets:
- \`GEMINI_API_KEY\` — Google AI Studio
- \`GROQ_API_KEY\` — Groq Console
- \`OPENROUTER_API_KEY\` — OpenRouter
- \`MISTRAL_API_KEY\` — Mistral La Plateforme

The router works with any subset of these keys and falls back when a provider is missing, unavailable, or rate-limited. Model names can be overridden with \`GEMINI_MODEL\`, \`GROQ_MODEL\`, \`OPENROUTER_MODEL\`, and \`MISTRAL_MODEL\`.

Optional paid adapters:
- \`OPENAI_API_KEY\` and/or \`ANTHROPIC_API_KEY\`
- Set \`ENABLE_PAID_FALLBACK=true\` only if you intentionally want paid APIs to be used after free providers fail. It defaults to off.

Free API access has quotas and can change. A provider's free chat website does not imply free API access. Do not add credentials to GitHub.

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
