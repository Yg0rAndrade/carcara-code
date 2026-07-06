import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';
import { fileIconUrl } from '@/lib/fileIcons';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

// Casamento fuzzy por subsequência: os caracteres da query precisam aparecer EM
// ordem no alvo. Bônus pra letras consecutivas (streak) e início de palavra, pra
// "gst" achar "Git status" antes de "...gest...". Devolve -1 quando não casa tudo.
function fuzzyScore(query, text) {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0,
    score = 0,
    streak = 0,
    lastIdx = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;
    let s = 1;
    if (lastIdx === ti - 1) {
      streak += 1;
      s += streak * 2;
    } else streak = 0;
    if (ti === 0 || /[\s\-_/.\\]/.test(t[ti - 1])) s += 3; // começo de palavra
    score += s;
    lastIdx = ti;
    qi += 1;
  }
  return qi === q.length ? score : -1;
}

// Paleta de comandos (Ctrl/Cmd+K). `commands` é uma lista achatada de
// { id, label, hint, group, run }. Com texto digitado, também busca ARQUIVOS no
// projeto ativo (fs:search) e os mostra num grupo próprio — abrir vai pro onOpenFile.
export function CommandPalette({ open, onClose, commands, activePath, onOpenFile }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState([]);
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Reabrir sempre começa limpo e com foco no campo.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setFiles([]);
    setSel(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Busca de arquivos (debounce), só com query e projeto aberto.
  useEffect(() => {
    const q = query.trim();
    if (!open || !activePath || !q) {
      setFiles([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      window.api.searchFiles(activePath, q).then((r) => {
        if (alive) setFiles((r || []).slice(0, 20));
      });
    }, 120);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, activePath, open]);

  // Comandos filtrados/ordenados pelo score fuzzy (sem query: ordem original).
  const matchedCommands = useMemo(() => {
    const q = query.trim();
    if (!q) return commands;
    return commands
      .map((c) => ({ c, score: fuzzyScore(q, c.label + ' ' + (c.hint || '')) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);
  }, [commands, query]);

  // Lista achatada e navegável: comandos + arquivos. O índice `sel` anda por ela toda.
  const items = useMemo(() => {
    const cmd = matchedCommands.map((c) => ({ type: 'command', key: 'c:' + c.id, data: c }));
    const fil = files.map((f) => ({ type: 'file', key: 'f:' + f.path, data: f }));
    return [...cmd, ...fil];
  }, [matchedCommands, files]);

  // Mantém a seleção dentro dos limites quando a lista muda.
  useEffect(() => {
    setSel((s) => (items.length ? Math.min(s, items.length - 1) : 0));
  }, [items.length]);

  // Rola o item selecionado pra dentro da janela visível.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${sel}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!open) return null;

  const run = (item) => {
    onClose();
    if (item.type === 'file') onOpenFile?.({ path: item.data.path, name: item.data.name });
    else item.data.run?.();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => (items.length ? (s + 1) % items.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => (items.length ? (s - 1 + items.length) % items.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[sel]) run(items[sel]);
    }
  };

  // Rótulo do grupo só aparece na primeira linha de cada bloco.
  let lastGroup = null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 pt-[12vh] backdrop-blur-[1px]"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[70vh] w-[560px] max-w-[92vw] flex-col overflow-hidden rounded-xl border bg-popover shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-3.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('palette.search_placeholder')}
            className="h-12 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1.5">
          {items.length === 0 && (
            <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
              {t('palette.no_results')}
            </div>
          )}
          {items.map((item, i) => {
            const group =
              item.type === 'file'
                ? t('palette.group_files')
                : item.data.group || t('palette.group_actions');
            const showGroup = group !== lastGroup;
            lastGroup = group;
            const selected = i === sel;
            return (
              <div key={item.key}>
                {showGroup && (
                  <div className="px-3.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {group}
                  </div>
                )}
                <button
                  type="button"
                  data-idx={i}
                  onMouseMove={() => setSel(i)}
                  onClick={() => run(item)}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13.5px]',
                    selected ? 'bg-primary/12 text-foreground' : 'text-foreground/90',
                  )}
                >
                  {item.type === 'file' ? (
                    <img src={fileIconUrl(item.data.name)} alt="" className="size-4 shrink-0" />
                  ) : (
                    <span className="grid size-4 shrink-0 place-items-center text-muted-foreground [&_svg]:size-4">
                      {item.data.icon}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {item.type === 'file' ? item.data.name : item.data.label}
                  </span>
                  <span className="shrink-0 truncate text-[12px] text-muted-foreground">
                    {item.type === 'file' ? relDir(item.data, activePath) : item.data.hint}
                  </span>
                  {selected && (
                    <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Caminho da pasta do arquivo, relativo à raiz do projeto, pra dar contexto sem poluir.
function relDir(file, root) {
  let p = file.path || '';
  if (root && p.startsWith(root)) p = p.slice(root.length);
  p = p.replace(/[\\/]+/g, '/').replace(/^\//, '');
  const i = p.lastIndexOf('/');
  return i > 0 ? p.slice(0, i) : '';
}
