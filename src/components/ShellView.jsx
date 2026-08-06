import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useTheme } from '@/lib/theme.jsx';
// Paleta e semântica de copiar/colar são compartilhadas com o terminal do
// "Gerenciar IAs" (AiManager) — ver src/lib/xtermShared.js.
import {
  TERM_THEMES,
  baseTerminalOptions,
  attachCopyPaste,
  terminalSurface,
} from '@/lib/xtermShared';
import { cn } from '@/lib/utils';

// Refaz o fit e só avisa o PTY quando a grade de caracteres realmente mudou.
// Resizes redundantes fazem o conpty reemitir a tela e duplicar conteúdo.
function syncSize(t, projectPath, resizeFn) {
  try {
    t.fit.fit();
    if (t.term.cols !== t.lastCols || t.term.rows !== t.lastRows) {
      t.lastCols = t.term.cols;
      t.lastRows = t.term.rows;
      resizeFn(projectPath, t.term.cols, t.term.rows);
    }
  } catch {}
}

// Terminal livre por projeto (npm, instalar skills, etc.).
// Fica sempre montado; a prop `visible` controla a exibição p/ não perder a sessão.
export function ShellView({ activeProject, visible, onOpenUrl }) {
  const { terminalTheme } = useTheme();
  const themeRef = useRef(terminalTheme);
  const hostRef = useRef(null);
  const termsRef = useRef(new Map()); // path -> { term, fit, el }
  // O WebLinksAddon é criado uma vez por terminal e captura o handler; guardamos
  // o onOpenUrl num ref pra o clique sempre chamar a versão atual (não a obsoleta).
  const onOpenUrlRef = useRef(onOpenUrl);
  onOpenUrlRef.current = onOpenUrl;

  // Troca o tema de todos os terminais abertos quando muda claro/escuro.
  useEffect(() => {
    themeRef.current = terminalTheme;
    for (const [, t] of termsRef.current) t.term.options.theme = TERM_THEMES[terminalTheme];
  }, [terminalTheme]);

  // Listeners de IPC (uma vez só).
  useEffect(() => {
    window.api.on('shell:data', ({ projectPath, data }) => {
      const t = termsRef.current.get(projectPath);
      if (t) t.term.write(data);
    });
    window.api.on('shell:exit', ({ projectPath }) => {
      const t = termsRef.current.get(projectPath);
      if (!t) return;
      if (projectPath.startsWith('ssh://')) {
        t.term.write('\r\n\x1b[90m[conexão perdida] — pressione Enter para reconectar\x1b[0m\r\n');
        t.awaitingReconnect = true;
      } else {
        t.term.write('\r\n\x1b[90m[sessão encerrada]\x1b[0m\r\n');
      }
    });
  }, []);

  // Cria/mostra o terminal do projeto ativo (só quando o painel está visível).
  useEffect(() => {
    if (!visible || !activeProject) return;
    const host = hostRef.current;
    for (const [p, t] of termsRef.current)
      t.el.style.display = p === activeProject ? 'block' : 'none';

    let t = termsRef.current.get(activeProject);
    if (!t) {
      const el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.inset = '0';
      el.style.padding = '8px 4px 8px 10px';
      host.appendChild(el);

      const term = new Terminal(baseTerminalOptions(themeRef.current));
      const fit = new FitAddon();
      term.loadAddon(fit);
      // Links clicáveis no terminal (addon oficial do xterm). Ctrl/Cmd+clique
      // abre a URL no preview do Carcará em vez do navegador externo; clique
      // simples é ignorado pra não atrapalhar a seleção de texto.
      term.loadAddon(
        new WebLinksAddon((event, uri) => {
          if (event.ctrlKey || event.metaKey) onOpenUrlRef.current?.(uri);
        }),
      );
      attachCopyPaste(term);

      term.open(el);
      // Renderizador WebGL: pinta o terminal num único canvas de GPU e repinta a
      // cada frame ao rolar, eliminando os glitches de "tinta velha" que o
      // renderizador DOM deixava. Se o contexto WebGL cair, volta pro DOM sozinho.
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
        const t = termsRef.current.get(activeProject);
        if (t && t.awaitingReconnect) {
          if (d === '\r') {
            t.awaitingReconnect = false;
            t.term.write('\r\n\x1b[90m[reconectando…]\x1b[0m\r\n');
            window.api.reconnectRemote(activeProject).then((r) => {
              if (r && r.ok === false) {
                t.term.write('\r\n\x1b[31m[' + (r.error || 'reconexão falhou') + ']\x1b[0m\r\n');
                return;
              }
              window.api.shellEnsure(activeProject, t.term.cols, t.term.rows).then((res) => {
                if (res && res.error) t.term.write('\r\n\x1b[31m[' + res.error + ']\x1b[0m\r\n');
                else if (res && res.buffer) t.term.write(res.buffer);
              });
            });
          }
          return; // engole o input enquanto aguarda o Enter de reconexão
        }
        window.api.shellInput(activeProject, d);
      });

      t = { term, fit, el, lastCols: 0, lastRows: 0 };
      termsRef.current.set(activeProject, t);

      // Mede só depois do layout assentar e SÓ então cria o PTY no tamanho
      // final, pra não spawnar num tamanho provisório e duplicar a tela no
      // resize seguinte.
      requestAnimationFrame(() => {
        fit.fit();
        t.lastCols = term.cols;
        t.lastRows = term.rows;
        window.api.shellEnsure(activeProject, term.cols, term.rows).then((res) => {
          if (res && res.error) term.write('\r\n\x1b[31m[' + res.error + ']\x1b[0m\r\n');
          else if (res && res.buffer) term.write(res.buffer);
        });
        term.focus();
      });
      return;
    }

    requestAnimationFrame(() => {
      syncSize(t, activeProject, window.api.shellResize);
      t.term.focus();
    });
  }, [activeProject, visible]);

  // Reajusta o terminal ativo quando o painel muda de tamanho.
  useEffect(() => {
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const t = termsRef.current.get(activeProject);
        if (t && t.el.style.display !== 'none') syncSize(t, activeProject, window.api.shellResize);
      });
    });
    if (hostRef.current) ro.observe(hostRef.current);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [activeProject]);

  // Fundo do terminal + família de cores juntos: o estado vazio abaixo é texto do app
  // sobre o fundo do terminal, e sem escopar ele some quando os dois temas divergem.
  const surface = terminalSurface(terminalTheme);

  return (
    <div
      ref={hostRef}
      className={cn('absolute inset-0', surface.className)}
      style={{ ...surface.style, display: visible ? 'block' : 'none' }}
    >
      {!activeProject && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-muted-foreground">
          Abra um projeto para usar o terminal aqui.
        </div>
      )}
    </div>
  );
}
