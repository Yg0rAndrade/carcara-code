import { createContext, useContext, useEffect, useState } from 'react';

// Layout GLOBAL (lado do rail + lado padrão do Claude). Espelhado em localStorage
// pra ler síncrono no boot (sem piscar); o config.json é a fonte da verdade e
// re-sincroniza ao montar. O override POR PROJETO mora no App (depende do ativo).
const LKEY = 'layoutGlobal:v1';
const sideOf = (v) => (v === 'right' ? 'right' : 'left');

function readMirror() {
  try {
    const s = JSON.parse(localStorage.getItem(LKEY) || '{}');
    return { railSide: sideOf(s.railSide), claudeSide: sideOf(s.claudeSide) };
  } catch {
    return { railSide: 'left', claudeSide: 'left' };
  }
}

const LayoutCtx = createContext({
  railSide: 'left',
  claudeSide: 'left',
  setRailSide: () => {},
  setClaudeSideGlobal: () => {},
  setPreset: () => {},
});

export function LayoutProvider({ children }) {
  const [global, setGlobal] = useState(readMirror);

  // Re-sincroniza com o config.json ao montar (fonte da verdade).
  useEffect(() => {
    let alive = true;
    window.api
      .getLayout?.()
      .then((l) => {
        if (!alive || !l) return;
        setGlobal({ railSide: sideOf(l.railSide), claudeSide: sideOf(l.claudeSide) });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Grava no espelho local + main sempre que muda.
  const persist = (next) => {
    setGlobal(next);
    try {
      localStorage.setItem(LKEY, JSON.stringify(next));
    } catch {}
    window.api.setLayout?.(next);
  };

  const value = {
    railSide: global.railSide,
    claudeSide: global.claudeSide,
    setRailSide: (s) => persist({ ...global, railSide: sideOf(s) }),
    setClaudeSideGlobal: (s) => persist({ ...global, claudeSide: sideOf(s) }),
    setPreset: (r, c) => persist({ railSide: sideOf(r), claudeSide: sideOf(c) }),
  };
  return <LayoutCtx.Provider value={value}>{children}</LayoutCtx.Provider>;
}

export function useLayout() {
  return useContext(LayoutCtx);
}
