// Visualizador read-only de HTML: monta um <webview> (Chromium embutido do
// Electron) apontando pro arquivo no disco via file://, pra que CSS/JS/imagens
// relativos resolvam igual ao navegador — e sem precisar de navegador instalado.
// Carregado sob demanda (React.lazy) pelo CodeView.
import { useEffect, useRef } from 'react';
import { fileUrlFor } from '@/lib/htmlPreview';

export default function HtmlViewer({ path }) {
  const hostRef = useRef(null);
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
    host.appendChild(w);
    return () => { try { w.remove(); } catch {} };
  }, [path]);
  return <div ref={hostRef} className="absolute inset-0 bg-white" />;
}
