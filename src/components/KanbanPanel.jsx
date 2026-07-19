// Kanban cuja fonte da verdade é o `tarefas.md` da raiz do projeto. O board não tem
// estado próprio: tudo que você vê está no arquivo, e toda ação vira um splice nele
// (ver src/lib/kanban.js — nunca re-serializamos o markdown).
//
// Por que dnd-kit e não Pragmatic/react-dnd: os dois usam a API HTML5 de drag, que é
// quebrada perto de <webview> no Electron (issues 18226/39371/42252, todas fechadas como
// "not planned"). O Preview do Carcará É um webview. dnd-kit é pointer-based → imune.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DragDropProvider, useDroppable } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { move } from '@dnd-kit/helpers';
import { CollisionPriority } from '@dnd-kit/abstract';
import {
  CheckIcon,
  PlusIcon,
  XIcon,
  EyeIcon,
  EyeOffIcon,
  MoreHorizontalIcon,
  PencilIcon,
  TrashIcon,
} from 'lucide-react';
import { EmptyState } from './ui/empty-state.jsx';
import { Button } from './ui/button.jsx';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import {
  parseBoard,
  moveCard,
  toggleDone,
  addCard,
  removeCard,
  setColumnColor,
  renameColumn,
  addColumn,
  removeColumn,
  visibleCards,
  isArchiveColumn,
  templateMarkdown,
  BOARD_TEMPLATES,
  COLUMN_COLORS,
} from '@/lib/kanban';

const Markdown = lazy(() => import('./Markdown.jsx'));

// Sobre clique-vs-arraste no card: NÃO configure `sensors` aqui. O default do
// PointerSensor já resolve — pra mouse sem alça ele exige `Delay(200ms, tol. 10px)` OU
// `Distance(5px)` antes de ativar, então clique curto abre o modal e movimento arrasta.
// (Uma tentativa de "melhorar" isso passando `{distance:{value:5}}` matou o drag por
// completo: o tipo é um ARRAY de instâncias de ActivationConstraint, e o objeto errado
// é engolido calado — nada ativa e o Chromium só seleciona o texto do card.)

const FILE = 'tarefas.md';
const joinPath = (root, name) => root + (root.includes('\\') ? '\\' : '/') + name;

// Pastéis. Escritos por extenso de propósito: o Tailwind é JIT e varre o código em busca
// de classes LITERAIS — um `bg-${cor}-200` montado em runtime nunca chega ao CSS.
//
// No escuro NÃO use o tom 950 tingido (ex.: bg-rose-950/40): 950 é quase preto, some no
// fundo. O truque é o tom BASE (400/500) com opacidade baixa — vira brilho colorido, não
// sombra — reforçado por uma borda colorida, que define a coluna melhor que o preenchimento.
const COLOR_CLASSES = {
  rose: {
    swatch: 'bg-rose-400 dark:bg-rose-400',
    tint: 'border-rose-200 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/15',
  },
  amber: {
    swatch: 'bg-amber-400 dark:bg-amber-400',
    tint: 'border-amber-200 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/15',
  },
  emerald: {
    swatch: 'bg-emerald-400 dark:bg-emerald-400',
    tint: 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/15',
  },
  sky: {
    swatch: 'bg-sky-400 dark:bg-sky-400',
    tint: 'border-sky-200 bg-sky-50 dark:border-sky-500/40 dark:bg-sky-500/15',
  },
  violet: {
    swatch: 'bg-violet-400 dark:bg-violet-400',
    tint: 'border-violet-200 bg-violet-50 dark:border-violet-500/40 dark:bg-violet-500/15',
  },
  stone: {
    swatch: 'bg-stone-400 dark:bg-stone-400',
    tint: 'border-stone-300 bg-stone-100 dark:border-stone-500/40 dark:bg-stone-500/15',
  },
};
// Sem cor: uma borda neutra pra coluna ainda ter contorno (senão destoa das pintadas).
const NO_COLOR = { swatch: 'bg-muted-foreground/25', tint: 'border-transparent' };
const colorOf = (c) => COLOR_CLASSES[c] || NO_COLOR;

// Fecha um popover ao clicar fora. Mesmo padrão do MoreTools da PreviewPanel.
function useClickOutside(open, onClose) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open, onClose]);
  return ref;
}

