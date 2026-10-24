// ===== MahiCloud upgrade: hedged streaming, smart routing, shared provider health =====
const sleepMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// --- Persistent provider health (Supabase table public.provider_health) ---
const PROVIDER_HEALTH_TTL_MS = 20_000;
let providerHealthLoadedAt = 0;
let providerHealthLoading: Promise<void> | null = null;
const providerPersistState = new Map<string, { lastWrite: number; timer: ReturnType<typeof setTimeout> | undefined; lastError: string }>();

async function refreshProviderHealth(): Promise<void> {
  try {
    const response = await rest("provider_health?select=provider,successes,failures,avg_latency_ms,cooldown_until_ms");
    if (!response.ok) return; // table not created yet: stay on in-memory health
    const rows = await response.json();
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      const name = typeof row?.provider === "string" ? row.provider : "";
      if (!name) continue;
      const successes = Math.max(0, Number(row.successes) || 0);
      const failures = Math.max(0, Number(row.failures) || 0);
      const local = providerHealth.get(name);
      if (!local || local.samples <= successes + failures) {
        providerHealth.set(name, {
          successes, failures, samples: successes + failures,
          averageLatencyMs: Math.max(0, Number(row.avg_latency_ms) || 0)
        });
      }
      const until = Number(row.cooldown_until_ms) || 0;
      if (until > Date.now() && until > (providerCooldownUntil.get(name) ?? 0)) providerCooldownUntil.set(name, until);
    }
  } catch (_) {
    // Health sharing is best-effort and must never affect a chat request.
  } finally {
    providerHealthLoadedAt = Date.now();
  }
}

async function ensureProviderHealthLoaded(): Promise<void> {
  if (flagEnabled("DISABLE_PERSISTENT_HEALTH")) return;
  if (Date.now() - providerHealthLoadedAt < PROVIDER_HEALTH_TTL_MS) return;
  if (!providerHealthLoading) providerHealthLoading = refreshProviderHealth().finally(() => { providerHealthLoading = null; });
  // Only a cold isolate waits (briefly); warm ones refresh in the background.
  if (providerHealthLoadedAt === 0) await Promise.race([providerHealthLoading, sleepMs(600)]);
}

async function persistProviderHealth(name: string, lastError: string): Promise<void> {
  const stats = providerHealth.get(name);
  if (!stats) return;
  if (stats.samples > 40) { // exponential-style decay so old history fades out
    stats.successes = Math.round(stats.successes / 2);
    stats.failures = Math.round(stats.failures / 2);
    stats.samples = stats.successes + stats.failures;
  }
  try {
    await rest("provider_health?on_conflict=provider", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        provider: name,
        successes: stats.successes,
        failures: stats.failures,
        avg_latency_ms: Math.round(stats.averageLatencyMs),
        cooldown_until_ms: providerCooldownUntil.get(name) ?? 0,
        last_error: lastError || null,
        updated_at: new Date().toISOString()
      })
    });
  } catch (_) {
    // best-effort
  }
}

function schedulePersistProvider(name: string, reason = ""): void {
  if (flagEnabled("DISABLE_PERSISTENT_HEALTH")) return;
  const state = providerPersistState.get(name) || { lastWrite: 0, timer: undefined, lastError: "" };
  if (reason) state.lastError = reason.slice(0, 200);
  providerPersistState.set(name, state);
  if (state.timer !== undefined) return;
  const wait = Math.max(0, 2000 - (Date.now() - state.lastWrite));
  state.timer = setTimeout(() => {
    state.timer = undefined;
    state.lastWrite = Date.now();
    void persistProviderHealth(name, state.lastError);
  }, wait);
}

// --- Smart task routing: tiny fast classifier, regex stays as the fallback ---
async function classifyTaskSmart(prompt: string): Promise<string> {
  const quick = classifyTask(prompt);
  if (quick !== "general") return quick;
  const text = String(prompt || "").trim();
  if (text.length < 30 || flagEnabled("DISABLE_SMART_ROUTING") || !providerIsConfigured("groq")) return quick;
  try {
    const response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + envFirst(["GROQ_API_KEY"]), "Content-Type": "application/json" },
      body: JSON.stringify({
        model: envFirst(["GROQ_CLASSIFIER_MODEL"]) || "openai/gpt-oss-20b",
        temperature: 0,
        max_tokens: 4,
        messages: [
          { role: "system", content: "Classify the user's message (any language, including Bengali or Banglish) into exactly one label: coding, reasoning, creative, web_research, general. coding = writing/fixing/explaining code or software. reasoning = math, logic, step-by-step analysis, comparisons. creative = stories, poems, writing, captions. web_research = needs fresh/live facts, news, prices, sources. general = everything else. Reply with the single label only." },
          { role: "user", content: text.slice(0, 600) }
        ]
      })
    }, 1500);
    if (!response.ok) return quick;
    const data = await response.json();
    const label = String(data?.choices?.[0]?.message?.content || "").toLowerCase().trim();
    for (const candidate of ["coding", "reasoning", "creative", "web_research", "general"]) {
      if (label.startsWith(candidate)) return candidate;
    }
  } catch (_) {
    // fall back to the regex classifier
  }
  return quick;
}

