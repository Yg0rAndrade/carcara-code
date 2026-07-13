import { createContext, useContext, useEffect, useState } from 'react';
import { isSupportedLang, langMeta } from './languages';

// Carrega TODOS os dicionários de ./locales/*.json de uma vez (eager) e os indexa
// por código de idioma (o basename do arquivo). Assim, adicionar um idioma é só
// soltar o <code>.json na pasta — nenhum import manual aqui. São strings curtas,
// então o custo no bundle inicial é pequeno e mantém t() síncrono (sem flash de chave).
const modules = import.meta.glob('./locales/*.json', { eager: true, import: 'default' });
const DICTS = {};
for (const [filePath, dict] of Object.entries(modules)) {
  const code = filePath.slice(filePath.lastIndexOf('/') + 1, -'.json'.length);
  DICTS[code] = dict;
}

// Idioma inicial: localStorage > idioma do sistema > 'en' (pt tem match dedicado).
function detectInitial() {
  const saved = localStorage.getItem('lang');
  if (saved && isSupportedLang(saved)) return saved;
  const sys = (navigator.language || '').toLowerCase();
  if (sys.startsWith('pt')) return 'pt';
  const two = sys.slice(0, 2);
  return isSupportedLang(two) ? two : 'en';
}

// Resolve 'a.b.c' num objeto aninhado; undefined se faltar.
function resolve(dict, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);
}

// Troca {tokens} pelos valores em vars.
function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

const I18nCtx = createContext({ lang: 'pt', setLang: () => {}, t: (k) => k });

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(detectInitial);

  useEffect(() => {
    localStorage.setItem('lang', lang);
    const meta = langMeta(lang);
    document.documentElement.lang = meta.htmlLang;
    // NOTA RTL: mantemos dir=ltr mesmo em árabe. O layout do app usa classes físicas
    // (left/right) e não está espelhado; forçar dir=rtl quebraria o layout. O texto
    // árabe já renderiza corretamente (bidi) dentro de rótulos curtos. Espelhamento
    // completo de RTL fica como trabalho futuro.
    document.documentElement.dir = 'ltr';
    // Mantém o processo main em sincronia (menus/notificações nativas), inclusive no boot.
    try {
      window.api?.setLang?.(lang);
    } catch {}
  }, [lang]);

  // Fallback em cascata: idioma ativo → en → pt → a própria chave. Nunca lança.
  const t = (key, vars) => {
    const hit = resolve(DICTS[lang], key) ?? resolve(DICTS.en, key) ?? resolve(DICTS.pt, key);
    return typeof hit === 'string' ? interpolate(hit, vars) : key;
  };

  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>;
}

export function useT() {
  return useContext(I18nCtx).t;
}
export function useLang() {
  const { lang, setLang } = useContext(I18nCtx);
  return { lang, setLang };
}

// Helper para componentes de classe (ex.: ErrorBoundary) onde hooks não funcionam.
// Lê localStorage diretamente; o idioma do componente muda na próxima renderização.
export function tStatic(key, vars) {
  const saved = localStorage.getItem('lang');
  const lang = saved && isSupportedLang(saved) ? saved : 'en';
  const hit = resolve(DICTS[lang], key) ?? resolve(DICTS.en, key) ?? resolve(DICTS.pt, key);
  return typeof hit === 'string' ? interpolate(hit, vars) : key;
}
