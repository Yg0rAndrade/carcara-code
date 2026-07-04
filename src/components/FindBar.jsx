import { useEffect, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Barra "buscar na página" (Ctrl+F) do preview, estilo Chrome. A UI é nossa, mas o
// motor é o NATIVO do webview: findInPage destaca/pula os resultados e o evento
// found-in-page devolve a posição atual e o total. Sem isto, o preview não tinha
// como buscar texto num site aberto.
//
// `webview`  = elemento <webview> ativo (o pai fecha a barra ao trocar de aba, então
//              o elemento é estável enquanto a barra vive).
// `nonce`    = muda toda vez que o Ctrl+F é apertado; re-foca e seleciona o input
//              (reabrir com texto = pronto pra digitar por cima, igual ao navegador).
// `onClose`  = fecha a barra (o pai também limpa a busca ao desmontar este componente).
export function FindBar({ webview, nonce, onClose, t }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState({ active: 0, total: 0 });
  const inputRef = useRef(null);

  // Foca + seleciona ao abrir e a cada Ctrl+F (nonce).
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, [nonce]);

  // Contador (posição/total) vem do evento nativo.
  useEffect(() => {
    if (!webview) return;
    const onFound = (e) => {
      const r = e.result || e;
      setResult({ active: r.activeMatchOrdinal || 0, total: r.matches || 0 });
    };
    webview.addEventListener('found-in-page', onFound);
    return () => {
      try {
        webview.removeEventListener('found-in-page', onFound);
      } catch {}
    };
  }, [webview]);

  // Find-as-you-type: cada mudança re-busca; vazio limpa os destaques.
  useEffect(() => {
    if (!webview) return;
    if (!query) {
      try {
        webview.stopFindInPage('clearSelection');
      } catch {}
      setResult({ active: 0, total: 0 });
      return;
    }
    try {
      webview.findInPage(query);
    } catch {}
  }, [query, webview]);

  // Ao fechar/desmontar: apaga o realce que ficou no site.
  useEffect(() => {
    return () => {
      try {
        webview && webview.stopFindInPage('clearSelection');
      } catch {}
    };
  }, [webview]);

  const step = (forward) => {
    if (!query || !webview) return;
    try {
      webview.findInPage(query, { findNext: true, forward });
    } catch {}
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      step(!e.shiftKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const hasQuery = query.length > 0;

  return (
    <div className="absolute right-3 top-3 z-30 flex items-center gap-1 rounded-lg border bg-popover/95 p-1 pl-2.5 shadow-md backdrop-blur">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        placeholder={t('preview.find_placeholder')}
        className="h-6 w-40 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
      <span
        className={cn(
          'min-w-[44px] text-right text-xs tabular-nums',
          result.total ? 'text-muted-foreground' : 'text-muted-foreground/60',
        )}
      >
        {hasQuery ? `${result.active}/${result.total}` : ''}
      </span>
      <div className="h-4 w-px bg-border" />
      <button
        type="button"
        onClick={() => step(false)}
        disabled={!result.total}
        title={t('preview.find_prev')}
        className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4"
      >
        <ChevronUp />
      </button>
      <button
        type="button"
        onClick={() => step(true)}
        disabled={!result.total}
        title={t('preview.find_next')}
        className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4"
      >
        <ChevronDown />
      </button>
      <button
        type="button"
        onClick={onClose}
        title={t('preview.find_close')}
        className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4"
      >
        <X />
      </button>
    </div>
  );
}
