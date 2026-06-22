const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeImage, Menu, webContents, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const crypto = require('crypto');
const http = require('http');
const detectPort = require('detect-port');
const mcpCore = require('./mcp-core.cjs');
const llmCore = require('./llm-core.cjs');

let mainWindow;
const runningServers = new Map(); // projectPath -> { proc, url, port, log }
const terminals = new Map();      // sessionId -> { pty, buffer, projectPath } (sessões do Claude Code)
const shells = new Map();         // projectPath -> { pty, buffer } (terminal livre por projeto)
let ptyLib = null;

const APP_NAME = 'Carcará Code';
const APP_ICON = path.join(__dirname, 'build', 'icon.png');

// Nome e identidade no Windows (agrupa o ícone certo na taskbar).
app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId('com.carcara.code');

// Remove os tokens próprios do User-Agent ("Carcará Code/x" e "Electron/x") pra o
// WebView se apresentar como Chrome puro. O nome com acento gerava um byte inválido
// no header e gateways (Supabase/Cloudflare) rejeitavam com 500. A versão do Chrome
// vem do UA padrão, então acompanha sozinha quando o Electron for atualizado.
app.userAgentFallback = app.userAgentFallback
  .replace(/Carcar[^/]*\/\S+\s*/i, '')
  .replace(/Electron\/\S+\s*/i, '')
  .replace(/\s+/g, ' ')
  .trim();

const configPath = () => path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  let c;
  try { c = JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { c = {}; }
  if (!Array.isArray(c.projects)) c.projects = [];
  // Migração única: tinha um 'root' antigo? Importa as subpastas pra lista e descarta o root.
  if (c.root && c.projects.length === 0) {
    try {
      for (const e of fs.readdirSync(c.root, { withFileTypes: true })) {
        if (e.isDirectory() && !e.name.startsWith('.')) c.projects.push(path.join(c.root, e.name));
      }
    } catch {}
    delete c.root;
    saveConfig(c);
  }
  return c;
}
function saveConfig(cfg) {
  try { fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2)); } catch {}
}

function llmConfig() {
  const c = loadConfig();
  const llm = c.llm || {};
  return {
    enabled: !!llm.enabled,
    model: llm.model || llmCore.MODEL_ID,
    features: {
      commit: !!(llm.features && llm.features.commit),
      promptTitle: !!(llm.features && llm.features.promptTitle),
      checkpointTitle: !!(llm.features && llm.features.checkpointTitle),
    },
  };
}

function killProc(proc) {
  if (!proc) return;
  if (process.platform === 'win32') {
    try { spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t']); } catch {}
  } else {
    try { proc.kill(); } catch {}
  }
}

// Envia pro renderer só se a janela ainda existir (evita "Object has been destroyed").
function safeSend(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

// Encerra todos os processos (terminais + servidores de preview).
function cleanup() {
  for (const s of runningServers.values()) { if (s.probe) clearInterval(s.probe); killProc(s.proc); }
  runningServers.clear();
  for (const t of terminals.values()) { if (t.idleTimer) clearTimeout(t.idleTimer); try { t.pty.kill(); } catch {} }
  terminals.clear();
  for (const s of shells.values()) { try { s.pty.kill(); } catch {} }
  shells.clear();
  try { mcpCore.mcpDisconnectAll(); } catch {}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    icon: APP_ICON,
    backgroundColor: '#191615',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);

  // Em dev (Vite rodando) carrega o servidor; senão, o build em dist/.
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Encaminha erros/logs do renderer pro stdout (útil pra debug).
  mainWindow.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log('[renderer]', message);
  });

  // Botões laterais do mouse via WM_APPCOMMAND (mouses que mandam assim). Mouses que
  // mandam como XBUTTON são tratados pelo listener injetado na página (ver PreviewPanel).
  mainWindow.on('app-command', (_e, cmd) => {
    if (cmd === 'browser-backward') safeSend('nav:back');
    else if (cmd === 'browser-forward') safeSend('nav:forward');
  });

  // Ao fechar a janela: mata os processos na hora e zera a referência.
  mainWindow.on('closed', () => { cleanup(); mainWindow = null; });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  cleanup();
  if (process.platform !== 'darwin') app.quit();
});

// Dá ao preview (webview) cara de navegador: DevTools no F12 e menu de botão direito.
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return;

  // Menu de contexto (botão direito) com as opções de um navegador.
  contents.on('context-menu', (_e, params) => {
    const can = params.editFlags;
    Menu.buildFromTemplate([
      { label: 'Voltar', enabled: contents.canGoBack(), click: () => contents.goBack() },
      { label: 'Avançar', enabled: contents.canGoForward(), click: () => contents.goForward() },
      { label: 'Recarregar', click: () => contents.reload() },
      { type: 'separator' },
      { label: 'Recortar', role: 'cut', enabled: can.canCut },
      { label: 'Copiar', role: 'copy', enabled: can.canCopy },
      { label: 'Colar', role: 'paste', enabled: can.canPaste },
      { label: 'Selecionar tudo', role: 'selectAll' },
      ...(params.linkURL ? [{ type: 'separator' }, { label: 'Copiar link', click: () => clipboard.writeText(params.linkURL) }] : []),
      { type: 'separator' },
      { label: 'Inspecionar elemento', click: () => { lastInspect = { x: params.x, y: params.y }; safeSend('devtools:toggle'); } },
    ]).popup();
  });

  // F12 / Ctrl+Shift+I: pede pro renderer abrir/fechar o DevTools encaixado.
  contents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    const isF12 = input.key === 'F12';
    const isInspect = input.control && input.shift && input.key.toLowerCase() === 'i';
    if (isF12 || isInspect) { lastInspect = null; safeSend('devtools:toggle'); return; }
    // Ctrl +/-/0 com o foco DENTRO do preview zoomam o SITE (estilo navegador),
    // não a janela do app. preventDefault impede o site de também reagir ao atalho.
    if ((input.control || input.meta) && !input.alt) {
      const k = input.key;
      const isZoom = k === '=' || k === '+' || k === '-' || k === '_' || k === '0';
      if (isZoom) {
        const cur = contents.getZoomLevel();
        const next = k === '0' ? 0 : (k === '-' || k === '_') ? cur - 0.5 : cur + 0.5;
        contents.setZoomLevel(Math.max(-3, Math.min(3, next)));
        _e.preventDefault();
      }
    }
  });

  // Borda discreta no preview: avisa quando o foco está DENTRO do webview (aí o
  // Ctrl +/- zooma o site; fora, zooma o app). Eventos focus/blur do webContents
  // são a fonte autoritativa; o renderer casa pelo id do webview do projeto ativo.
  contents.on('focus', () => safeSend('webview:focus', { id: contents.id, focused: true }));
  contents.on('blur', () => safeSend('webview:focus', { id: contents.id, focused: false }));

});

// Encaixa o DevTools do preview DENTRO de um segundo webview (à direita), estilo Chrome.
// Webviews não aceitam DevTools "docked" na própria janela; setDevToolsWebContents resolve.
let lastInspect = null;
ipcMain.on('devtools:dock', (_e, { previewId, devtoolsId }) => {
  try {
    const target = webContents.fromId(previewId);
    const host = webContents.fromId(devtoolsId);
    if (!target || !host) return;
    target.setDevToolsWebContents(host);
    target.openDevTools();
    host.focus();
    if (lastInspect) { try { target.inspectElement(lastInspect.x, lastInspect.y); } catch {} }
    lastInspect = null;
  } catch {}
});
ipcMain.on('devtools:undock', (_e, { previewId }) => {
  try { const t = webContents.fromId(previewId); if (t && t.isDevToolsOpened()) t.closeDevTools(); } catch {}
});

// ---------- Config / projetos ----------
ipcMain.handle('config:get', () => loadConfig());

// ---------- CLI de IA (Claude Code / OpenCode / Antigravity / custom) ----------
const AI_CLIS = { claude: 'claude', opencode: 'opencode', agy: 'agy', codex: 'codex' };

// O Claude Code guarda o transcript em ~/.claude/projects/<projeto>/<id>.jsonl.
// Procura esse arquivo (em qualquer projeto) E confirma que tem conversa de verdade
// (ao menos uma mensagem de usuário) — senão o `--resume` falharia com "no conversation".
function claudeHistoryExists(claudeId) {
  try {
    const base = process.env.CLAUDE_CONFIG_DIR
      ? path.join(process.env.CLAUDE_CONFIG_DIR, 'projects')
      : path.join(os.homedir(), '.claude', 'projects');
    for (const d of fs.readdirSync(base)) {
      const fp = path.join(base, d, claudeId + '.jsonl');
      try {
        const st = fs.statSync(fp);
        if (!st.isFile() || st.size === 0) continue;
        const fd = fs.openSync(fp, 'r');
        const buf = Buffer.alloc(Math.min(st.size, 262144)); // 1ª mensagem aparece logo no início
        fs.readSync(fd, buf, 0, buf.length, 0);
        fs.closeSync(fd);
        const head = buf.toString('utf8');
        if (head.includes('"type":"user"') || head.includes('"role":"user"')) return true;
      } catch {}
    }
  } catch {}
  return false;
}

