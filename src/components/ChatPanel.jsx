import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import {
  Plus,
  X,
  Library,
  Pencil,
  Trash2,
  ArrowUpLeft,
  Search,
  Star,
  CornerDownLeft,
} from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { useTheme } from '@/lib/theme.jsx';
import { useT } from '@/lib/i18n';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './ui/resizable.jsx';
import {
  isPane,
  firstPane,
  allPanes,
  paneCount,
  findPane,
  applyDrop,
  addSessionToPane,
  setActiveInPane,
  closeSessionInTree,
  reconcile,
} from '@/lib/paneLayout.js';
import { cn } from '@/lib/utils';
import { computeZone, ZONE_STYLE } from '@/lib/dropZones.js';
import { AiPicker } from './AiPicker.jsx';
import { MOVE_MIME, hasExternalFiles, dropPathsText } from '@/lib/dragPaths.js';
import { useChatMode } from '@/lib/chatModeContext.jsx';
import { AssistantChat } from './AssistantChat.jsx';

// IAs com adapter de chat na ponte (chat-cli.cjs). As demais seguem no terminal xterm.
const CHAT_CLIS = ['claude', 'codex', 'agy'];

// Preview de markdown completo (react-markdown + GFM + highlight.js), carregado
// sob demanda pra ficar fora do bundle de boot. Enquanto baixa, cai no PromptMd leve.
const Markdown = lazy(() => import('./Markdown.jsx'));

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
    black: '#1f2430',
    brightBlack: '#6b7280',
    red: '#d12d36',
    brightRed: '#e5484d',
    green: '#15803d',
    brightGreen: '#1a9d4d',
    yellow: '#b45309',
    brightYellow: '#c2710c',
    blue: '#2563eb',
    brightBlue: '#3b82f6',
    magenta: '#7c3aed',
    brightMagenta: '#9333ea',
    cyan: '#0e7490',
    brightCyan: '#0891b2',
    white: '#1f2430',
    brightWhite: '#0b0e14',
  },
  dark: {
    background: '#0b0f17',
    foreground: '#e6e8ee',
    cursor: '#7c5cff',
    selectionBackground: '#33405e',
    black: '#1b1f28',
    brightBlack: '#5c6473',
    red: '#ff7a7a',
    brightRed: '#ff9a9a',
    green: '#34d399',
    brightGreen: '#52e0ad',
    yellow: '#ffce6b',
    brightYellow: '#ffd98a',
    blue: '#6ea8fe',
    brightBlue: '#8fc0ff',
    magenta: '#c7a6ff',
    brightMagenta: '#d6bcff',
    cyan: '#6be0d6',
    brightCyan: '#8aeae1',
    white: '#e6e8ee',
    brightWhite: '#ffffff',
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
  try {
    const s = localStorage.getItem(LKEY(projectPath));
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
function saveLayout(projectPath, tree) {
  try {
    localStorage.setItem(LKEY(projectPath), JSON.stringify(tree));
  } catch {}
}

// Negrito **assim** dentro de uma linha → <strong>.
function renderInline(text) {
  return String(text)
    .split(/(\*\*[^*]+\*\*)/g)
    .map((seg, i) =>
      /^\*\*[^*]+\*\*$/.test(seg) ? (
        <strong key={i} className="font-semibold text-foreground">
          {seg.slice(2, -2)}
        </strong>
      ) : (
        <span key={i}>{seg}</span>
      ),
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
          return (
            <div
              key={i}
              className={cn(
                'mt-2 font-semibold',
                level <= 1
                  ? 'text-[15px] text-foreground'
                  : level === 2
                    ? 'text-[14px] text-foreground'
                    : 'text-[13px] text-primary',
              )}
            >
              {renderInline(txt)}
            </div>
          );
        }
        if (/^[-*]\s/.test(t))
          return (
            <div key={i} className="flex gap-1.5 pl-1">
              <span className="text-primary">•</span>
              <span>{renderInline(t.replace(/^[-*]\s*/, ''))}</span>
            </div>
          );
        if (/^\d+\.\s/.test(t)) {
          const m = t.match(/^(\d+)\.\s*(.*)/);
          return (
            <div key={i} className="flex gap-1.5 pl-1">
              <span className="shrink-0 text-primary tabular-nums">{m[1]}.</span>
              <span>{renderInline(m[2])}</span>
            </div>
          );
        }
        if (/^(---+|\*\*\*+)$/.test(t)) return <hr key={i} className="my-2.5 border-border" />;
        return (
          <div key={i} className="mt-0.5">
            {renderInline(t)}
          </div>
        );
      })}
    </div>
  );
}

