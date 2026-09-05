// Contrato do arrasto de caminhos entre a árvore de arquivos e o terminal.
// A árvore (CodeView) escreve os caminhos absolutos no dataTransfer sob este
// tipo; o terminal (ChatPanel) os lê ao soltar um arquivo sobre uma sessão.
// Mantido num só lugar pra os dois lados nunca divergirem.
export const MOVE_MIME = 'application/x-ygor-move';

// Recebe o payload cru do dataTransfer (caminhos separados por '\n') e devolve o
// texto a colar na sessão: caminhos separados por espaço, com um espaço no fim
// (pronto pra continuar digitando o prompt). Linhas vazias são descartadas;
// payload vazio/null vira string vazia.
export function formatDroppedPaths(raw) {
  const paths = (raw || '')
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean);
  return paths.length ? paths.join(' ') + ' ' : '';
}

// --- Arrasto de uma TAREFA do Kanban pro terminal ---
// Mesmo gesto do caminho de arquivo, outro payload: a alça do card escreve o texto da
// tarefa sob este tipo, e o terminal cola no prompt. MIME próprio (e não o MOVE_MIME)
// porque quem só aceita caminho — a árvore de arquivos, que move arquivo pra pasta —
// precisa continuar ignorando este arrasto.
export const TASK_MIME = 'application/x-ygor-task';

// Texto da tarefa pronto pra colar: título na 1ª linha, corpo abaixo. O corpo vem do
// `tarefas.md` como continuação de item de lista, ou seja, indentado — tiramos a
// indentação COMUM (não dois espaços fixos) pra sub-listas manterem o degrau relativo.
// Termina em espaço, igual ao de caminhos, pra a pessoa seguir digitando o prompt.
export function formatDroppedTask(titleRaw, bodyRaw) {
  const title = (titleRaw || '').trim();
  const lines = (bodyRaw || '').replace(/\r\n/g, '\n').split('\n');
  // Recorta as linhas em branco das pontas antes de medir a indentação.
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  const body = lines.map((l) => l.slice(cut)).join('\n');
  const text = [title, body].filter(Boolean).join('\n');
  return text ? text + ' ' : '';
}

// Lê uma tarefa de um drop. String vazia quando o arrasto não é de tarefa.
export function dropTaskText(dt) {
  if (!dt || typeof dt.getData !== 'function') return '';
  const raw = dt.getData(TASK_MIME) || '';
  return raw.trim() ? raw : '';
}

// --- Arrasto vindo de FORA do app (Chrome, Explorador, Finder) ---
// O interno (árvore) viaja no MOVE_MIME com caminhos absolutos. O externo chega como
// objetos File reais do SO: o dataTransfer anuncia o tipo 'Files' já no dragover (mas
// os File só ficam legíveis no drop). Detectamos a origem por esse tipo pra decidir,
// durante o arrasto, se um alvo deve reagir (dwell/spring-loaded), sem ler o arquivo.
export function hasExternalFiles(dt) {
  if (!dt) return false;
  const types = dt.types;
  if (!types) return false;
  // `types` é DOMStringList (tem .contains) no drop e array-like no React SyntheticEvent.
  return typeof types.contains === 'function'
    ? types.contains('Files')
    : Array.from(types).includes('Files');
}

// Extrai os caminhos absolutos de um drop externo. No Electron o caminho não vem do
// File cru (file.path foi removido nas versões novas) — resolvemos via
// webUtils.getPathForFile, exposto no preload como window.api.getDroppedPath. Recebe o
// resolvedor por parâmetro pra manter este módulo puro/testável. Descarta vazios.
export function externalPathsFromDrop(dt, resolvePath) {
  if (!dt || !dt.files || !dt.files.length || typeof resolvePath !== 'function') return [];
  const out = [];
  for (const f of Array.from(dt.files)) {
    let p = '';
    try {
      p = resolvePath(f) || '';
    } catch {
      p = '';
    }
    p = p.trim();
    if (p) out.push(p);
  }
  return out;
}

// Texto pronto pra colar no terminal a partir de QUALQUER drop de arquivo — interno
// (MOVE_MIME) ou externo (arquivos do SO). Um único ponto pros dois lados nunca
// divergirem. `resolvePath` só é usado no caso externo.
export function dropPathsText(dt, resolvePath) {
  const internal = dt && typeof dt.getData === 'function' ? dt.getData(MOVE_MIME) : '';
  if (internal) return formatDroppedPaths(internal);
  return formatDroppedPaths(externalPathsFromDrop(dt, resolvePath).join('\n'));
}

// Ponto ÚNICO do terminal pra qualquer coisa solta sobre ele: tarefa do Kanban,
// caminho da árvore ou arquivo do SO. A tarefa vem primeiro porque é o tipo mais
// específico; se não for uma, cai no caminho de arquivo de sempre.
export function dropInsertText(dt, resolvePath) {
  return dropTaskText(dt) || dropPathsText(dt, resolvePath);
}