// Acha a metadata da sessão (tab) no config.
function getSessionMeta(cfg, projectPath, sessionId) {
  const list = (cfg.sessions && cfg.sessions[projectPath]) || [];
  return list.find((x) => x.id === sessionId) || null;
}

// OpenCode/Antigravity geram o próprio id da conversa. A gente captura esse id
// do output do terminal (captureResumeId) e guarda amarrado à nossa sessão+CLI,
// pra retomar o tab certo depois. Pro Claude o id já é o nosso (--session-id).
function saveResumeId(projectPath, sessionId, cli, resumeId) {
  const cfg = loadConfig();
  const s = getSessionMeta(cfg, projectPath, sessionId);
  if (!s) return;
  s.resume = s.resume || {};
  if (s.resume[cli] === resumeId) return;
  s.resume[cli] = resumeId;
  saveConfig(cfg);
}

function captureResumeId(entry) {
  if (!entry || entry.resumeCaptured) return;
  const tail = entry.buffer.slice(-8000);
  let id = null;
  if (entry.cli === 'agy') {
    // O agy imprime algo como: "Resume: agy --conversation=<id>"
    const m = tail.match(/--conversation[=\s]+([0-9a-fA-F][\w-]{7,})/);
    if (m) id = m[1];
  } else if (entry.cli === 'opencode') {
    // OpenCode usa ids no formato ses_XXXX
    const m = tail.match(/\bses_[A-Za-z0-9]{6,}\b/);
    if (m) id = m[0];
  } else if (entry.cli === 'codex') {
    // Codex imprime a dica de retomada: "codex resume <id>"
    const m = tail.match(/codex\s+(?:exec\s+)?resume\s+([0-9a-fA-F][\w-]{7,})/i);
    if (m) id = m[1];
  } else {
    return;
  }
  if (!id) return;
  entry.resumeCaptured = id;
  saveResumeId(entry.projectPath, entry.sessionId, entry.cli, id);
}

// Comando que sobe automaticamente em cada nova sessão. Lido fresco do config,
// então trocar o CLI nas configs vale pras próximas sessões abertas.
// Retoma a MESMA conversa do tab após fechar/reabrir o app (quando há id salvo).
function buildLaunchCommand(sessionId, projectPath) {
  const c = loadConfig();
  const { cli, custom } = resolveProjectCli(projectPath, c);
  if (cli === 'claude') {
    const s = getSessionMeta(c, projectPath, sessionId);
    // Id do Claude desacoplado do id da aba. Migra o esquema antigo (id da aba).
    let cid = s && s.claudeId;
    if (!cid && claudeHistoryExists(sessionId)) cid = sessionId;
    if (cid && claudeHistoryExists(cid)) {           // tem conversa salva → retoma
      if (s && s.claudeId !== cid) { s.claudeId = cid; saveConfig(c); }
      return `claude --resume ${cid}`;
    }
    // Sem conversa válida (nova, ou "morta" sem mensagens) → cria com um id NOVO,
    // evitando o erro "Session ID already in use" de reusar um id reservado.
    const fresh = crypto.randomUUID();
    if (s) { s.claudeId = fresh; saveConfig(c); }
    return `claude --session-id ${fresh}`;
  }
  if (cli === 'opencode') {
    const s = getSessionMeta(c, projectPath, sessionId);
    return s?.resume?.opencode ? `opencode --session ${s.resume.opencode}` : 'opencode';
  }
  if (cli === 'agy') {
    const s = getSessionMeta(c, projectPath, sessionId);
    return s?.resume?.agy ? `agy --conversation=${s.resume.agy}` : 'agy';
  }
  if (cli === 'codex') {
    const s = getSessionMeta(c, projectPath, sessionId);
    return s?.resume?.codex ? `codex resume ${s.resume.codex}` : 'codex';
  }
  if (cli === 'custom') return (custom || '').trim() || 'claude';
  return AI_CLIS[cli] || 'claude';
}
// CLI por projeto. Cai pro global antigo (cfg.cli) e por fim 'claude'.
function resolveProjectCli(projectPath, cfg) {
  const c = cfg || loadConfig();
  const pc = c.projectCli && c.projectCli[projectPath];
  if (pc && pc.cli) return { cli: pc.cli, custom: pc.custom || '' };
  return { cli: c.cli || 'claude', custom: c.cliCustom || '' };
}
ipcMain.handle('ai:get', (evt, { projectPath }) => resolveProjectCli(projectPath));
ipcMain.handle('ai:set', (evt, { projectPath, cli, custom }) => {
  const c = loadConfig();
  c.projectCli = c.projectCli || {};
  c.projectCli[projectPath] = { cli: cli || 'claude', custom: custom || '' };
  saveConfig(c);
  return { ok: true };
});

// Adiciona uma ou mais pastas de projeto (de qualquer lugar do disco).
ipcMain.handle('projects:add', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Escolha a(s) pasta(s) de projeto',
    properties: ['openDirectory', 'multiSelections'],
  });
  if (res.canceled) return { added: 0 };
  const cfg = loadConfig();
  let added = 0;
  for (const p of res.filePaths) {
    if (!cfg.projects.includes(p)) { cfg.projects.push(p); added++; }
  }
  saveConfig(cfg);
  return { added };
});

// Remove um projeto da lista (não apaga nada do disco).
ipcMain.handle('projects:remove', (evt, { projectPath }) => {
  const cfg = loadConfig();
  cfg.projects = cfg.projects.filter((p) => p !== projectPath);
  // Mata os PTYs das sessões desse projeto e descarta a metadata.
  for (const [id, e] of terminals) {
    if (e.projectPath === projectPath) { try { e.pty.kill(); } catch {} terminals.delete(id); }
  }
  if (cfg.sessions) delete cfg.sessions[projectPath];
  saveConfig(cfg);
  return { ok: true };
});

// Reordena a lista (drag-and-drop no rail). Salva a nova ordem no config.json.
ipcMain.handle('projects:reorder', (evt, { paths }) => {
  const cfg = loadConfig();
  const known = new Set(cfg.projects);
  // Mantém só os caminhos conhecidos, na ordem pedida…
  const ordered = (Array.isArray(paths) ? paths : []).filter((p) => known.has(p));
  // …e acrescenta no fim qualquer projeto que tenha ficado de fora (segurança).
  for (const p of cfg.projects) if (!ordered.includes(p)) ordered.push(p);
  cfg.projects = ordered;
  saveConfig(cfg);
  return { ok: true };
});

// ---- Favicon do projeto como ícone ----
const iconCache = new Map(); // projectPath -> dataUrl | null
function toDataUrl(fp, buf) {
  const ext = path.extname(fp).toLowerCase();
  const mime = ext === '.svg' ? 'image/svg+xml'
    : ext === '.png' ? 'image/png'
    : ext === '.ico' ? 'image/x-icon'
    : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
    : ext === '.webp' ? 'image/webp'
    : ext === '.gif' ? 'image/gif'
    : ext === '.bmp' ? 'image/bmp'
    : ext === '.avif' ? 'image/avif'
    : 'application/octet-stream';
  return `data:${mime};base64,${buf.toString('base64')}`;
}
function findFavicon(p) {
  if (iconCache.has(p)) return iconCache.get(p);
  const dirs = ['', 'public', 'src', 'static', 'app', 'src/assets', 'assets', 'public/assets'];
  const names = [
    'favicon.svg', 'favicon.ico', 'favicon.png',
    'icon.svg', 'icon.png', 'logo.svg', 'apple-touch-icon.png',
  ];
  let icon = null;
  outer:
  for (const d of dirs) {
    for (const n of names) {
      const fp = path.join(p, d, n);
      try {
        const buf = fs.readFileSync(fp);
        if (buf.length <= 512 * 1024) { icon = toDataUrl(fp, buf); break outer; }
      } catch {}
    }
  }
  iconCache.set(p, icon);
  return icon;
}

