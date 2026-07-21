import { createContext, useContext, useEffect, useState } from 'react';

// Modo do painel de chat: 'cli' (terminal Claude Code real, padrão) ou 'chat'
// (UI assistant-ui, experimental). Espelha o padrão do layoutContext: mira em
// localStorage pra ler síncrono no boot (sem piscar) e re-sincroniza com o
// config.json (fonte da verdade) ao montar.
const LKEY = 'chatMode:v1';

// Chave mestra do recurso. O painel de chat ainda está em construção, então a opção saiu
// das Configurações e o modo fica travado no terminal — inclusive pra quem já tinha
// deixado 'chat' ligado (senão ficaria preso num painel incompleto, sem botão pra voltar).
// A fiação (config.json, contexto, ChatPanel) continua intacta: quando o chat estiver
// pronto, basta ligar este flag de volta e devolver o card na aba "Projetos".
const CHAT_MODE_ENABLED = false;

const modeOf = (v) => (CHAT_MODE_ENABLED && v === 'chat' ? 'chat' : 'cli');

function readMirror() {
  try {
    return modeOf(localStorage.getItem(LKEY));
  } catch {
    return 'cli';
  }
}

const ChatModeCtx = createContext({ chatMode: 'cli', setChatMode: () => {} });

export function ChatModeProvider({ children }) {
  const [mode, setMode] = useState(readMirror);

  // config.json é a verdade — re-sincroniza ao montar.
  useEffect(() => {
    let alive = true;
    window.api
      .getChatMode?.()
      .then((r) => {
        if (!alive || !r) return;
        setMode(modeOf(r.mode));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const setChatMode = (next) => {
    const m = modeOf(next);
    setMode(m);
    try {
      localStorage.setItem(LKEY, m);
    } catch {}
    window.api.setChatMode?.(m);
  };

  return (
    <ChatModeCtx.Provider value={{ chatMode: mode, setChatMode }}>{children}</ChatModeCtx.Provider>
  );
}

export function useChatMode() {
  return useContext(ChatModeCtx);
}
