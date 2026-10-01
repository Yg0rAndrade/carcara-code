// Quais itens de UMA pasta o git ignora (.gitignore, .git/info/exclude, excludes globais).
// A árvore da aba Código usa isto pra deixar esses itens em cinza, como o Explorer do
// VS Code: o olho pula `.claude/`, `.env`, `*.log` e vai direto no que importa.
//
// Um `git check-ignore --stdin -z` por pasta listada: um processo só, com todos os nomes
// de uma vez. Pasta vai com barra no fim ("dist/"), senão padrões de diretório
// (`dist/`) não casam. Arquivo rastreado nunca volta como ignorado (sem --no-index),
// igual ao VS Code. Fora de um repo, sem git no PATH ou em erro: conjunto vazio.
const { spawn } = require('child_process');

// Saída do `check-ignore -z`: caminhos separados por NUL, exatamente como foram
// enviados. Devolve os NOMES (sem a barra final das pastas).
function parseCheckIgnore(stdout) {
  return new Set(
    String(stdout || '')
      .split('\0')
      .filter(Boolean)
      .map((p) => p.replace(/\/+$/, '')),
  );
}

// Monta a entrada do stdin: um nome por item, pasta com "/" no fim, separados por NUL.
function checkIgnoreInput(items) {
  return items.map((it) => (it.isDir ? `${it.name}/` : it.name)).join('\0');
}

// items: [{ name, isDir }] de UMA pasta. Resolve com o Set de nomes ignorados.
function ignoredNames(dirPath, items, { timeoutMs = 3000, spawnFn = spawn } = {}) {
  if (!items.length) return Promise.resolve(new Set());
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    const finish = (set) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(set);
    };
    let child;
    try {
      child = spawnFn('git', ['check-ignore', '--stdin', '-z'], {
        cwd: dirPath,
        windowsHide: true,
      });
    } catch {
      return finish(new Set());
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      finish(new Set());
    }, timeoutMs);
    child.on('error', () => finish(new Set()));
    child.stdout.on('data', (d) => (out += d));
    // Código 0 = algum ignorado; 1 = nenhum; 128 = não é repo / erro. Só 0 tem saída útil.
    child.on('close', (code) => finish(code === 0 ? parseCheckIgnore(out) : new Set()));
    child.stdin.on('error', () => {});
    child.stdin.end(checkIgnoreInput(items));
  });
}

module.exports = { ignoredNames, parseCheckIgnore, checkIgnoreInput };