ipcMain.handle('projects:list', () => {
  const cfg = loadConfig();
  // Preserva a ordem salva no config.json (definida pelo drag-and-drop do rail).
  return cfg.projects
    .filter((p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } })
    .map((p) => {
      let hasPkg = false;
      try { fs.accessSync(path.join(p, 'package.json')); hasPkg = true; } catch {}
      return { name: path.basename(p), path: p, hasPkg, running: runningServers.has(p), icon: findFavicon(p) };
    });
});

// ---------- Código: árvore de arquivos e leitura ----------
const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.astro', '.cache',
  '.turbo', '.output', '.vercel', '.svelte-kit', 'coverage', '.parcel-cache',
]);
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.avif',
  '.woff', '.woff2', '.ttf', '.otf', '.eot', '.pdf', '.zip', '.gz', '.tgz',
  '.rar', '.7z', '.node', '.exe', '.dll', '.so', '.dylib', '.wasm',
  '.mp4', '.mov', '.avi', '.webm', '.mp3', '.wav', '.flac', '.class', '.jar',
]);

ipcMain.handle('fs:dir', (evt, { dirPath }) => {
  let ents = [];
  try { ents = fs.readdirSync(dirPath, { withFileTypes: true }); } catch { return []; }
  return ents
    .filter((en) => !(en.isDirectory() && IGNORE_DIRS.has(en.name)))
    .map((en) => ({ name: en.name, path: path.join(dirPath, en.name), isDir: en.isDirectory() }))
    .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
});

// Subsequência fuzzy (estilo "quick open" do VS Code): todos os caracteres da
// query aparecem na ordem dentro do texto. Pontua mais quando os caracteres ficam
// grudados (streak). Devolve null quando não casa.
function subseqScore(q, text) {
  let ti = 0, score = 0, streak = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const found = text.indexOf(q[qi], ti);
    if (found === -1) return null;
    if (found === ti) { streak++; score += 1 + streak; } else { streak = 0; score += 1; }
    ti = found + 1;
  }
  return score;
}

// Busca recursiva de arquivos pra barra de pesquisa da árvore. Caminha o projeto
// (ignorando IGNORE_DIRS), casa por subsequência fuzzy e ranqueia — casar no nome
// do arquivo vale muito mais que casar só no caminho. Limita visita e resultados
// pra não travar em projetos grandes.
ipcMain.handle('fs:search', (evt, { root, query, limit = 200 }) => {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const out = [];
  const MAX_VISIT = 50000;
  let visited = 0;
  const walk = (dir) => {
    if (visited > MAX_VISIT) return;
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const en of ents) {
      if (visited > MAX_VISIT) return;
      visited++;
      const full = path.join(dir, en.name);
      if (en.isDirectory()) {
        if (!IGNORE_DIRS.has(en.name)) walk(full);
        continue;
      }
      const rel = path.relative(root, full);
      const nameScore = subseqScore(q, en.name.toLowerCase());
      const score = nameScore != null ? nameScore + 1000 : subseqScore(q, rel.toLowerCase());
      if (score != null) out.push({ name: en.name, path: full, rel, score });
    }
  };
  walk(root);
  out.sort((a, b) => b.score - a.score || a.rel.length - b.rel.length);
  return out.slice(0, limit).map(({ score, ...r }) => r);
});

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.ico', '.svg']);

ipcMain.handle('fs:read', (evt, { filePath }) => {
  const ext = path.extname(filePath).toLowerCase();
  // Imagens: devolve como data URL pra exibir no visualizador.
  if (IMAGE_EXT.has(ext)) {
    try {
      const st = fs.statSync(filePath);
      if (st.size > 16 * 1024 * 1024) return { error: 'imagem muito grande (>16MB)' };
      return { image: toDataUrl(filePath, fs.readFileSync(filePath)), size: st.size };
    } catch (err) { return { error: String(err) }; }
  }
  if (BINARY_EXT.has(ext)) return { binary: true };
  try {
    const st = fs.statSync(filePath);
    if (st.size > 1024 * 1024) return { error: 'arquivo muito grande (>1MB) pra exibir' };
    return { content: fs.readFileSync(filePath, 'utf8') };
  } catch (err) { return { error: String(err) }; }
});

ipcMain.handle('fs:write', (evt, { filePath, content }) => {
  try { fs.writeFileSync(filePath, content, 'utf8'); return { ok: true }; }
  catch (err) { return { error: String(err) }; }
});

// Arrastar um arquivo da árvore PRA FORA (outro app / site). Precisa de um ícone.
let DRAG_ICON = null;
function dragIcon() {
  if (DRAG_ICON) return DRAG_ICON;
  try {
    const img = nativeImage.createFromPath(APP_ICON);
    if (img && !img.isEmpty()) { DRAG_ICON = img.resize({ width: 28, height: 28 }); return DRAG_ICON; }
  } catch {}
  // Fallback: ícone genérico 16x16 (PNG embutido) pra não quebrar o startDrag.
  DRAG_ICON = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAS0lEQVR4nO3OMQ0AIBDAwIfMv2YkIO0MM3T8z1RVe2Z2dvfMzCQBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4HFM5AYG3M2tCAAAAAElFTkSuQmCC'
  );
  return DRAG_ICON;
}
ipcMain.on('drag:start', (evt, filePath) => {
  try { evt.sender.startDrag({ file: filePath, icon: dragIcon() }); } catch {}
});

// Abre uma URL no navegador padrão do sistema (sem lock-in: o usuário escolhe).
// Só http/https — evita abrir esquemas perigosos (file:, etc.) por engano.
ipcMain.handle('shell:openExternal', async (evt, { url }) => {
  try {
    const u = String(url || '').trim();
    if (!/^https?:\/\//i.test(u)) return { error: 'URL inválida' };
    await shell.openExternal(u);
    return { ok: true };
  } catch (err) { return { error: String(err) }; }
});

// ---------- Operações do menu de contexto (botão direito) ----------
ipcMain.handle('fs:reveal', (evt, { targetPath }) => {
  try { shell.showItemInFolder(targetPath); return { ok: true }; }
  catch (err) { return { error: String(err) }; }
});

// Delete = manda pra Lixeira (reversível), nunca apaga de vez.
ipcMain.handle('fs:trash', async (evt, { targetPath }) => {
  try { await shell.trashItem(targetPath); return { ok: true }; }
  catch (err) { return { error: String(err) }; }
});

ipcMain.handle('fs:rename', (evt, { targetPath, newName }) => {
  try {
    const name = String(newName || '').trim();
    if (!name || name.includes('/') || name.includes('\\')) return { error: 'nome inválido' };
    const dest = path.join(path.dirname(targetPath), name);
    if (fs.existsSync(dest)) return { error: 'já existe um item com esse nome' };
    fs.renameSync(targetPath, dest);
    return { ok: true, path: dest };
  } catch (err) { return { error: String(err) }; }
});

ipcMain.handle('clip:write', (evt, { text }) => {
  try { clipboard.writeText(String(text)); return { ok: true }; }
  catch (err) { return { error: String(err) }; }
});

ipcMain.handle('clip:read', () => {
  try { return { text: clipboard.readText() }; }
  catch { return { text: '' }; }
});

function uniqueDest(destDir, base) {
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  let candidate = path.join(destDir, base);
  let i = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(destDir, `${stem} copy${i > 1 ? ' ' + i : ''}${ext}`);
    i++;
  }
  return candidate;
}

// Paste: move (cut) ou copia (copy) o item para uma pasta de destino.
ipcMain.handle('fs:paste', (evt, { srcPath, destDir, move }) => {
  try {
    if (!fs.existsSync(srcPath)) return { error: 'origem não existe' };
    const base = path.basename(srcPath);
    const sameDir = path.resolve(path.dirname(srcPath)) === path.resolve(destDir);
    let dest = path.join(destDir, base);
    if ((sameDir && !move) || fs.existsSync(dest)) dest = uniqueDest(destDir, base);
    // não deixa colar uma pasta dentro dela mesma
    if (path.resolve(dest).startsWith(path.resolve(srcPath) + path.sep)) return { error: 'destino inválido' };
    if (move) {
      try { fs.renameSync(srcPath, dest); }
      catch (e) {
        if (e.code === 'EXDEV') { fs.cpSync(srcPath, dest, { recursive: true }); fs.rmSync(srcPath, { recursive: true, force: true }); }
        else throw e;
      }
    } else {
      fs.cpSync(srcPath, dest, { recursive: true });
    }
    return { ok: true, path: dest };
  } catch (err) { return { error: String(err) }; }
});

// ---------- Terminal (Claude Code de verdade, via node-pty) ----------
function shellForOS() {
  if (process.platform === 'win32') return process.env.COMSPEC || 'powershell.exe';
  return process.env.SHELL || 'bash';
}

