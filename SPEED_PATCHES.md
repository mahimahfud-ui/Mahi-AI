# MahiCloud: faster AI responses — exact patches

AI request path (scanned from the repo): **browser → Supabase Edge Function `mahi-ai-chat` → AI provider → streamed back**.
Render only serves the static files. So speed comes from 3 places: page load (server.js), the edge function, and how the browser paints the stream.

Apply in this order (biggest win first). Each patch is find → replace.

---
## 1. `supabase/functions/mahi-ai-chat/index.ts`  (deploy: `supabase functions deploy mahi-ai-chat`)

### 1a. Don't let Wikipedia/weather/etc. lookups block the model (was unbounded sequential wait)
**Find** (inside the handler, ~line 2983):
```ts
    const publicApiContext = await fetchPublicApiContext(displayPrompt, task);
```
**Replace with:**
```ts
    const publicApiContext = await Promise.race([
      publicApiPromise,
      new Promise<string>((resolve) => setTimeout(() => resolve(""), 1500))
    ]);
```
**Then add** this line right after the `const task = ... : classifyTask(displayPrompt);` statement (~line 2867), so the lookup runs *while* memory/conversation DB calls run:
```ts
  const publicApiPromise: Promise<string> = attachments.length === 0
    ? fetchPublicApiContext(displayPrompt, task).catch(() => "")
    : Promise.resolve("");
```

### 1b. Fast mode: skip the blocking "independent review" for coding / reasoning
Today every coding & reasoning answer waits for a second-model review (up to 6 s) *after* streaming, and the app shows plain text until it finishes.
**Find** (~line 2360):
```ts
  if (["coding", "reasoning", "web_research", "code_execution"].includes(task)) return true;
```
**Replace with:**
```ts
  if (flagEnabled("FAST_MODE") && ["coding", "reasoning"].includes(task)) return false;
  if (["coding", "reasoning", "web_research", "code_execution"].includes(task)) return true;
```
Then set the secret `FAST_MODE=true` (Supabase → Edge Functions → Secrets). Medical/legal/adult-sensitive checks stay on. Remove the secret any time to restore the old behaviour.

### 1c. Fail over faster when a provider is slow to start
**Find** (~line 1933):
```ts
        }, Math.min(8000, timeoutMs));
```
**Replace with** (first byte now has 5 s instead of 8 s before trying the next model):
```ts
        }, Math.min(5000, timeoutMs));
```
(Same line appears for the fallback request ~line 1941: change `Math.min(8000, timeoutMs)` → `Math.min(5000, timeoutMs)`.)

---
## 2. `public/app.js`  (smooth streaming: 1 paint per frame instead of 1 DOM rewrite per token)

**Find** (~line 1740):
```js
      const handleStreamEvent = (block) => {
```
**Insert directly above it:**
```js
      let paintQueued = false;
      const paintStream = () => {
        paintQueued = false;
        messageContent.textContent = fullText.indexOf("[[MAHI_LANG") === -1
          ? fullText
          : fullText.replace(/\s*\[\[MAHI_LANG:[\s\S]*$/i, "");
        scrollToBottom();
      };
      const scheduleStreamPaint = () => { if (!paintQueued) { paintQueued = true; requestAnimationFrame(paintStream); } };
```
**Find** (~line 1754, inside the `delta` branch):
```js
          messageContent.textContent = fullText.replace(/\s*\[\[MAHI_LANG:[\s\S]*$/i, "");
          scrollToBottom();
```
**Replace with:**
```js
          scheduleStreamPaint();
```

---
## 3. `public/index.html` `<head>`  (faster first load)
Add `defer` to the three CDN scripts (they currently block rendering; `app.js` is already deferred and runs after them in order):
```html
<script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/marked@15.0.7/marked.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/dompurify@3.2.5/dist/purify.min.js"></script>
```
Add as the first lines inside `<head>` (opens connections early):
```html
<link rel="preconnect" href="https://husydmiujigyonlxbuuj.supabase.co" crossorigin>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
```

---
## 4. `server.js`  → replace the whole file with the new `server.js`
Tested locally: `app.js` 106,292 B → **25,725 B** (Brotli); repeat visit = **304, 0 bytes**; `/healthz`, 404 and path-traversal protection still work. Also fixes `keepAliveTimeout` (5 s → 65 s) which can cause dropped connections behind Render's proxy.

---
## 5. Hosting (no code)
- **Render free plan sleeps after ~15 min idle** → first visit can take 30–60 s. Fix: upgrade the plan, or ping `https://mahi-ai-kdm2.onrender.com/healthz` every 10 min (UptimeRobot, free).
- Keep **Supabase project region = Singapore** (same as your Render service) so browser → edge → DB hops stay short.
- Supabase edge functions also cold-start; the first message after a long idle can be slower. Normal.

## What I could not verify
- Live timings (my network can't reach your site or Supabase). The numbers above are file sizes, not measured response times.
- The edge function has ~3,000 lines; I patched only the spots I read. Moving the other sequential DB calls (usage reservation, conversation lookup, memory load) into `Promise.all` would save more, but I did not change them without reading every branch.
