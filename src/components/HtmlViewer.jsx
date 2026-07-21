// Visualizador read-only de HTML: monta um <webview> (Chromium embutido do
// Electron) apontando pro arquivo no disco via file://, pra que CSS/JS/imagens
// relativos resolvam igual ao navegador — e sem precisar de navegador instalado.
// Carregado sob demanda (React.lazy) pelo CodeView.
//
// Também hospeda o "selecionar elemento" (grabber), o mesmo do Preview: o modo é
// ligado de fora (prop `grabbing`, botão na barra do CodeView) e este componente
// cuida do INJECT/CLEANUP e da ponte `console-message` — quem tem o webview é ele.
import { useEffect, useRef, useState } from 'react';
import { fileUrlFor } from '@/lib/htmlPreview';
import { INJECT, CLEANUP, GRAB_SENTINEL, GRAB_CANCEL } from '@/lib/grabScript';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export default function HtmlViewer({ path, grabbing = false, onGrabEnd }) {
  const t = useT();
  const hostRef = useRef(null);
  const webRef = useRef(null);
  // Refs pra que os listeners do webview (criados uma vez por path) enxerguem o
  // estado atual sem serem recriados a cada toggle.
  const grabbingRef = useRef(grabbing);
  const onEndRef = useRef(onGrabEnd);
  const doneTimer = useRef(null);
  const [grabbed, setGrabbed] = useState(false);

  useEffect(() => {
    grabbingRef.current = grabbing;
  }, [grabbing]);
  useEffect(() => {
    onEndRef.current = onGrabEnd;
  });
  useEffect(() => () => clearTimeout(doneTimer.current), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !path) return;
    // <webview> não é um elemento React nativo bem comportado; cria via DOM, igual
    // o PreviewPanel. Sem partition: usa a sessão padrão, sem Node, read-only.
    const w = document.createElement('webview');
    w.setAttribute('src', fileUrlFor(path));
    w.style.position = 'absolute';
    w.style.inset = '0';
    w.style.width = '100%';
    w.style.height = '100%';
    w.style.background = '#fff';
    // Recarregar/navegar apaga o DOM injetado: re-injeta se o modo estiver ligado.
    w.addEventListener('dom-ready', () => {
      if (!grabbingRef.current) return;
      try {
        w.executeJavaScript(INJECT);
      } catch {}
    });
    // Ponte do "selecionar elemento": o script injetado emite o pacote via console.
    w.addEventListener('console-message', (e) => {
      const msg = e.message || '';
      if (msg.startsWith(GRAB_SENTINEL)) {
        try {
          const { md } = JSON.parse(msg.slice(GRAB_SENTINEL.length));
          window.api.copyText(md);
          setGrabbed(true);
          clearTimeout(doneTimer.current);
          doneTimer.current = setTimeout(() => setGrabbed(false), 2200);
        } catch {}
        onEndRef.current?.();
      } else if (msg.startsWith(GRAB_CANCEL)) {
        onEndRef.current?.();
      }
    });
    host.appendChild(w);
    webRef.current = w;
    return () => {
      webRef.current = null;
      try {
        w.remove(); // destruir o webview já leva junto o script injetado
      } catch {}
    };
  }, [path]);

  // Liga/desliga o modo no webview. O CLEANUP é idempotente (no-op se não injetou).
  useEffect(() => {
    const w = webRef.current;
    if (!w) return;
    try {
      w.executeJavaScript(grabbing ? INJECT : CLEANUP);
    } catch {}
  }, [grabbing]);

  // Esc cancela mesmo com o foco na janela do app (fora do webview) — o script
  // injetado só enxerga o Esc quando o foco está dentro da página.
  useEffect(() => {
    if (!grabbing) return;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      try {
        webRef.current?.executeJavaScript(CLEANUP);
      } catch {}
      onEndRef.current?.();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [grabbing]);

  return (
    <div className="absolute inset-0">
      <div ref={hostRef} className="absolute inset-0 bg-white" />
      {(grabbing || grabbed) && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center">
          <div
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium shadow-md',
              grabbed
                ? 'border-primary/40 bg-primary text-primary-foreground'
                : 'bg-popover text-popover-foreground',
            )}
          >
            {grabbed ? t('preview.grab_done') : t('preview.grab_active')}
          </div>
        </div>
      )}
    </div>
  );
}