// Biblioteca de prompts reutilizáveis (por projeto). O botão fica na barra de abas do
// chat; clicar num prompt INJETA o texto no terminal da sessão ativa (sem Enter), pra
// você revisar e enviar. Salva/edita/remove na lista persistida em .carcara/prompts.json.
function PromptMenu({ projectPath, sessionId, onInsert }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState({ title: '', body: '' });
  const [editingId, setEditingId] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null); // prompt aguardando confirmação de remoção
  const [viewing, setViewing] = useState(null); // prompt aberto pra leitura (markdown destacado)
  const [query, setQuery] = useState(''); // busca na lista
  const [mode, setMode] = useState('picker'); // 'picker' (seleção rápida Ctrl+K) | 'manage' (edição)
  const [sel, setSel] = useState(0); // item ativo no seletor rápido
  const pickerInputRef = useRef(null);
  const btnRef = useRef(null);

  const load = async () => {
    const r = await window.api.promptsList(projectPath);
    // Backfill: prompts antigos sem createdAt recebem um valor crescente pela ordem
    // (último = mais novo), pra a ordenação "mais novo em cima" funcionar pra todos.
    const list = (r && r.ok ? r.items : []).map((p, i) => ({
      ...p,
      createdAt: p.createdAt ?? i + 1,
    }));
    setItems(list);
  };
  const persist = (list) => {
    setItems(list);
    window.api.promptsSave(projectPath, list);
  };

  const openMenu = () => {
    setDraft({ title: '', body: '' });
    setEditingId(null);
    setConfirmDel(null);
    setViewing(null);
    setQuery('');
    setMode('picker');
    setSel(0);
    setOpen(true);
    load();
  };
  const newPrompt = () => {
    setViewing(null);
    setEditingId(null);
    setDraft({ title: '', body: '' });
  };
  const toggleFav = (p) => {
    const next = items.map((x) => (x.id === p.id ? { ...x, fav: !x.fav } : x));
    persist(next);
    if (viewing?.id === p.id) setViewing(next.find((x) => x.id === p.id));
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (confirmDel) setConfirmDel(null);
        else setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, confirmDel]);

  // Foca o campo do seletor rápido ao abrir/voltar pra ele.
  useEffect(() => {
    if (!open || mode !== 'picker') return;
    setSel(0);
    const id = requestAnimationFrame(() => pickerInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, mode]);

  const insert = (p) => {
    if (sessionId && p.body) onInsert?.(sessionId, p.body);
    setOpen(false);
  };
  const submit = async () => {
    const typed = draft.title.trim();
    const body = draft.body.trim();
    if (!body) return;
    // Sem título? Usa o começo do corpo como título.
    let title = typed || body.slice(0, 40);
    if (editingId) {
      persist(items.map((p) => (p.id === editingId ? { ...p, title, body } : p)));
    } else {
      persist([
        ...items,
        { id: crypto.randomUUID(), title, body, createdAt: Date.now(), fav: false },
      ]);
    }
    setDraft({ title: '', body: '' });
    setEditingId(null);
  };
  const edit = (p) => {
    setViewing(null);
    setEditingId(p.id);
    setDraft({ title: p.title, body: p.body });
  };
  const remove = (p) => {
    persist(items.filter((x) => x.id !== p.id));
    if (editingId === p.id) {
      setEditingId(null);
      setDraft({ title: '', body: '' });
    }
    setConfirmDel(null);
  };

  // Favoritos no topo, depois mais novos primeiro; filtrados pela busca (título + corpo).
  const q = query.trim().toLowerCase();
  const visibleItems = items
    .filter((p) => !q || (String(p.title) + ' ' + String(p.body)).toLowerCase().includes(q))
    .sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || (b.createdAt || 0) - (a.createdAt || 0));

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        title={t('prompts.library_title')}
        className="grid size-7 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-[15px]"
      >
        <Library />
      </button>
      {open && mode === 'manage' && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6"
          onMouseDown={() => setOpen(false)}
        >
          <div
            className="flex h-[80vh] w-[80vw] max-w-[1000px] flex-col overflow-hidden rounded-xl border bg-background text-foreground shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho */}
            <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
              <button
                type="button"
                onClick={() => setMode('picker')}
                title={t('prompts.back_to_selection')}
                className="flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-4"
              >
                <ArrowUpLeft /> {t('prompts.back_to_selection')}
              </button>
              <span className="text-[14px] font-semibold">{t('prompts.manage_title')}</span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                title={t('prompts.close')}
                className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-[18px]"
              >
                <X />
              </button>
            </div>

            <div className="flex min-h-0 flex-1">
              {/* Lista (esquerda) */}
              <div className="flex w-[42%] min-w-0 flex-col border-r">
                {/* Busca */}
                <div className="shrink-0 px-3 pt-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t('prompts.search_placeholder')}
                      className="h-8 w-full rounded-md border bg-card pl-8 pr-2 text-[12.5px] outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="flex shrink-0 items-center justify-between px-3 pt-2">
                  <span className="text-[12px] font-medium text-muted-foreground">
                    {q
                      ? `${visibleItems.length} de ${items.length}`
                      : `${items.length} ${items.length === 1 ? t('prompts.count_single') : t('prompts.count_plural')}`}
                  </span>
                  <button
                    type="button"
                    onClick={newPrompt}
                    className={cn(
                      'flex h-7 items-center gap-1 rounded-md px-2 text-[12.5px] font-medium transition-colors',
                      !viewing && editingId === null
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <Plus className="size-3.5" /> {t('prompts.new')}
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {items.length === 0 ? (
                    <p className="px-2 py-8 text-center text-[13px] text-muted-foreground">
                      {t('prompts.empty')}
                    </p>
                  ) : visibleItems.length === 0 ? (
                    <p className="px-2 py-8 text-center text-[13px] text-muted-foreground">
                      {t('prompts.no_results', { query })}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {visibleItems.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setViewing(p)}
                          className={cn(
                            'group w-full rounded-lg border p-3 text-left transition-colors hover:border-primary/50',
                            (viewing?.id === p.id || editingId === p.id) &&
                              'border-primary ring-1 ring-primary',
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFav(p);
                              }}
                              title={p.fav ? t('prompts.unpin') : t('prompts.pin')}
                              className={cn(
                                'mt-0.5 grid size-6 shrink-0 place-items-center rounded [&_svg]:size-4',
                                p.fav
                                  ? 'text-amber-500'
                                  : 'text-muted-foreground opacity-0 hover:text-amber-500 group-hover:opacity-100',
                              )}
                            >
                              <Star className={p.fav ? 'fill-amber-500' : ''} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-medium">
                                {p.title}
                              </span>
                              <span className="mt-0.5 break-words text-[12px] leading-relaxed text-muted-foreground line-clamp-3">
                                {p.body}
                              </span>
                            </span>
                            <span className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  edit(p);
                                }}
                                title={t('prompts.edit')}
                                className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-3.5"
                              >
                                <Pencil />
                              </span>
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDel(p);
                                }}
                                title={t('prompts.remove')}
                                className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive [&_svg]:size-3.5"
                              >
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
                    <button
                      type="button"
                      onClick={() => toggleFav(viewing)}
                      title={viewing.fav ? t('prompts.unpin') : t('prompts.pin')}
                      className={cn(
                        'grid size-8 shrink-0 place-items-center rounded-md border [&_svg]:size-4',
                        viewing.fav ? 'text-amber-500' : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <Star className={viewing.fav ? 'fill-amber-500' : ''} />
                    </button>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                      {viewing.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => insert(viewing)}
                      disabled={!sessionId}
                      className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 [&_svg]:size-3.5"
                    >
                      <ArrowUpLeft /> {t('prompts.insert')}
                    </button>
                    <button
                      type="button"
                      onClick={() => edit(viewing)}
                      title={t('prompts.edit')}
                      className="grid size-8 place-items-center rounded-md border text-muted-foreground hover:bg-muted [&_svg]:size-4"
                    >
                      <Pencil />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDel(viewing)}
                      title={t('prompts.remove')}
                      className="grid size-8 place-items-center rounded-md border text-muted-foreground hover:bg-destructive/10 hover:text-destructive [&_svg]:size-4"
                    >
                      <Trash2 />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-5">
                    <Suspense fallback={<PromptMd text={viewing.body} />}>
                      <Markdown text={viewing.body} />
                    </Suspense>
                  </div>
                </div>
              ) : (
                <div className="flex min-w-0 flex-1 flex-col p-4">
                  <div className="mb-2 text-[13px] font-medium">
                    {editingId ? t('prompts.editor_title_edit') : t('prompts.editor_title_new')}
                  </div>
                  <input
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    placeholder={t('prompts.editor_title_placeholder')}
                    className="mb-2 h-9 w-full rounded-md border bg-card px-3 text-[13px] outline-none focus:border-primary"
                  />
                  <textarea
                    value={draft.body}
                    onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                    placeholder={t('prompts.editor_body_placeholder')}
                    className="min-h-0 w-full flex-1 resize-none rounded-md border bg-card px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-primary"
                  />
                  <div className="mt-3 flex justify-end gap-2">
                    {editingId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setDraft({ title: '', body: '' });
                        }}
                        className="h-9 rounded-md px-3 text-[13px] text-muted-foreground hover:bg-muted"
                      >
                        {t('prompts.editor_cancel')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={submit}
                      disabled={!draft.body.trim()}
                      className="h-9 rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      {editingId ? t('prompts.editor_save') : t('prompts.editor_add')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Confirmação de remoção */}
            {confirmDel && (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center bg-black/40"
                onMouseDown={() => setConfirmDel(null)}
              >
                <div
                  className="w-[360px] max-w-[90%] rounded-xl border bg-background p-5 shadow-2xl"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <h2 className="text-[15px] font-semibold">{t('prompts.confirm_title')}</h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                    {t('prompts.confirm_message', { title: confirmDel.title })}
                  </p>
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDel(null)}
                      className="h-9 rounded-md px-3 text-[13px] text-muted-foreground hover:bg-muted"
                    >
                      {t('prompts.confirm_cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(confirmDel)}
                      className="h-9 rounded-md bg-destructive px-4 text-[13px] font-medium text-destructive-foreground hover:opacity-90"
                    >
                      {t('prompts.confirm_delete')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Seletor rápido (estilo Ctrl+K): digita e Enter pra inserir; botão pra gerenciar */}
      {open && mode === 'picker' && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 pt-[12vh] backdrop-blur-[1px]"
          onMouseDown={() => setOpen(false)}
        >
          <div
            className="flex max-h-[70vh] w-[560px] max-w-[92vw] flex-col overflow-hidden rounded-xl border bg-popover text-foreground shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b px-3.5">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={pickerInputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSel(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSel((s) => (visibleItems.length ? (s + 1) % visibleItems.length : 0));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSel((s) =>
                      visibleItems.length ? (s - 1 + visibleItems.length) % visibleItems.length : 0,
                    );
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const p = visibleItems[Math.min(sel, visibleItems.length - 1)];
                    if (p) insert(p);
                  }
                }}
                placeholder={t('prompts.picker_search_placeholder')}
                className="h-12 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => setMode('manage')}
                title={t('prompts.picker_manage_tooltip')}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-3.5"
              >
                <Pencil /> {t('prompts.picker_manage_button')}
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
              {visibleItems.length === 0 ? (
                <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                  {items.length === 0 ? t('prompts.picker_empty') : t('prompts.picker_no_results')}
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setMode('manage')}
                      className="text-primary hover:underline"
                    >
                      {items.length === 0 ? t('prompts.picker_create') : t('prompts.picker_open')}
                    </button>
                  </div>
                </div>
              ) : (
                visibleItems.map((p, i) => {
                  const selected = i === Math.min(sel, visibleItems.length - 1);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onMouseMove={() => setSel(i)}
                      onClick={() => insert(p)}
                      disabled={!sessionId}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13.5px] disabled:opacity-50',
                        selected ? 'bg-primary/12 text-foreground' : 'text-foreground/90',
                      )}
                    >
                      <Star
                        className={cn(
                          'size-3.5 shrink-0',
                          p.fav ? 'fill-amber-500 text-amber-500' : 'text-transparent',
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">{p.title}</span>
                      <span className="min-w-0 max-w-[45%] shrink truncate text-[12px] text-muted-foreground">
                        {p.body}
                      </span>
                      {selected && (
                        <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between border-t px-3.5 py-1.5 text-[11px] text-muted-foreground">
              <span>{t('prompts.picker_help')}</span>
              <span>
                {items.length}{' '}
                {items.length === 1 ? t('prompts.count_single') : t('prompts.count_plural')}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Bolinha de atividade do Claude DENTRO da aba da sessão. Âmbar pulsando = trabalhando;
// âmbar com halo = pediu uma confirmação (sua vez); âmbar fixo = terminou o turno.
function SessionActivityDot({ state }) {
  const t = useT();
  if (!state) return null;
  const title =
    state === 'working'
      ? t('session.activity_working')
      : state === 'asking'
        ? t('session.activity_asking')
        : t('session.activity_waiting');
  return (
    <span className="relative flex h-2 w-2 shrink-0" title={title}>
      {state === 'asking' && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
      )}
      <span
        className={cn(
          'relative inline-flex h-2 w-2 rounded-full bg-amber-500',
          state === 'working' && 'animate-pulse',
        )}
      />
    </span>
  );
}

export function ChatPanel({ activeProject, controlsRef, onActiveSessionChange, onOpenAiInstall }) {
  const t = useT();
  const { chatMode } = useChatMode();
  const { terminalTheme } = useTheme();
  const themeRef = useRef(terminalTheme);
  const hostRef = useRef(null);
  const termsRef = useRef(new Map()); // sessionId -> { term, fit, el, lastCols, lastRows }
  const paneRefs = useRef(new Map()); // paneId -> elemento de conteúdo do pane

  const [sessions, setSessions] = useState([]); // todas as sessões do projeto: [{ id, name }]
  const [projectAis, setProjectAis] = useState(null); // { ais, custom } do projeto ativo

  // Uma sessão renderiza como CHAT (assistant-ui) em vez de terminal xterm quando o modo
  // 'chat' está ligado E a IA da sessão tem adapter de chat (claude/codex/agy — ver
  // chat-cli.cjs). Outras CLIs (opencode/custom) seguem no terminal. Additivo — abas,
  // seletor de IA e layout ficam.
  const cliOf = (sid) => sessions.find((s) => s.id === sid)?.cli;
  const isChatSession = (sid) => chatMode === 'chat' && CHAT_CLIS.includes(cliOf(sid));
  // Atividade do Claude POR SESSÃO: sessionId -> 'working' | 'asking' | 'attention'.
  // É o detalhe fino (qual aba) que o rail (agregado por projeto) não mostra.
  const [sessionActivity, setSessionActivity] = useState({});
  const [layout, setLayout] = useState(null); // árvore de painéis do projeto ativo
  const layoutRef = useRef(null);
  const [focusedPane, setFocusedPane] = useState(null);
  const focusedPaneRef = useRef(null);
  focusedPaneRef.current = focusedPane;

  // Estado do arrastar de abas.
  const [dragSid, setDragSid] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // { paneId, zone }
  const [fileDropPane, setFileDropPane] = useState(null); // paneId destacado ao arrastar arquivo da árvore
  const dragRef = useRef(null);

  // Renomear aba à mão: sessionId em edição + valor do campo. O item "Renomear" do
  // menu de contexto (botão direito) abre; Enter salva, Esc cancela. O nome fixado
  // vence o aiTitle automático (main.js).
  const [renamingSid, setRenamingSid] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  // Menu de contexto da aba (botão direito): { sid, x, y } em coordenadas de tela.
  const [tabMenu, setTabMenu] = useState(null);

  const projectRef = useRef(activeProject);
  projectRef.current = activeProject;

  const sessionNames = new Map(sessions.map((s) => [s.id, s.name]));
  const canClose = sessions.length > 1;

  const saveTimer = useRef(0);
  const scheduleSave = () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (projectRef.current && layoutRef.current)
        saveLayout(projectRef.current, layoutRef.current);
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
      if (te.el.isConnected && te.el.style.display !== 'none')
        syncSize(te, sid, window.api.termResize);
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
    // Título da aba: o main lê o aiTitle que o próprio Claude gera no transcript e
    // renomeia a sessão (igual ao Claude Code). Casa por id; eventos de outro projeto
    // simplesmente não batem com nenhuma sessão da lista atual.
    window.api.on('session:meta', ({ sessionId, name }) => {
      if (!name) return;
      setSessions((cur) => cur.map((s) => (s.id === sessionId ? { ...s, name } : s)));
    });
  }, []);

  // Ao trocar de projeto: carrega sessões + restaura/reconcilia o layout salvo.
  useEffect(() => {
    if (!activeProject) {
      setSessions([]);
      setLayout(null);
      layoutRef.current = null;
      setFocusedPane(null);
      setProjectAis(null);
      return;
    }
    let cancelled = false;
    (async () => {
      let list = await window.api.sessionsList(activeProject);
      if (!list || list.length === 0) {
        const s = await window.api.sessionsCreate(activeProject);
        list = [s];
      }
      if (cancelled) return;
      const ai = await window.api.getAi(activeProject);
      if (cancelled) return;
      setProjectAis(ai || { ais: ['claude'], custom: '' });
      setSessions(list);
      const ids = list.map((s) => s.id);
      const tree = reconcile(loadLayout(activeProject), ids, ids[0]);
      layoutRef.current = tree;
      setLayout(tree);
      saveLayout(activeProject, tree);
      setFocusedPane(firstPane(tree)?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProject]);

  // Trocar a IA do projeto nas Configurações relê o cache local (projectAis), senão a
  // próxima aba nova ainda subiria a IA antiga (o main avisa via 'ai:changed').
  useEffect(() => {
    if (!activeProject) return;
    return window.api.on('ai:changed', ({ projectPath }) => {
      if (projectPath !== activeProject) return;
      window.api
        .getAi(activeProject)
        .then((ai) => setProjectAis(ai || { ais: ['claude'], custom: '' }));
    });
  }, [activeProject]);

  // Publica pro App qual sessão de chat está ativa (a do pane focado; senão a do
  // primeiro pane), pra painéis fora do chat — como o de Tarefas — seguirem a aba
  // em foco. Ref pro callback não forçar re-execução quando o App re-renderiza.
  const onActiveSessionRef = useRef(onActiveSessionChange);
  onActiveSessionRef.current = onActiveSessionChange;
  useEffect(() => {
    const pane = (focusedPane && findPane(layout, focusedPane)) || firstPane(layout);
    onActiveSessionRef.current?.(pane?.active ?? null);
  }, [layout, focusedPane]);

  // "Assumir" a sessão: dispensa SÓ a bolinha de "terminou" (attention). É o
  // clear-on-view — ao clicar na aba, clicar dentro ou digitar, você viu o
  // resultado e a bolinha some. 'working' (pulsa enquanto roda) e 'asking' (halo,
  // pediu confirmação) ficam intactos: 'asking' se resolve sozinho quando você
  // responde e o Claude volta a 'working'.
  const assumeSession = (sid) =>
    setSessionActivity((cur) => {
      if (cur[sid] !== 'attention') return cur;
      const next = { ...cur };
      delete next[sid];
      return next;
    });

  // Cria o terminal (xterm) de uma sessão dentro de um container de pane.
  const createTerm = (sessionId, container) => {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.padding = '8px 4px 8px 10px';
    // Clicar dentro do terminal dispensa a bolinha de "terminou" desta sessão
    // (caso da aba já ativa, em que não há clique de aba pra disparar).
    el.addEventListener('mousedown', () => assumeSession(sessionId));
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
        if (sel && !e.shiftKey) {
          window.api.copyText(sel);
          term.clearSelection();
          return false;
        }
        if (sel && e.shiftKey) {
          window.api.copyText(sel);
          return false;
        }
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
    el.addEventListener(
      'paste',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        const text = e.clipboardData?.getData('text');
        if (text) pasteIntoSession(sessionId, text);
        else
          window.api.readText().then((r) => {
            if (r && r.text) pasteIntoSession(sessionId, r.text);
          });
      },
      true,
    );
    // Renderizador WebGL: pinta o terminal num único canvas de GPU e repinta a
    // cada frame ao rolar, eliminando os glitches de "tinta velha". Se o contexto
    // WebGL cair, descarta o addon e volta pro DOM sozinho.
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        try {
          webgl.dispose();
        } catch {}
      });
      term.loadAddon(webgl);
    } catch {}
    term.onData((d) => {
      assumeSession(sessionId);
      window.api.termInput(sessionId, d);
    });

    const t = { term, fit, el, lastCols: 0, lastRows: 0 };
    termsRef.current.set(sessionId, t);

    // Mede só depois do layout assentar e SÓ então cria o PTY no tamanho final.
    requestAnimationFrame(() => {
      fit.fit();
      t.lastCols = term.cols;
      t.lastRows = term.rows;
      window.api
        .termEnsure(sessionId, projectRef.current, term.cols, term.rows, themeRef.current)
        .then((res) => {
          if (res && res.error) term.write('\r\n\x1b[31m[' + res.error + ']\x1b[0m\r\n');
          else if (res && res.buffer) term.write(res.buffer);
        });
      term.focus();
    });
    return t;
  };

  // Posiciona cada terminal no container do seu pane e mostra só a aba ativa.
  // Só cria o xterm quando a aba já escolheu a CLI (session.cli). Sem CLI: 1 IA =
  // auto-escolhe; 2+ IAs = deixa o AiPicker (renderizado abaixo) aparecer.
  useEffect(() => {
    if (!activeProject || !layout || !projectAis) return;
    const ais = projectAis.ais || [];
    for (const p of allPanes(layout)) {
      const container = paneRefs.current.get(p.id);
      if (!container) continue;
      for (const sid of p.tabs) {
        const isActive = sid === p.active;
        let te = termsRef.current.get(sid);
        // Sessão em modo chat: não cria/mostra o xterm (o overlay do AssistantChat cobre
        // o container). Esconde um terminal já criado, se existir, sem matá-lo.
        if (isActive && isChatSession(sid)) {
          if (te) te.el.style.display = 'none';
          continue;
        }
        if (!te && isActive) {
          const meta = sessions.find((s) => s.id === sid);
          if (!meta || !meta.cli) {
            if (ais.length === 1) pickCli(sid, ais[0]); // 1 IA → sobe sem tela
            continue; // sem CLI: nada de terminal ainda
          }
          te = createTerm(sid, container);
        }
        if (!te) continue;
        if (te.el.parentNode !== container) container.appendChild(te.el);
        te.el.style.display = isActive ? 'block' : 'none';
      }
    }
    scheduleRefit();
  }, [layout, activeProject, sessions, projectAis, chatMode]);

  // Reajusta os terminais visíveis quando o painel inteiro muda de tamanho.
  useEffect(() => {
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(refitAll);
    });
    if (hostRef.current) ro.observe(hostRef.current);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const focusSession = (sid) => {
    const te = termsRef.current.get(sid);
    if (te)
      requestAnimationFrame(() => {
        try {
          te.term.focus();
        } catch {}
      });
  };

  // Insere texto na sessão via bracketed paste (ver pasteIntoSession): texto
  // multi-linha vai inteiro pro input da TUI sem cada \n virar Enter.
  const insertText = (sid, text) => {
    pasteIntoSession(sid, text);
    const te = termsRef.current.get(sid);
    if (te)
      requestAnimationFrame(() => {
        try {
          te.term.focus();
        } catch {}
      });
  };

  // Escolha da IA de uma aba (via AiPicker ou auto-escolha com 1 IA): grava no main e
  // atualiza local; a mudança de `sessions` re-dispara o efeito que cria o xterm.
  const pickCli = async (sid, key) => {
    if (!activeProject) return;
    await window.api.sessionSetCli(activeProject, sid, key);
    setSessions((cur) => cur.map((s) => (s.id === sid ? { ...s, cli: key } : s)));
    focusSession(sid);
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
    // Editando esta aba? Não ativa/foca o terminal — isso roubaria o foco do campo
    // de renomear e fecharia a edição pelo onBlur.
    if (renamingSid === sid) return;
    commitLayout(setActiveInPane(layoutRef.current, paneId, sid));
    setFocusedPane(paneId);
    focusSession(sid);
    assumeSession(sid);
    // Aba ainda "Untitled"? O Claude pode ter gerado o aiTitle tarde (ou a sessão já
    // encerrou e o watcher parou). Re-verifica o transcript ao clicar; se houver
    // título, o main responde via 'session:meta' e a aba se renomeia sozinha.
    const cur = sessions.find((s) => s.id === sid);
    if (activeProject && (!cur || !cur.name || cur.name === 'Untitled')) {
      window.api.sessionRefreshTitle(activeProject, sid);
    }
  };

  const closeSession = async (e, sessionId) => {
    e.stopPropagation();
    if (!activeProject || sessions.length <= 1) return;
    await window.api.sessionsClose(activeProject, sessionId);
    const t = termsRef.current.get(sessionId);
    if (t) {
      try {
        t.term.dispose();
      } catch {}
      t.el.remove();
      termsRef.current.delete(sessionId);
    }
    setSessions((cur) => cur.filter((s) => s.id !== sessionId));
    commitLayout(closeSessionInTree(layoutRef.current, sessionId));
  };

  // --- Menu de contexto da aba (botão direito) ---
  const openTabMenu = (sid, e) => {
    e.preventDefault();
    e.stopPropagation();
    setTabMenu({ sid, x: e.clientX, y: e.clientY });
  };
  const closeTabMenu = () => setTabMenu(null);

  // --- Renomear aba à mão ---
  const startRename = (sid) => {
    const cur = sessionNames.get(sid);
    setRenameDraft(cur && cur !== t('session.untitled') ? cur : '');
    setRenamingSid(sid);
  };
  const cancelRename = () => {
    setRenamingSid(null);
    setRenameDraft('');
  };
  const commitRename = async (sid) => {
    if (renamingSid !== sid) return;
    const name = renameDraft.trim();
    setRenamingSid(null);
    setRenameDraft('');
    if (!activeProject) return;
    const res = await window.api.sessionsRename(activeProject, sid, name);
    // Nome vazio volta ao título automático: o main devolve o nome efetivo (aiTitle
    // ou "Untitled"), então usa a resposta em vez do rascunho.
    const applied = (res && res.name) || name;
    setSessions((cur) => cur.map((s) => (s.id === sid ? { ...s, name: applied } : s)));
  };

  // --- Arrastar e soltar abas ---
  const onTabDragStart = (paneId, sid, e) => {
    dragRef.current = { sid, from: paneId };
    setDragSid(sid);
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', sid);
    } catch {}
  };
  const endDrag = () => {
    dragRef.current = null;
    setDragSid(null);
    setDropTarget(null);
  };

  const onZoneDragOver = (paneId, e) => {
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {}
    const r = e.currentTarget.getBoundingClientRect();
    const zone = computeZone((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    setDropTarget((prev) =>
      prev && prev.paneId === paneId && prev.zone === zone ? prev : { paneId, zone },
    );
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

  // --- Arrastar arquivo(s) da árvore pra dentro do terminal ---
  // Só reage ao tipo customizado da árvore (MOVE_MIME); arrasto de aba usa
  // 'text/plain' e é ignorado aqui, então os dois convivem sem conflito.

  // Rede de segurança: se o arrasto for cancelado (Esc) ou solto fora da janela,
  // nem onFilePathDrop nem onFilePathDragLeave disparam pra limpar o anel — o
  // 'drop' não acontece e o 'dragleave' pode não bater (o ponteiro pode estar
  // sobre o xterm filho quando o arrasto termina). 'dragend' fecha arrasto
  // cancelado/abortado que não dispara drop nem dragleave no pane — mesmo
  // motivo do onTreeDragEnd da árvore (CodeView.jsx) — e sempre borbulha até a
  // window ao fim de qualquer arrasto, então serve pra limpar o realce preso.
  useEffect(() => {
    const onDragEnd = () => setFileDropPane(null);
    window.addEventListener('dragend', onDragEnd);
    return () => window.removeEventListener('dragend', onDragEnd);
  }, []);

  const onFilePathDragOver = (paneId, e) => {
    // Aceita tanto o arrasto interno da árvore (MOVE_MIME) quanto arquivo(s) de FORA
    // do app (Chrome/Explorador/Finder), que chegam como 'Files' no dataTransfer.
    if (!e.dataTransfer.types.includes(MOVE_MIME) && !hasExternalFiles(e.dataTransfer)) return;
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = 'copy';
    } catch {}
    setFileDropPane((prev) => (prev === paneId ? prev : paneId));
  };

  // Mesmo truque de dragleave usado na árvore (CodeView): só limpa quando o
  // ponteiro sai de fato do container, não ao passar sobre um filho (o xterm).
  const onFilePathDragLeave = (e) => {
    if (e.currentTarget === e.target) setFileDropPane(null);
  };

  const onFilePathDrop = (pane, e) => {
    // Interno (árvore) ou externo (arquivo do SO): o contrato único resolve os dois.
    // No externo o caminho absoluto vem do webUtils.getPathForFile (via preload).
    const text = dropPathsText(e.dataTransfer, window.api?.getDroppedPath);
    if (!text) return; // não é um arrasto de arquivo
    e.preventDefault();
    e.stopPropagation();
    setFileDropPane(null);
    if (pane.active) insertText(pane.active, text);
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
        className={
          'flex h-full flex-col overflow-hidden ' +
          (isFocused ? 'ring-1 ring-inset ring-primary/40' : '')
        }
      >
        <div
          className="flex h-11 shrink-0 items-center border-b bg-card px-1.5"
          onDragOver={
            dragSid
              ? (e) => {
                  e.preventDefault();
                  setDropTarget({ paneId: p.id, zone: 'center' });
                }
              : undefined
          }
          onDrop={dragSid ? (e) => onDrop(p.id, 'center', e) : undefined}
        >
          {/* Só as abas rolam, e só na horizontal. min-w-0 deixa a faixa encolher
              (e portanto rolar); overflow-y-hidden mata o scroll vertical que o
              scrollbar horizontal provocaria ao roubar altura da barra. O '+' e a
              biblioteca de prompts ficam FORA desta faixa, fixos à direita. */}
          <div className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden">
            {p.tabs.map((sid) => {
              const isActive = sid === p.active;
              return (
                <div
                  key={sid}
                  draggable={renamingSid !== sid}
                  onDragStart={(e) => onTabDragStart(p.id, sid, e)}
                  onDragEnd={endDrag}
                  onClick={() => onTabClick(p.id, sid)}
                  onContextMenu={(e) => openTabMenu(sid, e)}
                  title={t('session.tabs_rename_hint')}
                  className={
                    'group flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded px-2.5 text-[13px] transition-colors ' +
                    (isActive
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60')
                  }
                >
                  {renamingSid === sid ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.target.select()}
                      onBlur={() => commitRename(sid)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitRename(sid);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelRename();
                        }
                      }}
                      placeholder={t('session.untitled')}
                      className="h-6 w-28 min-w-0 rounded border border-border bg-background px-1 text-[13px] text-foreground outline-none focus:border-foreground/40"
                    />
                  ) : (
                    <span>{sessionNames.get(sid) || t('session.untitled')}</span>
                  )}
                  <SessionActivityDot state={sessionActivity[sid]} />
                  {canClose && (
                    <button
                      type="button"
                      onClick={(e) => closeSession(e, sid)}
                      title={t('session.tabs_close')}
                      className="grid size-4 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 hover:text-foreground group-hover:opacity-100 [&_svg]:size-3"
                    >
                      <X />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => addSession(p.id)}
            title={t('session.new')}
            className="ml-1 grid size-7 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-[15px]"
          >
            <Plus />
          </button>
          <div className="shrink-0">
            <PromptMenu projectPath={activeProject} sessionId={p.active} onInsert={insertText} />
          </div>
        </div>

        <div
          ref={setPaneRef(p.id)}
          className={
            'relative flex-1 overflow-hidden' +
            (fileDropPane === p.id ? ' ring-2 ring-inset ring-primary/50' : '')
          }
          onDragOver={(e) => onFilePathDragOver(p.id, e)}
          onDragLeave={onFilePathDragLeave}
          onDrop={(e) => onFilePathDrop(p, e)}
        >
          {(() => {
            const meta = sessions.find((s) => s.id === p.active);
            const ais = projectAis?.ais || [];
            if (meta && !meta.cli && ais.length >= 2) {
              return (
                <AiPicker
                  ais={ais}
                  onPick={(key) => pickCli(p.active, key)}
                  onOpenAiInstall={onOpenAiInstall}
                />
              );
            }
            return null;
          })()}
          {/* Sessão em modo chat: overlay do AssistantChat por cima do container (o xterm
              fica escondido). Só pra sessão ativa e IA = claude. z abaixo do overlay de drop. */}
          {isChatSession(p.active) && (
            <div className="absolute inset-0 z-10 flex flex-col bg-background">
              <AssistantChat
                sessionId={p.active}
                projectPath={activeProject}
                cli={cliOf(p.active)}
              />
            </div>
          )}
          {dragSid && (
            <div
              className="absolute inset-0 z-20"
              onDragOver={(e) => onZoneDragOver(p.id, e)}
              onDrop={(e) =>
                onDrop(p.id, dropTarget?.paneId === p.id ? dropTarget.zone : 'center', e)
              }
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
    <div
      className="flex flex-1 flex-col overflow-hidden"
      style={{ background: terminalTheme === 'dark' ? '#0b0f17' : '#ffffff' }}
    >
      <div ref={hostRef} className="relative flex-1 overflow-hidden">
        {!activeProject && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-muted-foreground">
            {t('chat.empty')}
          </div>
        )}
        {activeProject && layout && renderNode(layout)}
      </div>
      {tabMenu && (
        <>
          {/* Camada invisível que fecha o menu ao clicar fora ou ao abrir outro. */}
          <div
            className="fixed inset-0 z-40"
            onClick={closeTabMenu}
            onContextMenu={(e) => {
              e.preventDefault();
              closeTabMenu();
            }}
          />
          <div
            className="fixed z-50 min-w-[140px] overflow-hidden rounded-md border border-border bg-popover py-1 text-[13px] text-popover-foreground shadow-lg"
            style={{ left: tabMenu.x, top: tabMenu.y }}
          >
            <button
              type="button"
              className="flex w-full items-center px-3 py-1.5 text-left hover:bg-muted"
              onClick={() => {
                const sid = tabMenu.sid;
                closeTabMenu();
                startRename(sid);
              }}
            >
              {t('session.tabs_rename')}
            </button>
            {canClose && (
              <button
                type="button"
                className="flex w-full items-center px-3 py-1.5 text-left text-red-500 hover:bg-muted"
                onClick={() => {
                  const sid = tabMenu.sid;
                  closeTabMenu();
                  closeSession({ stopPropagation() {} }, sid);
                }}
              >
                {t('session.tabs_close')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
