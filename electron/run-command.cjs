// Comando de run por projeto: parte pura (sem fs, sem spawn), pra ser testável fora do
// Electron. Ver PLANO-COMANDO-RUN-POR-PROJETO.md.
//
// O que mora aqui é a decisão "o que este projeto roda": o modo (automático ou
// personalizado), a normalização do que veio da tela e a troca do {port} pela porta que o
// app escolheu. Quem lê o package.json e quem sobe o processo continua no main.js.

// Config de um projeto que nunca foi configurado. `autoStart` liga por padrão: o app
// sempre abriu o Preview sozinho, e a tarefa pede pra manter isso pra quem não mexer.
const DEFAULT_RUN = { mode: 'auto', command: '', autoStart: true };

// Normaliza o que está gravado (ou o que veio da tela) num formato só. Entrada
// inválida vira o padrão em vez de derrubar o boot — config é arquivo editável à mão.
function normalizeRun(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_RUN };
  const command = typeof raw.command === 'string' ? raw.command.trim() : '';
  // Modo 'custom' sem comando não roda nada: cai no automático em vez de travar o
  // Preview num comando vazio.
  const mode = raw.mode === 'custom' && command ? 'custom' : 'auto';
  return { mode, command, autoStart: raw.autoStart !== false };
}

// Está valendo um comando escrito pelo usuário?
function isCustom(run) {
  const n = normalizeRun(run);
  return n.mode === 'custom' && Boolean(n.command);
}

// Troca o {port} pela porta escolhida. Sem {port} no texto, devolve o comando intacto —
// a porta ainda chega pelo ambiente (PORT), que é como a maioria dos dev servers lê.
function applyPort(command, port) {
  return String(command || '').replace(/\{port\}/gi, String(port));
}

// A linha que vai pro shell. `null` quando não há comando personalizado valendo.
function customCommandFor(run, port) {
  return isCustom(run) ? applyPort(normalizeRun(run).command, port) : null;
}

module.exports = { DEFAULT_RUN, normalizeRun, isCustom, applyPort, customCommandFor };

// --- Projeto que é um app Electron --------------------------------------------------
// O modo Automático trata qualquer package.json com `dev`/`start` como site. Num app
// Electron (o próprio Carcará, aberto dentro dele mesmo) isso sobe só o Vite do
// renderer: o Preview mostra a tela de carregamento eterna, sem o preload/IPC do main.
// Daí o app não abre o Preview sozinho nesses projetos e oferece os scripts em botões.
const ELECTRON_DEPS = ['electron', 'electron-nightly'];

function isElectronPackage(pkg) {
  if (!pkg || typeof pkg !== 'object') return false;
  const all = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  return ELECTRON_DEPS.some((d) => Object.prototype.hasOwnProperty.call(all, d));
}

// Scripts que viram botão, na ordem em que fazem sentido pra quem quer rodar o app:
// abrir, desenvolver, buildar, empacotar. Testes/lint/hooks ficam de fora.
const SCRIPT_ORDER = [
  /^start$/,
  /^dev$/,
  /^(electron|app)(:|$)/,
  /^build$/,
  /^(pack|dist|make|package)(:|$)/,
];
const MAX_SCRIPTS = 6;

function electronScripts(pkg) {
  const scripts = (pkg && pkg.scripts) || {};
  const names = Object.keys(scripts).filter((n) => typeof scripts[n] === 'string');
  const out = [];
  for (const re of SCRIPT_ORDER) {
    for (const n of names) if (re.test(n) && !out.includes(n)) out.push(n);
  }
  return out.slice(0, MAX_SCRIPTS).map((name) => ({ name, command: scripts[name] }));
}

// O que o renderer precisa saber, ou null quando não é Electron. Comando personalizado
// vence: se a pessoa disse o que roda ali, o Preview segue a decisão dela.
function electronInfo(pkg, run, manager = 'npm') {
  if (isCustom(run) || !isElectronPackage(pkg)) return null;
  return { manager, scripts: electronScripts(pkg) };
}

module.exports.isElectronPackage = isElectronPackage;
module.exports.electronScripts = electronScripts;
module.exports.electronInfo = electronInfo;
