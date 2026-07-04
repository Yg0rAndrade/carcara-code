import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Loader2, Code2, History, Check, ClipboardPaste, Eraser } from 'lucide-react';
import { ConnectIcon } from './ui/connect.jsx';
import { HoverIcon } from './ui/hover-icon.jsx';
import CodeMirror from '@uiw/react-codemirror';
import { vscodeLight, vscodeDark } from '@uiw/codemirror-theme-vscode';
import { EditorView } from '@codemirror/view';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { xml } from '@codemirror/lang-xml';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs.jsx';
import { Input } from './ui/input.jsx';
import { Button } from './ui/button.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.jsx';
import { ResizeBar } from './ui/resize-bar.jsx';
import { DragHandle } from './ui/drag-handle.jsx';
import { EmptyState } from './ui/empty-state.jsx';
import { useTheme } from '@/lib/theme.jsx';
import { cn } from '@/lib/utils';
import { parseCurl } from '@/lib/curl';
import { loadHistory, addEntry, deleteEntry, clearHistory } from '@/lib/apiHistory';
import { toast } from '@/lib/toast';
import { useT } from '@/lib/i18n';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

// Alvos de "Copiar como" (target/client do httpsnippet — todos verificados).
const SNIPPETS = [
  { label: 'cURL', target: 'shell', client: 'curl' },
  { label: 'JavaScript — fetch', target: 'javascript', client: 'fetch' },
  { label: 'Node — fetch', target: 'node', client: 'fetch' },
  { label: 'Node — axios', target: 'node', client: 'axios' },
  { label: 'Python — requests', target: 'python', client: 'requests' },
  { label: 'Go', target: 'go', client: 'native' },
  { label: 'PHP', target: 'php', client: 'curl' },
];

const editorTheme = EditorView.theme({
  '&': { fontSize: '13px', height: '100%' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, "Cascadia Code", "JetBrains Mono", Consolas, monospace',
    lineHeight: '1.6',
  },
});

function langForType(ct = '') {
  if (ct.includes('json')) return [json()];
  if (ct.includes('html')) return [html()];
  if (ct.includes('xml')) return [xml()];
  return [];
}

function statusColor(status) {
  if (status >= 200 && status < 300) return 'text-green-600 dark:text-green-400';
  if (status >= 300 && status < 400) return 'text-blue-600 dark:text-blue-400';
  if (status >= 400) return 'text-red-600 dark:text-red-400';
  return 'text-muted-foreground';
}

function fmtSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function methodColor(m) {
  switch (m) {
    case 'GET':
      return 'text-green-600 dark:text-green-400';
    case 'POST':
      return 'text-blue-600 dark:text-blue-400';
    case 'PUT':
    case 'PATCH':
      return 'text-amber-600 dark:text-amber-400';
    case 'DELETE':
      return 'text-red-600 dark:text-red-400';
    default:
      return 'text-muted-foreground';
  }
}

// URL enxuta pro histórico: host + caminho, sem protocolo nem query.
function shortUrl(u) {
  try {
    const x = new URL(u);
    return (x.host + x.pathname).replace(/\/$/, '') || x.host;
  } catch {
    return String(u || '')
      .replace(/^[a-z]+:\/\//i, '')
      .split('?')[0];
  }
}

// Quando foi enviado, em linguagem do dia a dia.
function fmtWhen(ts, t) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return t('api.time_now');
  if (diff < 3_600_000) return t('api.time_min_ago', { n: Math.floor(diff / 60_000) });
  if (diff < 86_400_000) return t('api.time_hour_ago', { n: Math.floor(diff / 3_600_000) });
  try {
    return new Date(ts).toLocaleDateString();
  } catch {
    return '';
  }
}

// Completa o esquema quando o usuário digita a URL sem ele (igual ao Postman).
// Local (localhost/IP) assume http; o resto assume https — que é o caso comum de API.
function normalizeUrl(u) {
  const t = (u || '').trim();
  if (!t) return t;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return t; // já tem http:// https:// etc.
  if (t.startsWith('//')) return 'https:' + t; // protocolo-relativo
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)(:|\/|$)/i.test(t)) return 'http://' + t;
  return 'https://' + t;
}

const emptyRow = () => ({ on: true, key: '', val: '' });