// Ambiente que FORÇA a assinatura (sem chave de API) e limpa a flag do Electron.
function cleanEnv() {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

// Onde o Claude Code guarda as configs globais (respeita CLAUDE_CONFIG_DIR).
function claudeSettingsPath() {
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(base, 'settings.json');
}

// O Claude Code tem o PRÓPRIO tema (chave "theme" no settings.json), independente
// do tema do nosso app. Se o terminal é claro mas o Claude está em "dark", as cores
// (cinzas/esmaecidos pensados p/ fundo escuro) ficam ilegíveis no branco. Aqui a gente
// casa os dois: escreve 'light'/'dark' no settings.json do Claude, preservando o resto.
// Só grava se mudou, pra não tocar o arquivo (e disparar watchers) à toa.
function applyClaudeTheme(theme) {
  const want = theme === 'light' ? 'light' : 'dark';
  try {
    const fp = claudeSettingsPath();
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { cfg = {}; }
    if (cfg && typeof cfg === 'object' && cfg.theme === want) return;
    cfg = (cfg && typeof cfg === 'object') ? cfg : {};
    cfg.theme = want;
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, JSON.stringify(cfg, null, 2));
  } catch {}
}

ipcMain.handle('claude:applyTheme', (evt, { theme }) => { applyClaudeTheme(theme); return { ok: true }; });

// ---------- Sessões do Claude Code (várias por projeto) ----------
// A lista de sessões vive no config.json (cfg.sessions[projectPath] = [{ id, name }]),
// então sobrevive a restart. Os PTYs são (re)criados sob demanda em term:ensure.
function getSessions(cfg, projectPath) {
  if (!cfg.sessions || typeof cfg.sessions !== 'object') cfg.sessions = {};
  if (!Array.isArray(cfg.sessions[projectPath])) cfg.sessions[projectPath] = [];
  return cfg.sessions[projectPath];
}

ipcMain.handle('sessions:list', (evt, { projectPath }) => {
  const cfg = loadConfig();
  return getSessions(cfg, projectPath);
});

ipcMain.handle('sessions:create', (evt, { projectPath, name }) => {
  const cfg = loadConfig();
  const list = getSessions(cfg, projectPath);
  // Contador monotônico por projeto: o número só sobe e nunca é reaproveitado,
  // então cada sessão mantém seu número como identidade permanente (fechar a 2
  // não faz a próxima virar 2 de novo — vira a 4). Ver main.js histórico do bug.
  if (!cfg.sessionSeq || typeof cfg.sessionSeq !== 'object') cfg.sessionSeq = {};
  // Projetos antigos não têm contador salvo: semeia a partir do maior número já
  // existente (campo `n` ou o número no nome "Sessão N") pra não colidir.
  if (cfg.sessionSeq[projectPath] == null) {
    cfg.sessionSeq[projectPath] = list.reduce((max, s) => {
      const num = s.n ?? parseInt(String(s.name).match(/(\d+)/)?.[1] ?? '0', 10);
      return Number.isFinite(num) && num > max ? num : max;
    }, 0);
  }
  const n = (cfg.sessionSeq[projectPath] || 0) + 1;
  cfg.sessionSeq[projectPath] = n;
  const session = { id: crypto.randomUUID(), name: name || `Sessão ${n}`, n };
  list.push(session);
  saveConfig(cfg);
  return session;
});

ipcMain.handle('sessions:rename', (evt, { projectPath, sessionId, name }) => {
  const cfg = loadConfig();
  const s = getSessions(cfg, projectPath).find((x) => x.id === sessionId);
  if (s) { s.name = name; saveConfig(cfg); }
  return { ok: true };
});

ipcMain.handle('sessions:close', (evt, { projectPath, sessionId }) => {
  const e = terminals.get(sessionId);
  if (e) { try { e.pty.kill(); } catch {} terminals.delete(sessionId); }
  const cfg = loadConfig();
  cfg.sessions = cfg.sessions || {};
  if (Array.isArray(cfg.sessions[projectPath])) {
    cfg.sessions[projectPath] = cfg.sessions[projectPath].filter((x) => x.id !== sessionId);
    saveConfig(cfg);
  }
  return { ok: true };
});

// ---------- Atividade do Claude (notifica quando termina) ----------
// Só vale pra sessões cujo CLI é o `claude`. Detecta por ociosidade: depois de você
// enviar algo (input com Enter = "armado"), o output volta a fluir = "trabalhando";
// quando o output para por ~3s = "terminou". O estado é por sessão; o rail agrega
// por projeto no renderer. A notificação do SO só dispara se o projeto não estiver
// em foco (decisão de produto: silencioso quando você já está olhando).
let activeProjectPath = null;
const ACTIVITY_IDLE_MS = 3000;   // silêncio que marca "terminou"
const ACTIVITY_MIN_BYTES = 40;   // ignora eco/ruído trivial pra não disparar à toa
const lastNotifyAt = new Map();  // projectPath -> ts (coalescência por projeto)

function notifyEnabled() {
  return loadConfig().notify !== false; // padrão: ligado
}

function emitActivity(entry, state, extra) {
  safeSend('activity:state', { projectPath: entry.projectPath, sessionId: entry.sessionId, state, ...extra });
}

// Tira os códigos ANSI (cores, posicionamento de cursor) pra sobrar só o texto visível.
function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b[=>NOPF]/g, '');
}

// Distingue "o Claude PEDIU algo (pergunta/permissão) e está esperando você" de "só
// terminou o turno". Lê o rodapé do último frame redesenhado pela TUI (já sem ANSI) e
// procura a assinatura dos prompts de permissão/seleção do Claude Code: a pergunta
// ("Do you want to…/Would you like to…") ou o menu de opções (❯ na 1ª + 2ª numerada).
// Olha só os últimos ~1200 chars visíveis pra pegar o estado ATUAL da tela, não um
// prompt já respondido que ficou no histórico.
function looksLikeAsking(entry) {
  const tail = stripAnsi(entry.buffer.slice(-6000)).slice(-1200);
  if (/Do you want to|Would you like to/i.test(tail)) return true;
  if (/❯\s*1\.\s/.test(tail) && /\b2\.\s/.test(tail)) return true;
  return false;
}

// Reinicia o debounce de ociosidade e marca a sessão como "trabalhando".
function activityWorking(entry) {
  if (!entry.working) { entry.working = true; emitActivity(entry, 'working'); }
  if (entry.idleTimer) clearTimeout(entry.idleTimer);
  entry.idleTimer = setTimeout(() => activityIdle(entry), ACTIVITY_IDLE_MS);
}

// O output parou: a sessão terminou. Emite 'done' e talvez notifica.
function activityIdle(entry) {
  entry.idleTimer = null;
  if (!entry.working) return;
  entry.working = false;
  entry.armed = false;
  const asking = looksLikeAsking(entry); // pediu confirmação vs. terminou de fato
  emitActivity(entry, 'done', { asking });
  maybeNotifyDone(entry, asking);
  scheduleAutoCheckpoint(entry.projectPath); // snapshot do resultado do turno
}

function maybeNotifyDone(entry, asking) {
  if (!notifyEnabled()) return;
  const focused = mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused();
  if (focused && activeProjectPath === entry.projectPath) return; // você já está olhando
  const now = Date.now();
  if (now - (lastNotifyAt.get(entry.projectPath) || 0) < 1500) return; // coalesce por projeto
  lastNotifyAt.set(entry.projectPath, now);
  try {
    if (Notification && !Notification.isSupported()) return;
    const name = path.basename(entry.projectPath);
    const body = asking ? `Claude precisa de você em ${name}` : `Claude terminou em ${name}`;
    const n = new Notification({ title: 'Carcará Code', body });
    n.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
      safeSend('activity:focus', { projectPath: entry.projectPath, sessionId: entry.sessionId });
    });
    n.show();
  } catch {}
}

// Alimenta o rastreador com um chunk de output da sessão (só pra claude).
function activityOnData(entry, data) {
  if (entry.cli !== 'claude') return;
  if (entry.working) { activityWorking(entry); return; } // mantém vivo o debounce
  if (!entry.armed) return;                              // só conta depois de você enviar algo
  entry.outBytes = (entry.outBytes || 0) + data.length;
  if (entry.outBytes >= ACTIVITY_MIN_BYTES) activityWorking(entry);
}

// Qual projeto está aberto no momento (renderer avisa). Usado pra não notificar/badgear
// o projeto que você está olhando.
ipcMain.on('activity:setActive', (evt, { projectPath }) => { activeProjectPath = projectPath || null; });
ipcMain.handle('notify:get', () => ({ enabled: notifyEnabled() }));
ipcMain.handle('notify:set', (evt, { enabled }) => { const c = loadConfig(); c.notify = !!enabled; saveConfig(c); return { ok: true }; });

