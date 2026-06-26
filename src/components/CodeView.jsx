// Visualização/edição de código — extraído do PreviewPanel pra ser carregado sob
// demanda (React.lazy). Concentra TODO o peso do CodeMirror (16 linguagens),
// dos modos legados e do react-zoom-pan-pinch: nada disso entra no bundle inicial;
// só carrega quando o usuário abre a aba "Código".
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Save, Copy, X, Search, ChevronRight, ChevronDown,
  Scissors, ClipboardPaste, Link2, Pencil, Trash2, ExternalLink,
  ZoomIn, ZoomOut, Maximize2, Eye, EyeOff, Plus, KeyRound, Code2,
  FilePlus, FolderPlus,
} from 'lucide-react';
import { fileIconUrl, folderIconUrl } from '@/lib/fileIcons';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import CodeMirror from '@uiw/react-codemirror';
import { vscodeLight, vscodeDark } from '@uiw/codemirror-theme-vscode';
import { keymap, EditorView } from '@codemirror/view';
import { StreamLanguage } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { yaml } from '@codemirror/lang-yaml';
import { rust } from '@codemirror/lang-rust';
import { php } from '@codemirror/lang-php';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { go } from '@codemirror/lang-go';
import { xml } from '@codemirror/lang-xml';
import { vue } from '@codemirror/lang-vue';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { properties } from '@codemirror/legacy-modes/mode/properties';
import { ruby } from '@codemirror/legacy-modes/mode/ruby';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { Button } from './ui/button.jsx';
import { ResizeBar } from './ui/resize-bar.jsx';
import { EmptyState } from './ui/empty-state.jsx';
import { useTheme } from '@/lib/theme.jsx';
import { cn } from '@/lib/utils';

// Preview de markdown renderizado (react-markdown + GFM + highlight), sob demanda.
const Markdown = lazy(() => import('./Markdown.jsx'));
// Visualizador read-only de planilhas (.xlsx/.xlsm), sob demanda.
const XlsxViewer = lazy(() => import('./XlsxViewer.jsx'));

function isMarkdown(name) {
  const e = String(name || '').toLowerCase().split('.').pop();
  return ['md', 'markdown', 'mdx'].includes(e);
}

// Visual do editor: fonte maior, mais espaçada.
// Só fonte/espaçamento; as cores e o fundo vêm do tema (vscodeLight/vscodeDark).
const editorTheme = EditorView.theme({
  '&': { fontSize: '13.5px', height: '100%' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, "Cascadia Code", "JetBrains Mono", Consolas, monospace',
    lineHeight: '1.7',
  },
});

