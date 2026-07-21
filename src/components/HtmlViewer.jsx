// Visualizador de HTML: monta um <webview> (Chromium embutido do Electron) apontando
// pro arquivo no disco via file://, pra que CSS/JS/imagens relativos resolvam igual ao
// navegador — e sem precisar de navegador instalado. Carregado sob demanda pelo CodeView.
//
// Um .html É um site, então este visualizador tem a MESMA chrome de navegador do Preview
// do projeto, só que enxuta: dispositivo (computador/tablet/celular), recarregar, zoom da
// página e o seletor de elementos (grabber). As peças são compartilhadas de verdade —
// ToolButton/DevicePicker (ui/) e applyViewport/stepZoom (lib/webviewChrome) —, nada aqui
// é cópia da lógica do PreviewPanel.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, RotateCw, Minus, Plus } from 'lucide-react';
import { ToolButton } from './ui/tool-button.jsx';
import { DevicePicker } from './ui/device-picker.jsx';
import { fileUrlFor } from '@/lib/htmlPreview';
import { applyViewport, stepZoom, zoomPercent } from '@/lib/webviewChrome';
import { INJECT, CLEANUP, GRAB_SENTINEL, GRAB_CANCEL } from '@/lib/grabScript';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export default function HtmlViewer({ path }) {
  const t = useT();
  const hostRef = useRef(null);
  const webRef = useRef(null);
  const [viewport, setViewport] = useState(
    () => localStorage.getItem('htmlViewerViewport') || 'desktop',
  );
  const [zoom, setZoom] = useState(0); // nível do Chromium (fator = 1.2 ^ nível)
  const [grabbing, setGrabbing] = useState(false);
  const [grabbed, setGrabbed] = useState(false); // faixa "Elemento copiado!"
  // Refs pros listeners do webview (criados uma vez por arquivo) enxergarem o estado
  // atual sem serem recriados a cada clique de botão.
  const viewportRef = useRef(viewport);
  const zoomRef = useRef(zoom);
  const grabbingRef = useRef(grabbing);
  const doneTimer = useRef(null);
  viewportRef.current = viewport;
  zoomRef.current = zoom;
  grabbingRef.current = grabbing;

  useEffect(() => () => clearTimeout(doneTimer.current), []);

  // Emulação de toque (mata o `:hover`, igual ao "device mode" do Chrome) só faz sentido
  // fora do desktop — e NUNCA junto do grabber, que precisa do mouse pra mirar o elemento.
  // Predicado único, pra que os dois lados nunca discordem (a lição do print no celular).
  const touchWanted = useCallback(
    () => viewportRef.current !== 'desktop' && !grabbingRef.current,
    [],
  );

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
    applyViewport(w, viewportRef.current); // respeita o dispositivo escolhido já na criação
    // Recarregar/navegar zera o que foi injetado e pode zerar o zoom: re-afirma tudo.
    w.addEventListener('dom-ready', () => {
      try {
        w.setZoomLevel(zoomRef.current);
      } catch {}
      try {
        window.api.previewEmulateTouch(w.getWebContentsId(), touchWanted());
      } catch {}
      if (grabbingRef.current) {
        try {
          w.executeJavaScript(INJECT);
        } catch {}
      }
    });
    // Ctrl+roda dentro da página também muda o zoom: mantém o rótulo "100%" honesto.
    w.addEventListener('zoom-changed', () => {
      try {
        setZoom(w.getZoomLevel());
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
        setGrabbing(false);
      } else if (msg.startsWith(GRAB_CANCEL)) {
        setGrabbing(false);
      }
    });
    host.appendChild(w);
    webRef.current = w;
    return () => {
      webRef.current = null;
      setGrabbing(false);
      try {
        w.remove(); // destruir o webview já leva junto o script injetado
      } catch {}
    };
  }, [path, touchWanted]);

  // Dispositivo: re-aplica a moldura e a emulação de toque.
  useEffect(() => {
    localStorage.setItem('htmlViewerViewport', viewport);
    const w = webRef.current;
    if (!w) return;
    applyViewport(w, viewport);
    try {
      window.api.previewEmulateTouch(w.getWebContentsId(), touchWanted());
    } catch {}
  }, [viewport, grabbing, touchWanted]);

  // Zoom da página (o mesmo que o Ctrl +/-/0 já faz com o foco dentro do webview).
  const bumpZoom = (dir) => {
    const w = webRef.current;
    if (!w) return;
    let cur = zoom;
    try {
      cur = w.getZoomLevel(); // fonte da verdade: o teclado pode ter mexido por fora
    } catch {}
    const next = stepZoom(cur, dir);
    try {
      w.setZoomLevel(next);
    } catch {}
    setZoom(next);
  };

  const reload = () => {
    try {
      webRef.current?.reload();
    } catch {}
  };

  // Liga/desliga o "selecionar elemento". O CLEANUP é idempotente (no-op se não injetou).
  useEffect(() => {
    const w = webRef.current;
    if (!w) return;
    try {
      w.executeJavaScript(grabbing ? INJECT : CLEANUP);
    } catch {}
  }, [grabbing]);

  // Esc cancela mesmo com o foco na janela do app (o script injetado só enxerga o Esc
  // quando o foco está dentro da página).
  useEffect(() => {
    if (!grabbing) return;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      try {
        webRef.current?.executeJavaScript(CLEANUP);
      } catch {}
      setGrabbing(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [grabbing]);

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b bg-card px-2">
        <ToolButton
          onClick={() => setGrabbing((g) => !g)}
          active={grabbing}
          title={t('preview.grab_element')}
        >
          <Crosshair />
        </ToolButton>
        <DevicePicker value={viewport} onChange={setViewport} />
        <ToolButton onClick={reload} title={t('preview.reload')}>
          <RotateCw />
        </ToolButton>
        <div className="flex-1" />
        <ToolButton onClick={() => bumpZoom(-1)} title={t('settings.zoomOut')}>
          <Minus />
        </ToolButton>
        <button
          type="button"
          onClick={() => bumpZoom(0)}
          title={t('settings.zoomReset')}
          className="h-7 rounded-md px-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {zoomPercent(zoom)}%
        </button>
        <ToolButton onClick={() => bumpZoom(1)} title={t('settings.zoomIn')}>
          <Plus />
        </ToolButton>
      </div>

      <div className={cn('relative min-h-0 flex-1', viewport !== 'desktop' && 'bg-muted/40')}>
        <div ref={hostRef} className="absolute inset-0" />
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
    </div>
  );
}
