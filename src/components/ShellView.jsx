import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { Plus, X } from 'lucide-react';
import { useTheme } from '@/lib/theme.jsx';
import { useT } from '@/lib/i18n';
// Paleta e semântica de copiar/colar são compartilhadas com o terminal do
// "Gerenciar IAs" (AiManager) e o do Claude Code (ChatPanel) — ver src/lib/xtermShared.js.
import {
  TERM_THEMES,
  baseTerminalOptions,
  attachCopyPaste,
  terminalSurface,
} from '@/lib/xtermShared';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './ui/resizable.jsx';
import {
  isPane,
  firstPane,
  allPanes,
  paneCount,
  allSessionIds,
  makePane,
  applyDrop,
  addSessionToPane,
  setActiveInPane,
  closeSessionInTree,
} from '@/lib/paneLayout.js';
import { computeZone, ZONE_STYLE } from '@/lib/dropZones.js';
import { cn } from '@/lib/utils';

// Estado EFÊMERO dos terminais livres, fora do componente pra sobreviver a
// fechar/abrir o painel (o ShellView desmonta quando o terminal é fechado). Vive
// só durante a sessão do app: no restart o renderer recarrega e os PTYs do main
// morrem junto, então recomeça limpo — de propósito (não persistimos no config).
const shellTrees = new Map(); // projectPath -> árvore de panes (paneLayout)
const shellMeta = new Map(); // termId -> { name }
const shellSeq = new Map(); // projectPath -> próximo número de "Terminal N"

const newTermId = () => crypto.randomUUID();

// Refaz o fit e só avisa o PTY quando a grade de caracteres realmente mudou.
// Resizes redundantes fazem o conpty reemitir a tela e duplicar conteúdo.
function syncSize(t) {
  try {
    t.fit.fit();
    if (t.term.cols !== t.lastCols || t.term.rows !== t.lastRows) {
      t.lastCols = t.term.cols;
      t.lastRows = t.term.rows;
      window.api.shellResize(t.termId, t.term.cols, t.term.rows);
    }
  } catch {}
}

