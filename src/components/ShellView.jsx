import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useTheme } from '@/lib/theme.jsx';

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
      if (t) t.term.write('\r\n\x1b[90m[sessão encerrada]\x1b[0m\r\n');
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

      const term = new Terminal({
        fontSize: 13,
        fontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace',
        theme: TERM_THEMES[themeRef.current],
        cursorBlink: true,
        scrollback: 5000,
        // Garante contraste mínimo p/ texto esmaecido não sumir no fundo claro.
        minimumContrastRatio: 4.5,
      });
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
      // Copiar/colar no terminal. Ctrl/Cmd+C copia a seleção quando há texto
      // selecionado; sem seleção, deixa virar SIGINT (interromper comando), igual
      // ao VS Code. Ctrl/Cmd+V: NÃO colamos por conta própria — o xterm já trata o
      // evento 'paste' nativo do navegador (e respeita o bracketed-paste). Só
      // retornamos false pra o xterm não mandar ^V (0x16) pro PTY; assim sobra um
      // único caminho de colagem e o texto não entra em dobro.
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
        if (k === 'v') return false; // deixa a colagem nativa do xterm cuidar (uma vez só)
        return true;
      });

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
      term.onData((d) => window.api.shellInput(activeProject, d));

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

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      style={{
        display: visible ? 'block' : 'none',
        background: TERM_THEMES[terminalTheme].background,
      }}
    >
      {!activeProject && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-muted-foreground">
          Abra um projeto para usar o terminal aqui.
        </div>
      )}
    </div>
  );
}
