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
