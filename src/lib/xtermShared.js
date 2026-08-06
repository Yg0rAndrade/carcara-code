// Peças comuns dos terminais do app (o livre por projeto, no ShellView, e o do
// "Gerenciar IAs"). Só o que os dois precisam compartilhar de verdade: a paleta por
// tema e a semântica de copiar/colar — a parte fácil de errar.

export const TERM_THEMES = {
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

// Opções base de um terminal do app. `theme` é a chave 'light' | 'dark'.
export function baseTerminalOptions(theme) {
  return {
    fontSize: 13,
    fontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace',
    theme: TERM_THEMES[theme] || TERM_THEMES.dark,
    cursorBlink: true,
    scrollback: 5000,
    // Garante contraste mínimo p/ texto esmaecido não sumir no fundo claro.
    minimumContrastRatio: 4.5,
  };
}

// Copiar/colar no terminal. Ctrl/Cmd+C copia a seleção quando há texto selecionado;
// sem seleção, deixa virar SIGINT (interromper comando), igual ao VS Code. Ctrl/Cmd+V:
// NÃO colamos por conta própria — o xterm já trata o evento 'paste' nativo do navegador
// (e respeita o bracketed-paste). Só retornamos false pra o xterm não mandar ^V (0x16)
// pro PTY; assim sobra um único caminho de colagem e o texto não entra em dobro.
export function attachCopyPaste(term) {
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
}