// Realce de sintaxe por tipo de arquivo. Cobre os formatos comuns; o que não tiver
// modo dedicado cai num modo "legado" (StreamLanguage) que ainda colore o básico.
function langFor(name) {
  const lower = name.toLowerCase();
  const e = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : lower;
  if (['js', 'jsx', 'mjs', 'cjs'].includes(e)) return [javascript({ jsx: true })];
  if (['ts', 'tsx', 'mts', 'cts'].includes(e)) return [javascript({ jsx: true, typescript: true })];
  if (e === 'vue') return [vue()];
  if (['html', 'htm', 'svelte', 'astro', 'xhtml'].includes(e)) return [html()];
  if (['css', 'scss', 'less', 'sass'].includes(e)) return [css()];
  if (['json', 'jsonc', 'json5'].includes(e)) return [json()];
  if (['md', 'markdown', 'mdx'].includes(e)) return [markdown()];
  if (e === 'py') return [python()];
  if (['sql', 'pgsql', 'mysql', 'ddl'].includes(e)) return [sql()];
  if (['yml', 'yaml'].includes(e)) return [yaml()];
  if (['xml', 'svg', 'xsl', 'plist', 'xaml'].includes(e)) return [xml()];
  if (e === 'rs') return [rust()];
  if (e === 'php') return [php()];
  if (['c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'hh', 'ino'].includes(e)) return [cpp()];
  if (e === 'java') return [java()];
  if (e === 'go') return [go()];
  if (['rb', 'gemfile', 'rake'].includes(e)) return [StreamLanguage.define(ruby)];
  if (e === 'lua') return [StreamLanguage.define(lua)];
  if (['sh', 'bash', 'zsh', 'fish', 'cmd', 'bat', 'ps1'].includes(e)) return [StreamLanguage.define(shell)];
  if (e === 'toml') return [StreamLanguage.define(toml)];
  if (['ini', 'cfg', 'conf', 'env', 'properties'].includes(e)) return [StreamLanguage.define(properties)];
  if (lower === 'dockerfile' || e === 'dockerfile') return [StreamLanguage.define(dockerFile)];
  return [];
}

// ---------- Visualizacao/edicao de codigo ----------
const FileTreeCtx = createContext(null);

// Diálogo de confirmação no estilo do app (substitui o window.confirm do sistema).
function ConfirmDialog({ open, title, message, confirmLabel = 'OK', cancelLabel = 'Cancelar', danger, onConfirm, onCancel }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
      else if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onConfirm, onCancel]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-[1px]"
      onMouseDown={onCancel}
    >
      <div
        className="w-[400px] max-w-[90vw] rounded-xl border bg-background p-5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        {message && <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={danger ? 'destructive' : 'default'} size="sm" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

// Diálogo de texto no estilo do app (pede um nome). Usado pelo "Novo arquivo/pasta".
function PromptDialog({ open, title, placeholder, confirmLabel = 'Criar', onConfirm, onCancel }) {
  const [val, setVal] = useState('');
  useEffect(() => { if (open) setVal(''); }, [open]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-[1px]"
      onMouseDown={onCancel}
    >
      <div
        className="w-[400px] max-w-[90vw] rounded-xl border bg-background p-5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        <input
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onConfirm(val); }
            else if (e.key === 'Escape') onCancel();
          }}
          placeholder={placeholder}
          spellCheck={false}
          className="mt-4 h-9 w-full rounded-md border bg-background px-3 text-[13px] outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancelar</Button>
          <Button variant="default" size="sm" onClick={() => onConfirm(val)}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

function parentDir(p) {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i > 0 ? p.slice(0, i) : p;
}

// Normaliza pra comparar caminhos no arrastar-soltar: barras unificadas, sem barra
// final, minúsculas (Windows é case-insensitive). Só pra comparação, não pra I/O.
function normPath(p) {
  return String(p || '').replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase();
}

export function CodeView({ active, openRequest }) {
  const { theme } = useTheme();
  // Abas de arquivos abertos. Cada aba carrega o próprio estado (conteúdo, imagem,
  // notice de erro e dirty) pra que alternar entre abas preserve edições não salvas.
  const [tabs, setTabs] = useState([]); // [{ path, name, content, image, notice, dirty }]
  const [activePath, setActivePath] = useState(null);
  const activePathRef = useRef(null);
  activePathRef.current = activePath;
  const activeTab = tabs.find((t) => t.path === activePath) || null;
  const saveRef = useRef(() => {});
  // .env abertos como texto cru (CodeMirror) em vez do editor mascarado. Por path.
  const [rawEnv, setRawEnv] = useState(() => new Set());
  const envRaw = activeTab && rawEnv.has(activeTab.path);
  const toggleEnvRaw = () => setRawEnv((s) => {
    const n = new Set(s);
    n.has(activeTab.path) ? n.delete(activeTab.path) : n.add(activeTab.path);
    return n;
  });
  // .md abertos no editor cru (CodeMirror) em vez do preview renderizado. Por path:
  // markdown abre renderizado por padrão; este set marca os que estão em modo edição.
  const [mdEdit, setMdEdit] = useState(() => new Set());
  const mdPreview = activeTab && isMarkdown(activeTab.name) && !mdEdit.has(activeTab.path);
  const toggleMdEdit = () => setMdEdit((s) => {
    const n = new Set(s);
    n.has(activeTab.path) ? n.delete(activeTab.path) : n.add(activeTab.path);
    return n;
  });

  // Menu de contexto da árvore
  const [menu, setMenu] = useState(null);     // { x, y, item }
  const [clip, setClip] = useState(null);     // { path, name, isDir, mode: 'cut' | 'copy' }
  const [delItems, setDelItems] = useState(null); // array de itens aguardando confirmação de exclusão
  const [creating, setCreating] = useState(null); // { destDir, isDir } aguardando o nome do novo item
  const [renaming, setRenaming] = useState(null); // path em edição de nome
  // Item selecionado na árvore (arquivo OU pasta). Serve de alvo pro F2 (renomear),
  // separado da aba ativa pra que pastas também possam ser selecionadas/renomeadas.
  const [selected, setSelected] = useState(null); // { path, name, isDir } — "lead" da seleção
  const selectedRef = useRef(null);
  selectedRef.current = selected;
  // Seleção múltipla na árvore (Ctrl/Cmd+clique alterna, Shift+clique seleciona faixa).
  // Map path -> { path, name, isDir } pra ter nome/tipo de cada item na exclusão em lote.
  const [selItems, setSelItems] = useState(() => new Map());
  const selItemsRef = useRef(selItems);
  selItemsRef.current = selItems;
  // Âncora da seleção por faixa (Shift+clique seleciona da âncora até o item clicado).
  const [anchorPath, setAnchorPath] = useState(null);
  const anchorRef = useRef(null);
  anchorRef.current = anchorPath;

  // Calcula a faixa de itens visíveis entre dois paths, na ordem em que aparecem na
  // árvore (lê o DOM, então respeita pastas abertas/fechadas — só conta o que está visível).
  const computeRange = (anchor, target) => {
    const rows = Array.from(document.querySelectorAll('[data-tree-row]'));
    const ia = rows.findIndex((r) => r.getAttribute('data-path') === anchor);
    const ib = rows.findIndex((r) => r.getAttribute('data-path') === target);
    if (ia === -1 || ib === -1) return null;
    const [lo, hi] = ia < ib ? [ia, ib] : [ib, ia];
    const m = new Map();
    for (let i = lo; i <= hi; i++) {
      const r = rows[i];
      const p = r.getAttribute('data-path');
      m.set(p, { path: p, name: r.getAttribute('data-name'), isDir: r.getAttribute('data-dir') === '1' });
    }
    return m;
  };

  // Clique num nó da árvore com os modificadores (Shift = faixa, Ctrl/Cmd = alternar).
  const onNodeClick = (e, item) => {
    if (e.shiftKey && anchorRef.current) {
      const m = computeRange(anchorRef.current, item.path);
      if (m && m.size) {
        setSelItems(m);
        setSelected({ path: item.path, name: item.name, isDir: item.isDir });
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      setSelItems((prev) => {
        const n = new Map(prev);
        if (n.has(item.path)) n.delete(item.path);
        else n.set(item.path, { path: item.path, name: item.name, isDir: item.isDir });
        return n;
      });
      setSelected({ path: item.path, name: item.name, isDir: item.isDir });
      setAnchorPath(item.path);
      return;
    }
    // Clique simples: seleção única.
    setSelItems(new Map([[item.path, { path: item.path, name: item.name, isDir: item.isDir }]]));
    setSelected({ path: item.path, name: item.name, isDir: item.isDir });
    setAnchorPath(item.path);
  };

  // Botão direito: se o item não estiver na seleção atual, vira seleção única; se já
  // estiver (parte de uma seleção múltipla), mantém a seleção pra agir sobre todos.
  const onContextNode = (item) => {
    if (!selItemsRef.current.has(item.path)) {
      setSelItems(new Map([[item.path, { path: item.path, name: item.name, isDir: item.isDir }]]));
      setAnchorPath(item.path);
    }
    setSelected({ path: item.path, name: item.name, isDir: item.isDir });
  };
  const [refresh, setRefresh] = useState(0);
  const bump = () => setRefresh((n) => n + 1);
  // Observa o projeto ativo no disco: quando algo muda lá fora (ex.: o Claude cria
  // um arquivo), o main avisa por 'fs:changed' e a árvore se recarrega sozinha.
  useEffect(() => {
    if (!active) return;
    window.api.watchDir(active.path);
    const off = window.api.on('fs:changed', () => bump());
    return () => { off?.(); };
  }, [active]);
  // Busca de arquivos no topo da árvore. Com texto, mostra uma lista achatada de
  // resultados (varredura recursiva no main); vazia, mostra a árvore normal.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  useEffect(() => {
    const q = query.trim();
    if (!active || !q) { setResults([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      window.api.searchFiles(active.path, q).then((r) => { if (alive) setResults(r || []); });
    }, 120);
    return () => { alive = false; clearTimeout(t); };
  }, [query, active, refresh]);
  const [treeDragOver, setTreeDragOver] = useState(false);
  // Arrastar-soltar INTERNO (mover dentro da árvore). dragItemsRef guarda os itens
  // sendo arrastados (1 ou vários, da seleção); dragActive liga o realce de alvo.
  const dragItemsRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [treeWidth, setTreeWidth] = useState(() => Number(localStorage.getItem('codeTreeWidth')) || 256);
  const [treeResizing, setTreeResizing] = useState(false);
  const codeRowRef = useRef(null);

  const startTreeResize = (e) => {
    e.preventDefault();
    const rect = codeRowRef.current.getBoundingClientRect();
    setTreeResizing(true);
    document.body.style.cursor = 'col-resize';
    const onMove = (ev) => {
      const w = Math.max(160, Math.min(ev.clientX - rect.left, rect.width - 280));
      setTreeWidth(w);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      setTreeResizing(false);
      setTreeWidth((w) => { localStorage.setItem('codeTreeWidth', String(Math.round(w))); return w; });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Copia arquivos soltos (de fora) para dentro de uma pasta do projeto.
  const importFiles = async (fileList, destDir) => {
    const files = Array.from(fileList || []);
    for (const f of files) {
      const p = window.api.getDroppedPath(f);
      if (p) await window.api.pasteItem(p, destDir, false);
    }
    bump();
  };

  // Move itens (arrastar-soltar interno) para uma pasta de destino, reaproveitando o
  // mesmo backend do "recortar/colar" (fs:paste com move=true). Pula no-ops: soltar na
  // própria pasta, soltar nele mesmo, ou jogar uma pasta dentro de si mesma.
  const moveItems = async (items, destDir) => {
    let changed = false;
    for (const it of items || []) {
      if (normPath(it.path) === normPath(destDir)) continue;
      if (normPath(parentDir(it.path)) === normPath(destDir)) continue;
      if (normPath(destDir).startsWith(normPath(it.path) + '/')) continue;
      const r = await window.api.pasteItem(it.path, destDir, true);
      if (!r.error) changed = true;
    }
    if (changed) {
      setSelItems(new Map());
      setSelected(null);
      setAnchorPath(null);
      bump();
    }
  };

  // Há pelo menos um item arrastado que PODE cair nessa pasta? (controla o realce do alvo.)
  const canDropItems = (destDir) => {
    const items = dragItemsRef.current;
    if (!items?.length) return false;
    return items.some((it) => (
      normPath(it.path) !== normPath(destDir) &&
      normPath(parentDir(it.path)) !== normPath(destDir) &&
      !normPath(destDir).startsWith(normPath(it.path) + '/')
    ));
  };

  // Início do arrasto de um nó: se o nó faz parte de uma seleção múltipla, arrasta
  // todos os selecionados; senão, arrasta só ele (e vira a seleção atual).
  const onTreeDragStart = (e, item) => {
    const sel = selItemsRef.current;
    let items;
    if (sel.has(item.path) && sel.size > 1) {
      items = Array.from(sel.values());
    } else {
      const one = { path: item.path, name: item.name, isDir: item.isDir };
      items = [one];
      setSelItems(new Map([[item.path, one]]));
      setSelected(one);
      setAnchorPath(item.path);
    }
    dragItemsRef.current = items;
    setDragActive(true);
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-ygor-move', items.map((i) => i.path).join('\n'));
    } catch {}
  };

  const onTreeDragEnd = () => { dragItemsRef.current = null; setDragActive(false); };

  // Soltou sobre uma pasta (alvo interno): move o que estava sendo arrastado e limpa.
  const dropMove = async (destDir) => {
    const items = dragItemsRef.current || [];
    await moveItems(items, destDir);
    dragItemsRef.current = null;
    setDragActive(false);
  };

  const openMenu = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 300);
    setMenu({ x, y, item });
  };

  const actions = {
    reveal: (it) => window.api.revealItem(it.path),
    copyPath: (it) => window.api.copyText(it.path),
    cut: (it) => setClip({ path: it.path, name: it.name, isDir: it.isDir, mode: 'cut' }),
    copy: (it) => setClip({ path: it.path, name: it.name, isDir: it.isDir, mode: 'copy' }),
    paste: async (it) => {
      if (!clip) return;
      const destDir = it.isDir ? it.path : parentDir(it.path);
      const r = await window.api.pasteItem(clip.path, destDir, clip.mode === 'cut');
      if (!r.error) { if (clip.mode === 'cut') setClip(null); bump(); }
    },
    rename: (it) => setRenaming(it.path),
    // Novo arquivo/pasta: cria dentro da pasta clicada (ou na pasta do arquivo clicado).
    newFile: (it) => setCreating({ destDir: it.isDir ? it.path : parentDir(it.path), isDir: false }),
    newFolder: (it) => setCreating({ destDir: it.isDir ? it.path : parentDir(it.path), isDir: true }),
    del: (it) => {
      // Se o item clicado faz parte de uma seleção múltipla, apaga todos os selecionados.
      const sel = selItemsRef.current;
      const targets = sel.has(it.path) && sel.size > 1 ? Array.from(sel.values()) : [it];
      setDelItems(targets);
    },
  };

  // Remove as abas que casam com `pred`. Se a aba ativa for removida, ativa a
  // vizinha (a que ficou na mesma posição, senão a anterior).
  const removeTabs = (pred) => {
    setTabs((cur) => {
      const idx = cur.findIndex(pred);
      const next = cur.filter((t) => !pred(t));
      if (idx >= 0 && pred(cur[idx]) && cur[idx].path === activePathRef.current) {
        const fallback = next[idx] || next[idx - 1] || null;
        setActivePath(fallback ? fallback.path : null);
      } else if (activePathRef.current && !next.some((t) => t.path === activePathRef.current)) {
        const fallback = next[idx] || next[idx - 1] || next[0] || null;
        setActivePath(fallback ? fallback.path : null);
      }
      return next;
    });
  };

  const closeFile = (e, path) => {
    e.stopPropagation();
    removeTabs((t) => t.path === path);
  };

  const performDelete = async (items) => {
    setDelItems(null);
    for (const it of items) {
      const r = await window.api.trashItem(it.path);
      if (!r.error) {
        // Fecha a aba do item e, se for pasta, qualquer aba aberta dentro dela.
        removeTabs((t) => t.path === it.path || t.path.startsWith(it.path + '/') || t.path.startsWith(it.path + '\\'));
      }
    }
    setSelItems(new Map());
    setSelected(null);
    setAnchorPath(null);
    bump();
  };

  const performCreate = async (name) => {
    const c = creating;
    setCreating(null);
    if (!c) return;
    const clean = (name || '').trim();
    if (!clean) return;
    const r = await window.api.createItem(c.destDir, clean, c.isDir);
    if (r.error) return;
    bump();
    // Abre o arquivo recém-criado pra já cair na edição; pasta só recarrega a árvore.
    if (!c.isDir) openFile({ path: r.path, name: clean });
  };

  const commitRename = async (it, newName) => {
    setRenaming(null);
    const name = (newName || '').trim();
    if (!name || name === it.name) return;
    const r = await window.api.renameItem(it.path, name);
    if (r.error) return;
    setTabs((cur) => cur.map((t) => (t.path === it.path ? { ...t, path: r.path, name } : t)));
    if (activePathRef.current === it.path) setActivePath(r.path);
    if (selectedRef.current?.path === it.path) setSelected({ path: r.path, name, isDir: !!it.isDir });
    if (selItemsRef.current.has(it.path)) {
      setSelItems((prev) => {
        const n = new Map(prev);
        n.delete(it.path);
        n.set(r.path, { path: r.path, name, isDir: !!it.isDir });
        return n;
      });
    }
    bump();
  };

  const openFile = async (item) => {
    setSelected({ path: item.path, name: item.name, isDir: false });
    setSelItems(new Map([[item.path, { path: item.path, name: item.name, isDir: false }]]));
    setAnchorPath(item.path);
    // Já aberto? só ativa a aba existente.
    if (tabs.some((t) => t.path === item.path)) { setActivePath(item.path); return; }
    const r = await window.api.readFile(item.path);
    const tab = { path: item.path, name: item.name, content: '', image: null, pdf: null, xlsx: null, notice: null, dirty: false };
    if (r.image) tab.image = r.image;
    else if (r.pdf) tab.pdf = r.pdf;
    else if (r.xlsx) tab.xlsx = r.xlsx;
    else if (r.binary) tab.notice = 'Arquivo binario - nao editavel.';
    else if (r.error) tab.notice = 'Erro: ' + r.error;
    else tab.content = r.content;
    setTabs((cur) => [...cur, tab]);
    setActivePath(item.path);
  };

  // Pedido externo de abrir arquivo (paleta de comandos). Usa ref pra chamar o
  // openFile atual sem re-disparar o efeito, e o `seq` evita reabrir à toa.
  const openFileRef = useRef(openFile);
  openFileRef.current = openFile;
  const lastOpenSeq = useRef(0);
  useEffect(() => {
    if (!openRequest || openRequest.seq === lastOpenSeq.current) return;
    lastOpenSeq.current = openRequest.seq;
    openFileRef.current({ path: openRequest.path, name: openRequest.name });
  }, [openRequest]);

  // Autosave: preferência ligada nas Configurações (aba "Códigos"). Mora no localStorage;
  // o SettingsModal avisa por evento 'ygc:autosave' pra ligar/desligar na hora.
  const [autoSave, setAutoSave] = useState(() => localStorage.getItem('codeAutoSave') === '1');
  useEffect(() => {
    const onChange = (e) => setAutoSave(!!e.detail);
    window.addEventListener('ygc:autosave', onChange);
    return () => window.removeEventListener('ygc:autosave', onChange);
  }, []);
  // Com autosave ligado, salva os arquivos sujos pouco depois da última digitação (debounce).
  useEffect(() => {
    if (!autoSave) return;
    const dirty = tabs.filter((t) => t.dirty && !t.notice);
    if (!dirty.length) return;
    const id = setTimeout(async () => {
      for (const t of dirty) {
        const res = await window.api.writeFile(t.path, t.content);
        if (!res.error) setTabs((cur) => cur.map((x) => (x.path === t.path ? { ...x, dirty: false } : x)));
      }
    }, 800);
    return () => clearTimeout(id);
  }, [tabs, autoSave]);

  const save = useCallback(async () => {
    const t = tabs.find((x) => x.path === activePath);
    if (!t || t.notice) return;
    const res = await window.api.writeFile(t.path, t.content);
    if (!res.error) setTabs((cur) => cur.map((x) => (x.path === t.path ? { ...x, dirty: false } : x)));
  }, [tabs, activePath]);
  saveRef.current = save;

  const saveKeymap = keymap.of([
    { key: 'Mod-s', preventDefault: true, run: () => { saveRef.current(); return true; } },
  ]);

  // Atalhos na árvore: Ctrl+C / Ctrl+X / Ctrl+V e Delete sobre o arquivo selecionado.
  // Ignora quando o foco está num campo de texto ou no editor de código (lá esses
  // atalhos copiam/colam o TEXTO, não o arquivo).
  useEffect(() => {
    const onKey = async (e) => {
      if (!active) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (el?.closest?.('.cm-editor') || tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;

      // F2 renomeia o item selecionado na árvore (arquivo ou pasta), igual no VS Code.
      if (e.key === 'F2') {
        const sel = selectedRef.current;
        if (!sel) return;
        e.preventDefault();
        setRenaming(sel.path);
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      const at = tabs.find((t) => t.path === activePathRef.current);
      const it = at ? { path: at.path, name: at.name, isDir: false } : null;
      const k = e.key.toLowerCase();

      if (mod && (k === 'c' || k === 'x')) {
        if (!it) return;
        e.preventDefault();
        setClip({ path: it.path, name: it.name, isDir: !!it.isDir, mode: k === 'x' ? 'cut' : 'copy' });
      } else if (mod && k === 'v') {
        if (!clip) return;
        e.preventDefault();
        const destDir = it ? (it.isDir ? it.path : parentDir(it.path)) : active.path;
        const r = await window.api.pasteItem(clip.path, destDir, clip.mode === 'cut');
        if (!r.error) { if (clip.mode === 'cut') setClip(null); bump(); }
      } else if (e.key === 'Delete') {
        // Prioriza a seleção da árvore (pode ter vários itens); senão, a aba ativa.
        const sel = selItemsRef.current;
        const targets = sel.size > 0 ? Array.from(sel.values()) : it ? [it] : [];
        if (!targets.length) return;
        e.preventDefault();
        setDelItems(targets);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, tabs, clip]);

  return (
    <div ref={codeRowRef} className="absolute inset-0 flex bg-background">
      <div
        style={{ width: treeWidth }}
        className={cn(
          'flex shrink-0 flex-col border-r transition-colors',
          treeDragOver && 'bg-primary/5 ring-2 ring-inset ring-primary/40'
        )}
        onDragOver={(e) => {
          if (!active) return;
          const isFiles = e.dataTransfer.types.includes('Files');
          if (isFiles || dragActive) {
            e.preventDefault();
            e.dataTransfer.dropEffect = isFiles ? 'copy' : 'move';
            setTreeDragOver(true);
          }
        }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setTreeDragOver(false); }}
        onDrop={(e) => {
          if (!active) return;
          if (e.dataTransfer.files?.length) {
            e.preventDefault(); setTreeDragOver(false);
            importFiles(e.dataTransfer.files, active.path);
            return;
          }
          if (dragActive) {
            e.preventDefault(); setTreeDragOver(false);
            dropMove(active.path);
          }
        }}
      >
        {active ? (
          <>
            <div className="shrink-0 border-b p-1.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
                  placeholder="Buscar arquivos…"
                  spellCheck={false}
                  className="h-7 w-full rounded-md border bg-background pl-7 pr-7 text-[13px] outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    title="Limpar"
                    className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div
              className="min-h-0 flex-1 overflow-auto py-1.5"
              onContextMenu={(e) => {
                // Clique direito na área em branco: menu da raiz do projeto (só Colar).
                openMenu(e, { path: active.path, name: active.name, isDir: true, root: true });
              }}
            >
              {query.trim() ? (
                results.length ? (
                  results.map((r) => {
                    const dir = r.rel.slice(0, r.rel.length - r.name.length).replace(/[\\/]+$/, '').replace(/\\/g, '/');
                    const isSel = (selected?.path ?? activePath) === r.path;
                    return (
                      <button
                        key={r.path}
                        type="button"
                        onClick={() => openFile({ path: r.path, name: r.name })}
                        title={r.rel}
                        className={cn(
                          'flex w-full items-center gap-1.5 px-2 py-[3px] text-left text-[13px] hover:bg-muted',
                          isSel && 'bg-accent'
                        )}
                      >
                        <img src={fileIconUrl(r.name)} alt="" draggable={false} className="h-4 w-4 shrink-0" />
                        <span className="shrink-0 truncate">{r.name}</span>
                        {dir && <span className="ml-auto truncate pl-2 text-[11px] text-muted-foreground">{dir}</span>}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-1 text-xs text-muted-foreground">Nenhum arquivo encontrado.</div>
                )
              ) : (
                <FileTreeCtx.Provider
                  value={{
                    selectedSet: selItems,
                    activePath,
                    onSelect: openFile,
                    onNodeClick,
                    onContextNode,
                    openMenu,
                    renaming,
                    commitRename,
                    cancelRename: () => setRenaming(null),
                    cutPath: clip?.mode === 'cut' ? clip.path : null,
                    refresh,
                    onDropFiles: importFiles,
                    dragActive,
                    onTreeDragStart,
                    onTreeDragEnd,
                    canDropItems,
                    onDropMove: dropMove,
                  }}
                >
                  <Tree dirPath={active.path} depth={0} />
                </FileTreeCtx.Provider>
              )}
            </div>
          </>
        ) : (
          <div className="px-3 py-1.5 text-sm text-muted-foreground">Abra um projeto.</div>
        )}
      </div>
      <ResizeBar onMouseDown={startTreeResize} />
      <FileMenu menu={menu} clip={clip} actions={actions} selItems={selItems} onClose={() => setMenu(null)} />
      <div className="flex min-w-0 flex-1 flex-col shadow-[inset_7px_0_14px_-12px_rgba(0,0,0,0.22)]">
        <div className="flex h-9 shrink-0 items-center border-b bg-card">
          {tabs.length ? (
            <>
              <div className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1.5">
                {tabs.map((t) => {
                  const isActive = t.path === activePath;
                  return (
                    <div
                      key={t.path}
                      onClick={() => { setActivePath(t.path); setSelected({ path: t.path, name: t.name, isDir: false }); }}
                      onMouseDown={(e) => { if (e.button === 1) closeFile(e, t.path); }}
                      title={t.path}
                      className={cn(
                        'group flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded px-2.5 text-[13px] transition-colors',
                        isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60'
                      )}
                    >
                      <img src={fileIconUrl(t.name)} alt="" draggable={false} className="h-3.5 w-3.5 shrink-0" />
                      <span className="max-w-[160px] truncate">{t.name}</span>
                      <button
                        type="button"
                        onClick={(e) => closeFile(e, t.path)}
                        title="Fechar"
                        className="grid size-4 place-items-center rounded text-muted-foreground hover:bg-foreground/10 hover:text-foreground [&_svg]:size-3"
                      >
                        {t.dirty ? (
                          <>
                            <span className="size-1.5 rounded-full bg-current group-hover:hidden" />
                            <X className="hidden group-hover:block" />
                          </>
                        ) : (
                          <X className="opacity-0 transition-opacity group-hover:opacity-100" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
              {activeTab && !activeTab.notice && !activeTab.image && !activeTab.pdf && !activeTab.xlsx && isEnvFile(activeTab.name) && (
                <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1.5 text-muted-foreground" onClick={toggleEnvRaw}
                  title={envRaw ? 'Voltar ao editor seguro (mascarado)' : 'Ver como texto puro'}>
                  {envRaw ? <><KeyRound className="size-3.5" />Modo seguro</> : <><Eye className="size-3.5" />Ver como texto</>}
                </Button>
              )}
              {activeTab && !activeTab.notice && !activeTab.image && !activeTab.pdf && !activeTab.xlsx && isMarkdown(activeTab.name) && (
                <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1.5 text-muted-foreground" onClick={toggleMdEdit}
                  title={mdPreview ? 'Editar o markdown' : 'Visualizar renderizado'}>
                  {mdPreview ? <><Code2 className="size-3.5" />Editar</> : <><Eye className="size-3.5" />Visualizar</>}
                </Button>
              )}
              {activeTab && !activeTab.notice && !activeTab.image && !activeTab.pdf && !activeTab.xlsx && (
                <Button variant="secondary" size="sm" className="mr-2 h-7 shrink-0" onClick={save} disabled={!activeTab.dirty} title="Salvar (Ctrl+S)">
                  <Save className="mr-1" />Salvar
                </Button>
              )}
            </>
          ) : (
            <span className="px-3 text-xs text-muted-foreground">Selecione um arquivo</span>
          )}
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {activeTab?.image ? (
            <ImageViewer src={activeTab.image} name={activeTab.name} />
          ) : activeTab?.pdf ? (
            <PdfViewer src={activeTab.pdf} name={activeTab.name} />
          ) : activeTab?.xlsx ? (
            <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Carregando planilha…</div>}>
              <XlsxViewer data={activeTab.xlsx} name={activeTab.name} />
            </Suspense>
          ) : activeTab?.notice ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">{activeTab.notice}</div>
          ) : mdPreview ? (
            <div className="absolute inset-0 overflow-y-auto px-8 py-6">
              <div className="mx-auto max-w-3xl">
                <Suspense fallback={<div className="text-sm text-muted-foreground">Carregando preview…</div>}>
                  <Markdown text={activeTab.content} />
                </Suspense>
              </div>
            </div>
          ) : activeTab && isEnvFile(activeTab.name) && !envRaw ? (
            <EnvEditor
              value={activeTab.content}
              onChange={(v) => setTabs((cur) => cur.map((x) => (x.path === activePathRef.current ? { ...x, content: v, dirty: true } : x)))}
            />
          ) : activeTab ? (
            <CodeMirror
              key={activeTab.path}
              value={activeTab.content}
              theme={theme === 'dark' ? vscodeDark : vscodeLight}
              height="100%"
              style={{ height: '100%' }}
              extensions={[saveKeymap, editorTheme, ...langFor(activeTab.name)]}
              onChange={(v) => setTabs((cur) => cur.map((x) => (x.path === activePathRef.current ? { ...x, content: v, dirty: true } : x)))}
            />
          ) : (
            <EmptyState>Selecione um arquivo na arvore.</EmptyState>
          )}
        </div>
      </div>
      {treeResizing && <div className="fixed inset-0 z-50 cursor-col-resize" />}
      <ConfirmDialog
        open={!!delItems?.length}
        title="Mover para a Lixeira"
        message={
          delItems?.length
            ? delItems.length === 1
              ? `Tem certeza que deseja mover "${delItems[0].name}" para a Lixeira?`
              : `Tem certeza que deseja mover ${delItems.length} itens para a Lixeira?`
            : ''
        }
        confirmLabel="Mover para a Lixeira"
        cancelLabel="Cancelar"
        danger
        onConfirm={() => performDelete(delItems)}
        onCancel={() => setDelItems(null)}
      />
      <PromptDialog
        open={!!creating}
        title={creating?.isDir ? 'Nova pasta' : 'Novo arquivo'}
        placeholder={creating?.isDir ? 'nome-da-pasta' : 'nome-do-arquivo.txt'}
        confirmLabel="Criar"
        onConfirm={performCreate}
        onCancel={() => setCreating(null)}
      />
    </div>
  );
}

// Arquivos de ambiente (.env, .env.local, .env.production, foo.env): abrem no editor
// mascarado em vez do CodeMirror, pra não vazar segredo em screenshot/print.
function isEnvFile(name) {
  const n = (name || '').toLowerCase();
  return n === '.env' || n.startsWith('.env.') || n.endsWith('.env');
}

// Cada linha vira uma chave/valor editável OU uma linha "crua" (comentário, em branco)
// preservada como está. Normaliza quebras pra \n; preserva o espaçamento ao redor do "=".
function parseEnv(text) {
  return (text || '').split(/\r?\n/).map((line) => {
    const m = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_.]*)(\s*=\s*)(.*)$/);
    if (m && !line.trimStart().startsWith('#')) {
      return { type: 'kv', indent: m[1], key: m[2], sep: m[3], value: m[4] };
    }
    return { type: 'raw', text: line };
  });
}
function serializeEnv(rows) {
  return rows.map((r) => (r.type === 'kv' ? r.indent + r.key + r.sep + r.value : r.text)).join('\n');
}

// Editor de .env com valores mascarados por padrão (•••). Revela por linha (olho) ou
// tudo de uma vez; edita chave/valor, adiciona e remove variáveis. Escreve de volta no
// `content` da aba — o botão Salvar (Ctrl+S) do CodeView segue funcionando igual.
function EnvEditor({ value, onChange }) {
  const rows = parseEnv(value);
  const [revealed, setRevealed] = useState(() => new Set());
  const [revealAll, setRevealAll] = useState(false);

  const commit = (next) => onChange(serializeEnv(next));
  const setVal = (idx, v) => commit(rows.map((r, i) => (i === idx ? { ...r, value: v } : r)));
  const setKey = (idx, k) => commit(rows.map((r, i) => (i === idx ? { ...r, key: k } : r)));
  const removeRow = (idx) => commit(rows.filter((_, i) => i !== idx));
  const addRow = () => {
    const next = [...rows];
    if (next.length && next[next.length - 1].text !== '') next.push({ type: 'raw', text: '' });
    next.push({ type: 'kv', indent: '', key: 'NOVA_VARIAVEL', sep: '=', value: '' });
    commit(next);
  };
  const toggle = (idx) =>
    setRevealed((cur) => {
      const n = new Set(cur);
      n.has(idx) ? n.delete(idx) : n.add(idx);
      return n;
    });

  const kvCount = rows.filter((r) => r.type === 'kv').length;

  return (
    <div className="absolute inset-0 flex flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b bg-card px-3 text-xs text-muted-foreground">
        <KeyRound className="size-3.5" />
        <span>Editor seguro de ambiente — valores mascarados</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setRevealAll((v) => !v)}
          className="flex h-7 items-center gap-1.5 rounded px-2 transition-colors hover:bg-muted [&_svg]:size-3.5"
        >
          {revealAll ? <EyeOff /> : <Eye />}
          {revealAll ? 'Ocultar tudo' : 'Revelar tudo'}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {kvCount === 0 ? (
          <p className="px-1 py-6 text-center text-[13px] text-muted-foreground">
            Nenhuma variável. Clique em “Adicionar variável”.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {rows.map((r, i) =>
              // Comentários e linhas em branco ficam OCULTOS no modo mascarado (mas são
              // preservados no arquivo ao salvar). Pra vê-los, use "Ver como texto".
              r.type !== 'kv' ? null : (
                <div key={i} className="group flex items-center gap-2">
                  <input
                    value={r.key}
                    onChange={(e) => setKey(i, e.target.value)}
                    spellCheck={false}
                    className="w-[34%] shrink-0 rounded-md border bg-card px-2.5 py-1.5 font-mono text-[12.5px] text-foreground outline-none focus:border-primary"
                  />
                  <span className="text-muted-foreground">=</span>
                  <div className="relative flex-1">
                    <input
                      value={r.value}
                      onChange={(e) => setVal(i, e.target.value)}
                      type={revealAll || revealed.has(i) ? 'text' : 'password'}
                      spellCheck={false}
                      autoComplete="off"
                      className="w-full rounded-md border bg-card py-1.5 pl-2.5 pr-9 font-mono text-[12.5px] text-foreground outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      title={revealAll || revealed.has(i) ? 'Ocultar' : 'Revelar'}
                      className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-3.5"
                    >
                      {revealAll || revealed.has(i) ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    title="Remover variável"
                    className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 [&_svg]:size-3.5"
                  >
                    <Trash2 />
                  </button>
                </div>
              )
            )}
          </div>
        )}

        <button
          type="button"
          onClick={addRow}
          className="mt-3 flex h-8 items-center gap-1.5 rounded-md border border-dashed px-2.5 text-[13px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground [&_svg]:size-3.5"
        >
          <Plus />Adicionar variável
        </button>
      </div>
    </div>
  );
}

// Visualizador de imagem (SVG/PNG/GIF/JPG/WEBP) com zoom e arraste.
function ImageViewer({ src, name }) {
  return (
    <div className="absolute inset-0 flex flex-col">
      <TransformWrapper minScale={0.1} maxScale={20} centerOnInit doubleClick={{ mode: 'reset' }}>
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <div className="flex h-8 shrink-0 items-center gap-1 border-b bg-card px-2 text-xs text-muted-foreground">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => zoomOut()} title="Diminuir"><ZoomOut /></Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => zoomIn()} title="Aumentar"><ZoomIn /></Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => resetTransform()} title="Ajustar à tela"><Maximize2 /></Button>
              <span className="ml-1 truncate">role para zoom · arraste para mover · duplo-clique reseta</span>
            </div>
            <div className="ygc-checker relative min-h-0 flex-1">
              <TransformComponent
                wrapperStyle={{ width: '100%', height: '100%' }}
                contentStyle={{ width: '100%', height: '100%' }}
              >
                <div className="flex h-full w-full items-center justify-center p-4">
                  <img src={src} alt={name} draggable={false} className="max-h-full max-w-full object-contain" />
                </div>
              </TransformComponent>
            </div>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}

// Visualizador de PDF: usa o leitor nativo embutido no Chromium (zoom, busca,
// paginação, impressão) apontando um <iframe> pra data URL. Zero dependências.
function PdfViewer({ src, name }) {
  return (
    <iframe
      src={src}
      title={name}
      className="absolute inset-0 h-full w-full border-0 bg-card"
    />
  );
}

function Tree({ dirPath, depth }) {
  const { refresh } = useContext(FileTreeCtx);
  const [items, setItems] = useState(null);
  useEffect(() => { window.api.listDir(dirPath).then(setItems); }, [dirPath, refresh]);
  if (!items) return null;
  return items.map((it) => <TreeNode key={it.path} item={it} depth={depth} />);
}

function TreeNode({ item, depth }) {
  const ctx = useContext(FileTreeCtx);
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  const isSel = ctx.selectedSet?.has(item.path) || (ctx.selectedSet?.size === 0 && ctx.activePath === item.path);
  const isRenaming = ctx.renaming === item.path;
  const isCut = ctx.cutPath === item.path;
  return (
    <div>
      <div
        data-tree-row=""
        data-path={item.path}
        data-name={item.name}
        data-dir={item.isDir ? '1' : ''}
        draggable={!isRenaming}
        onDragStart={(e) => ctx.onTreeDragStart(e, item)}
        onDragEnd={ctx.onTreeDragEnd}
        onDragOver={(e) => {
          const dest = item.isDir ? item.path : parentDir(item.path);
          const isFiles = e.dataTransfer.types.includes('Files');
          const internal = ctx.dragActive && ctx.canDropItems(dest);
          if (!isFiles && !internal) return;
          e.preventDefault(); e.stopPropagation();
          e.dataTransfer.dropEffect = isFiles ? 'copy' : 'move';
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          const dest = item.isDir ? item.path : parentDir(item.path);
          if (e.dataTransfer.files?.length) {
            e.preventDefault(); e.stopPropagation(); setOver(false);
            ctx.onDropFiles?.(e.dataTransfer.files, dest);
            return;
          }
          if (ctx.dragActive) {
            e.preventDefault(); e.stopPropagation(); setOver(false);
            ctx.onDropMove?.(dest);
          }
        }}
        className={cn(
          'flex cursor-pointer select-none items-center gap-1.5 py-[3px] pr-2 text-[13px] hover:bg-muted',
          isSel && 'bg-accent',
          isCut && 'opacity-50',
          over && 'bg-primary/10 ring-1 ring-inset ring-primary/50'
        )}
        style={{ paddingLeft: depth * 12 + 8 }}
        onClick={(e) => {
          ctx.onNodeClick(e, item);
          if (e.shiftKey || e.ctrlKey || e.metaKey) return; // seleção múltipla: não abre/expande
          item.isDir ? setOpen((o) => !o) : ctx.onSelect(item);
        }}
        onContextMenu={(e) => { ctx.onContextNode(item); ctx.openMenu(e, item); }}
        title={item.name}
      >
        {item.isDir ? (
          open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
               : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <img
          src={item.isDir ? folderIconUrl(item.name, open) : fileIconUrl(item.name)}
          alt=""
          draggable={false}
          className="h-4 w-4 shrink-0"
        />
        {isRenaming ? (
          <input
            autoFocus
            defaultValue={item.name}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') ctx.commitRename(item, e.target.value);
              else if (e.key === 'Escape') ctx.cancelRename();
            }}
            onBlur={(e) => ctx.commitRename(item, e.target.value)}
            className="min-w-0 flex-1 rounded border bg-background px-1 text-[13px] outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <span className="truncate">{item.name}</span>
        )}
      </div>
      {item.isDir && open && <Tree dirPath={item.path} depth={depth + 1} />}
    </div>
  );
}

// ---------- Menu de contexto (botão direito) ----------
function MenuItem({ icon: Icon, label, onClick, danger, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted disabled:pointer-events-none disabled:opacity-40',
        danger && 'text-red-600'
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function FileMenu({ menu, clip, actions, selItems, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
    };
  }, [menu, onClose]);
  if (!menu) return null;
  const { x, y, item } = menu;
  const run = (fn) => () => { onClose(); fn(item); };
  // Quantos itens o "Delete" vai apagar (a seleção inteira se o item clicado fizer parte dela).
  const delCount = selItems?.has(item.path) && selItems.size > 1 ? selItems.size : 1;
  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[200px] overflow-hidden rounded-md border bg-background py-1 shadow-md"
      style={{ left: x, top: y }}
    >
      {item.root ? (
        // Área em branco: criar na raiz do projeto, ou colar.
        <>
          <MenuItem icon={FilePlus} label="New File" onClick={run(actions.newFile)} />
          <MenuItem icon={FolderPlus} label="New Folder" onClick={run(actions.newFolder)} />
          <div className="my-1 border-t" />
          <MenuItem icon={ClipboardPaste} label="Paste" disabled={!clip} onClick={run(actions.paste)} />
        </>
      ) : (
        <>
          <MenuItem icon={FilePlus} label="New File" onClick={run(actions.newFile)} />
          <MenuItem icon={FolderPlus} label="New Folder" onClick={run(actions.newFolder)} />
          <div className="my-1 border-t" />
          <MenuItem icon={ExternalLink} label="Reveal in File Explorer" onClick={run(actions.reveal)} />
          <div className="my-1 border-t" />
          <MenuItem icon={Scissors} label="Cut" onClick={run(actions.cut)} />
          <MenuItem icon={Copy} label="Copy" onClick={run(actions.copy)} />
          {clip && <MenuItem icon={ClipboardPaste} label="Paste" onClick={run(actions.paste)} />}
          <MenuItem icon={Link2} label="Copy Path" onClick={run(actions.copyPath)} />
          <div className="my-1 border-t" />
          <MenuItem icon={Pencil} label="Rename" onClick={run(actions.rename)} />
          <MenuItem icon={Trash2} label={delCount > 1 ? `Delete ${delCount} items` : 'Delete'} danger onClick={run(actions.del)} />
        </>
      )}
    </div>
  );
}
