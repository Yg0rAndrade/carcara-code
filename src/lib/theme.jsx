import { createContext, useContext, useEffect, useState } from 'react';

// Registro de temas da interface. Cada tema declara sua "família" (light|dark):
// a família liga a classe `.dark` (que os poucos utilitários `dark:` do Tailwind
// e a paleta base do CSS usam), e o `data-theme` aplica a paleta específica por
// cima. Assim um tema novo = uma família + um bloco de variáveis no index.css.
// 'light' e 'dark' não têm bloco próprio (caem na base :root / .dark).
export const THEMES = {
  light: { family: 'light' },
  dark: { family: 'dark' },
  brasa: { family: 'dark' },
  carvao: { family: 'dark' },
  papel: { family: 'light' },
};

// Ordem de exibição no seletor (Aparência).
export const THEME_ORDER = ['light', 'dark', 'brasa', 'carvao', 'papel'];

// Família (light|dark) de um tema, com fallback seguro para 'light'.
export function themeFamily(theme) {
  return THEMES[theme]?.family ?? 'light';
}

const ThemeCtx = createContext({
  theme: 'light',
  // Superfície escura? Resolve a FAMÍLIA do tema (brasa/carvão também são dark).
  // Use isto — nunca `theme === 'dark'` — para escolher variante clara/escura
  // de editores, ícones e libs, senão temas dark nomeados caem no visual claro.
  isDark: false,
  setTheme: () => {},
  toggle: () => {},
  // 'auto' acompanha o tema do app; 'light'/'dark' fixam o terminal.
  terminalAppearance: 'auto',
  setTerminalAppearance: () => {},
  // Tema EFETIVO do terminal já resolvido (sempre 'light' ou 'dark', nunca 'auto'
  // nem um tema nomeado como 'brasa' — o terminal só entende as duas famílias).
  terminalTheme: 'light',
});

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    return THEMES[saved] ? saved : 'light';
  });
  const [terminalAppearance, setTerminalAppearance] = useState(
    () => localStorage.getItem('terminalAppearance') || 'auto',
  );

  useEffect(() => {
    const root = document.documentElement;
    // A classe `.dark` segue a FAMÍLIA (brasa/carvão também são "dark"); o
    // `data-theme` seleciona a paleta específica por cima da base.
    root.classList.toggle('dark', themeFamily(theme) === 'dark');
    root.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('terminalAppearance', terminalAppearance);
  }, [terminalAppearance]);

  // Alternar = pular pra família oposta (mantém o "flip rápido" do atalho/paleta).
  const toggle = () => setTheme((t) => (themeFamily(t) === 'dark' ? 'light' : 'dark'));
  const isDark = themeFamily(theme) === 'dark';
  const terminalTheme = terminalAppearance === 'auto' ? themeFamily(theme) : terminalAppearance;

  return (
    <ThemeCtx.Provider
      value={{
        theme,
        isDark,
        setTheme,
        toggle,
        terminalAppearance,
        setTerminalAppearance,
        terminalTheme,
      }}
    >
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}
