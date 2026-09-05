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
