const { contextBridge, ipcRenderer, webUtils, webFrame } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),

  // Zoom da JANELA do app (Ctrl +/-/0 e o controle nas Configurações). Mexe só no
  // host (rail, chat, abas…); o webview do preview tem zoom próprio (tratado no main
  // quando o foco está nele). Passos de 10%, entre 50% e 200%. Devolve o fator
  // aplicado (1 = 100%) pra a UI mostrar a porcentagem.
  zoom: (dir) => {
    const cur = webFrame.getZoomFactor();
    const next = dir === 'reset' ? 1 : dir === 'in' ? cur + 0.1 : cur - 0.1;
    const clamped = Math.max(0.5, Math.min(2, Math.round(next * 10) / 10));
    webFrame.setZoomFactor(clamped);
    return clamped;
  },
  setZoom: (factor) => {
    const clamped = Math.max(0.5, Math.min(2, Number(factor) || 1));
    webFrame.setZoomFactor(clamped);
    return clamped;
  },
  getZoom: () => webFrame.getZoomFactor(),

  // CLI de IA por projeto (qual ferramenta sobe nas sessões daquele projeto)
  getAi: (projectPath) => ipcRenderer.invoke('ai:get', { projectPath }),
  setAi: (projectPath, cli, custom) => ipcRenderer.invoke('ai:set', { projectPath, cli, custom }),
  addProjects: () => ipcRenderer.invoke('projects:add'),
  removeProject: (projectPath) => ipcRenderer.invoke('projects:remove', { projectPath }),
  reorderProjects: (paths) => ipcRenderer.invoke('projects:reorder', { paths }),
  listProjects: () => ipcRenderer.invoke('projects:list'),

  // Sessões do Claude Code (várias por projeto)
  sessionsList: (projectPath) => ipcRenderer.invoke('sessions:list', { projectPath }),
  sessionsCreate: (projectPath, name) => ipcRenderer.invoke('sessions:create', { projectPath, name }),
  sessionsRename: (projectPath, sessionId, name) => ipcRenderer.invoke('sessions:rename', { projectPath, sessionId, name }),
  sessionsClose: (projectPath, sessionId) => ipcRenderer.invoke('sessions:close', { projectPath, sessionId }),

  // Terminal (Claude Code real) — por sessão
  termEnsure: (sessionId, projectPath, cols, rows, theme) => ipcRenderer.invoke('term:ensure', { sessionId, projectPath, cols, rows, theme }),
  termInput: (sessionId, data) => ipcRenderer.send('term:input', { sessionId, data }),
  termResize: (sessionId, cols, rows) => ipcRenderer.send('term:resize', { sessionId, cols, rows }),

  // Casa o tema do Claude Code (settings.json) com o tema do terminal
  applyClaudeTheme: (theme) => ipcRenderer.invoke('claude:applyTheme', { theme }),

  // Atividade do Claude: avisa o main qual projeto está em foco (pra não notificar/badgear
  // o que você já está olhando) e lê/grava o toggle de notificações. Os eventos
  // 'activity:state' e 'activity:focus' chegam pelo `on(...)` genérico abaixo.
  setActiveProject: (projectPath) => ipcRenderer.send('activity:setActive', { projectPath }),
  getNotify: () => ipcRenderer.invoke('notify:get'),
  setNotify: (enabled) => ipcRenderer.invoke('notify:set', { enabled }),

  // Terminal livre (shell comum)
  shellEnsure: (projectPath, cols, rows) => ipcRenderer.invoke('shell:ensure', { projectPath, cols, rows }),
  shellInput: (projectPath, data) => ipcRenderer.send('shell:input', { projectPath, data }),
  shellResize: (projectPath, cols, rows) => ipcRenderer.send('shell:resize', { projectPath, cols, rows }),

  // Git (source control)
  gitIsRepo: (projectPath) => ipcRenderer.invoke('git:isRepo', { projectPath }),
  gitStatus: (projectPath) => ipcRenderer.invoke('git:status', { projectPath }),
  gitDiff: (projectPath, file, staged, untracked) => ipcRenderer.invoke('git:diff', { projectPath, file, staged, untracked }),
  gitStage: (projectPath, files) => ipcRenderer.invoke('git:stage', { projectPath, files }),
  gitUnstage: (projectPath, files) => ipcRenderer.invoke('git:unstage', { projectPath, files }),
  gitCommit: (projectPath, message) => ipcRenderer.invoke('git:commit', { projectPath, message }),
  gitPush: (projectPath) => ipcRenderer.invoke('git:push', { projectPath }),
  gitPull: (projectPath) => ipcRenderer.invoke('git:pull', { projectPath }),
  gitBranches: (projectPath) => ipcRenderer.invoke('git:branches', { projectPath }),
  gitCheckout: (projectPath, branch) => ipcRenderer.invoke('git:checkout', { projectPath, branch }),
  gitCreateBranch: (projectPath, name) => ipcRenderer.invoke('git:createBranch', { projectPath, name }),
  gitInit: (projectPath) => ipcRenderer.invoke('git:init', { projectPath }),
  gitAddRemote: (projectPath, url) => ipcRenderer.invoke('git:addRemote', { projectPath, url }),

  // API connector (REST)
  httpSend: (request, workingDir) => ipcRenderer.invoke('http:send', { request, workingDir }),
  httpToSnippet: (request, target, client) => ipcRenderer.invoke('http:toSnippet', { request, target, client }),
  httpListSaved: (projectPath) => ipcRenderer.invoke('http:listSaved', { projectPath }),
  httpReadSaved: (projectPath, name) => ipcRenderer.invoke('http:readSaved', { projectPath, name }),
  httpSaveRequest: (projectPath, name, request) => ipcRenderer.invoke('http:saveRequest', { projectPath, name, request }),
  httpDeleteSaved: (projectPath, name) => ipcRenderer.invoke('http:deleteSaved', { projectPath, name }),

  // MCP connector
  mcpConnect: (config) => ipcRenderer.invoke('mcp:connect', { config }),
  mcpDisconnect: (connId) => ipcRenderer.invoke('mcp:disconnect', { connId }),
  mcpListTools: (connId) => ipcRenderer.invoke('mcp:listTools', { connId }),
  mcpListResources: (connId) => ipcRenderer.invoke('mcp:listResources', { connId }),
  mcpListPrompts: (connId) => ipcRenderer.invoke('mcp:listPrompts', { connId }),
  mcpCallTool: (connId, name, args) => ipcRenderer.invoke('mcp:callTool', { connId, name, args }),
  mcpReadResource: (connId, uri) => ipcRenderer.invoke('mcp:readResource', { connId, uri }),
  mcpGetPrompt: (connId, name, args) => ipcRenderer.invoke('mcp:getPrompt', { connId, name, args }),
  mcpListServers: (projectPath) => ipcRenderer.invoke('mcp:listServers', { projectPath }),
  mcpReadServer: (projectPath, name) => ipcRenderer.invoke('mcp:readServer', { projectPath, name }),
  mcpSaveServer: (projectPath, name, config) => ipcRenderer.invoke('mcp:saveServer', { projectPath, name, config }),
  mcpDeleteServer: (projectPath, name) => ipcRenderer.invoke('mcp:deleteServer', { projectPath, name }),

  // Preview
  startPreview: (projectPath) => ipcRenderer.invoke('preview:start', { projectPath }),
  stopPreview: (projectPath) => ipcRenderer.invoke('preview:stop', { projectPath }),
  previewStatus: (projectPath) => ipcRenderer.invoke('preview:status', { projectPath }),
  previewGetLog: (projectPath) => ipcRenderer.invoke('preview:log:get', { projectPath }),

  // Código
  listDir: (dirPath) => ipcRenderer.invoke('fs:dir', { dirPath }),
  searchFiles: (root, query) => ipcRenderer.invoke('fs:search', { root, query }),
  readFile: (filePath) => ipcRenderer.invoke('fs:read', { filePath }),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:write', { filePath, content }),

  // Menu de contexto da árvore de arquivos
  revealItem: (targetPath) => ipcRenderer.invoke('fs:reveal', { targetPath }),
  trashItem: (targetPath) => ipcRenderer.invoke('fs:trash', { targetPath }),
  renameItem: (targetPath, newName) => ipcRenderer.invoke('fs:rename', { targetPath, newName }),
  pasteItem: (srcPath, destDir, move) => ipcRenderer.invoke('fs:paste', { srcPath, destDir, move }),
  copyText: (text) => ipcRenderer.invoke('clip:write', { text }),
  readText: () => ipcRenderer.invoke('clip:read'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', { url }),

  // Drag and drop de arquivos
  getDroppedPath: (file) => { try { return webUtils.getPathForFile(file); } catch { return ''; } },
  startDrag: (filePath) => ipcRenderer.send('drag:start', filePath),
  dockDevTools: (previewId, devtoolsId) => ipcRenderer.send('devtools:dock', { previewId, devtoolsId }),
  undockDevTools: (previewId) => ipcRenderer.send('devtools:undock', { previewId }),

  // Registra um listener e devolve uma função pra removê-lo. Sem isso, painéis que
  // montam/desmontam (MCP, etc.) empilhavam listeners a cada abertura — vazamento que
  // dispara o aviso de maxListeners e deixa setState rodando em componentes mortos.
  // Retorno ignorável: chamadas antigas (sem cleanup) seguem funcionando igual.
  on: (channel, cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
});