// Bolinha da cor no cabeçalho: clica e escolhe. A cor vai pro arquivo (ver kanban.js).
function ColorPicker({ color, onPick, t }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(
    open,
    useCallback(() => setOpen(false), []),
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={t('kanban.color')}
        className={cn(
          'size-2.5 rounded-full ring-offset-1 transition hover:ring-1 hover:ring-ring',
          colorOf(color).swatch,
        )}
      />
      {open && (
        <div className="absolute left-0 top-5 z-50 flex gap-1 rounded-md border bg-popover p-1.5 shadow-md">
          {COLUMN_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                onPick(c);
                setOpen(false);
              }}
              className={cn(
                'size-4 rounded-full transition hover:scale-110',
                COLOR_CLASSES[c].swatch,
                color === c && 'ring-1 ring-ring ring-offset-1',
              )}
            />
          ))}
          <button
            type="button"
            onClick={() => {
              onPick(null);
              setOpen(false);
            }}
            title={t('kanban.no_color')}
            className={cn(
              'flex size-4 items-center justify-center rounded-full border border-dashed text-muted-foreground [&_svg]:size-2.5',
              !color && 'ring-1 ring-ring ring-offset-1',
            )}
          >
            <XIcon />
          </button>
        </div>
      )}
    </div>
  );
}

// Título do card: renderiza o inline mais comum (negrito e código) sem arrastar o
// react-markdown inteiro pra dentro de cada card. O corpo, esse sim, usa o Markdown real.
function InlineTitle({ raw }) {
  const parts = useMemo(() => {
    const out = [];
    const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let last = 0;
    let m;
    while ((m = re.exec(raw))) {
      if (m.index > last) out.push({ t: 'text', v: raw.slice(last, m.index) });
      const tok = m[0];
      if (tok.startsWith('**')) out.push({ t: 'b', v: tok.slice(2, -2) });
      else out.push({ t: 'code', v: tok.slice(1, -1) });
      last = m.index + tok.length;
    }
    if (last < raw.length) out.push({ t: 'text', v: raw.slice(last) });
    return out;
  }, [raw]);

  return (
    <>
      {parts.map((p, i) =>
        p.t === 'b' ? (
          <strong key={i} className="font-semibold text-foreground">
            {p.v}
          </strong>
        ) : p.t === 'code' ? (
          <code key={i} className="rounded bg-muted px-1 font-mono text-[11px]">
            {p.v}
          </code>
        ) : (
          <span key={i}>{p.v}</span>
        ),
      )}
    </>
  );
}

// Sem handle: o card inteiro é a alça. Sem checkbox na face — concluir é uma ação
// deliberada, mora no modal (e o card ficaria disputando alvo de clique com ela).
function Card({ card, index, column, onOpen }) {
  const { ref, isDragging } = useSortable({
    id: card.id,
    index,
    group: column,
    type: 'card',
    accept: ['card'],
  });
  const bodyLines = card.bodyRaw.trim() ? card.bodyRaw.trim().split('\n').length : 0;

  return (
    <div
      ref={ref}
      // Clique abre; arraste move. Quem separa os dois são as travas PADRÃO do
      // PointerSensor (delay 200ms / 5px) — ver o comentário no topo do arquivo.
      onClick={() => onOpen(card)}
      className={cn(
        // select-none: sem isto o arraste pinta o texto do card de azul no meio do
        // caminho, que foi o sintoma de quando o sensor estava morto.
        'select-none rounded-md border bg-card p-2 text-[13px] shadow-sm transition-colors hover:border-primary/40',
        isDragging ? 'cursor-grabbing opacity-50' : 'cursor-grab',
        card.done && 'opacity-60',
      )}
    >
      <div className={cn('leading-snug text-muted-foreground', card.done && 'line-through')}>
        <InlineTitle raw={card.titleRaw} />
      </div>
      {bodyLines > 0 && (
        <span className="mt-1 block text-[11px] text-muted-foreground/60">≡ {bodyLines}</span>
      )}
    </div>
  );
}

