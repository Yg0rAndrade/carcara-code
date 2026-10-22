// Visual de chat vindo de um plugin local (electron/plugins/<id>): um <webview> com a
// página e o preload que o plugin indica. O Carcará não sabe o que roda lá dentro; só
// pede a página (plugins:chatView), monta e repassa o tema atual.
//
// Um <webview> recarrega a página quando muda de lugar no DOM (e o plugin derruba a
// conversa junto). Por isso os chats moram numa camada fixa (PluginViewLayer) por cima
// dos panes: trocar de projeto, aba ou pane só esconde ou reposiciona.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2, RotateCw } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme.jsx';

// Tokens do shadcn (src/index.css) que o plugin traduz pro tema dele.
const TOKENS = [
  'background',
  'foreground',
  'card',
  'popover',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'warning',
  'success',
  'border',
  'input',
  'ring',
];

// Lê os valores computados no elemento (respeita tema escopado numa subárvore).
function readThemeTokens(el) {
  const cs = getComputedStyle(el);
  const out = {};
  for (const k of TOKENS) out[k] = cs.getPropertyValue(`--${k}`).trim();
  out.fontUi = cs.getPropertyValue('--font-ui').trim();
  out.fontMono = cs.getPropertyValue('--font-mono').trim();
  // Família escura/clara pela luminosidade do fundo ("H S% L%").
  const l = parseFloat((out.background.split(/\s+/)[2] || '').replace('%', ''));
  out.dark = Number.isFinite(l) ? l < 50 : true;
  return out;
}

export function PluginChatView({ pluginId, projectPath, tabId, visible, onTitle }) {
  const t = useT();
  const { theme } = useTheme();
  const hostRef = useRef(null);
  const [state, setState] = useState({ status: 'loading', error: '' });
  const [attempt, setAttempt] = useState(0);
  const onTitleRef = useRef(onTitle);
  onTitleRef.current = onTitle;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let alive = true;
    let view = null;
    setState({ status: 'loading', error: '' });
    window.api
      .pluginChatView(pluginId, projectPath, tabId)
      .then(({ src, preload }) => {
        if (!alive) return;
        // <webview> via DOM, igual ao PreviewPanel/HtmlViewer. O preload TEM que ir antes
        // do src: o Electron só lê o atributo na primeira navegação.
        view = document.createElement('webview');
        view.setAttribute('preload', preload);
        view.setAttribute('src', src);
        view.className = 'absolute inset-0 h-full w-full';
        view.addEventListener('dom-ready', () => alive && setState({ status: 'ready', error: '' }));
        // O preload do plugin pode mandar o título da conversa (ipcRenderer.sendToHost).
        view.addEventListener('ipc-message', (e) => {
          if (alive && e.channel === 'carcara:title' && typeof e.args[0] === 'string') {
            onTitleRef.current?.(e.args[0]);
          }
        });
        host.appendChild(view);
      })
      .catch((err) => {
        if (alive) setState({ status: 'error', error: String(err?.message || err) });
      });
    return () => {
      alive = false;
      view?.remove();
    };
  }, [pluginId, projectPath, tabId, attempt]);

  // Tema: manda os tokens atuais pro plugin ao montar e a cada troca de tema.
  useEffect(() => {
    if (hostRef.current) window.api.pluginTheme(readThemeTokens(hostRef.current));
  }, [theme]);

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 bg-background"
      style={visible ? undefined : { visibility: 'hidden', pointerEvents: 'none' }}
    >
      {state.status === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          {t('pluginChat.loading')}
        </div>
      )}
      {state.status === 'error' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm font-medium text-foreground">{t('pluginChat.error')}</p>
          <p className="max-w-md break-words text-xs text-muted-foreground">{state.error}</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <RotateCw aria-hidden="true" className="size-3.5" />
            {t('pluginChat.retry')}
          </button>
        </div>
      )}
    </div>
  );
}

// Camada com os chats de plugin de TODOS os projetos abertos nesta execução. Cada pane
// marca o lugar da aba ativa com um slot (slotsRef: key -> elemento); a view com slot
// aparece em cima dele, as outras ficam escondidas e vivas.
export function PluginViewLayer({ pluginId, views, slotsRef, hostRef, onTitle, deps }) {
  const [rects, setRects] = useState({});

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const measure = () => {
      const base = host.getBoundingClientRect();
      const next = {};
      for (const [key, el] of slotsRef.current) {
        const r = el.getBoundingClientRect();
        next[key] = {
          left: r.left - base.left,
          top: r.top - base.top,
          width: r.width,
          height: r.height,
        };
      }
      setRects((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    for (const el of slotsRef.current.values()) ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views, ...deps]);

  return views.map((v) => {
    const r = rects[v.key];
    return (
      <div
        key={v.key}
        className={'absolute ' + (r ? 'z-10' : 'pointer-events-none')}
        style={r || { inset: 0 }}
      >
        <PluginChatView
          pluginId={pluginId}
          projectPath={v.project}
          tabId={v.sid}
          visible={!!r}
          onTitle={(name) => onTitle(v.project, v.sid, name)}
        />
      </div>
    );
  });
}