ipcMain.handle('term:ensure', (evt, { sessionId, projectPath, cols, rows, theme }) => {
  if (terminals.has(sessionId)) {
    return { existed: true, buffer: terminals.get(sessionId).buffer };
  }
  let pty;
  try {
    pty = ptyLib || (ptyLib = require('node-pty'));
  } catch (e) {
    return { error: 'node-pty não carregou: ' + e.message };
  }

  const proc = pty.spawn(shellForOS(), [], {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: projectPath,
    env: cleanEnv(),
  });
  const { cli } = resolveProjectCli(projectPath);
  const entry = { pty: proc, buffer: '', projectPath, sessionId, cli };
  terminals.set(sessionId, entry);

  proc.onData((data) => {
    entry.buffer += data;
    if (entry.buffer.length > 200000) entry.buffer = entry.buffer.slice(-150000);
    captureResumeId(entry); // OpenCode/Antigravity/Codex: pesca o id da conversa do output
    activityOnData(entry, data); // detecção "trabalhando/terminou" (só claude)
    safeSend('term:data', { sessionId, data });
  });
  proc.onExit(() => {
    if (entry.idleTimer) { clearTimeout(entry.idleTimer); entry.idleTimer = null; }
    terminals.delete(sessionId);
    emitActivity(entry, 'idle'); // limpa o indicador no rail
    safeSend('term:exit', { sessionId });
  });

  // Casa o tema do Claude Code com o do terminal ANTES de subir o CLI, pra ele já
  // nascer com as cores certas pro fundo (claro/escuro). Só faz sentido pro claude.
  if (cli === 'claude' && theme) applyClaudeTheme(theme);

  // Sobe o CLI de IA escolhido (Claude Code por padrão) automaticamente nessa sessão,
  // retomando a conversa anterior do tab quando há id salvo.
  const cmd = buildLaunchCommand(sessionId, projectPath);
  proc.write(cmd + '\r');
  return { existed: false, buffer: '' };
});

ipcMain.on('term:input', (evt, { sessionId, data }) => {
  const e = terminals.get(sessionId);
  if (e) {
    e.pty.write(data);
    // Enviar algo (Enter) "arma" a detecção: o output que vier a seguir conta como trabalho.
    if (e.cli === 'claude' && /[\r\n]/.test(data)) { e.armed = true; e.outBytes = 0; }
  }
});

ipcMain.on('term:resize', (evt, { sessionId, cols, rows }) => {
  const e = terminals.get(sessionId);
  if (e) { try { e.pty.resize(cols, rows); } catch {} }
});

// ---------- Terminal livre (shell comum p/ npm, instalar skills, etc.) ----------
// Igual ao do Claude Code, mas NÃO sobe o `claude` — abre só o shell no projeto.
ipcMain.handle('shell:ensure', (evt, { projectPath, cols, rows }) => {
  if (shells.has(projectPath)) {
    return { existed: true, buffer: shells.get(projectPath).buffer };
  }
  let pty;
  try {
    pty = ptyLib || (ptyLib = require('node-pty'));
  } catch (e) {
    return { error: 'node-pty não carregou: ' + e.message };
  }

  const proc = pty.spawn(shellForOS(), [], {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: projectPath,
    env: cleanEnv(),
  });
  const entry = { pty: proc, buffer: '' };
  shells.set(projectPath, entry);

  proc.onData((data) => {
    entry.buffer += data;
    if (entry.buffer.length > 200000) entry.buffer = entry.buffer.slice(-150000);
    safeSend('shell:data', { projectPath, data });
  });
  proc.onExit(() => {
    shells.delete(projectPath);
    safeSend('shell:exit', { projectPath });
  });

  return { existed: false, buffer: '' };
});

ipcMain.on('shell:input', (evt, { projectPath, data }) => {
  const e = shells.get(projectPath);
  if (e) e.pty.write(data);
});

ipcMain.on('shell:resize', (evt, { projectPath, cols, rows }) => {
  const e = shells.get(projectPath);
  if (e) { try { e.pty.resize(cols, rows); } catch {} }
});

// ---------- Git (source control) ----------
// Usa simple-git, que é só um wrapper do git do sistema — então herda o
// credential manager pra push/pull no GitHub, igual o VS Code faz.
let _sg = null;
function gitFor(cwd) {
  if (!_sg) { const m = require('simple-git'); _sg = m.simpleGit || m.default || m; }
  return _sg(cwd);
}
// Roda uma operação git e devolve sempre { ok, ... } — nunca derruba o handler.
async function gitTry(fn) {
  try { return { ok: true, ...(await fn()) }; }
  catch (e) { return { ok: false, error: (e && e.message) ? e.message : String(e) }; }
}

// ---------- Checkpoints (shadow git: "voltar no tempo") ----------
// Snapshots do projeto guardados num repositório git PARALELO (GIT_DIR próprio, fora
// do projeto), com a árvore de trabalho apontando pro projeto. Assim o histórico e o
// staging do usuário ficam intocados, arquivos untracked entram, e funciona até sem
// git no projeto. Mesma técnica do Cline. Ver memória "checkpoints-shadow-git".
const CHECKPOINT_EXCLUDE = [
  '.git/', 'node_modules/', 'dist/', 'build/', 'out/', '.next/', '.nuxt/',
  '.svelte-kit/', '.turbo/', '.cache/', 'coverage/', '.venv/', 'venv/',
  '__pycache__/', '.DS_Store', '*.log',
].join('\n') + '\n';

function shadowDir(projectPath) {
  const hash = crypto.createHash('sha1').update(path.resolve(projectPath)).digest('hex').slice(0, 16);
  return path.join(app.getPath('userData'), 'checkpoints', hash + '.git');
}

function shadowGit(projectPath) {
  const dir = shadowDir(projectPath);
  return gitFor(projectPath).env({ ...process.env, GIT_DIR: dir, GIT_WORK_TREE: path.resolve(projectPath) });
}

async function ensureShadow(projectPath) {
  const dir = shadowDir(projectPath);
  if (!fs.existsSync(path.join(dir, 'HEAD'))) {
    fs.mkdirSync(dir, { recursive: true });
    const g = shadowGit(projectPath);
    await g.raw(['init']);
    await g.raw(['config', 'user.email', 'checkpoints@carcara.code']);
    await g.raw(['config', 'user.name', 'Carcará Checkpoints']);
    await g.raw(['config', 'commit.gpgsign', 'false']);
    fs.mkdirSync(path.join(dir, 'info'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'info', 'exclude'), CHECKPOINT_EXCLUDE);
  }
}

// Serializa as operações por projeto: várias sessões terminando juntas não podem
// mexer no mesmo índice ao mesmo tempo (corromperia o shadow repo).
const checkpointQueues = new Map();
function withCheckpointLock(projectPath, fn) {
  const prev = checkpointQueues.get(projectPath) || Promise.resolve();
  const next = prev.then(fn, fn);
  checkpointQueues.set(projectPath, next.catch(() => {}));
  return next;
}

async function checkpointCreate(projectPath, label, { allowEmpty = false } = {}) {
  return withCheckpointLock(projectPath, async () => {
    await ensureShadow(projectPath);
    const g = shadowGit(projectPath);
    await g.raw(['add', '-A']);
    if (!allowEmpty) {
      const st = (await g.raw(['status', '--porcelain'])).trim();
      if (!st) return { skipped: true };
    }
    const msg = label || ('Checkpoint ' + new Date().toISOString());
    const args = ['commit', '-m', msg];
    if (allowEmpty) args.push('--allow-empty');
    await g.raw(args);
    const hash = (await g.raw(['rev-parse', 'HEAD'])).trim();
    return { hash, label: msg };
  });
}

async function checkpointList(projectPath) {
  const dir = shadowDir(projectPath);
  if (!fs.existsSync(path.join(dir, 'HEAD'))) return [];
  const g = shadowGit(projectPath);
  const out = (await g.raw(['log', '--pretty=format:%H%x1f%ct%x1f%s', '-n', '200'])).trim();
  if (!out) return [];
  return out.split('\n').map((line) => {
    const [hash, ts, subject] = line.split('\x1f');
    return { hash, ts: Number(ts) * 1000, subject };
  });
}

