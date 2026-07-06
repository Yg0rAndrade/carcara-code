// Formatação e matemática de tempo do painel de Tasks. Funções puras (o `now`
// é injetado, nunca lido de Date.now) — por isso testáveis.

// 7361 -> "7,4k", 24580 -> "24,6k". Vírgula decimal pra casar com pt-BR.
export function formatCompact(n) {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 1000) return String(Math.round(n));
  for (const u of [{ v: 1000000, s: 'M' }, { v: 1000, s: 'k' }]) {
    if (n >= u.v) {
      const rounded = Math.round((n / u.v) * 10) / 10;
      // Arredondamento pode estourar pra 1000k — nesse caso vira 1M.
      if (u.s === 'k' && rounded >= 1000) return '1M';
      const str = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1).replace('.', ',');
      return str + u.s;
    }
  }
  return String(Math.round(n));
}

// 45000 -> "45s", 134000 -> "2m 14s", 3900000 -> "1h 5m". <1s ou inválido -> "0s".
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 1000) return '0s';
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) return `${totalMin}m ${totalSec % 60}s`;
  const hours = Math.floor(totalMin / 60);
  return `${hours}h ${totalMin % 60}m`;
}

// Durações das concluídas com inferência sequencial: usa o início observado
// quando existe; senão assume que a task começou quando a anterior terminou.
// `observed` distingue medição real de inferência (a estimativa só usa reais).
function sequentialCompleted(todos) {
  const out = [];
  let cursor;
  for (const t of todos) {
    if (t.status === 'completed' && t.completedAt !== undefined) {
      if (t.startedAt !== undefined) out.push({ ms: Math.max(0, t.completedAt - t.startedAt), observed: true });
      else if (cursor !== undefined) out.push({ ms: Math.max(0, t.completedAt - cursor), observed: false });
      else out.push({ ms: 0, observed: false });
      cursor = t.completedAt;
    } else {
      out.push(undefined);
      if (t.status === 'in_progress' && t.startedAt !== undefined) cursor = t.startedAt;
    }
  }
  return out;
}

// Duração (ms) de cada concluída, alinhada por índice; undefined nas demais.
export function completedTaskDurations(todos) {
  return sequentialCompleted(todos).map((d) => d && d.ms);
}

// Resumo de tempos: decorrido (concluídas + parte ao vivo da ativa) e estimativa
// regressiva do restante (média das medidas; a ativa custa o que falta dela).
export function summarizeTiming(todos, now) {
  const seq = sequentialCompleted(todos);
  let elapsedMs = 0, observedSum = 0, observedCount = 0, unfinished = 0;
  todos.forEach((t, i) => {
    const d = seq[i];
    if (d) {
      elapsedMs += d.ms;
      if (d.observed) { observedSum += d.ms; observedCount++; }
    } else if (t.status === 'in_progress' && t.startedAt !== undefined) {
      elapsedMs += Math.max(0, now - t.startedAt);
    }
    if (t.status === 'pending' || t.status === 'in_progress') unfinished++;
  });
  const hasEstimate = observedCount >= 1 && unfinished >= 1;
  let estimateMs = 0;
  if (hasEstimate) {
    const avg = observedSum / observedCount;
    for (const t of todos) {
      if (t.status === 'pending') estimateMs += avg;
      else if (t.status === 'in_progress') {
        const elapsed = t.startedAt !== undefined ? Math.max(0, now - t.startedAt) : 0;
        estimateMs += Math.max(0, avg - elapsed);
      }
    }
  }
  return { elapsedMs, estimateMs, hasEstimate };
}

// "claude-opus-4-8" -> "opus-4-8"
export function shortModel(model) {
  return model.startsWith('claude-') ? model.slice('claude-'.length) : model;
}

// Semáforo do contexto: ok < 0.60 <= warn < 0.85 <= danger.
export function contextLevel(pct) {
  if (pct >= 0.85) return 'danger';
  if (pct >= 0.60) return 'warn';
  return 'ok';
}

// Semáforo do cache (invertido: reaproveitar mais é melhor): good >= 0.75 > mid >= 0.50 > low.
export function cacheLevel(rate) {
  if (rate >= 0.75) return 'good';
  if (rate >= 0.50) return 'mid';
  return 'low';
}
