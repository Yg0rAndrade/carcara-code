import { createContext, useContext, useEffect, useState } from 'react';
import pt from './locales/pt.json';
import en from './locales/en.json';

const DICTS = { pt, en };

// Idioma inicial: localStorage > idioma do sistema > 'pt'.
function detectInitial() {
  const saved = localStorage.getItem('lang');
  if (saved === 'pt' || saved === 'en') return saved;
  const sys = (navigator.language || '').toLowerCase();
  return sys.startsWith('pt') ? 'pt' : 'en';
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
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
    // Mantém o processo main em sincronia (menus/notificações nativas), inclusive no boot.
    try { window.api?.setLang?.(lang); } catch {}
  }, [lang]);

  // Fallback em cascata: idioma ativo → pt → a própria chave. Nunca lança.
  const t = (key, vars) => {
    const hit = resolve(DICTS[lang], key) ?? resolve(DICTS.pt, key);
    return typeof hit === 'string' ? interpolate(hit, vars) : key;
  };

  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>;
}

export function useT() { return useContext(I18nCtx).t; }
export function useLang() { const { lang, setLang } = useContext(I18nCtx); return { lang, setLang }; }