// Terminais livres por projeto (npm, instalar skills, dev server…), em abas e
// splits — mesmo modelo de árvore (paneLayout.js) das sessões do Claude Code, mas
// enxuto: sem CLI/atividade/chat, só shell limpo. Cada aba mantém seu PTY e
// scrollback vivos ao trocar (esconder/mostrar, nunca destruir o xterm).
export function ShellView({ activeProject, visible, onOpenUrl }) {
  const t = useT();
  const { terminalTheme } = useTheme();
  const themeRef = useRef(terminalTheme);
  const hostRef = useRef(null);
  const termsRef = useRef(new Map()); // termId -> { term, fit, el, lastCols, lastRows, termId, projectPath, awaitingReconnect }
  const paneRefs = useRef(new Map()); // paneId -> container de conteúdo do pane
  // O WebLinksAddon é criado uma vez por terminal e captura o handler; guardamos
  // o onOpenUrl num ref pra o clique sempre chamar a versão atual (não a obsoleta).
  const onOpenUrlRef = useRef(onOpenUrl);
  onOpenUrlRef.current = onOpenUrl;
  const projectRef = useRef(activeProject);
  projectRef.current = activeProject;

  const [layout, setLayout] = useState(null); // árvore do projeto ativo
  const layoutRef = useRef(null);
  const [focusedPane, setFocusedPane] = useState(null);
  const focusedPaneRef = useRef(null);
  focusedPaneRef.current = focusedPane;

  // Arrastar abas entre panes / zonas de split.
  const [dragId, setDragId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // { paneId, zone }
  const dragRef = useRef(null);

  // Confirmação de fechar aba (pode ter processo rodando).
  const [closing, setClosing] = useState(null); // termId a confirmar

  const nextName = (projectPath) => {
    const n = shellSeq.get(projectPath) || 1;
    shellSeq.set(projectPath, n + 1);
    return t('preview.term_default_name', { n });
  };

  const commitLayout = (next) => {
    layoutRef.current = next;
    setLayout(next);
    if (projectRef.current) shellTrees.set(projectRef.current, next);
  };

  const refitAll = () => {
    for (const [, te] of termsRef.current) {
      if (te.el.isConnected && te.el.style.display !== 'none') syncSize(te);
    }
  };
  const refitTimer = useRef(0);
  const scheduleRefit = () => {
    cancelAnimationFrame(refitTimer.current);
    refitTimer.current = requestAnimationFrame(refitAll);
  };

  // Troca a árvore ao mudar de projeto: reusa a salva (efêmera) ou cria uma com
  // um terminal já pronto (paridade com o comportamento de "abrir Terminal").
  useEffect(() => {
    if (!activeProject) {
      layoutRef.current = null;
      setLayout(null);
      setFocusedPane(null);
      return;
    }
    let tree = shellTrees.get(activeProject);
    if (!tree) {
      const id = newTermId();
      shellMeta.set(id, { name: nextName(activeProject) });
      tree = makePane([id], id);
      shellTrees.set(activeProject, tree);
    }
    layoutRef.current = tree;
    setLayout(tree);
    setFocusedPane(firstPane(tree)?.id ?? null);
  }, [activeProject]);

  // Troca o tema de todos os terminais abertos quando muda claro/escuro.
  useEffect(() => {
    themeRef.current = terminalTheme;
    for (const [, te] of termsRef.current) te.term.options.theme = TERM_THEMES[terminalTheme];
  }, [terminalTheme]);

  // Listeners de IPC (com limpeza — o componente remonta a cada abrir do painel).
  useEffect(() => {
    const offData = window.api.on('shell:data', ({ termId, data }) => {
      const te = termsRef.current.get(termId);
      if (te) te.term.write(data);
    });
    const offExit = window.api.on('shell:exit', ({ termId, projectPath }) => {
      const te = termsRef.current.get(termId);
      if (!te) return;
      if (String(projectPath).startsWith('ssh://')) {
        te.term.write('\r\n\x1b[90m[conexão perdida] — pressione Enter para reconectar\x1b[0m\r\n');
        te.awaitingReconnect = true;
      } else {
        te.term.write('\r\n\x1b[90m[sessão encerrada]\x1b[0m\r\n');
      }
    });
    return () => {
      offData?.();
      offExit?.();
    };
  }, []);

  // Cria o xterm de um terminal dentro do container de um pane.
  const createTerm = (termId, container, projectPath) => {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.padding = '8px 4px 8px 10px';
    container.appendChild(el);

    const term = new Terminal(baseTerminalOptions(themeRef.current));
    const fit = new FitAddon();
    term.loadAddon(fit);
    // Links clicáveis: Ctrl/Cmd+clique abre a URL no preview do Carcará; clique
    // simples é ignorado pra não atrapalhar a seleção de texto.
    term.loadAddon(
      new WebLinksAddon((event, uri) => {
        if (event.ctrlKey || event.metaKey) onOpenUrlRef.current?.(uri);
      }),
    );
    attachCopyPaste(term);

    term.open(el);
    // Renderizador WebGL: pinta num único canvas de GPU e repinta a cada frame ao
    // rolar, matando os glitches de "tinta velha". Se o contexto cair, volta pro DOM.
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        try {
          webgl.dispose();
        } catch {}
      });
      term.loadAddon(webgl);
    } catch {}

    const te = {
      term,
      fit,
      el,
      lastCols: 0,
      lastRows: 0,
      termId,
      projectPath,
      awaitingReconnect: false,
    };
    termsRef.current.set(termId, te);

    term.onData((d) => {
      if (te.awaitingReconnect) {
        if (d === '\r') {
          te.awaitingReconnect = false;
          te.term.write('\r\n\x1b[90m[reconectando…]\x1b[0m\r\n');
          window.api.reconnectRemote(projectPath).then((r) => {
            if (r && r.ok === false) {
              te.term.write('\r\n\x1b[31m[' + (r.error || 'reconexão falhou') + ']\x1b[0m\r\n');
              return;
            }
            window.api.shellEnsure(termId, projectPath, te.term.cols, te.term.rows).then((res) => {
              if (res && res.error) te.term.write('\r\n\x1b[31m[' + res.error + ']\x1b[0m\r\n');
              else if (res && res.buffer) te.term.write(res.buffer);
            });
          });
        }
        return; // engole o input enquanto aguarda o Enter de reconexão
      }
      window.api.shellInput(termId, d);
    });

    // Mede só depois do layout assentar e SÓ então cria o PTY no tamanho final,
    // pra não spawnar num tamanho provisório e duplicar a tela no resize seguinte.
    requestAnimationFrame(() => {
      fit.fit();
      te.lastCols = term.cols;
      te.lastRows = term.rows;
      window.api.shellEnsure(termId, projectPath, term.cols, term.rows).then((res) => {
        if (res && res.error) term.write('\r\n\x1b[31m[' + res.error + ']\x1b[0m\r\n');
        else if (res && res.buffer) term.write(res.buffer);
      });
      term.focus();
    });
    return te;
  };

  // Posiciona cada terminal no container do seu pane e mostra só a aba ativa.
  useEffect(() => {
    if (!visible || !activeProject || !layout) return;
    for (const p of allPanes(layout)) {
      const container = paneRefs.current.get(p.id);
      if (!container) continue;
      for (const id of p.tabs) {
        const isActive = id === p.active;
        let te = termsRef.current.get(id);
        if (!te && isActive) te = createTerm(id, container, activeProject);
        if (!te) continue;
        if (te.el.parentNode !== container) container.appendChild(te.el);
        te.el.style.display = isActive ? 'block' : 'none';
      }
    }
    scheduleRefit();
  }, [layout, activeProject, visible]);

  // Reajusta os terminais visíveis quando o painel muda de tamanho.
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
  }, [activeProject]);

  const focusTerm = (id) => {
    const te = termsRef.current.get(id);
    if (te)
      requestAnimationFrame(() => {
        try {
          te.term.focus();
        } catch {}
      });
  };

  const addTerminal = (paneId) => {
    if (!activeProject) return;
    const id = newTermId();
    shellMeta.set(id, { name: nextName(activeProject) });
    commitLayout(addSessionToPane(layoutRef.current, paneId, id));
    setFocusedPane(paneId);
    focusTerm(id);
  };

  const onTabClick = (paneId, id) => {
    commitLayout(setActiveInPane(layoutRef.current, paneId, id));
    setFocusedPane(paneId);
    focusTerm(id);
  };

  // Fecha de fato após a confirmação: mata o PTY, descarta o xterm e tira da árvore.
  const doClose = (id) => {
    window.api.shellClose(id);
    const te = termsRef.current.get(id);
    if (te) {
      try {
        te.term.dispose();
      } catch {}
      te.el.remove();
      termsRef.current.delete(id);
    }
    shellMeta.delete(id);
    commitLayout(closeSessionInTree(layoutRef.current, id));
    setClosing(null);
  };

  // --- Arrastar e soltar abas ---
  const onTabDragStart = (paneId, id, e) => {
    dragRef.current = { id, from: paneId };
    setDragId(id);
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    } catch {}
  };
  const endDrag = () => {
    dragRef.current = null;
    setDragId(null);
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
    commitLayout(applyDrop(layoutRef.current, paneId, zone, d.id));
    setFocusedPane(paneId);
    focusTerm(d.id);
  };

  const onSplitLayout = (node, sizes) => {
    node.sizes = sizes; // tamanho é "não controlado": mutação direta + refit
    if (projectRef.current) shellTrees.set(projectRef.current, layoutRef.current);
    scheduleRefit();
  };

  const setPaneRef = (id) => (el) => {
    if (el) paneRefs.current.set(id, el);
    else paneRefs.current.delete(id);
  };

  const multi = layout ? paneCount(layout) > 1 : false;
  const canClose = layout ? allSessionIds(layout).length > 1 : false;

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
          className="flex h-9 shrink-0 items-center border-b bg-card px-1.5"
          onDragOver={
            dragId
              ? (e) => {
                  e.preventDefault();
                  setDropTarget({ paneId: p.id, zone: 'center' });
                }
              : undefined
          }
          onDrop={dragId ? (e) => onDrop(p.id, 'center', e) : undefined}
        >
          <div className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden">
            {p.tabs.map((id) => {
              const isActive = id === p.active;
              return (
                <div
                  key={id}
                  draggable
                  onDragStart={(e) => onTabDragStart(p.id, id, e)}
                  onDragEnd={endDrag}
                  onClick={() => onTabClick(p.id, id)}
                  className={
                    'group flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded px-2.5 text-[13px] transition-colors ' +
                    (isActive
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60')
                  }
                >
                  <span>{shellMeta.get(id)?.name || 'Terminal'}</span>
                  {canClose && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setClosing(id);
                      }}
                      title={t('preview.term_close')}
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
            onClick={() => addTerminal(p.id)}
            title={t('preview.term_new')}
            className="ml-1 grid size-7 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-[15px]"
          >
            <Plus />
          </button>
        </div>

        <div ref={setPaneRef(p.id)} className="relative flex-1 overflow-hidden">
          {dragId && (
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

  // Fundo do terminal + família de cores juntos (ver terminalSurface): a área tem UI
  // do app (abas, estado vazio) por cima do fundo do terminal, que tem tema próprio.
  const surface = terminalSurface(terminalTheme);

  return (
    <div
      ref={hostRef}
      className={cn('absolute inset-0 flex flex-col', surface.className)}
      style={{ ...surface.style, display: visible ? 'flex' : 'none' }}
    >
      {!activeProject ? (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-muted-foreground">
          Abra um projeto para usar o terminal aqui.
        </div>
      ) : (
        layout && <div className="min-h-0 flex-1">{renderNode(layout)}</div>
      )}

      {closing && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55">
          <div className="w-[330px] rounded-2xl border border-destructive/30 bg-background p-5 text-center shadow-xl">
            <div className="text-sm font-semibold">{t('preview.term_close_confirm')}</div>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setClosing(null)}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
              >
                {t('settings.portsCloseCancel')}
              </button>
              <button
                type="button"
                onClick={() => doClose(closing)}
                className="rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground hover:opacity-90"
              >
                {t('preview.term_close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