// Menu "⋯" da coluna. Excluir pede confirmação NO PRÓPRIO menu quando há cards —
// apagar uma coluna leva as tarefas junto, e um clique errado aqui é caro.
function ColumnMenu({ col, onRename, onDelete, t }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
    setConfirming(false);
  }, []);
  const ref = useClickOutside(open, close);
  const count = col.cards.length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={t('kanban.column_menu')}
        className="text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
      >
        <MoreHorizontalIcon />
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-50 min-w-[160px] overflow-hidden rounded-md border bg-popover py-1 shadow-md">
          <button
            type="button"
            onClick={() => {
              onRename();
              close();
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted [&_svg]:size-3.5"
          >
            <PencilIcon />
            {t('kanban.rename_column')}
          </button>
          {confirming ? (
            <button
              type="button"
              onClick={() => {
                onDelete();
                close();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] font-medium text-destructive hover:bg-muted [&_svg]:size-3.5"
            >
              <TrashIcon />
              {t('kanban.delete_column_confirm', { n: count })}
            </button>
          ) : (
            <button
              type="button"
              // Coluna vazia sai direto; com cards, pede confirmação antes.
              onClick={() => {
                if (count > 0) {
                  setConfirming(true);
                  return;
                }
                onDelete();
                close();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-destructive hover:bg-muted [&_svg]:size-3.5"
            >
              <TrashIcon />
              {t('kanban.delete_column')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Coluna-fantasma no fim do board. Some enquanto você digita o nome.
function AddColumn({ onAdd, t }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const submit = () => {
    if (name.trim()) onAdd(name.trim());
    setName('');
    setAdding(false);
  };

  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="flex h-9 w-[220px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-dashed text-[13px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground [&_svg]:size-3.5"
      >
        <PlusIcon />
        {t('kanban.add_column')}
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') {
          setName('');
          setAdding(false);
        }
      }}
      placeholder={t('kanban.new_column')}
      className="h-9 w-[220px] shrink-0 rounded-lg border bg-card px-2.5 text-[13px] outline-none focus:border-primary"
    />
  );
}

function Column({ col, cards, showDone, onOpen, onAdd, onColor, onRename, onDelete, t }) {
  // Droppable, não sortable: a coluna recebe cards mas não é arrastada. Prioridade
  // baixa de colisão pra que soltar EM CIMA de um card ganhe da coluna que o contém —
  // sem isso todo drop viraria "solta no fim da coluna".
  const { ref } = useDroppable({
    id: col.name,
    type: 'column',
    accept: 'card',
    collisionPriority: CollisionPriority.Low,
  });
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [renaming, setRenaming] = useState(false);
  const archive = isArchiveColumn(col);
  const hidden = col.cards.length - cards.length;

  const submit = () => {
    if (text.trim()) onAdd(col.name, text);
    setText('');
    setAdding(false);
  };

  const submitRename = (e) => {
    const next = e.target.value.trim();
    if (next && next !== col.name) onRename(col.name, next);
    setRenaming(false);
  };

  return (
    <div
      ref={ref}
      className={cn(
        'flex w-[280px] shrink-0 flex-col gap-2 rounded-lg border p-2 transition-colors',
        colorOf(col.color).tint,
      )}
    >
      <div className="flex items-center gap-2 px-1">
        <ColorPicker color={col.color} onPick={(c) => onColor(col.name, c)} t={t} />
        {renaming ? (
          <input
            autoFocus
            defaultValue={col.name}
            onBlur={submitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRename(e);
              if (e.key === 'Escape') setRenaming(false);
            }}
            className="min-w-0 flex-1 rounded border bg-card px-1 py-0.5 text-[13px] font-semibold outline-none focus:border-primary"
          />
        ) : (
          <h3
            onDoubleClick={() => setRenaming(true)}
            title={t('kanban.rename_hint')}
            className="cursor-text truncate text-[13px] font-semibold text-foreground"
          >
            {col.name}
          </h3>
        )}
        <span className="text-[11px] text-muted-foreground">{cards.length}</span>
        {hidden > 0 && !showDone && (
          <span className="text-[11px] text-muted-foreground/60">+{hidden}</span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
            title={t('kanban.add_card')}
          >
            <PlusIcon />
          </button>
          <ColumnMenu
            col={col}
            onRename={() => setRenaming(true)}
            onDelete={() => onDelete(col.name)}
            t={t}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {adding && (
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={submit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
              if (e.key === 'Escape') {
                setText('');
                setAdding(false);
              }
            }}
            placeholder={t('kanban.new_card')}
            className="min-h-[56px] resize-y rounded-md border bg-card p-2 text-[13px] outline-none focus:border-primary"
          />
        )}
        {cards.map((card, i) => (
          <Card key={card.id} card={card} index={i} column={col.name} onOpen={onOpen} />
        ))}
        {cards.length === 0 && !adding && (
          <div className="rounded-md border border-dashed py-6 text-center text-[11px] text-muted-foreground/60">
            {archive ? t('kanban.empty_archive') : t('kanban.empty_column')}
          </div>
        )}
      </div>
    </div>
  );
}

function CardModal({ card, onClose, onToggle, onRemove, t }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // O corpo vem indentado em 2 espaços (é continuação do listItem). Sem tirar isso,
  // o markdown leria tudo como bloco de código.
  const body = card.bodyRaw.replace(/^ {2}/gm, '');

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-8"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg border bg-card shadow-lg">
        <div className="flex items-start gap-2 border-b p-3">
          <button
            type="button"
            onClick={() => onToggle(card.id)}
            className={cn(
              'mt-1 flex size-4 shrink-0 items-center justify-center rounded-[3px] border [&_svg]:size-3',
              card.done
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted-foreground/40 hover:border-primary',
            )}
          >
            {card.done && <CheckIcon strokeWidth={3} />}
          </button>
          <h2
            className={cn(
              'flex-1 text-[15px] leading-snug',
              card.done && 'line-through opacity-60',
            )}
          >
            <InlineTitle raw={card.titleRaw} />
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground [&_svg]:size-4"
          >
            <XIcon />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {body.trim() ? (
            <Suspense fallback={null}>
              <Markdown text={body} />
            </Suspense>
          ) : (
            <p className="text-[13px] text-muted-foreground/60">{t('kanban.no_body')}</p>
          )}
        </div>
        <div className="flex justify-end border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onRemove(card.id);
              onClose();
            }}
            className="text-destructive hover:text-destructive"
          >
            {t('kanban.delete_card')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function KanbanPanel({ active }) {
  const t = useT();
  const [md, setMd] = useState(null);
  const [missing, setMissing] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [items, setItems] = useState({});
  const mdRef = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const projectPath = active?.path || null;
  // `ssh://`: fs:watch é no-op remoto (main.js:1491) e o join de path quebraria.
  const remote = !!active?.remote;
  const filePath = projectPath && !remote ? joinPath(projectPath, FILE) : null;

  const load = useCallback(async () => {
    if (!filePath) return;
    const r = await window.api.readFile(filePath);
    if (r?.error || typeof r?.content !== 'string') {
      setMissing(true);
      setMd(null);
      return;
    }
    setMissing(false);
    // Guarda do eco: o nosso próprio write dispara fs:changed de volta. Sem esta
    // comparação o board re-renderiza (e perde o drag) a cada salvamento.
    // Mesma ideia do CodeView.jsx:496-517 — termina por igualdade, não por supressão.
    if (r.content !== mdRef.current) {
      mdRef.current = r.content;
      setMd(r.content);
    }
  }, [filePath]);

  useEffect(() => {
    mdRef.current = null;
    setMd(null);
    setMissing(false);
    load();
  }, [load]);

  // Pega carona no watcher que já existe (main.js:1474) em vez de criar IPC nova.
  useEffect(() => {
    if (!filePath) return;
    const off = window.api.on('fs:changed', () => load());
    window.api.watchDir(projectPath);
    return () => off();
  }, [filePath, projectPath, load]);

  const board = useMemo(() => (md === null ? null : parseBoard(md)), [md]);

  // `items` (coluna → ids) é o que o dnd-kit reordena de forma otimista durante o
  // arraste; o arquivo é a verdade e re-sincroniza quando ele muda.
  useEffect(() => {
    if (!board) return;
    const next = {};
    for (const col of board.columns) next[col.name] = visibleCards(col, showDone).map((c) => c.id);
    setItems(next);
  }, [board, showDone]);

  const write = useCallback(
    async (nextMd) => {
      if (!filePath || nextMd === mdRef.current) return;
      mdRef.current = nextMd;
      setMd(nextMd);
      await window.api.writeFile(filePath, nextMd);
    },
    [filePath],
  );

  const onToggle = useCallback((id) => write(toggleDone(mdRef.current, id)), [write]);
  const onRemove = useCallback((id) => write(removeCard(mdRef.current, id)), [write]);
  const onAdd = useCallback((col, text) => write(addCard(mdRef.current, col, text)), [write]);
  const onColor = useCallback((col, c) => write(setColumnColor(mdRef.current, col, c)), [write]);
  const onRename = useCallback(
    (old, next) => write(renameColumn(mdRef.current, old, next)),
    [write],
  );
  const onDelete = useCallback((col) => write(removeColumn(mdRef.current, col)), [write]);
  const onAddColumn = useCallback((name) => write(addColumn(mdRef.current, name)), [write]);

  const onDragEnd = useCallback(
    (event) => {
      const { source } = event.operation;
      if (!source || event.canceled) return;
      // Lê do ref, não do state: o onDragOver acabou de chamar setItems e o valor
      // fechado nesta callback pode ser o de antes do último movimento.
      for (const [colName, ids] of Object.entries(itemsRef.current)) {
        const idx = ids.indexOf(source.id);
        if (idx === -1) continue;
        // Posição por card-alvo (o próximo visível), não por índice — os ids daqui
        // são só os cards VISÍVEIS, e o splice conta todos.
        write(moveCard(mdRef.current, source.id, colName, ids[idx + 1] ?? null));
        return;
      }
    },
    [write],
  );

  if (!projectPath) return null;

  if (remote) {
    return (
      <div className="absolute inset-0 bg-background">
        <EmptyState>
          <p className="font-medium">{t('kanban.remote_title')}</p>
          <p className="text-xs opacity-80">{t('kanban.remote_body')}</p>
        </EmptyState>
      </div>
    );
  }

  if (missing) {
    return (
      <div className="absolute inset-0 overflow-y-auto bg-background">
        <EmptyState>
          <p className="font-medium">{t('kanban.missing_title')}</p>
          <p className="max-w-sm text-xs opacity-80">{t('kanban.missing_body', { file: FILE })}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {Object.entries(BOARD_TEMPLATES).map(([key, tpl]) => (
              <Button
                key={key}
                variant="outline"
                size="sm"
                onClick={async () => {
                  await window.api.writeFile(filePath, templateMarkdown(key));
                  load();
                }}
              >
                {tpl.columns.join(' · ')}
              </Button>
            ))}
          </div>
        </EmptyState>
      </div>
    );
  }

  if (!board) return null;

  const openCard = openId
    ? board.columns.flatMap((c) => c.cards).find((c) => c.id === openId) || null
    : null;
  const doneCount = board.columns
    .filter((c) => !isArchiveColumn(c))
    .reduce((n, c) => n + c.cards.filter((x) => x.done).length, 0);

  return (
    <div className="absolute inset-0 flex flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {FILE}
        </span>
        {doneCount > 0 && (
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
          >
            {showDone ? <EyeOffIcon /> : <EyeIcon />}
            {showDone ? t('kanban.hide_done') : t('kanban.show_done', { n: doneCount })}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto p-3">
        <DragDropProvider
          onDragOver={(event) => setItems((cur) => move(cur, event))}
          onDragEnd={onDragEnd}
        >
          <div className="flex h-full items-start gap-3">
            {board.columns.map((col) => {
              const ids = items[col.name] || [];
              const byId = new Map(col.cards.map((c) => [c.id, c]));
              const cards = ids.map((id) => byId.get(id)).filter(Boolean);
              return (
                <Column
                  key={col.name}
                  col={col}
                  cards={cards}
                  showDone={showDone}
                  onOpen={(c) => setOpenId(c.id)}
                  onAdd={onAdd}
                  onColor={onColor}
                  onRename={onRename}
                  onDelete={onDelete}
                  t={t}
                />
              );
            })}
            <AddColumn onAdd={onAddColumn} t={t} />
          </div>
        </DragDropProvider>
      </div>

      {openCard && (
        <CardModal
          card={openCard}
          onClose={() => setOpenId(null)}
          onToggle={onToggle}
          onRemove={onRemove}
          t={t}
        />
      )}
    </div>
  );
}
