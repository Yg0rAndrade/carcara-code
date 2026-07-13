import { createContext, useContext, useEffect, useState } from 'react';
import { isSupportedLang, langMeta } from './languages';
import pt from './locales/pt.json';
import en from './locales/en.json';

// pt e en entram EAGER: são a base de fallback e cobrem a maioria dos usuários, então
// o t() nunca cai numa chave crua enquanto um idioma extra ainda carrega. Os outros 16
// locales viram chunks separados (import.meta.glob SEM eager = imports dinâmicos) e são
// buscados sob demanda — só o idioma ativo. Isso mantém o bundle de boot enxuto: em vez
// de ~800KB de dicionários no caminho do boot, só pt+en. Trocar de idioma no seletor faz
// um carregamento rápido (disco local) e re-renderiza quando o dicionário chega.
const DICTS = { pt, en };
const loaders = import.meta.glob('./locales/*.json', { import: 'default' });

function loaderFor(code) {
  return loaders[`./locales/${code}.json`];
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
  const [, bump] = useState(0); // força re-render quando um dicionário lazy termina de chegar

  useEffect(() => {
    let alive = true;
    // Carrega o dicionário do idioma ativo se ainda não estiver em memória (pt/en já estão).
    if (!DICTS[lang]) {
      const load = loaderFor(lang);
      if (load)
        load().then((dict) => {
          if (!alive) return;
          DICTS[lang] = dict;
          bump((n) => n + 1);
        });
    }
    localStorage.setItem('lang', lang);
    const meta = langMeta(lang);
    document.documentElement.lang = meta.htmlLang;
    // NOTA RTL: mantemos dir=ltr mesmo em árabe. O layout usa classes físicas (left/right)
    // e não está espelhado; forçar dir=rtl quebraria o layout. Texto árabe em rótulos curtos
    // já renderiza correto (bidi). Espelhamento completo de RTL fica como trabalho futuro.
    document.documentElement.dir = 'ltr';
    // Mantém o processo main em sincronia (menus/notificações nativas), inclusive no boot.
    try {
      window.api?.setLang?.(lang);
    } catch {}
    return () => {
      alive = false;
    };
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
// Lê localStorage diretamente e usa só os dicionários já em memória (pt/en sempre; os
// demais, se o idioma ativo já tiver sido carregado) — cai em en/pt caso ainda não.
export function tStatic(key, vars) {
  const saved = localStorage.getItem('lang');
  const lang = saved && isSupportedLang(saved) ? saved : 'en';
  const hit = resolve(DICTS[lang], key) ?? resolve(DICTS.en, key) ?? resolve(DICTS.pt, key);
  return typeof hit === 'string' ? interpolate(hit, vars) : key;
}
