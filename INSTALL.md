# MahiCloud upgrade pack

## What it does
- Backend (`mahi-ai-chat`): hedged streaming (backup model starts quietly if the first is slow), Groq task classifier
  (regex stays as fallback), shared provider health in Supabase, one neutral "Thinking…" status.
- Frontend: working Stop button (it showed a stop icon but did nothing before), Claude-style responsive UI,
  Copy / Retry on answers, code-block copy, scroll-to-bottom, chat search, shortcuts.

## Install (local, 2 minutes)
1. `git clone https://github.com/mahimahfud-ui/Mahi-AI && cd Mahi-AI && git checkout -b claude/upgrade-engine`
2. Unzip this pack into the repo root (merge folders).
3. `python3 tools/apply_upgrade.py`   (safe to re-run; stops with an error if the code changed and a patch no longer matches)
4. `git add -A && git commit -m "Engine + UI upgrade" && git push -u origin claude/upgrade-engine` and open a Pull Request.

(Alternative with no local tools: upload the files to a new branch named `claude/upgrade-engine` on github.com;
the included workflow applies the patch and commits it for you.)

## Deploy
1. Run `supabase/migrations/20261024120000_provider_health.sql` (SQL Editor, or `supabase db push`).
   The code works without the table; it just keeps health in memory like before.
2. `supabase functions deploy mahi-ai-chat`
3. Merge the PR -> Render redeploys the frontend.

## Optional secrets / flags (Supabase -> Edge Function secrets)
- `GROQ_CLASSIFIER_MODEL` (default `llama-3.1-8b-instant`)
- `DISABLE_HEDGING=true`, `DISABLE_SMART_ROUTING=true`, `DISABLE_PERSISTENT_HEALTH=true` to switch a feature off.
