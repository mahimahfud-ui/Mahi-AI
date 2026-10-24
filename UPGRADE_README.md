# Upgrade pack on branch `claude/upgrade-engine`

## What was pushed
- INSTALL.md
- supabase/migrations/20261024120000_provider_health.sql
- .github/workflows/apply-upgrade.yml
- tools/apply_upgrade.py (verify completeness)
- public/claude-ui.css / claude-features.js (may need full version from zip)

## Critical: restore index.ts first
Main branch `supabase/functions/mahi-ai-chat/index.ts` was corrupted.

1. Restore good version from commit `84b7f59` (or use the FIXED file from conversation)
2. Apply identity fixes (multi-provider, not OpenAI)
3. Unzip full pack or copy full tools/* and public/claude*
4. Run: `python3 tools/apply_upgrade.py`
5. `supabase functions deploy mahi-ai-chat`
6. Merge PR to main

Full pack is in the zip the user uploaded: mahi-upgrade-pack.zip
