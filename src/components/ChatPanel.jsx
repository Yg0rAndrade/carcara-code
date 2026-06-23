import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Plus, X, Library, Pencil, Trash2, ArrowUpLeft } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { useTheme } from '@/lib/theme.jsx';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './ui/resizable.jsx';
import {
  isPane, firstPane, allPanes, paneCount,
  applyDrop, addSessionToPane, setActiveInPane, closeSessionInTree, reconcile,
} from '@/lib/paneLayout.js';
import { cn } from '@/lib/utils';

// Cola texto na sessão via "bracketed paste" emitindo os marcadores nós mesmos
// (\e[200~ … \e[201~) direto pro pty. NÃO usamos term.paste() do xterm: ele só
// envolve o texto nos marcadores se achar que o modo está ligado, e esse flag
// dessincroniza depois da 1ª mensagem (o TUI do Claude/Ink reinicia o input ao
// processar a resposta). Sem os marcadores, cada \n vira Enter e só a 1ª linha é
// enviada — o bug de "só um pedaço" nas mensagens seguintes. O prompt do Claude
// Code sempre aceita bracketed paste, então emitir sempre é seguro.
function pasteIntoSession(sid, text) {
  const body = String(text).replace(/\r\n/g, '\n').replace(/\n/g, '\r');
  window.api.termInput(sid, '\x1b[200~' + body + '\x1b[201~');
}

const TERM_THEMES = {
  light: {
    background: '#ffffff',
    foreground: '#1f2430',
    cursor: '#2563eb',
    selectionBackground: '#cfe0ff',
    black: '#1f2430', brightBlack: '#6b7280',
    red: '#d12d36', brightRed: '#e5484d',
    green: '#15803d', brightGreen: '#1a9d4d',
    yellow: '#b45309', brightYellow: '#c2710c',
    blue: '#2563eb', brightBlue: '#3b82f6',
    magenta: '#7c3aed', brightMagenta: '#9333ea',
    cyan: '#0e7490', brightCyan: '#0891b2',
    white: '#1f2430', brightWhite: '#0b0e14',
  },
  dark: {
    background: '#0b0f17',
    foreground: '#e6e8ee',
    cursor: '#7c5cff',
    selectionBackground: '#33405e',
    black: '#1b1f28', brightBlack: '#5c6473',
    red: '#ff7a7a', brightRed: '#ff9a9a',
    green: '#34d399', brightGreen: '#52e0ad',
    yellow: '#ffce6b', brightYellow: '#ffd98a',
    blue: '#6ea8fe', brightBlue: '#8fc0ff',
    magenta: '#c7a6ff', brightMagenta: '#d6bcff',
    cyan: '#6be0d6', brightCyan: '#8aeae1',
    white: '#e6e8ee', brightWhite: '#ffffff',
  },
};

// Refaz o fit e só avisa o PTY quando a grade de caracteres realmente mudou.
// Resizes redundantes fazem o conpty reemitir a tela e duplicar conteúdo.
function syncSize(t, sessionId, resizeFn) {
  try {
    t.fit.fit();
    if (t.term.cols !== t.lastCols || t.term.rows !== t.lastRows) {
      t.lastCols = t.term.cols;
      t.lastRows = t.term.rows;
      resizeFn(sessionId, t.term.cols, t.term.rows);
    }
  } catch {}
}

// Layout salvo por projeto (só no renderer; estrutura + tamanhos das divisórias).
const LKEY = (p) => `paneLayout:v1:${p}`;
function loadLayout(projectPath) {
  try { const s = localStorage.getItem(LKEY(projectPath)); return s ? JSON.parse(s) : null; } catch { return null; }
}
function saveLayout(projectPath, tree) {
  try { localStorage.setItem(LKEY(projectPath), JSON.stringify(tree)); } catch {}
}

// Em que metade/canto o cursor está, a partir de coords relativas (0..1).
function computeZone(x, y) {
  const margin = 0.28;
  const d = { left: x, right: 1 - x, top: y, bottom: 1 - y };
  const min = Math.min(d.left, d.right, d.top, d.bottom);
  if (min > margin) return 'center';
  if (min === d.left) return 'left';
  if (min === d.right) return 'right';
  if (min === d.top) return 'top';
  return 'bottom';
}

