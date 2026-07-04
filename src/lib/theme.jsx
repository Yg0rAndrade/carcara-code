import { createContext, useContext, useEffect, useState } from 'react';

const ThemeCtx = createContext({
  theme: 'light',
  setTheme: () => {},
  toggle: () => {},
  // 'auto' acompanha o tema do app; 'light'/'dark' fixam o terminal.
  terminalAppearance: 'auto',
  setTerminalAppearance: () => {},
  // Tema EFETIVO do terminal já resolvido (nunca 'auto').
  terminalTheme: 'light',
});

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [terminalAppearance, setTerminalAppearance] = useState(
    () => localStorage.getItem('terminalAppearance') || 'auto',
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('terminalAppearance', terminalAppearance);
  }, [terminalAppearance]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  const terminalTheme = terminalAppearance === 'auto' ? theme : terminalAppearance;

  return (
    <ThemeCtx.Provider
      value={{ theme, setTheme, toggle, terminalAppearance, setTerminalAppearance, terminalTheme }}
    >
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}