// Restaura a árvore EXATAMENTE pro commit alvo (inclusive removendo arquivos criados
// depois). Tira um snapshot do estado atual antes — então voltar é reversível. O HEAD
// do shadow não se move: a história inteira segue alcançável (dá pra ir e voltar).
async function checkpointRestore(projectPath, hash) {
  await checkpointCreate(projectPath, 'Antes de voltar ' + new Date().toISOString(), { allowEmpty: true });
  return withCheckpointLock(projectPath, async () => {
    const g = shadowGit(projectPath);
    await g.raw(['read-tree', hash]);
    await g.raw(['checkout-index', '-f', '-a']);
    await g.raw(['clean', '-fd']);
    return { ok: true };
  });
}

// Auto-checkpoint quando um turno do Claude termina (engatado em activityIdle). Só
// claude, gateado por config e silencioso quando nada mudou.
function checkpointsEnabled() { return loadConfig().checkpoints !== false; }
function scheduleAutoCheckpoint(projectPath) {
  if (!projectPath || !checkpointsEnabled()) return;
  checkpointCreate(projectPath, 'Após resposta do Claude ' + new Date().toISOString())
    .then((r) => { if (r && r.hash) safeSend('checkpoint:added', { projectPath, hash: r.hash }); })
    .catch(() => {});
}

ipcMain.handle('checkpoint:list', (evt, { projectPath }) => gitTry(async () => ({ items: await checkpointList(projectPath) })));
ipcMain.handle('checkpoint:create', (evt, { projectPath, label }) => gitTry(() => checkpointCreate(projectPath, label, { allowEmpty: true })));
ipcMain.handle('checkpoint:restore', (evt, { projectPath, hash }) => gitTry(() => checkpointRestore(projectPath, hash)));
// Diff de um checkpoint vs o anterior no shadow repo (pra IA titular o histórico).
ipcMain.handle('checkpoint:diff', (evt, { projectPath, hash }) => gitTry(async () => {
  const g = shadowGit(projectPath);
  let diff;
  try { diff = await g.raw(['diff', hash + '^', hash]); }
  catch { diff = await g.raw(['show', '--format=', hash]); } // commit raiz (sem pai)
  return { diff };
}));
ipcMain.handle('checkpoint:getEnabled', () => ({ enabled: checkpointsEnabled() }));
ipcMain.handle('checkpoint:setEnabled', (evt, { enabled }) => { const c = loadConfig(); c.checkpoints = !!enabled; saveConfig(c); return { ok: true }; });

// ---------- Biblioteca de prompts (por projeto, em .carcara/prompts.json) ----------
// Prompts reutilizáveis que o usuário injeta no input do chat. Ficam versionáveis
// junto do projeto (.carcara/), então acompanham o repo e a equipe.
function promptsFile(projectPath) { return path.join(projectPath, '.carcara', 'prompts.json'); }
ipcMain.handle('prompts:list', (evt, { projectPath }) => {
  try {
    const f = promptsFile(projectPath);
    if (!fs.existsSync(f)) return { ok: true, items: [] };
    const items = JSON.parse(fs.readFileSync(f, 'utf8'));
    return { ok: true, items: Array.isArray(items) ? items : [] };
  } catch (e) { return { ok: false, error: (e && e.message) || String(e), items: [] }; }
});
ipcMain.handle('prompts:save', (evt, { projectPath, items }) => {
  try {
    fs.mkdirSync(path.join(projectPath, '.carcara'), { recursive: true });
    fs.writeFileSync(promptsFile(projectPath), JSON.stringify(items || [], null, 2));
    return { ok: true };
  } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
});

ipcMain.handle('git:isRepo', (evt, { projectPath }) =>
  gitTry(async () => ({ isRepo: await gitFor(projectPath).checkIsRepo() })));

ipcMain.handle('git:status', (evt, { projectPath }) => gitTry(async () => {
  const git = gitFor(projectPath);
  if (!(await git.checkIsRepo())) return { isRepo: false };
  const s = await git.status();
  return {
    isRepo: true,
    branch: s.current,
    tracking: s.tracking,
    ahead: s.ahead,
    behind: s.behind,
    files: s.files.map((f) => ({ path: f.path, index: f.index, working: f.working_dir })),
  };
}));

ipcMain.handle('git:diff', (evt, { projectPath, file, staged, untracked }) => gitTry(async () => {
  if (untracked) {
    let content = '';
    try { content = fs.readFileSync(path.join(projectPath, file), 'utf8'); } catch {}
    return { diff: content, untracked: true };
  }
  const args = staged ? ['--cached', '--', file] : ['--', file];
  return { diff: await gitFor(projectPath).diff(args) };
}));

ipcMain.handle('git:stage', (evt, { projectPath, files }) =>
  gitTry(async () => { await gitFor(projectPath).add(files); return {}; }));

ipcMain.handle('git:unstage', (evt, { projectPath, files }) =>
  gitTry(async () => { await gitFor(projectPath).reset(['--', ...files]); return {}; }));

ipcMain.handle('git:commit', (evt, { projectPath, message }) =>
  gitTry(async () => ({ result: await gitFor(projectPath).commit(message) })));

ipcMain.handle('git:push', (evt, { projectPath }) => gitTry(async () => {
  const git = gitFor(projectPath);
  const s = await git.status();
  if (!s.tracking) await git.push(['-u', 'origin', s.current]); // primeiro push: cria o upstream
  else await git.push();
  return {};
}));

ipcMain.handle('git:pull', (evt, { projectPath }) =>
  gitTry(async () => ({ result: await gitFor(projectPath).pull() })));

ipcMain.handle('git:branches', (evt, { projectPath }) => gitTry(async () => {
  const b = await gitFor(projectPath).branchLocal();
  return { current: b.current, all: b.all };
}));

ipcMain.handle('git:checkout', (evt, { projectPath, branch }) =>
  gitTry(async () => { await gitFor(projectPath).checkout(branch); return {}; }));

ipcMain.handle('git:createBranch', (evt, { projectPath, name }) =>
  gitTry(async () => { await gitFor(projectPath).checkoutLocalBranch(name); return {}; }));

ipcMain.handle('git:init', (evt, { projectPath }) =>
  gitTry(async () => { await gitFor(projectPath).init(); return {}; }));

ipcMain.handle('git:addRemote', (evt, { projectPath, url }) => gitTry(async () => {
  const git = gitFor(projectPath);
  try { await git.addRemote('origin', url); }
  catch { await git.remote(['set-url', 'origin', url]); } // origin já existia → atualiza
  return {};
}));

// ---------- API connector (REST) ----------
// Roda as requests no processo principal (sem CORS, como o Thunder Client faz).
// Motor: httpyac — parseia o formato .http e executa; a resposta vem pelo callback logResponse.
let httpyacReady = false;
function ensureHttpyac() {
  const httpyac = require('httpyac');
  if (!httpyacReady) {
    httpyac.cli.initFileProvider();
    httpyac.cli.initIOProvider();
    httpyacReady = true;
  }
  return httpyac;
}

// Monta um documento .http a partir da request estruturada vinda da UI.
function buildHttpText({ method = 'GET', url = '', headers = {}, body = '' }) {
  const lines = [`${(method || 'GET').toUpperCase()} ${url}`];
  for (const [k, v] of Object.entries(headers || {})) {
    if (k && String(k).trim()) lines.push(`${k}: ${v ?? ''}`);
  }
  lines.push('');
  if (body != null && String(body).length) lines.push(String(body));
  return lines.join('\n') + '\n';
}

