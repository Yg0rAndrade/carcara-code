import { useCallback, useEffect, useRef, useState } from 'react';
import { History, RotateCcw, Plus, Loader2, Clock } from 'lucide-react';
import { RefreshCCWIcon } from './ui/refresh-ccw.jsx';
import { Button } from './ui/button.jsx';
import { EmptyState } from './ui/empty-state.jsx';
import { toast } from '@/lib/toast.js';
import { cn } from '@/lib/utils';

// Tempo relativo curto em pt-BR ("agora", "há 4 min", "há 2 h", "há 3 d").
function ago(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 45) return 'agora';
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} d`;
}

// Painel "Histórico": lista os checkpoints (snapshots no shadow git) e deixa voltar a
// qualquer um. O auto-checkpoint roda quando o Claude termina um turno; aqui o usuário
// também cria manualmente e restaura. Restaurar tira um snapshot antes — é reversível.
export function CheckpointsPanel({ active, visible }) {
  const projectPath = active?.path || null;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);      // hash em operação (restore)
  const [creating, setCreating] = useState(false);
  const [autoOn, setAutoOn] = useState(true);
  const [confirm, setConfirm] = useState(null); // checkpoint aguardando confirmação de restore
  const [titles, setTitles] = useState({});     // hash -> título antigo cacheado (legado)

  const refresh = useCallback(async () => {
    if (!projectPath) { setItems([]); return; }
    setLoading(true);
    const r = await window.api.checkpointList(projectPath);
    setItems(r.ok ? (r.items || []) : []);
    setLoading(false);
  }, [projectPath]);

  useEffect(() => { if (visible) refresh(); }, [visible, refresh]);

  useEffect(() => {
    window.api.checkpointGetEnabled().then((r) => setAutoOn(r?.enabled !== false));
  }, []);

  // Novo auto-checkpoint chegou (Claude terminou um turno): atualiza se for deste projeto.
  useEffect(() => {
    return window.api.on('checkpoint:added', ({ projectPath: p }) => {
      if (p === projectPath && visible) refresh();
    });
  }, [projectPath, visible, refresh]);

  // Carrega títulos já cacheados (localStorage) pros checkpoints atuais. O título novo
  // vem direto do subject do checkpoint (o aiTitle que o Claude deu à aba); este cache
  // só preserva os rótulos que a IA local gerou antes desta mudança.
  useEffect(() => {
    if (!items.length) return;
    const cached = {};
    for (const cp of items) {
      const v = localStorage.getItem('cpTitle:' + cp.hash);
      if (v) cached[cp.hash] = v;
    }
    if (Object.keys(cached).length) setTitles((t) => ({ ...cached, ...t }));
  }, [items]);

  const create = async () => {
    if (!projectPath || creating) return;
    setCreating(true);
    const r = await window.api.checkpointCreate(projectPath, 'Checkpoint manual ' + new Date().toISOString());
    setCreating(false);
    if (r.ok) { toast.success('Checkpoint criado'); refresh(); }
    else toast.error('Falha ao criar checkpoint: ' + (r.error || 'erro'));
  };

  const restore = async (cp) => {
    setConfirm(null);
    if (!projectPath) return;
    setBusy(cp.hash);
    const r = await window.api.checkpointRestore(projectPath, cp.hash);
    setBusy(null);
    if (r.ok) { toast.success('Projeto restaurado para o checkpoint'); refresh(); }
    else toast.error('Falha ao restaurar: ' + (r.error || 'erro'));
  };

  const toggleAuto = async () => {
    const next = !autoOn;
    setAutoOn(next);
    await window.api.checkpointSetEnabled(next);
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col overflow-hidden bg-background">
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b bg-card px-2.5">
        <History className="size-[15px] text-muted-foreground" />
        <span className="text-[13px] font-medium">Histórico</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={toggleAuto}
          title="Criar um checkpoint automaticamente quando o Claude termina um turno"
          className={cn(
            'flex h-7 items-center gap-1.5 rounded px-2 text-[12px] font-medium transition-colors',
            autoOn ? 'text-primary hover:bg-muted' : 'text-muted-foreground hover:bg-muted'
          )}
        >
          <span className={cn('size-1.5 rounded-full', autoOn ? 'bg-primary' : 'bg-muted-foreground/50')} />
          Auto
        </button>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2" disabled={!projectPath || creating} onClick={create}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Criar
        </Button>
        <Button variant="ghost" size="icon" className="size-7" disabled={loading || !projectPath} title="Atualizar" onClick={refresh}>
          <RefreshCCWIcon className={'size-4 ' + (loading ? 'animate-spin' : '')} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <EmptyState>
            <div className="font-medium text-foreground">Sem checkpoints ainda</div>
            <p className="max-w-[260px] text-[13px] leading-relaxed">
              Um checkpoint é criado quando o Claude termina um turno, ou clique em “Criar”.
              Dá pra voltar a qualquer um deles.
            </p>
          </EmptyState>
        ) : (
          <ul className="py-1">
            {items.map((cp, i) => (
              <li
                key={cp.hash}
                className="group flex items-center gap-2.5 px-3 py-2 hover:bg-muted/60"
              >
                <span className="relative flex size-4 shrink-0 items-center justify-center">
                  <Clock className="size-3.5 text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-foreground">{labelOf(cp, titles)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {ago(cp.ts)}
                    {i === 0 && <span className="ml-1.5 text-primary">· mais recente</span>}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 gap-1.5 px-2 opacity-0 transition-opacity group-hover:opacity-100"
                  disabled={!!busy}
                  onClick={() => setConfirm(cp)}
                  title="Restaurar o projeto para este ponto"
                >
                  {busy === cp.hash ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                  Voltar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirm && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40" onMouseDown={() => setConfirm(null)}>
          <div className="w-[360px] max-w-[90%] rounded-xl border bg-background p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <h2 className="text-[15px] font-semibold">Voltar no tempo</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Restaurar os arquivos do projeto para <span className="font-medium text-foreground">{ago(confirm.ts)}</span>?
              <br />Um checkpoint do estado atual é salvo antes — você pode voltar.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirm(null)}>Cancelar</Button>
              <Button size="sm" onClick={() => restore(confirm)}>Restaurar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Rótulo do checkpoint: prioriza um título antigo cacheado pela IA local (legado); o
// caso novo é o subject já ser o aiTitle da aba. Em ambos, limpa o sufixo de timestamp
// ISO que o main carimba nos rótulos genéricos (quando o Claude ainda não titulou).
function labelOf(cp, titles) {
  const ai = titles && titles[cp.hash];
  if (ai) return ai;
  return (cp.subject || '').replace(/\s*\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/, '').trim() || 'Checkpoint';
}