// Editor de pares chave/valor (Headers e Query Params).
function KeyValueEditor({ rows, onChange, placeholderKey, placeholderVal }) {
  const t = useT();
  const update = (i, field, value) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () => onChange([...rows, emptyRow()]);
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={r.on}
            onChange={(e) => update(i, 'on', e.target.checked)}
            title={t('api.toggle_tip')}
            className="h-3.5 w-3.5 shrink-0 accent-primary"
          />
          <Input
            value={r.key}
            onChange={(e) => update(i, 'key', e.target.value)}
            placeholder={placeholderKey ?? t('api.placeholder_param')}
            spellCheck={false}
            className="h-7 font-mono text-xs"
          />
          <Input
            value={r.val}
            onChange={(e) => update(i, 'val', e.target.value)}
            placeholder={placeholderVal ?? t('api.placeholder_value')}
            spellCheck={false}
            className="h-7 font-mono text-xs"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            title={t('api.remove_tip')}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-[14px]"
          >
            <Trash2 />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="mt-0.5 flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-[14px]"
      >
        <Plus />
        {t('api.add_button')}
      </button>
    </div>
  );
}

export function ApiPanel({ active }) {
  const t = useT();
  const { theme } = useTheme();
  const projectPath = active?.path || null;

  // Rascunho da request persistido por projeto: ao trocar de aba o painel desmonta,
  // então guardamos o que está em edição pra não perder. (O componente é remontado
  // com key={projectPath}, então o rascunho carregado é sempre o do projeto atual.)
  const draftKey = `apiDraft:${projectPath || '_none_'}`;
  const draft0 = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(draftKey) || 'null') || {};
    } catch {
      return {};
    }
  }, [draftKey]);

  const [method, setMethod] = useState(draft0.method || 'GET');
  const [url, setUrl] = useState(draft0.url || '');
  const [tab, setTab] = useState(draft0.tab || 'params');
  const [params, setParams] = useState(draft0.params?.length ? draft0.params : [emptyRow()]);
  const [headers, setHeaders] = useState(draft0.headers?.length ? draft0.headers : [emptyRow()]);
  const [body, setBody] = useState(draft0.body || '');
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);

  // Histórico (cada Enviar vira um item com a resposta; persistido por projeto)
  const [history, setHistory] = useState(() => loadHistory(projectPath));
  const [selectedId, setSelectedId] = useState(null);
  const idRef = useRef(0);

  // "Copiar como"
  const [snippetOpen, setSnippetOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const snippetRef = useRef(null);

  // Importar de cURL
  const [importing, setImporting] = useState(false);
  const [importDraft, setImportDraft] = useState('');
  const [importError, setImportError] = useState('');

  // Layout redimensionável (persistido).
  const [sidebarWidth, setSidebarWidth] = useState(
    () => Number(localStorage.getItem('apiSidebarWidth')) || 200,
  );
  const [configHeight, setConfigHeight] = useState(
    () => Number(localStorage.getItem('apiConfigHeight')) || 240,
  );
  const [dragging, setDragging] = useState(null); // 'col' | 'row' | null
  const rootRef = useRef(null);
  const splitRef = useRef(null);

  const startSidebarResize = (e) => {
    e.preventDefault();
    const rect = rootRef.current.getBoundingClientRect();
    setDragging('col');
    const onMove = (ev) =>
      setSidebarWidth(Math.max(150, Math.min(rect.right - ev.clientX, rect.width - 360)));
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setDragging(null);
      setSidebarWidth((w) => {
        localStorage.setItem('apiSidebarWidth', String(Math.round(w)));
        return w;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startConfigResize = (e) => {
    e.preventDefault();
    const rect = splitRef.current.getBoundingClientRect();
    setDragging('row');
    const onMove = (ev) =>
      setConfigHeight(Math.max(96, Math.min(ev.clientY - rect.top, rect.height - 140)));
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setDragging(null);
      setConfigHeight((h) => {
        localStorage.setItem('apiConfigHeight', String(Math.round(h)));
        return h;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const hasBody = method !== 'GET' && method !== 'HEAD';

  const fullUrl = useMemo(() => {
    const base = normalizeUrl(url);
    const on = params.filter((p) => p.on && p.key.trim());
    if (!on.length) return base;
    const qs = on.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.val)}`).join('&');
    return base + (base.includes('?') ? '&' : '?') + qs;
  }, [url, params]);

  // Monta o objeto de request enviado ao main (send / snippet / save).
  const buildRequest = useCallback(() => {
    const headerObj = {};
    for (const h of headers) if (h.on && h.key.trim()) headerObj[h.key.trim()] = h.val;
    return { method, url: fullUrl, headers: headerObj, body: hasBody ? body : '' };
  }, [method, fullUrl, headers, body, hasBody]);

  // Persiste o rascunho a cada mudança (sobrevive à troca de aba e a reabrir o app).
  // Não guarda a resposta — só o que monta a request.
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ method, url, tab, params, headers, body }));
    } catch {}
  }, [draftKey, method, url, tab, params, headers, body]);

  const send = async () => {
    if (!url.trim() || loading) return;
    // Mostra no campo a URL já com esquema (feedback visual; o envio usa fullUrl normalizado).
    const base = normalizeUrl(url);
    if (base !== url.trim()) setUrl(base);
    setLoading(true);
    setErr(null);
    setRes(null);
    const snapshot = { method, url: base, params, headers, body, fullUrl };
    try {
      const r = await window.api.httpSend(buildRequest(), projectPath || undefined);
      if (r.ok) {
        setRes(r);
        record(snapshot, r, null);
      } else {
        setErr(r.error || t('api.error_unknown'));
        record(snapshot, null, r.error || t('api.error_unknown'));
      }
    } catch (e) {
      const msg = e?.message || String(e);
      setErr(msg);
      record(snapshot, null, msg);
    } finally {
      setLoading(false);
    }
  };

  // Guarda no histórico o que foi enviado e o resultado, e seleciona o item.
  const record = (req, r, error) => {
    const id = `${Date.now()}-${idRef.current++}`;
    const entry = {
      id,
      sentAt: Date.now(),
      method: req.method,
      url: req.url,
      fullUrl: req.fullUrl,
      params: req.params,
      headers: req.headers,
      body: req.body,
      ok: !!r,
      status: r?.status ?? null,
      statusText: r?.statusText ?? '',
      timeMs: r?.timeMs ?? null,
      sizeBytes: r?.sizeBytes ?? null,
      contentType: r?.contentType ?? '',
      resBody: r ? r.body || '' : '',
      error: error || '',
    };
    setHistory(addEntry(projectPath, entry));
    setSelectedId(id);
  };

  const onUrlKey = (e) => {
    if (e.key === 'Enter') send();
  };

  const resetForm = () => {
    setMethod('GET');
    setUrl('');
    setParams([emptyRow()]);
    setHeaders([emptyRow()]);
    setBody('');
    setRes(null);
    setErr(null);
    setSelectedId(null);
    setTab('params');
  };

  // Limpa tudo e recomeça do zero (o efeito de persistência grava o rascunho vazio).
  const clearAll = () => {
    resetForm();
    closeImport?.();
  };

  // Interpreta um comando cURL e preenche os campos. Retorna false se não entendeu.
  const applyCurl = useCallback(
    (text) => {
      const p = parseCurl(text);
      if (!p) return false;
      setMethod(p.method);
      setUrl(p.url);
      setParams(p.params);
      setHeaders(p.headers);
      setBody(p.body);
      setTab('params');
      setRes(null);
      setErr(null);
      setSelectedId(null);
      toast.success(t('api.toast_success'));
      return true;
    },
    [t],
  );

  const openImport = () => {
    setImportError('');
    setImportDraft('');
    setImporting(true);
  };
  const closeImport = () => {
    setImporting(false);
    setImportDraft('');
    setImportError('');
  };
  const doImport = () => {
    if (!importDraft.trim()) return;
    if (applyCurl(importDraft)) closeImport();
    else setImportError(t('api.import_error'));
  };

  // Colar um comando cURL direto no campo de URL → importa em vez de colar o texto cru.
  const onUrlPaste = (e) => {
    const pasteText = e.clipboardData?.getData('text') ?? '';
    if (!/^\s*curl\b/i.test(pasteText)) return;
    e.preventDefault();
    if (!applyCurl(pasteText)) {
      setImportDraft(pasteText);
      setImportError(t('api.import_error'));
      setImporting(true);
    }
  };

  // Recarrega no formulário um item do histórico, mostrando também a resposta guardada.
  const loadEntry = (h) => {
    setMethod(h.method);
    setUrl(h.url);
    setParams(h.params?.length ? h.params : [emptyRow()]);
    setHeaders(h.headers?.length ? h.headers : [emptyRow()]);
    setBody(h.body || '');
    setTab('params');
    if (h.ok) {
      setRes({
        status: h.status,
        statusText: h.statusText,
        timeMs: h.timeMs,
        sizeBytes: h.sizeBytes,
        contentType: h.contentType,
        body: h.resBody,
      });
      setErr(null);
    } else {
      setRes(null);
      setErr(h.error || null);
    }
    setSelectedId(h.id);
  };

  const removeEntry = (id, e) => {
    e.stopPropagation();
    setHistory(deleteEntry(projectPath, id));
    if (selectedId === id) setSelectedId(null);
  };

  const clearAllHistory = () => {
    setHistory(clearHistory(projectPath));
    setSelectedId(null);
  };

  const copyAs = async (s) => {
    setSnippetOpen(false);
    if (!url.trim()) return;
    const r = await window.api.httpToSnippet(buildRequest(), s.target, s.client);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    try {
      await navigator.clipboard.writeText(r.snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  // Fecha o menu de snippet ao clicar fora.
  useEffect(() => {
    if (!snippetOpen) return;
    const onDown = (e) => {
      if (snippetRef.current && !snippetRef.current.contains(e.target)) setSnippetOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [snippetOpen]);

  return (
    <div ref={rootRef} className="absolute inset-0 flex bg-background">
      {/* Área principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Linha de envio */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-2.5">
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="h-8 w-[104px] shrink-0 text-xs font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METHODS.map((m) => (
                <SelectItem key={m} value={m} className="text-xs font-semibold">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={onUrlKey}
            onPaste={onUrlPaste}
            placeholder={t('api.url_placeholder')}
            spellCheck={false}
            className="h-8 flex-1 font-mono text-xs"
          />

          {/* Limpar tudo (recomeçar) */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0"
            onClick={clearAll}
            disabled={!url.trim() && !body.trim()}
            title={t('api.clear_tip')}
          >
            <Eraser className="mr-1" />
            {t('api.clear_button')}
          </Button>

          {/* Importar de cURL */}
          <Button
            variant="secondary"
            size="sm"
            className="h-8 shrink-0"
            onClick={openImport}
            title={t('api.import_tip')}
          >
            <ClipboardPaste className="mr-1" />
            {t('api.import_button')}
          </Button>

          {/* Copiar como (dropdown) */}
          <div ref={snippetRef} className="relative shrink-0">
            <Button
              variant="secondary"
              size="sm"
              className="h-8"
              onClick={() => setSnippetOpen((o) => !o)}
              disabled={!url.trim()}
              title={t('api.copy_tip')}
            >
              {copied ? <Check className="mr-1 text-green-500" /> : <Code2 className="mr-1" />}
              {copied ? t('api.copy_button_done') : t('api.copy_button')}
            </Button>
            {snippetOpen && (
              <div className="absolute right-0 top-9 z-50 min-w-[180px] overflow-hidden rounded-md border bg-background py-1 shadow-md">
                {SNIPPETS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => copyAs(s)}
                    className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-muted"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button
            size="sm"
            className="h-8"
            onClick={send}
            disabled={loading || !url.trim()}
            title={t('api.send_tip')}
          >
            {loading ? (
              <Loader2 className="mr-1 animate-spin" />
            ) : (
              <HoverIcon as={ConnectIcon} className="mr-1" />
            )}
            {t('api.send_button')}
          </Button>
        </div>

        {/* Faixa de importar cURL */}
        {importing && (
          <div className="flex shrink-0 flex-col gap-1 border-b bg-muted/40 px-2.5 py-2">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-muted-foreground">
                {t('api.import_bar_label')}
              </span>
              <Input
                autoFocus
                value={importDraft}
                onChange={(e) => {
                  setImportDraft(e.target.value);
                  setImportError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') doImport();
                  else if (e.key === 'Escape') closeImport();
                }}
                placeholder={t('api.import_bar_placeholder')}
                spellCheck={false}
                className="h-7 flex-1 font-mono text-xs"
              />
              <Button size="sm" className="h-7" onClick={doImport} disabled={!importDraft.trim()}>
                {t('api.import_bar_confirm')}
              </Button>
              <Button variant="ghost" size="sm" className="h-7" onClick={closeImport}>
                {t('api.import_bar_cancel')}
              </Button>
            </div>
            {importError && <span className="text-[11px] text-red-500">{importError}</span>}
          </div>
        )}

        {/* Config + Resposta (divisor arrastável entre as duas) */}
        <div ref={splitRef} className="flex min-h-0 flex-1 flex-col">
          <div style={{ height: configHeight }} className="flex shrink-0 flex-col overflow-hidden">
            <div className="shrink-0 px-2.5 pt-2.5">
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="h-8 gap-0.5 p-0.5">
                  <TabsTrigger value="params" className="h-7 px-2.5 text-xs">
                    {t('api.tabs_params')}
                  </TabsTrigger>
                  <TabsTrigger value="headers" className="h-7 px-2.5 text-xs">
                    {t('api.tabs_headers')}
                  </TabsTrigger>
                  {hasBody && (
                    <TabsTrigger value="body" className="h-7 px-2.5 text-xs">
                      {t('api.tabs_body')}
                    </TabsTrigger>
                  )}
                </TabsList>
              </Tabs>
            </div>
            <div className="min-h-0 flex-1 p-2.5">
              {tab === 'params' && (
                <KeyValueEditor
                  rows={params}
                  onChange={setParams}
                  placeholderKey={t('api.placeholder_param')}
                  placeholderVal={t('api.placeholder_value')}
                />
              )}
              {tab === 'headers' && (
                <KeyValueEditor
                  rows={headers}
                  onChange={setHeaders}
                  placeholderKey={t('api.placeholder_header')}
                  placeholderVal={t('api.placeholder_value')}
                />
              )}
              {tab === 'body' && hasBody && (
                <div className="h-full min-h-[120px] overflow-hidden rounded-md border">
                  <CodeMirror
                    value={body}
                    theme={theme === 'dark' ? vscodeDark : vscodeLight}
                    height="100%"
                    style={{ height: '100%' }}
                    extensions={[editorTheme, json()]}
                    placeholder={t('api.body_placeholder')}
                    onChange={setBody}
                  />
                </div>
              )}
            </div>
          </div>

          <DragHandle onMouseDown={startConfigResize} />

          {/* Resposta */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex h-9 shrink-0 items-center gap-3 border-b px-3 text-xs">
              <span className="eyebrow">{t('api.response_label')}</span>
              {res && (
                <>
                  <span className={cn('font-semibold', statusColor(res.status))}>
                    {res.status} {res.statusText}
                  </span>
                  <span className="text-muted-foreground">{res.timeMs} ms</span>
                  <span className="text-muted-foreground">{fmtSize(res.sizeBytes)}</span>
                  {res.contentType && (
                    <span className="truncate text-muted-foreground">{res.contentType}</span>
                  )}
                </>
              )}
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden">
              {err ? (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-red-500">
                  {err}
                </div>
              ) : res ? (
                <CodeMirror
                  value={res.body || ''}
                  theme={theme === 'dark' ? vscodeDark : vscodeLight}
                  height="100%"
                  style={{ height: '100%' }}
                  editable={false}
                  extensions={[editorTheme, ...langForType(res.contentType)]}
                />
              ) : (
                <EmptyState>
                  {loading ? t('api.response_loading') : t('api.response_empty')}
                </EmptyState>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Divisor + Histórico de chamadas — à direita */}
      <ResizeBar onMouseDown={startSidebarResize} />
      <div style={{ width: sidebarWidth }} className="flex shrink-0 flex-col bg-card">
        <div className="flex h-12 shrink-0 items-center gap-1.5 border-b px-3">
          <History className="size-3.5 text-primary" />
          <span className="eyebrow flex-1 truncate">{t('api.history_label')}</span>
          <button
            type="button"
            onClick={clearAll}
            title={t('api.history_new_call')}
            className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-[14px]"
          >
            <Plus />
          </button>
          {history.length > 0 && (
            <button
              type="button"
              onClick={clearAllHistory}
              title={t('api.history_clear_all')}
              className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-red-500 [&_svg]:size-[14px]"
            >
              <Trash2 />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {history.length === 0 ? (
            <p className="px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
              {t('api.history_empty')}
            </p>
          ) : (
            history.map((h) => (
              <div
                key={h.id}
                onClick={() => loadEntry(h)}
                className={cn(
                  'group cursor-pointer border-b px-2.5 py-2 hover:bg-muted',
                  selectedId === h.id && 'bg-accent',
                )}
                title={h.fullUrl || h.url}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'shrink-0 font-mono text-[10px] font-bold',
                      methodColor(h.method),
                    )}
                  >
                    {h.method}
                  </span>
                  <span className="flex-1 truncate text-[12px]">
                    {shortUrl(h.fullUrl || h.url)}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => removeEntry(h.id, e)}
                    title={t('api.history_delete')}
                    className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 hover:bg-background hover:text-red-500 group-hover:opacity-100 [&_svg]:size-[13px]"
                  >
                    <Trash2 />
                  </button>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                  {h.ok ? (
                    <span className={cn('font-semibold', statusColor(h.status))}>{h.status}</span>
                  ) : (
                    <span className="font-semibold text-red-500">{t('api.history_error')}</span>
                  )}
                  <span>{fmtWhen(h.sentAt, t)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Captura o mouse durante o arraste (senão o editor/iframe engole o evento). */}
      {dragging && (
        <div
          className={cn(
            'fixed inset-0 z-50',
            dragging === 'col' ? 'cursor-col-resize' : 'cursor-row-resize',
          )}
        />
      )}
    </div>
  );
}
