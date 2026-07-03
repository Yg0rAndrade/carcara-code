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