const ZONE_STYLE = {
  center: { inset: 0 },
  left: { left: 0, top: 0, bottom: 0, width: '50%' },
  right: { right: 0, top: 0, bottom: 0, width: '50%' },
  top: { left: 0, right: 0, top: 0, height: '50%' },
  bottom: { left: 0, right: 0, bottom: 0, height: '50%' },
};

// Negrito **assim** dentro de uma linha → <strong>.
function renderInline(text) {
  return String(text).split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
    /^\*\*[^*]+\*\*$/.test(seg)
      ? <strong key={i} className="font-semibold text-foreground">{seg.slice(2, -2)}</strong>
      : <span key={i}>{seg}</span>
  );
}

// Renderizador leve de markdown pros prompts: dá ênfase (títulos coloridos, negrito,
// listas, divisória) sem depender de lib. Não é parser completo — só o pra ler melhor.
function PromptMd({ text }) {
  const lines = String(text || '').split('\n');
  return (
    <div className="text-[13px] leading-relaxed text-muted-foreground">
      {lines.map((ln, i) => {
        const t = ln.trim();
        if (!t) return <div key={i} className="h-2" />;
        if (/^#{1,6}\s/.test(t)) {
          const level = t.match(/^#+/)[0].length;
          const txt = t.replace(/^#+\s*/, '');
          return <div key={i} className={cn('mt-2 font-semibold', level <= 1 ? 'text-[15px] text-foreground' : level === 2 ? 'text-[14px] text-foreground' : 'text-[13px] text-primary')}>{renderInline(txt)}</div>;
        }
        if (/^[-*]\s/.test(t)) return <div key={i} className="flex gap-1.5 pl-1"><span className="text-primary">•</span><span>{renderInline(t.replace(/^[-*]\s*/, ''))}</span></div>;
        if (/^\d+\.\s/.test(t)) { const m = t.match(/^(\d+)\.\s*(.*)/); return <div key={i} className="flex gap-1.5 pl-1"><span className="shrink-0 text-primary tabular-nums">{m[1]}.</span><span>{renderInline(m[2])}</span></div>; }
        if (/^(---+|\*\*\*+)$/.test(t)) return <hr key={i} className="my-2.5 border-border" />;
        return <div key={i} className="mt-0.5">{renderInline(t)}</div>;
      })}
    </div>
  );
}

// Biblioteca de prompts reutilizáveis (por projeto). O botão fica na barra de abas do
// chat; clicar num prompt INJETA o texto no terminal da sessão ativa (sem Enter), pra
// você revisar e enviar. Salva/edita/remove na lista persistida em .carcara/prompts.json.
function PromptMenu({ projectPath, sessionId, onInsert }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState({ title: '', body: '' });
  const [editingId, setEditingId] = useState(null);
  const [llmTitle, setLlmTitle] = useState(false); // IA pode gerar título do prompt?
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null); // prompt aguardando confirmação de remoção
  const [viewing, setViewing] = useState(null); // prompt aberto pra leitura (markdown destacado)
  const btnRef = useRef(null);

  const load = async () => {
    const r = await window.api.promptsList(projectPath);
    setItems(r && r.ok ? r.items : []);
    try {
      const [c, s] = await Promise.all([window.api.llmGetConfig(), window.api.llmStatus()]);
      setLlmTitle(!!c?.enabled && !!c?.features?.promptTitle && !!s?.installed);
    } catch { /* IA desligada/indisponível: segue com o fallback de hoje */ }
  };
  const persist = (list) => { setItems(list); window.api.promptsSave(projectPath, list); };

  const openMenu = () => {
    setDraft({ title: '', body: '' });
    setEditingId(null);
    setConfirmDel(null);
    setViewing(null);
    setOpen(true);
    load();
  };
  const newPrompt = () => { setViewing(null); setEditingId(null); setDraft({ title: '', body: '' }); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') { if (confirmDel) setConfirmDel(null); else setOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, confirmDel]);

  const insert = (p) => {
    if (sessionId && p.body) onInsert?.(sessionId, p.body);
    setOpen(false);
  };
  const submit = async () => {
    const typed = draft.title.trim();
    const body = draft.body.trim();
    if (!body || saving) return;
    // Sem título e IA ligada: gera um título curto do corpo (cai no fallback se falhar).
    let title = typed;
    if (!title && llmTitle) {
      setSaving(true);
      try { const r = await window.api.llmGenerate('promptTitle', body); if (r?.ok && r.text) title = r.text; } catch { /* fallback */ }
      setSaving(false);
    }
    if (!title) title = body.slice(0, 40);
    if (editingId) {
      persist(items.map((p) => (p.id === editingId ? { ...p, title, body } : p)));
    } else {
      persist([...items, { id: crypto.randomUUID(), title, body }]);
    }
    setDraft({ title: '', body: '' });
    setEditingId(null);
  };
  const edit = (p) => { setViewing(null); setEditingId(p.id); setDraft({ title: p.title, body: p.body }); };
  const remove = (p) => {
    persist(items.filter((x) => x.id !== p.id));
    if (editingId === p.id) { setEditingId(null); setDraft({ title: '', body: '' }); }
    setConfirmDel(null);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        title="Biblioteca de prompts"
        className="grid size-7 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-[15px]"
      >
        <Library />
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6"
          onMouseDown={() => setOpen(false)}>
          <div
            className="flex h-[80vh] w-[80vw] max-w-[1000px] flex-col overflow-hidden rounded-xl border bg-background text-foreground shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho */}
            <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
              <Library className="size-4 text-muted-foreground" />
              <span className="text-[14px] font-semibold">Biblioteca de prompts</span>
              <span className="text-[12px] text-muted-foreground">· clique num prompt para ler; insira pelo botão</span>
              <div className="flex-1" />
              <button type="button" onClick={() => setOpen(false)} title="Fechar (Esc)"
                className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-[18px]">
                <X />
              </button>
            </div>

            <div className="flex min-h-0 flex-1">
              {/* Lista (esquerda) */}
              <div className="flex w-[42%] min-w-0 flex-col border-r">
                <div className="flex shrink-0 items-center justify-between px-3 pt-3">
                  <span className="text-[12px] font-medium text-muted-foreground">{items.length} prompt{items.length === 1 ? '' : 's'}</span>
                  <button type="button" onClick={newPrompt}
                    className={cn('flex h-7 items-center gap-1 rounded-md px-2 text-[12.5px] font-medium transition-colors',
                      !viewing && editingId === null ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted')}>
                    <Plus className="size-3.5" /> Novo
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {items.length === 0 ? (
                    <p className="px-2 py-8 text-center text-[13px] text-muted-foreground">Nenhum prompt salvo ainda.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {items.map((p) => (
                        <button key={p.id} type="button" onClick={() => setViewing(p)}
                          className={cn('group w-full rounded-lg border p-3 text-left transition-colors hover:border-primary/50',
                            (viewing?.id === p.id || editingId === p.id) && 'border-primary ring-1 ring-primary')}>
                          <div className="flex items-start gap-2">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-medium">{p.title}</span>
                              <span className="mt-0.5 break-words text-[12px] leading-relaxed text-muted-foreground line-clamp-3">{p.body}</span>
                            </span>
                            <span className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                              <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); edit(p); }} title="Editar"
                                className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-3.5">
                                <Pencil />
                              </span>
                              <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setConfirmDel(p); }} title="Remover"
                                className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive [&_svg]:size-3.5">
                                <Trash2 />
                              </span>
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Painel direito: leitura (markdown destacado) OU editor */}
              {viewing && editingId === null ? (
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{viewing.title}</span>
                    <button type="button" onClick={() => insert(viewing)} disabled={!sessionId}
                      className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 [&_svg]:size-3.5">
                      <ArrowUpLeft /> Inserir no chat
                    </button>
                    <button type="button" onClick={() => edit(viewing)} title="Editar"
                      className="grid size-8 place-items-center rounded-md border text-muted-foreground hover:bg-muted [&_svg]:size-4"><Pencil /></button>
                    <button type="button" onClick={() => setConfirmDel(viewing)} title="Remover"
                      className="grid size-8 place-items-center rounded-md border text-muted-foreground hover:bg-destructive/10 hover:text-destructive [&_svg]:size-4"><Trash2 /></button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-5">
                    <PromptMd text={viewing.body} />
                  </div>
                </div>
              ) : (
                <div className="flex min-w-0 flex-1 flex-col p-4">
                  <div className="mb-2 text-[13px] font-medium">{editingId ? 'Editar prompt' : 'Novo prompt'}</div>
                  <input
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    placeholder="Título (opcional — a IA pode gerar)"
                    className="mb-2 h-9 w-full rounded-md border bg-card px-3 text-[13px] outline-none focus:border-primary"
                  />
                  <textarea
                    value={draft.body}
                    onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                    placeholder="Prompt — ex.: rode os testes e corrija o que quebrar"
                    className="min-h-0 w-full flex-1 resize-none rounded-md border bg-card px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-primary"
                  />
                  <div className="mt-3 flex justify-end gap-2">
                    {editingId && (
                      <button type="button" onClick={() => { setEditingId(null); setDraft({ title: '', body: '' }); }}
                        className="h-9 rounded-md px-3 text-[13px] text-muted-foreground hover:bg-muted">
                        Cancelar edição
                      </button>
                    )}
                    <button type="button" onClick={submit} disabled={!draft.body.trim() || saving}
                      className="h-9 rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40">
                      {saving ? 'Gerando título…' : editingId ? 'Salvar' : 'Adicionar'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Confirmação de remoção */}
            {confirmDel && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40" onMouseDown={() => setConfirmDel(null)}>
                <div className="w-[360px] max-w-[90%] rounded-xl border bg-background p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
                  <h2 className="text-[15px] font-semibold">Remover prompt</h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                    Remover <span className="font-medium text-foreground">“{confirmDel.title}”</span>? Esta ação não pode ser desfeita.
                  </p>
                  <div className="mt-5 flex justify-end gap-2">
                    <button type="button" onClick={() => setConfirmDel(null)}
                      className="h-9 rounded-md px-3 text-[13px] text-muted-foreground hover:bg-muted">Cancelar</button>
                    <button type="button" onClick={() => remove(confirmDel)}
                      className="h-9 rounded-md bg-destructive px-4 text-[13px] font-medium text-destructive-foreground hover:opacity-90">Remover</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Bolinha de atividade do Claude DENTRO da aba da sessão. Âmbar pulsando = trabalhando;
// âmbar com halo = pediu uma confirmação (sua vez); âmbar fixo = terminou o turno.
function SessionActivityDot({ state }) {
  if (!state) return null;
  const title = state === 'working' ? 'Claude trabalhando…'
    : state === 'asking' ? 'Claude pediu uma confirmação'
    : 'Claude aguardando você';
  return (
    <span className="relative flex h-2 w-2 shrink-0" title={title}>
      {state === 'asking' && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
      )}
      <span className={cn(
        'relative inline-flex h-2 w-2 rounded-full bg-amber-500',
        state === 'working' && 'animate-pulse'
      )} />
    </span>
  );
}

export function ChatPanel({ activeProject, controlsRef }) {
  const { terminalTheme } = useTheme();
  const themeRef = useRef(terminalTheme);
  const hostRef = useRef(null);
  const termsRef = useRef(new Map());      // sessionId -> { term, fit, el, lastCols, lastRows }
  const paneRefs = useRef(new Map());      // paneId -> elemento de conteúdo do pane

  const [sessions, setSessions] = useState([]); // todas as sessões do projeto: [{ id, name }]
  // Atividade do Claude POR SESSÃO: sessionId -> 'working' | 'asking' | 'attention'.
  // É o detalhe fino (qual aba) que o rail (agregado por projeto) não mostra.
  const [sessionActivity, setSessionActivity] = useState({});
  const [layout, setLayout] = useState(null);   // árvore de painéis do projeto ativo
  const layoutRef = useRef(null);
  const [focusedPane, setFocusedPane] = useState(null);
  const focusedPaneRef = useRef(null);
  focusedPaneRef.current = focusedPane;

  // Estado do arrastar de abas.
  const [dragSid, setDragSid] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // { paneId, zone }
  const dragRef = useRef(null);

  const projectRef = useRef(activeProject);
  projectRef.current = activeProject;

  const sessionNames = new Map(sessions.map((s) => [s.id, s.name]));
  const canClose = sessions.length > 1;

  const saveTimer = useRef(0);
  const scheduleSave = () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (projectRef.current && layoutRef.current) saveLayout(projectRef.current, layoutRef.current);
    }, 300);
  };

  const commitLayout = (next) => {
    layoutRef.current = next;
    setLayout(next);
    if (projectRef.current) saveLayout(projectRef.current, next);
  };

  const refitTimer = useRef(0);
  const refitAll = () => {
    for (const [sid, te] of termsRef.current) {
      if (te.el.isConnected && te.el.style.display !== 'none') syncSize(te, sid, window.api.termResize);
    }
  };
  const scheduleRefit = () => {
    cancelAnimationFrame(refitTimer.current);
    refitTimer.current = requestAnimationFrame(refitAll);
  };

  // Troca o tema de todos os terminais já abertos quando muda claro/escuro.
  useEffect(() => {
    themeRef.current = terminalTheme;
    for (const [, t] of termsRef.current) t.term.options.theme = TERM_THEMES[terminalTheme];
    window.api.applyClaudeTheme(terminalTheme);
  }, [terminalTheme]);

  // Listeners de IPC (uma vez só) — roteados por sessionId.
  useEffect(() => {
    window.api.on('term:data', ({ sessionId, data }) => {
      const t = termsRef.current.get(sessionId);
      if (t) t.term.write(data);
    });
    window.api.on('term:exit', ({ sessionId }) => {
      const t = termsRef.current.get(sessionId);
      if (t) t.term.write('\r\n\x1b[90m[sessão encerrada]\x1b[0m\r\n');
    });
    // Mesmo evento que o App consome pro rail, mas aqui guardamos por sessionId pra
    // pintar a bolinha na aba certa. 'done' vira 'asking' (pediu confirmação) ou
    // 'attention' (terminou); 'working' enquanto roda; idle/exit limpa.
    window.api.on('activity:state', ({ sessionId, state, asking }) => {
      setSessionActivity((cur) => {
        const next = { ...cur };
        if (state === 'working') next[sessionId] = 'working';
        else if (state === 'done') next[sessionId] = asking ? 'asking' : 'attention';
        else delete next[sessionId];
        return next;
      });
    });
  }, []);

  // Ao trocar de projeto: carrega sessões + restaura/reconcilia o layout salvo.
  useEffect(() => {
    if (!activeProject) { setSessions([]); setLayout(null); layoutRef.current = null; setFocusedPane(null); return; }
    let cancelled = false;
    (async () => {
      let list = await window.api.sessionsList(activeProject);
      if (!list || list.length === 0) {
        const s = await window.api.sessionsCreate(activeProject);
        list = [s];
      }
      if (cancelled) return;
      setSessions(list);
      const ids = list.map((s) => s.id);
      const tree = reconcile(loadLayout(activeProject), ids, ids[0]);
      layoutRef.current = tree;
      setLayout(tree);
      saveLayout(activeProject, tree);
      setFocusedPane(firstPane(tree)?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, [activeProject]);

  // Cria o terminal (xterm) de uma sessão dentro de um container de pane.
  const createTerm = (sessionId, container) => {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.padding = '8px 4px 8px 10px';
    container.appendChild(el);

    const term = new Terminal({
      fontSize: 13,
      fontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace',
      theme: TERM_THEMES[themeRef.current],
      cursorBlink: true,
      scrollback: 5000,
      // Texto "esmaecido" (faint/dim) que a CLI usa some no fundo branco — o xterm
      // mistura a cor com o fundo. Isto força um contraste mínimo legível sempre.
      minimumContrastRatio: 4.5,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);

    // Copiar/colar na sessão do Claude. Ctrl/Cmd+C copia a seleção quando há
    // texto selecionado; sem seleção, deixa virar SIGINT (a CLI trata). Ctrl+Shift+C
    // sempre copia. A COLAGEM é tratada no listener de 'paste' abaixo (não aqui): aqui
    // só retornamos false no Ctrl/Cmd+V pra bloquear o \x16, sem disparar a colagem —
    // se colássemos aqui E no evento 'paste', o texto iria duplicado ("a" → "aa").
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return true;
      const k = e.key.toLowerCase();
      if (k === 'c') {
        const sel = term.getSelection();
        if (sel && !e.shiftKey) { window.api.copyText(sel); term.clearSelection(); return false; }
        if (sel && e.shiftKey) { window.api.copyText(sel); return false; }
        return true; // sem seleção: Ctrl+C normal (SIGINT)
      }
      if (k === 'v') return false; // a colagem vai pelo evento 'paste' (evita duplicar)
      return true;
    });

    term.open(el);

    // Colagem por NOSSA conta, fonte única. O xterm tem um handler nativo de 'paste' na
    // textarea; se ele rodar junto com o nosso, o texto cola DUAS vezes. Interceptamos o
    // evento na fase de CAPTURA no container (antes de descer pra textarea do xterm),
    // cancelamos o nativo e colamos uma vez só via pasteIntoSession (bracketed paste
    // garantido — multi-linha intacto). Pega Ctrl/Cmd+V e o paste do botão direito.
    el.addEventListener('paste', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = e.clipboardData?.getData('text');
      if (text) pasteIntoSession(sessionId, text);
      else window.api.readText().then((r) => { if (r && r.text) pasteIntoSession(sessionId, r.text); });
    }, true);
    // Renderizador WebGL: pinta o terminal num único canvas de GPU e repinta a
    // cada frame ao rolar, eliminando os glitches de "tinta velha". Se o contexto
    // WebGL cair, descarta o addon e volta pro DOM sozinho.
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => { try { webgl.dispose(); } catch {} });
      term.loadAddon(webgl);
    } catch {}
    term.onData((d) => window.api.termInput(sessionId, d));

    const t = { term, fit, el, lastCols: 0, lastRows: 0 };
    termsRef.current.set(sessionId, t);

    // Mede só depois do layout assentar e SÓ então cria o PTY no tamanho final.
    requestAnimationFrame(() => {
      fit.fit();
      t.lastCols = term.cols;
      t.lastRows = term.rows;
      window.api.termEnsure(sessionId, projectRef.current, term.cols, term.rows, themeRef.current).then((res) => {
        if (res && res.error) term.write('\r\n\x1b[31m[' + res.error + ']\x1b[0m\r\n');
        else if (res && res.buffer) term.write(res.buffer);
      });
      term.focus();
    });
    return t;
  };

  // Posiciona cada terminal no container do seu pane e mostra só a aba ativa.
  // Reparentear (appendChild) move o nó sem destruir o xterm — a sessão segue viva.
  useEffect(() => {
    if (!activeProject || !layout) return;
    for (const p of allPanes(layout)) {
      const container = paneRefs.current.get(p.id);
      if (!container) continue;
      for (const sid of p.tabs) {
        const isActive = sid === p.active;
        let te = termsRef.current.get(sid);
        if (!te && isActive) te = createTerm(sid, container);
        if (!te) continue;
        if (te.el.parentNode !== container) container.appendChild(te.el);
        te.el.style.display = isActive ? 'block' : 'none';
      }
    }
    scheduleRefit();
  }, [layout, activeProject]);

  // Reajusta os terminais visíveis quando o painel inteiro muda de tamanho.
  useEffect(() => {
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(refitAll);
    });
    if (hostRef.current) ro.observe(hostRef.current);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  const focusSession = (sid) => {
    const te = termsRef.current.get(sid);
    if (te) requestAnimationFrame(() => { try { te.term.focus(); } catch {} });
  };

  // Insere texto na sessão via bracketed paste (ver pasteIntoSession): texto
  // multi-linha vai inteiro pro input da TUI sem cada \n virar Enter.
  const insertText = (sid, text) => {
    pasteIntoSession(sid, text);
    const te = termsRef.current.get(sid);
    if (te) requestAnimationFrame(() => { try { te.term.focus(); } catch {} });
  };

  const addSession = async (paneId) => {
    if (!activeProject) return;
    const s = await window.api.sessionsCreate(activeProject);
    setSessions((cur) => [...cur, s]);
    commitLayout(addSessionToPane(layoutRef.current, paneId, s.id));
    setFocusedPane(paneId);
    focusSession(s.id);
  };

  // Nova sessão a partir da paleta de comandos: cai no pane em foco (ou no primeiro).
  if (controlsRef) {
    controlsRef.current = {
      newSession: () => {
        const pane = focusedPaneRef.current || firstPane(layoutRef.current)?.id;
        if (pane) addSession(pane);
      },
    };
  }

  const onTabClick = (paneId, sid) => {
    commitLayout(setActiveInPane(layoutRef.current, paneId, sid));
    setFocusedPane(paneId);
    focusSession(sid);
  };

  const closeSession = async (e, sessionId) => {
    e.stopPropagation();
    if (!activeProject || sessions.length <= 1) return;
    await window.api.sessionsClose(activeProject, sessionId);
    const t = termsRef.current.get(sessionId);
    if (t) { try { t.term.dispose(); } catch {} t.el.remove(); termsRef.current.delete(sessionId); }
    setSessions((cur) => cur.filter((s) => s.id !== sessionId));
    commitLayout(closeSessionInTree(layoutRef.current, sessionId));
  };

  // --- Arrastar e soltar abas ---
  const onTabDragStart = (paneId, sid, e) => {
    dragRef.current = { sid, from: paneId };
    setDragSid(sid);
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', sid); } catch {}
  };
  const endDrag = () => { dragRef.current = null; setDragSid(null); setDropTarget(null); };

  const onZoneDragOver = (paneId, e) => {
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch {}
    const r = e.currentTarget.getBoundingClientRect();
    const zone = computeZone((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    setDropTarget((prev) => (prev && prev.paneId === paneId && prev.zone === zone ? prev : { paneId, zone }));
  };

  const onDrop = (paneId, zone, e) => {
    e.preventDefault();
    const d = dragRef.current;
    endDrag();
    if (!d) return;
    commitLayout(applyDrop(layoutRef.current, paneId, zone, d.sid));
    setFocusedPane(paneId);
    focusSession(d.sid);
  };

  const onSplitLayout = (node, sizes) => {
    node.sizes = sizes; // mutação direta: tamanho é "não controlado", não precisa re-render
    scheduleSave();
    scheduleRefit();
  };

  // Callback ref: registra/limpa o container de cada pane.
  const setPaneRef = (id) => (el) => {
    if (el) paneRefs.current.set(id, el);
    else paneRefs.current.delete(id);
  };

  const multi = layout ? paneCount(layout) > 1 : false;

  const renderPane = (p) => {
    const isFocused = multi && p.id === focusedPane;
    return (
      <div
        key={p.id}
        onMouseDown={() => setFocusedPane(p.id)}
        className={'flex h-full flex-col overflow-hidden ' + (isFocused ? 'ring-1 ring-inset ring-primary/40' : '')}
      >
        <div
          className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b bg-card px-1.5"
          onDragOver={dragSid ? (e) => { e.preventDefault(); setDropTarget({ paneId: p.id, zone: 'center' }); } : undefined}
          onDrop={dragSid ? (e) => onDrop(p.id, 'center', e) : undefined}
        >
          {p.tabs.map((sid) => {
            const isActive = sid === p.active;
            return (
              <div
                key={sid}
                draggable
                onDragStart={(e) => onTabDragStart(p.id, sid, e)}
                onDragEnd={endDrag}
                onClick={() => onTabClick(p.id, sid)}
                className={
                  'group flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded px-2.5 text-[13px] transition-colors ' +
                  (isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60')
                }
              >
                <span>{sessionNames.get(sid) || 'Sessão'}</span>
                <SessionActivityDot state={sessionActivity[sid]} />
                {canClose && (
                  <button
                    type="button"
                    onClick={(e) => closeSession(e, sid)}
                    title="Fechar sessão"
                    className="grid size-4 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 hover:text-foreground group-hover:opacity-100 [&_svg]:size-3"
                  >
                    <X />
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => addSession(p.id)}
            title="Nova sessão do Claude Code"
            className="grid size-7 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-[15px]"
          >
            <Plus />
          </button>
          <div className="ml-auto shrink-0">
            <PromptMenu projectPath={activeProject} sessionId={p.active} onInsert={insertText} />
          </div>
        </div>

        <div ref={setPaneRef(p.id)} className="relative flex-1 overflow-hidden">
          {dragSid && (
            <div
              className="absolute inset-0 z-20"
              onDragOver={(e) => onZoneDragOver(p.id, e)}
              onDrop={(e) => onDrop(p.id, dropTarget?.paneId === p.id ? dropTarget.zone : 'center', e)}
            >
              {dropTarget?.paneId === p.id && (
                <div
                  className="pointer-events-none absolute rounded-sm border-2 border-primary bg-primary/20 transition-all duration-100"
                  style={ZONE_STYLE[dropTarget.zone]}
                />
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderNode = (node) => {
    if (isPane(node)) return renderPane(node);
    return (
      <ResizablePanelGroup
        key={node.id}
        direction={node.dir === 'row' ? 'horizontal' : 'vertical'}
        onLayout={(sizes) => onSplitLayout(node, sizes)}
      >
        <ResizablePanel defaultSize={node.sizes?.[0] ?? 50} minSize={15}>
          {renderNode(node.children[0])}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={node.sizes?.[1] ?? 50} minSize={15}>
          {renderNode(node.children[1])}
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: terminalTheme === 'dark' ? '#0b0f17' : '#ffffff' }}>
      <div ref={hostRef} className="relative flex-1 overflow-hidden">
        {!activeProject && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-muted-foreground">
            Clique num projeto pra abrir o Claude Code aqui.
          </div>
        )}
        {activeProject && layout && renderNode(layout)}
      </div>
    </div>
  );
}
