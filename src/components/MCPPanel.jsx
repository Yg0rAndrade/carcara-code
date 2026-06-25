import { useCallback, useEffect, useRef, useState } from 'react';
import { Plug, Loader2, Play, Save, Plus, Trash2, Server, ChevronDown, ChevronRight } from 'lucide-react';
import { ConnectIcon } from './ui/connect.jsx';
import { HoverIcon } from './ui/hover-icon.jsx';
import CodeMirror from '@uiw/react-codemirror';
import { vscodeLight, vscodeDark } from '@uiw/codemirror-theme-vscode';
import { EditorView } from '@codemirror/view';
import { json } from '@codemirror/lang-json';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs.jsx';
import { Input } from './ui/input.jsx';
import { Button } from './ui/button.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.jsx';
import { ResizeBar } from './ui/resize-bar.jsx';
import { EmptyState } from './ui/empty-state.jsx';
import { McpToolForm } from './McpToolForm.jsx';
import { McpInspectorDrawer } from './McpInspectorDrawer.jsx';
import { useTheme } from '@/lib/theme.jsx';
import { cn } from '@/lib/utils';

const editorTheme = EditorView.theme({
  '&': { fontSize: '13px', height: '100%' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
});

function normalizeUrl(u) {
  const t = (u || '').trim();
  if (!t) return t;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return t;
  if (/^(localhost|127\.0\.0\.1)(:|\/|$)/i.test(t)) return 'http://' + t;
  return 'https://' + t;
}

const pretty = (v) => { try { return JSON.stringify(v, null, 2); } catch { return String(v); } };

export function MCPPanel({ active }) {
  const { theme } = useTheme();
  const cmTheme = theme === 'dark' ? vscodeDark : vscodeLight;
  const projectPath = active?.path || null;

  // Conexão
  const [transport, setTransport] = useState('stdio');
  const [command, setCommand] = useState('npx');
  const [argsStr, setArgsStr] = useState('-y @modelcontextprotocol/server-everything');
  const [url, setUrl] = useState('');
  const [bearer, setBearer] = useState(''); // token Bearer p/ HTTP (não persistido — fica só em memória)
  const [connId, setConnId] = useState(null);
  const [serverInfo, setServerInfo] = useState(null);
  const [caps, setCaps] = useState({});
  const [status, setStatus] = useState('idle'); // idle | connecting | connected | error
  const [oauthPhase, setOauthPhase] = useState(null); // null | 'awaiting' (login no navegador)
  const [err, setErr] = useState(null);
  const [log, setLog] = useState('');
  const [logOpen, setLogOpen] = useState(false);

  // Inspector (Bloco C): tráfego JSON-RPC cru + drawer.
  const [traffic, setTraffic] = useState([]);
  const seqRef = useRef(0);
  const [drawerOpen, setDrawerOpen] = useState(() => localStorage.getItem('mcpDrawerOpen') !== '0');
  const [drawerHeight, setDrawerHeight] = useState(() => Number(localStorage.getItem('mcpDrawerHeight')) || 220);

  // Navegação
  const [tab, setTab] = useState('tools');
  const [tools, setTools] = useState([]);
  const [resources, setResources] = useState(null);
  const [templates, setTemplates] = useState(null); // resource templates (Bloco A)
  const [prompts, setPrompts] = useState(null);
  const [selected, setSelected] = useState(null); // item selecionado (tool/resource/template/prompt)
  const [formArgs, setFormArgs] = useState({});
  const [tmplVars, setTmplVars] = useState({}); // valores das variáveis de um resource template
  const [tmplSuggest, setTmplSuggest] = useState({}); // completions por variável de template
  const [subscribed, setSubscribed] = useState(() => new Set()); // uris assinadas
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null); // { text, isError }

  // Coleção
  const [servers, setServers] = useState({});
  const [currentName, setCurrentName] = useState(null);
  const [naming, setNaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  // Layout
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem('mcpSidebarWidth')) || 210);
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef(null);

  const startSidebarResize = (e) => {
    e.preventDefault();
    const rect = rootRef.current.getBoundingClientRect();
    setDragging(true);
    const onMove = (ev) => setSidebarWidth(Math.max(160, Math.min(rect.right - ev.clientX, rect.width - 380)));
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setDragging(false);
      setSidebarWidth((w) => { localStorage.setItem('mcpSidebarWidth', String(Math.round(w))); return w; });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startDrawerResize = (e) => {
    e.preventDefault();
    setDragging(true);
    const onMove = (ev) => {
      const rect = rootRef.current.getBoundingClientRect();
      setDrawerHeight(Math.max(120, Math.min(rect.bottom - ev.clientY, rect.height - 180)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setDragging(false);
      setDrawerHeight((h) => { localStorage.setItem('mcpDrawerHeight', String(Math.round(h))); return h; });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const toggleDrawer = () => setDrawerOpen((o) => { localStorage.setItem('mcpDrawerOpen', o ? '0' : '1'); return !o; });

  // Eventos do main (log do servidor stdio, queda da conexão).
  // Remove os listeners ao desmontar — o painel monta/desmonta a cada troca de aba.
  useEffect(() => {
    const offLog = window.api.on('mcp:log', ({ text }) => setLog((l) => (l + text).slice(-8000)));
    const offTraffic = window.api.on('mcp:traffic', (e) => {
      const entry = { ...e, seq: seqRef.current++ };
      setTraffic((t) => (t.length >= 500 ? [...t.slice(t.length - 499), entry] : [...t, entry]));
    });
    const offOauth = window.api.on('mcp:oauth', ({ phase }) => setOauthPhase(phase));
    const offClosed = window.api.on('mcp:closed', () => {
      setConnId(null); setStatus('idle'); setServerInfo(null);
      setTools([]); setResources(null); setTemplates(null); setPrompts(null); setSubscribed(new Set()); setSelected(null); setResult(null);
      setTraffic([]); seqRef.current = 0;
    });
    return () => { offLog?.(); offTraffic?.(); offOauth?.(); offClosed?.(); };
  }, []);

  const refreshServers = useCallback(async () => {
    if (!projectPath) { setServers({}); return; }
    const r = await window.api.mcpListServers(projectPath);
    setServers(r.ok ? r.servers : {});
  }, [projectPath]);
  useEffect(() => { refreshServers(); }, [refreshServers]);

  const buildConfig = () => {
    if (transport === 'stdio') {
      return { transport: 'stdio', command: command.trim(), args: argsStr.trim() ? argsStr.trim().split(/\s+/) : [] };
    }
    const base = { transport: 'http', url: normalizeUrl(url) };
    // Com token → header Bearer. Sem token → OAuth (login no navegador).
    return bearer.trim() ? { ...base, headers: { Authorization: 'Bearer ' + bearer.trim() } } : { ...base, oauth: true };
  };
  // Config sem segredos, p/ persistir em .carcara/mcp-servers.json (o token nunca vai pro disco).
  const buildSavedConfig = () => {
    const c = buildConfig();
    if (c.headers) delete c.headers;
    return c;
  };

  const connect = async () => {
    if (status === 'connecting') return;
    setStatus('connecting'); setErr(null); setLog(''); setResult(null); setSelected(null); setOauthPhase(null);
    setResources(null); setTemplates(null); setPrompts(null); setSubscribed(new Set()); setTraffic([]); seqRef.current = 0;
    const r = await window.api.mcpConnect(buildConfig());
    setOauthPhase(null);
    if (!r.ok) { setStatus('error'); setErr(r.error); setLogOpen(true); return; }
    setConnId(r.connId); setServerInfo(r.serverInfo); setCaps(r.capabilities || {}); setStatus('connected');
    setTab('tools');
    const t = await window.api.mcpListTools(r.connId);
    setTools(t.ok ? (t.tools || []) : []);
  };

  const disconnect = async () => {
    if (connId) await window.api.mcpDisconnect(connId);
    setConnId(null); setStatus('idle'); setServerInfo(null);
    setTools([]); setResources(null); setTemplates(null); setPrompts(null); setSubscribed(new Set()); setSelected(null); setResult(null);
    setTraffic([]); seqRef.current = 0;
  };

  // Carrega resources/prompts sob demanda ao abrir a aba.
  useEffect(() => {
    if (!connId) return;
    if (tab === 'resources' && resources === null) {
      window.api.mcpListResources(connId).then((r) => setResources(r.ok ? (r.resources || []) : []));
    }
    if (tab === 'resources' && templates === null) {
      window.api.mcpListResourceTemplates(connId).then((r) => setTemplates(r.ok ? (r.resourceTemplates || []) : []));
    }
    if (tab === 'prompts' && prompts === null) {
      window.api.mcpListPrompts(connId).then((r) => setPrompts(r.ok ? (r.prompts || []) : []));
    }
  }, [tab, connId, resources, templates, prompts]);

  const selectItem = (item) => { setSelected(item); setFormArgs({}); setTmplVars({}); setTmplSuggest({}); setResult(null); setErr(null); };

  // Expande um uriTemplate (RFC 6570 simples: só {var}) com os valores preenchidos.
  const templateVarNames = (t) => [...new Set((t?.uriTemplate?.match(/\{([^}]+)\}/g) || []).map((s) => s.slice(1, -1)))];
  const expandTemplate = (t, vars) => (t.uriTemplate || '').replace(/\{([^}]+)\}/g, (_, n) => encodeURIComponent(vars[n] ?? ''));

  const toggleSubscribe = async (uri) => {
    const on = subscribed.has(uri);
    const r = on ? await window.api.mcpUnsubscribeResource(connId, uri) : await window.api.mcpSubscribeResource(connId, uri);
    if (!r.ok) { setErr(r.error); return; }
    setSubscribed((s) => { const n = new Set(s); on ? n.delete(uri) : n.add(uri); return n; });
  };

  // Completion (Bloco A): fábrica de callback p/ McpToolForm/datalist. ref = ref/prompt ou ref/resource.
  const completeArg = (ref) => (argName, value) =>
    window.api.mcpComplete(connId, ref, argName, value).then((r) => (r.ok ? r.values : []));

  const invokeTool = async () => {
    setRunning(true); setResult(null); setErr(null);
    const r = await window.api.mcpCallTool(connId, selected.name, formArgs);
    setRunning(false);
    if (!r.ok) { setErr(r.error); return; }
    setResult({ text: pretty(r.content ?? r), isError: !!r.isError });
  };
  const readResource = async (uri) => {
    setRunning(true); setResult(null); setErr(null);
    const r = await window.api.mcpReadResource(connId, uri);
    setRunning(false);
    if (!r.ok) { setErr(r.error); return; }
    setResult({ text: pretty(r.contents ?? r), isError: false });
  };
  const getPrompt = async () => {
    setRunning(true); setResult(null); setErr(null);
    const r = await window.api.mcpGetPrompt(connId, selected.name, formArgs);
    setRunning(false);
    if (!r.ok) { setErr(r.error); return; }
    setResult({ text: pretty(r.messages ?? r), isError: false });
  };

  // Coleção (salvar/carregar/excluir)
  const doSave = async (name) => {
    const r = await window.api.mcpSaveServer(projectPath, name, buildSavedConfig());
    if (!r.ok) { setErr(r.error); return; }
    setCurrentName(name); setNaming(false); setNameDraft(''); refreshServers();
  };
  const onSaveClick = () => {
    if (!projectPath) return;
    if (currentName) doSave(currentName); else { setNameDraft(''); setNaming(true); }
  };
  const loadServer = async (name) => {
    const r = await window.api.mcpReadServer(projectPath, name);
    if (!r.ok || !r.config) return;
    const c = r.config;
    setTransport(c.transport || 'stdio');
    setCommand(c.command || 'npx');
    setArgsStr(Array.isArray(c.args) ? c.args.join(' ') : '');
    setUrl(c.url || '');
    setCurrentName(name);
  };
  const deleteServer = async (name, e) => {
    e.stopPropagation();
    const r = await window.api.mcpDeleteServer(projectPath, name);
    if (r.ok) { if (currentName === name) setCurrentName(null); refreshServers(); }
  };

  const connected = status === 'connected';
  const list = tab === 'tools' ? tools : tab === 'resources' ? (resources || []) : (prompts || []);

  return (
    <div ref={rootRef} className="absolute inset-0 flex bg-background">
      {/* Área principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra de conexão */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-2.5">
          <Select value={transport} onValueChange={setTransport} disabled={connected}>
            <SelectTrigger className="h-8 w-[92px] shrink-0 text-xs font-semibold"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="stdio" className="text-xs font-semibold">stdio</SelectItem>
              <SelectItem value="http" className="text-xs font-semibold">HTTP</SelectItem>
            </SelectContent>
          </Select>

          {transport === 'stdio' ? (
            <>
              <Input value={command} onChange={(e) => setCommand(e.target.value)} disabled={connected} placeholder="comando (ex: npx)" spellCheck={false} className="h-8 w-[120px] shrink-0 font-mono text-xs" />
              <Input value={argsStr} onChange={(e) => setArgsStr(e.target.value)} disabled={connected} placeholder="args (ex: -y @servidor/mcp)" spellCheck={false} className="h-8 flex-1 font-mono text-xs" />
            </>
          ) : (
            <>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} disabled={connected} placeholder="https://servidor.com/mcp" spellCheck={false} className="h-8 flex-1 font-mono text-xs" />
              <Input type="password" value={bearer} onChange={(e) => setBearer(e.target.value)} disabled={connected} placeholder="Bearer token (opcional)" spellCheck={false} autoComplete="off" className="h-8 w-[180px] shrink-0 font-mono text-xs" title="Enviado como header Authorization: Bearer …. Não é salvo em disco." />
            </>
          )}

          <Button variant="secondary" size="sm" className="h-8" onClick={onSaveClick} disabled={!projectPath} title={currentName ? `Salvar "${currentName}"` : 'Salvar servidor'}>
            <Save className="mr-1" />Salvar
          </Button>
          {connected ? (
            <Button variant="secondary" size="sm" className="h-8" onClick={disconnect}>
              <Plug className="mr-1" />Desconectar
            </Button>
          ) : (
            <Button size="sm" className="h-8" onClick={connect} disabled={status === 'connecting'}>
              {status === 'connecting' ? <Loader2 className="mr-1 animate-spin" /> : <HoverIcon as={ConnectIcon} className="mr-1" />}Conectar
            </Button>
          )}
        </div>

        {/* Dica OAuth: HTTP sem token conecta via login no navegador */}
        {transport === 'http' && !connected && !bearer.trim() && (
          <div className="flex shrink-0 items-center gap-2 border-b bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>Sem token → <span className="text-foreground">Conectar</span> abre o login no navegador (OAuth).</span>
            <div className="flex-1" />
            <button type="button"
              onClick={async () => { const r = await window.api.mcpOauthLogout(normalizeUrl(url)); setErr(r.ok ? null : (r.error || null)); }}
              disabled={!url.trim()}
              className="rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground disabled:opacity-40">
              Esquecer login
            </button>
          </div>
        )}

        {/* Nome (ao salvar) */}
        {naming && (
          <div className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-2.5 py-2">
            <span className="text-xs text-muted-foreground">Nome:</span>
            <Input autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && nameDraft.trim()) doSave(nameDraft.trim()); else if (e.key === 'Escape') { setNaming(false); setNameDraft(''); } }}
              placeholder="ex: everything" className="h-7 max-w-[260px] text-xs" />
            <Button size="sm" className="h-7" onClick={() => nameDraft.trim() && doSave(nameDraft.trim())} disabled={!nameDraft.trim()}>Salvar</Button>
            <Button variant="ghost" size="sm" className="h-7" onClick={() => { setNaming(false); setNameDraft(''); }}>Cancelar</Button>
          </div>
        )}

        {/* Status / log */}
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5 text-xs">
          <span className={cn('size-2 rounded-full', connected ? 'bg-green-500' : status === 'error' ? 'bg-red-500' : 'bg-muted-foreground/40')} />
          {connected && serverInfo ? (
            <span className="truncate">
              <span className="font-medium text-foreground">{serverInfo.name}</span>
              <span className="text-muted-foreground"> v{serverInfo.version} · {Object.keys(caps).join(', ')}</span>
            </span>
          ) : status === 'error' ? (
            <span className="truncate text-red-500">{err || 'Falha ao conectar.'}</span>
          ) : (
            <span className="text-muted-foreground">{status === 'connecting' ? (oauthPhase === 'awaiting' ? 'Aguardando autorização no navegador…' : 'Conectando…') : 'Desconectado'}</span>
          )}
          <div className="flex-1" />
          {/* Quando conectado, o stderr vive na aba Logging do Inspector. Aqui só p/ falha de conexão. */}
          {!connected && log && (
            <button type="button" onClick={() => setLogOpen((o) => !o)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
              {logOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}log
            </button>
          )}
        </div>
        {!connected && logOpen && log && (
          <pre className="max-h-28 shrink-0 overflow-auto border-b bg-background px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">{log}</pre>
        )}

        {/* Abas + corpo */}
        {connected ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 px-2.5 pt-2.5">
              <Tabs value={tab} onValueChange={(v) => { setTab(v); setSelected(null); setResult(null); }}>
                <TabsList className="h-8 gap-0.5 p-0.5">
                  <TabsTrigger value="tools" className="h-7 px-2.5 text-xs">Tools</TabsTrigger>
                  <TabsTrigger value="resources" className="h-7 px-2.5 text-xs" disabled={!caps.resources}>Resources</TabsTrigger>
                  <TabsTrigger value="prompts" className="h-7 px-2.5 text-xs" disabled={!caps.prompts}>Prompts</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="flex min-h-0 flex-1">
              {/* Lista */}
              <div className="w-[210px] shrink-0 overflow-auto border-r py-1">
                {(() => {
                  const itemKey = (it) => it?.uri || it?.uriTemplate || it?.name;
                  const renderBtn = (it) => {
                    const isSel = selected && itemKey(selected) === itemKey(it);
                    return (
                      <button key={itemKey(it)} type="button"
                        onClick={() => { selectItem(it); if (it.uri) readResource(it.uri); }}
                        className={cn('block w-full px-3 py-1.5 text-left text-[13px] hover:bg-muted', isSel && 'bg-accent')}
                        title={it.description || itemKey(it)}>
                        <span className="flex items-center gap-1">
                          <span className="flex-1 truncate font-medium">{it.name || it.uri || it.uriTemplate}</span>
                          {it.uri && subscribed.has(it.uri) && <span className="size-1.5 shrink-0 rounded-full bg-primary" title="assinado" />}
                        </span>
                        {it.description && <span className="block truncate text-[11px] text-muted-foreground">{it.description}</span>}
                      </button>
                    );
                  };
                  if (tab === 'resources') {
                    const res = resources || [], tpl = templates || [];
                    if (!res.length && !tpl.length) return <p className="px-3 py-2 text-[11px] text-muted-foreground">Nada aqui.</p>;
                    return (
                      <>
                        {res.map(renderBtn)}
                        {tpl.length > 0 && <div className="eyebrow px-3 pb-1 pt-2">Templates</div>}
                        {tpl.map(renderBtn)}
                      </>
                    );
                  }
                  return list.length === 0
                    ? <p className="px-3 py-2 text-[11px] text-muted-foreground">Nada aqui.</p>
                    : list.map(renderBtn);
                })()}
              </div>

              {/* Detalhe */}
              <div className="flex min-w-0 flex-1 flex-col overflow-auto p-3">
                {!selected ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Selecione um item à esquerda.</div>
                ) : tab === 'tools' ? (
                  <>
                    <McpToolForm schema={selected.inputSchema} value={formArgs} onChange={setFormArgs} />
                    <div className="mt-3">
                      <Button size="sm" className="h-8" onClick={invokeTool} disabled={running}>
                        {running ? <Loader2 className="mr-1 animate-spin" /> : <Play className="mr-1" />}Invocar
                      </Button>
                    </div>
                  </>
                ) : tab === 'prompts' ? (
                  <>
                    <McpToolForm schema={argsToSchema(selected.arguments)} value={formArgs} onChange={setFormArgs}
                      onComplete={caps.completions ? completeArg({ type: 'ref/prompt', name: selected.name }) : undefined} />
                    <div className="mt-3">
                      <Button size="sm" className="h-8" onClick={getPrompt} disabled={running}>
                        {running ? <Loader2 className="mr-1 animate-spin" /> : <Play className="mr-1" />}Obter
                      </Button>
                    </div>
                  </>
                ) : selected.uriTemplate ? (
                  <>
                    <div className="mb-2 break-all font-mono text-[11px] text-muted-foreground">{selected.uriTemplate}</div>
                    {templateVarNames(selected).length === 0 ? (
                      <p className="text-xs text-muted-foreground">Template sem variáveis.</p>
                    ) : (
                      <div className="space-y-2">
                        {templateVarNames(selected).map((n) => {
                          const canComplete = !!caps.completions;
                          const fetchTmpl = (val) => completeArg({ type: 'ref/resource', uri: selected.uriTemplate })(n, val)
                            .then((vals) => setTmplSuggest((s) => ({ ...s, [n]: vals || [] }))).catch(() => {});
                          return (
                            <label key={n} className="block">
                              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{n}</span>
                              <Input value={tmplVars[n] || ''}
                                onChange={(e) => { setTmplVars((v) => ({ ...v, [n]: e.target.value })); if (canComplete) fetchTmpl(e.target.value); }}
                                onFocus={canComplete ? () => fetchTmpl(tmplVars[n] || '') : undefined}
                                list={canComplete ? `tmpl-${n}` : undefined}
                                placeholder={n} spellCheck={false} autoComplete="off" className="h-8 font-mono text-xs" />
                              {canComplete && (tmplSuggest[n] || []).length > 0 && (
                                <datalist id={`tmpl-${n}`}>{tmplSuggest[n].map((o) => <option key={String(o)} value={String(o)} />)}</datalist>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                    <div className="mt-3">
                      <Button size="sm" className="h-8" onClick={() => readResource(expandTemplate(selected, tmplVars))} disabled={running}>
                        {running ? <Loader2 className="mr-1 animate-spin" /> : <Play className="mr-1" />}Ler
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-2 break-all font-mono text-[11px] text-muted-foreground">{selected.uri}</div>
                    {caps.resources?.subscribe && (
                      <Button variant={subscribed.has(selected.uri) ? 'secondary' : 'outline'} size="sm" className="h-8" onClick={() => toggleSubscribe(selected.uri)}>
                        {subscribed.has(selected.uri) ? 'Cancelar assinatura' : 'Assinar atualizações'}
                      </Button>
                    )}
                  </>
                )}

                {(result || err) && (
                  <div className="mt-3 min-h-[120px] flex-1 overflow-hidden rounded-md border">
                    <div className={cn('flex h-7 items-center border-b px-2.5 text-[11px] font-semibold', result?.isError ? 'text-red-500' : 'text-muted-foreground')}>
                      {err ? 'ERRO' : result?.isError ? 'RESULTADO (isError)' : 'RESULTADO'}
                    </div>
                    {err ? (
                      <div className="p-3 text-sm text-red-500">{err}</div>
                    ) : (
                      <CodeMirror value={result.text} theme={cmTheme} height="240px" editable={false} extensions={[editorTheme, json()]} />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState>Conecte a um servidor MCP para inspecionar tools, resources e prompts.</EmptyState>
        )}

        {/* Inspector (Bloco C): history JSON-RPC, logging, progress, ping */}
        {connected && (
          <McpInspectorDrawer
            open={drawerOpen}
            onToggle={toggleDrawer}
            height={drawerHeight}
            onResizeStart={startDrawerResize}
            traffic={traffic}
            truncated={Math.max(0, seqRef.current - traffic.length)}
            onClear={() => { setTraffic([]); seqRef.current = 0; }}
            stderr={log}
            caps={caps}
            onPing={() => window.api.mcpPing(connId)}
            onSetLevel={(lvl) => window.api.mcpSetLogLevel(connId, lvl)}
          />
        )}
      </div>

      {/* Sidebar: servidores salvos */}
      <ResizeBar onMouseDown={startSidebarResize} />
      <div style={{ width: sidebarWidth }} className="flex shrink-0 flex-col bg-card">
        <div className="flex h-12 shrink-0 items-center gap-1.5 border-b px-3">
          <Server className="size-3.5 text-primary" />
          <span className="eyebrow flex-1 truncate">Servers</span>
          <button type="button" onClick={() => { setCurrentName(null); }} title="Novo (limpar nome)" className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-[14px]">
            <Plus />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto py-1">
          {!projectPath ? (
            <p className="px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">Abra um projeto para salvar servidores.</p>
          ) : Object.keys(servers).length === 0 ? (
            <p className="px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">Nenhum servidor salvo ainda.</p>
          ) : (
            Object.keys(servers).sort().map((name) => (
              <div key={name} onClick={() => loadServer(name)} title={name}
                className={cn('group flex cursor-pointer items-center gap-1.5 px-2.5 py-1 text-[13px] hover:bg-muted', currentName === name && 'bg-accent')}>
                <span className="flex-1 truncate">{name}</span>
                <button type="button" onClick={(e) => deleteServer(name, e)} title="Excluir" className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 hover:bg-background hover:text-red-500 group-hover:opacity-100 [&_svg]:size-[13px]">
                  <Trash2 />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {dragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}
    </div>
  );
}

// Converte a lista `arguments` de um prompt MCP num mini JSON Schema pro McpToolForm.
function argsToSchema(args) {
  if (!Array.isArray(args)) return { properties: {}, required: [] };
  const properties = {};
  const required = [];
  for (const a of args) {
    properties[a.name] = { type: 'string', description: a.description };
    if (a.required) required.push(a.name);
  }
  return { properties, required };
}