ipcMain.handle('http:send', async (evt, { request, workingDir }) => {
  try {
    const httpyac = ensureHttpyac();
    const text = typeof request === 'string' ? request : buildHttpText(request || {});
    const fileStore = new httpyac.store.HttpFileStore();
    const httpFile = await fileStore.parse('carcara-request.http', text, {
      workingDir: workingDir || process.cwd(),
    });
    const region = httpFile.httpRegions.find((r) => r.request);
    if (!region) return { ok: false, error: 'Nenhuma request reconhecida no documento.' };

    let res = null;
    const started = Date.now();
    await httpyac.send({ httpFile, httpRegion: region, logResponse: (r) => { res = r; } });
    if (!res) return { ok: false, error: 'A request não retornou resposta.' };

    const sizeBytes = res.rawBody ? res.rawBody.length : Buffer.byteLength(res.prettyPrintBody || String(res.body || ''));
    return {
      ok: true,
      status: res.statusCode,
      statusText: res.statusMessage || '',
      contentType: (res.contentType && res.contentType.mimeType) || '',
      headers: res.headers || {},
      body: res.prettyPrintBody != null ? res.prettyPrintBody : (typeof res.body === 'string' ? res.body : JSON.stringify(res.body, null, 2)),
      timeMs: Math.round((res.timings && res.timings.total) || (Date.now() - started)),
      sizeBytes,
      protocol: res.protocol || '',
    };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
});

// Converte a request estruturada num objeto HAR (formato que o httpsnippet consome).
function buildHar({ method = 'GET', url = '', headers = {}, body = '' }) {
  let queryString = [];
  try {
    const u = new URL(url);
    queryString = [...u.searchParams.entries()].map(([name, value]) => ({ name, value }));
  } catch {}
  const headerArr = Object.entries(headers || {}).map(([name, value]) => ({ name, value: String(value ?? '') }));
  const har = {
    method: (method || 'GET').toUpperCase(),
    url,
    httpVersion: 'HTTP/1.1',
    cookies: [],
    headers: headerArr,
    queryString,
    headersSize: -1,
    bodySize: -1,
  };
  if (body != null && String(body).length) {
    const ct = headerArr.find((h) => h.name.toLowerCase() === 'content-type');
    har.postData = { mimeType: (ct && ct.value) || 'application/json', text: String(body) };
  }
  return har;
}

ipcMain.handle('http:toSnippet', async (evt, { request, target, client }) => {
  try {
    const { HTTPSnippet } = require('httpsnippet');
    const snippet = new HTTPSnippet(buildHar(request || {})).convert(target, client);
    if (typeof snippet !== 'string') return { ok: false, error: 'Conversão não suportada para esse alvo.' };
    return { ok: true, snippet };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
});

// Persistência das requests como arquivos .http no projeto (git-friendly, compatível com VS Code REST Client).
function requestsDir(projectPath) { return path.join(projectPath, '.carcara', 'requests'); }
function safeName(name) { return String(name || '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'request'; }

ipcMain.handle('http:listSaved', (evt, { projectPath }) => {
  try {
    const dir = requestsDir(projectPath);
    if (!fs.existsSync(dir)) return { ok: true, items: [] };
    const items = fs.readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.http'))
      .map((f) => ({ name: f.replace(/\.http$/i, '') }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, items };
  } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
});

ipcMain.handle('http:readSaved', (evt, { projectPath, name }) => {
  try {
    const text = fs.readFileSync(path.join(requestsDir(projectPath), safeName(name) + '.http'), 'utf8');
    return { ok: true, text };
  } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
});

ipcMain.handle('http:saveRequest', (evt, { projectPath, name, request }) => {
  try {
    const dir = requestsDir(projectPath);
    fs.mkdirSync(dir, { recursive: true });
    const text = typeof request === 'string' ? request : buildHttpText(request || {});
    const safe = safeName(name);
    fs.writeFileSync(path.join(dir, safe + '.http'), text);
    return { ok: true, name: safe };
  } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
});

ipcMain.handle('http:deleteSaved', (evt, { projectPath, name }) => {
  try { fs.unlinkSync(path.join(requestsDir(projectPath), safeName(name) + '.http')); return { ok: true }; }
  catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
});

// ---------- MCP connector ----------
// Cliente MCP roda aqui (Node) via mcp-core.cjs; conexões stateful, 1 ativa por vez.
ipcMain.handle('mcp:connect', async (evt, { config }) => {
  try {
    mcpCore.mcpDisconnectAll(); // uma conexão ativa por vez
    const res = await mcpCore.mcpConnect(config, {
      onLog: (text) => mainWindow?.webContents.send('mcp:log', { text }),
      onClose: (connId) => mainWindow?.webContents.send('mcp:closed', { connId }),
    });
    return { ok: true, ...res };
  } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
});

ipcMain.handle('mcp:disconnect', async (evt, { connId }) => {
  try { await mcpCore.mcpDisconnect(connId); return { ok: true }; }
  catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
});

ipcMain.handle('mcp:listTools', async (e, { connId }) => {
  try { return { ok: true, ...(await mcpCore.mcpClient(connId).listTools()) }; }
  catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('mcp:listResources', async (e, { connId }) => {
  try { return { ok: true, ...(await mcpCore.mcpClient(connId).listResources()) }; }
  catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('mcp:listPrompts', async (e, { connId }) => {
  try { return { ok: true, ...(await mcpCore.mcpClient(connId).listPrompts()) }; }
  catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('mcp:callTool', async (e, { connId, name, args }) => {
  try { return { ok: true, ...(await mcpCore.mcpClient(connId).callTool({ name, arguments: args || {} })) }; }
  catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('mcp:readResource', async (e, { connId, uri }) => {
  try { return { ok: true, ...(await mcpCore.mcpClient(connId).readResource({ uri })) }; }
  catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('mcp:getPrompt', async (e, { connId, name, args }) => {
  try { return { ok: true, ...(await mcpCore.mcpClient(connId).getPrompt({ name, arguments: args || {} })) }; }
  catch (err) { return { ok: false, error: err.message }; }
});

// Persistência dos servidores salvos: <projeto>/.carcara/mcp-servers.json (nome -> config).
function mcpServersFile(projectPath) { return path.join(projectPath, '.carcara', 'mcp-servers.json'); }
function readMcpServers(projectPath) {
  try { return JSON.parse(fs.readFileSync(mcpServersFile(projectPath), 'utf8')); } catch { return {}; }
}
ipcMain.handle('mcp:listServers', (e, { projectPath }) => {
  try { return { ok: true, servers: readMcpServers(projectPath) }; }
  catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('mcp:readServer', (e, { projectPath, name }) => {
  try { return { ok: true, config: readMcpServers(projectPath)[name] || null }; }
  catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('mcp:saveServer', (e, { projectPath, name, config }) => {
  try {
    const all = readMcpServers(projectPath);
    all[name] = config;
    fs.mkdirSync(path.join(projectPath, '.carcara'), { recursive: true });
    fs.writeFileSync(mcpServersFile(projectPath), JSON.stringify(all, null, 2));
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('mcp:deleteServer', (e, { projectPath, name }) => {
  try {
    const all = readMcpServers(projectPath);
    delete all[name];
    fs.writeFileSync(mcpServersFile(projectPath), JSON.stringify(all, null, 2));
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ---------- IA local (llm-core) ----------
// Modelo/binário nativo carregam lazy dentro do llm-core; nada disso no boot.
const llmUserDir = () => app.getPath('userData');

ipcMain.handle('llm:getConfig', () => ({ ok: true, ...llmConfig() }));
ipcMain.handle('llm:setConfig', (evt, { patch }) => {
  const c = loadConfig();
  const cur = llmConfig();
  c.llm = {
    enabled: patch.enabled ?? cur.enabled,
    model: cur.model,
    features: { ...cur.features, ...(patch.features || {}) },
  };
  saveConfig(c);
  return { ok: true, ...c.llm };
});

ipcMain.handle('llm:status', async () => {
  try { return { ok: true, ...(await llmCore.status(llmUserDir())) }; }
  catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
});

ipcMain.handle('llm:download', async () => {
  try {
    await llmCore.download(llmUserDir(), ({ done, total }) =>
      safeSend('llm:downloadProgress', { done, total }));
    return { ok: true, ...(await llmCore.status(llmUserDir())) };
  } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
});

ipcMain.handle('llm:remove', async () => {
  try { await llmCore.remove(llmUserDir()); return { ok: true }; }
  catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
});

ipcMain.handle('llm:warmup', async () => {
  try { return await llmCore.warmup(llmUserDir()); }
  catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
});

ipcMain.handle('llm:generate', async (evt, { task, input }) => {
  try {
    const text = await llmCore.generate({
      userDataDir: llmUserDir(), task, input,
      onToken: (tokens) => safeSend('llm:genProgress', { tokens }),
    });
    return { ok: true, text };
  } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
});

// ---------- Preview (dev server) ----------
// Cacheia se um gerenciador está instalado (bun/pnpm/yarn podem não existir).
const cmdCache = new Map();
function cmdAvailable(cmd) {
  if (cmdCache.has(cmd)) return cmdCache.get(cmd);
  let ok = false;
  try {
    const r = require('child_process').spawnSync(cmd, ['--version'], { shell: true, stdio: 'ignore', timeout: 5000 });
    ok = !r.error && r.status === 0;
  } catch { ok = false; }
  cmdCache.set(cmd, ok);
  return ok;
}

function pickPackageManager(p) {
  // Só usa o gerenciador do lockfile se ele estiver realmente instalado; senão, npm.
  if (fs.existsSync(path.join(p, 'pnpm-lock.yaml')) && cmdAvailable('pnpm')) return 'pnpm';
  if (fs.existsSync(path.join(p, 'yarn.lock')) && cmdAvailable('yarn')) return 'yarn';
  if (fs.existsSync(path.join(p, 'bun.lockb')) && cmdAvailable('bun')) return 'bun';
  return 'npm';
}

function detectDevCommand(projectPath) {
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf8')); }
  catch { return null; }
  const scripts = pkg.scripts || {};
  const script = scripts.dev ? 'dev' : scripts.start ? 'start' : scripts.serve ? 'serve' : null;
  if (!script) return null;
  return { manager: pickPackageManager(projectPath), script, pkg };
}

function hasNodeModules(p) {
  try { fs.accessSync(path.join(p, 'node_modules')); return true; } catch { return false; }
}
function needsInstall(p, pkg) {
  const deps = Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length;
  return deps > 0 && !hasNodeModules(p);
}

// ---- A gente CONTROLA a porta (não adivinha): escolhe uma livre, força no dev server
// e espera ELA subir. Vínculo em memória, vale enquanto o projeto roda.
async function pickFreePort() {
  // Portas que ESTE Carcará já reservou (mesmo processo).
  const used = new Set([...runningServers.values()].map((e) => Number(e.chosenPort)).filter(Boolean));
  let base = 8080;
  // O detect-port só faz bind check TCP (0.0.0.0/127.0.0.1) e não enxerga o
  // runningServers de OUTRO Carcará — e ainda erra quando o dev server escuta só
  // em ::1 (Vite/Astro). Por isso, além do detect-port, a gente faz um probe HTTP
  // real (v4+v6) pra não roubar uma porta que JÁ está servindo de outra instância.
  for (let attempt = 0; attempt < 200; attempt++) {
    while (used.has(base)) base++;
    let candidate;
    try { candidate = await detectPort(base); } catch { candidate = base; }
    if (used.has(candidate)) { base = candidate + 1; continue; }
    if (await probePort(candidate)) {
      // Já tem alguém vivo aqui (outro Carcará?). Marca e tenta a próxima.
      used.add(candidate);
      base = candidate + 1;
      continue;
    }
    return candidate;
  }
  return base;
}

// Como forçar a porta em cada framework (detecta pelas deps do package.json).
function devPortFlags(pkg, port) {
  const d = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const has = (n) => Boolean(d[n]);
  // Sem --strictPort: se a porta estiver disputada, o Vite pula pra próxima
  // (e a gente detecta a porta real pelo log). strictPort fazia ele morrer na hora.
  if (has('vite')) return ['--port', String(port)];
  if (has('astro')) return ['--port', String(port)];
  if (has('next')) return ['--port', String(port)];
  if (has('nuxt')) return ['--port', String(port)];
  if (has('@angular/cli') || has('@angular/core')) return ['--port', String(port)];
  if (has('@vue/cli-service')) return ['--port', String(port)];
  if (has('parcel')) return ['--port', String(port)];
  // react-scripts (CRA) e desconhecidos: só via env PORT (passar --port quebraria).
  return [];
}

function sendLog(projectPath, text) {
  safeSend('preview:log', { projectPath, chunk: text });
}
function sendPhase(projectPath, text) {
  safeSend('preview:phase', { projectPath, text });
}

// Testa se há um servidor HTTP de verdade respondendo nessa porta
// (um GET real — não só conexão TCP — pra ignorar processos zumbis que resetam).
// Tenta IPv4 e IPv6 porque alguns dev servers (Astro/Vite) escutam só no ::1.
function probeOne(host, port) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    const req = http.get({ host, port, path: '/', timeout: 1500 }, (res) => { res.destroy(); finish(true); });
    req.on('error', () => finish(false));
    req.on('timeout', () => { req.destroy(); finish(false); });
  });
}
function probePort(port) {
  return Promise.all([probeOne('127.0.0.1', port), probeOne('::1', port)])
    .then((rs) => rs.some(Boolean));
}

function runInstall(projectPath, manager) {
  return new Promise((resolve) => {
    const proc = spawn(manager, ['install'], { cwd: projectPath, shell: true, env: process.env });
    proc.stdout.on('data', (d) => sendLog(projectPath, d.toString()));
    proc.stderr.on('data', (d) => sendLog(projectPath, d.toString()));
    proc.on('exit', (code) => resolve(code));
    proc.on('error', (e) => { sendLog(projectPath, '\n' + e.message + '\n'); resolve(1); });
  });
}

ipcMain.handle('preview:start', async (evt, { projectPath }) => {
  if (runningServers.has(projectPath)) {
    const e = runningServers.get(projectPath);
    if (e.url) safeSend('preview:ready', { projectPath, url: e.url });
    return { running: true, url: e.url };
  }
  const cmd = detectDevCommand(projectPath);
  if (!cmd) return { error: 'Nenhum script dev/start/serve no package.json' };

  // Reserva a entrada já, pra não tentar abrir duas vezes enquanto instala.
  const entry = { proc: null, url: null, port: null, log: '' };
  runningServers.set(projectPath, entry);

  // 1) Primeira vez? Instala as dependências.
  if (needsInstall(projectPath, cmd.pkg)) {
    sendPhase(projectPath, `Instalando dependências com ${cmd.manager} (primeira vez, pode demorar)…`);
    const code = await runInstall(projectPath, cmd.manager);
    if (code !== 0) {
      runningServers.delete(projectPath);
      return { error: `Falha ao instalar dependências (${cmd.manager} install). Veja o log.` };
    }
  }

  // 2) Escolhe uma porta LIVRE, força o dev server nela e espera ELA subir.
  const port = await pickFreePort();
  entry.chosenPort = port;
  const flags = devPortFlags(cmd.pkg, port);
  const args = cmd.manager === 'npm'
    ? ['run', cmd.script, ...(flags.length ? ['--', ...flags] : [])]
    : [cmd.script, ...flags];
  console.log(`[preview] ${path.basename(projectPath)} -> porta livre ${port} | ${cmd.manager} ${args.join(' ')}`);
  sendPhase(projectPath, `Porta livre escolhida: ${port}`);
  sendPhase(projectPath, `Subindo: ${cmd.manager} ${args.join(' ')}`);

  const env = { ...process.env, PORT: String(port), BROWSER: 'none', FORCE_COLOR: '1' };
  const proc = spawn(cmd.manager, args, { cwd: projectPath, shell: true, env });
  entry.proc = proc;

  const markReady = (foundPort) => {
    if (entry.url) return;
    entry.port = foundPort;
    entry.url = `http://localhost:${foundPort}`;
    if (entry.probe) { clearInterval(entry.probe); entry.probe = null; }
    console.log(`[preview] ${path.basename(projectPath)} pronto em ${entry.url}`);
    sendPhase(projectPath, `Preview pronto em ${entry.url}`);
    safeSend('preview:ready', { projectPath, url: entry.url });
  };

  const onData = (d) => {
    const s = d.toString();
    entry.log += s;
    sendLog(projectPath, s);
  };
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);

  // Caminho principal (determinístico): espera a porta que ESCOLHEMOS e forçamos subir.
  // Plano B: se o framework ignorou a flag e subiu noutra porta, usa a que ELE imprimiu.
  entry.probe = setInterval(async () => {
    if (entry.url) return;
    if (await probePort(port)) { markReady(port); return; }
    const urls = [...entry.log.matchAll(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d+)/gi)];
    if (urls.length) {
      const p = Number(urls[urls.length - 1][1]);
      if (p !== port && p >= 1024 && p <= 65535 && await probePort(p)) markReady(p);
    }
  }, 600);

  proc.on('exit', (code) => {
    if (entry.probe) { clearInterval(entry.probe); entry.probe = null; }
    if (!entry.url) {
      console.log(`[preview] ${path.basename(projectPath)} encerrou sem subir (código ${code})`);
      sendLog(projectPath, `\n[servidor encerrou sem subir — código ${code}]\n`);
    }
    runningServers.delete(projectPath);
    safeSend('preview:exit', { projectPath });
  });
  proc.on('error', (e) => sendLog(projectPath, '\n[erro ao iniciar] ' + e.message + '\n'));

  return { running: true, starting: true, cmd: `${cmd.manager} ${args.join(' ')}` };
});

// Retorna o log já acumulado (pra reexibir quando o projeto é reaberto).
ipcMain.handle('preview:log:get', (evt, { projectPath }) => {
  const e = runningServers.get(projectPath);
  return e ? e.log : '';
});

ipcMain.handle('preview:stop', (evt, { projectPath }) => {
  const e = runningServers.get(projectPath);
  if (e) {
    if (e.probe) clearInterval(e.probe);
    killProc(e.proc);
    runningServers.delete(projectPath);
  }
  return { stopped: true };
});

ipcMain.handle('preview:status', (evt, { projectPath }) => {
  const e = runningServers.get(projectPath);
  return e ? { running: true, url: e.url } : { running: false };
});