// --- Hedged streaming: start a backup model quietly if the first is slow to answer ---
const HEDGE_EXCLUDED_PROVIDERS = new Set(["deepseek", "anthropic", "openai"]); // never double-spend on paid routes

async function* prependChunk(first: string, rest: AsyncGenerator<string, void, unknown>): AsyncGenerator<string, void, unknown> {
  yield first;
  yield* rest;
}

async function startHedgedStream(
  order: string[], index: number, used: Set<string>, messages: ChatMessage[], task: string,
  attachments: PreparedAttachment[], budgetMs: number, slowTask: boolean
): Promise<ProviderStream> {
  type Attempt = { name: string; startedAt: number; stream: ProviderStream | null; dead: boolean; promise: Promise<ProviderStream> };
  const begin = (name: string): Attempt => {
    const attempt: Attempt = { name, startedAt: Date.now(), stream: null, dead: false, promise: null as unknown as Promise<ProviderStream> };
    attempt.promise = (async () => {
      const stream = await startProviderStream(name, messages, task, attachments, budgetMs);
      attempt.stream = stream;
      try {
        if (attempt.dead) throw new Error("hedge_cancelled");
        const first = await stream.iterator.next();
        if (attempt.dead) throw new Error("hedge_cancelled");
        if (first.done || !first.value) throw new Error("Provider returned an empty response");
        return { provider: name, iterator: prependChunk(first.value, stream.iterator), cleanup: stream.cleanup };
      } catch (error) {
        stream.cleanup();
        throw error;
      }
    })();
    attempt.promise.catch(() => {}); // never leave an unhandled rejection behind
    return attempt;
  };
  const stop = (attempt: Attempt) => { attempt.dead = true; try { attempt.stream?.cleanup(); } catch (_) {} };

  const primary = begin(order[index]);
  const hedgeName = flagEnabled("DISABLE_HEDGING") ? undefined : order.slice(index + 1).find((name) =>
    !used.has(name) && !HEDGE_EXCLUDED_PROVIDERS.has(name) && !providerIsCoolingDown(name));
  if (!hedgeName) return primary.promise;

  const settledEarly = await Promise.race([
    primary.promise.then(() => true, () => true),
    sleepMs(slowTask ? 6000 : 2500).then(() => false)
  ]);
  if (settledEarly) return primary.promise; // fast path: success, or a failure the caller handles

  used.add(hedgeName);
  const hedge = begin(hedgeName);
  let primaryFailed = false;
  let primaryError: unknown = null;
  const winner = await new Promise<Attempt>((resolve, reject) => {
    let failed = 0;
    primary.promise.then(() => resolve(primary), (error) => {
      primaryFailed = true; primaryError = error;
      if (++failed === 2) reject(primaryError);
    });
    hedge.promise.then(() => resolve(hedge), (error) => {
      if (hedge.dead) return; // cancelled by us after the primary won: not a provider failure
      const reason = error instanceof Error ? error.message : String(error);
      recordProviderOutcome(hedge.name, false, Date.now() - hedge.startedAt);
      rememberProviderFailure(hedge.name, reason);
      if (++failed === 2) reject(primaryError ?? error);
    });
  });
  if (winner === hedge) {
    if (primaryFailed) {
      const reason = primaryError instanceof Error ? primaryError.message : String(primaryError);
      recordProviderOutcome(primary.name, false, Date.now() - primary.startedAt);
      rememberProviderFailure(primary.name, reason);
    } else {
      stop(primary); // too slow: abandoned quietly, not counted as a failure
    }
  } else {
    stop(hedge);
    used.delete(hedgeName); // never really tried, so it stays available as a later fallback
  }
  return winner.promise;
}
// ===== end MahiCloud upgrade block =====
