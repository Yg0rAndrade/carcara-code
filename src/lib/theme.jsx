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
  // amoled: o terminal escuro também vai pro preto puro (paleta 'amoled' do xterm).
  carvao: { family: 'dark', amoled: true },
  papel: { family: 'light' },
  ceu: { family: 'light' },
  oceano: { family: 'dark' },
  mata: { family: 'dark' },
  ipe: { family: 'dark' },
  menta: { family: 'light' },
  lavanda: { family: 'light' },
  coral: { family: 'light' },
  pitanga: { family: 'dark' },
  cerrado: { family: 'dark' },
  noite: { family: 'dark' },
};

// Ordem de exibição nos seletores (Aparência e barra de título): claros, escuros
// neutros/da marca, e os coloridos — em linhas de 3.
export const THEME_ORDER = [
  'light',
  'papel',
  'ceu',
  'dark',
  'carvao',
  'brasa',
  'oceano',
  'mata',
  'ipe',
  'menta',
  'lavanda',
  'coral',
  'pitanga',
  'cerrado',
  'noite',
];

// Cores da miniatura de cada tema (ui/theme-preview.jsx). Aproximam a paleta real do
// index.css só pra reconhecimento visual; a fonte da verdade continua sendo o CSS.
export const THEME_SWATCH = {
  light: {
    label: 'settings.themeLight',
    family: 'light',
    bg: 'hsl(220 16% 93%)',
    card: '#ffffff',
    line: 'hsl(220 13% 82%)',
    primary: 'hsl(37.7 92% 50%)',
    border: 'hsl(220 13% 88%)',
  },
  dark: {
    label: 'settings.themeDark',
    family: 'dark',
    bg: 'hsl(0 0% 9%)',
    card: 'hsl(0 0% 15%)',
    line: 'hsl(0 0% 34%)',
    primary: 'hsl(25 88% 56%)',
    border: 'hsl(0 0% 26%)',
  },
  brasa: {
    label: 'settings.themeBrasa',
    // Fundo bem mais quente/avermelhado e a brasa "acesa" (glow) pra se distinguir
    // do escuro neutro. É o tema que deve gritar "calor".
    family: 'dark',
    bg: 'hsl(12 40% 8%)',
    card: 'hsl(14 30% 12%)',
    line: 'hsl(16 20% 34%)',
    primary: 'hsl(20 100% 57%)',
    border: 'hsl(16 34% 22%)',
    glow: true,
  },
  carvao: {
    label: 'settings.themeCarvao',
    // Preto absoluto na moldura + card quase preto: lê como "o mais fundo/OLED".
    family: 'dark',
    bg: '#000000',
    card: 'hsl(0 0% 7%)',
    line: 'hsl(0 0% 26%)',
    primary: 'hsl(25 90% 56%)',
    border: 'hsl(0 0% 14%)',
  },
  papel: {
    label: 'settings.themePapel',
    // Creme quente e saturado + linhas sépia: destaca do branco frio do "Claro".
    family: 'light',
    bg: 'hsl(38 44% 88%)',
    card: 'hsl(42 52% 96%)',
    line: 'hsl(34 26% 74%)',
    primary: 'hsl(30 92% 48%)',
    border: 'hsl(36 30% 80%)',
  },
  ceu: {
    label: 'settings.themeCeu',
    // Claro com o azul do céu: moldura azulada e destaque azul vivo.
    family: 'light',
    bg: 'hsl(210 55% 92%)',
    card: '#ffffff',
    line: 'hsl(212 30% 80%)',
    primary: 'hsl(212 90% 52%)',
    border: 'hsl(212 35% 85%)',
  },
  oceano: {
    label: 'settings.themeOceano',
    // Azul-marinho fundo + azul de água acesa.
    family: 'dark',
    bg: 'hsl(215 45% 8%)',
    card: 'hsl(215 34% 13%)',
    line: 'hsl(212 22% 34%)',
    primary: 'hsl(199 92% 56%)',
    border: 'hsl(214 28% 21%)',
    glow: true,
  },
  mata: {
    label: 'settings.themeMata',
    // Verde-floresta escuro + folha viva.
    family: 'dark',
    bg: 'hsl(152 34% 7%)',
    card: 'hsl(150 26% 11.5%)',
    line: 'hsl(148 16% 32%)',
    primary: 'hsl(145 63% 47%)',
    border: 'hsl(150 22% 19%)',
  },
  ipe: {
    label: 'settings.themeIpe',
    // Noite arroxeada + o rosa-magenta da flor do ipê.
    family: 'dark',
    bg: 'hsl(280 30% 8%)',
    card: 'hsl(282 25% 12.5%)',
    line: 'hsl(286 14% 34%)',
    primary: 'hsl(322 85% 63%)',
    border: 'hsl(285 22% 21%)',
    glow: true,
  },
  menta: {
    label: 'settings.themeMenta',
    family: 'light',
    bg: 'hsl(150 38% 91%)',
    card: '#ffffff',
    line: 'hsl(152 22% 78%)',
    primary: 'hsl(160 72% 36%)',
    border: 'hsl(152 26% 84%)',
  },
  lavanda: {
    label: 'settings.themeLavanda',
    family: 'light',
    bg: 'hsl(262 45% 93%)',
    card: '#ffffff',
    line: 'hsl(262 22% 82%)',
    primary: 'hsl(262 70% 56%)',
    border: 'hsl(262 30% 87%)',
  },
  coral: {
    label: 'settings.themeCoral',
    family: 'light',
    bg: 'hsl(12 70% 93%)',
    card: '#ffffff',
    line: 'hsl(10 30% 82%)',
    primary: 'hsl(4 78% 58%)',
    border: 'hsl(10 40% 87%)',
  },
  pitanga: {
    label: 'settings.themePitanga',
    family: 'dark',
    bg: 'hsl(355 32% 8%)',
    card: 'hsl(355 26% 12%)',
    line: 'hsl(355 16% 33%)',
    primary: 'hsl(354 85% 60%)',
    border: 'hsl(355 24% 20%)',
    glow: true,
  },
  cerrado: {
    label: 'settings.themeCerrado',
    family: 'dark',
    bg: 'hsl(35 30% 8%)',
    card: 'hsl(33 24% 12%)',
    line: 'hsl(35 16% 33%)',
    primary: 'hsl(42 88% 55%)',
    border: 'hsl(34 22% 20%)',
  },
  noite: {
    label: 'settings.themeNoite',
    family: 'dark',
    bg: 'hsl(236 36% 9%)',
    card: 'hsl(236 28% 13.5%)',
    line: 'hsl(234 18% 36%)',
    primary: 'hsl(234 85% 70%)',
    border: 'hsl(236 24% 22%)',
    glow: true,
  },
};

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
  // Paleta do xterm (chave de TERM_THEMES): a família do terminal, ou 'amoled' quando
  // o terminal é escuro e o tema do app pede preto puro. Fundo/cores vêm daqui; a
  // FAMÍLIA (classe .light/.dark, tema da CLI) continua vindo de terminalTheme.
  terminalPalette: 'light',
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
  const terminalPalette =
    terminalTheme === 'dark' && THEMES[theme]?.amoled ? 'amoled' : terminalTheme;

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
        terminalPalette,
      }}
    >
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}
