// Histórico de chamadas da aba API.
//
// Toda vez que o usuário envia uma request, guardamos o que foi enviado E o
// resultado — assim ele pode revisitar, recarregar e comparar sem precisar
// "salvar" nada na mão. Modelo pensado pro público não-técnico: prático.
//
// Persistido no localStorage por projeto (dado de execução, não vai pro git).
// Limites pra não estourar a cota: no máximo MAX_ENTRIES itens, e o corpo da
// resposta é truncado em MAX_BODY caracteres.

const MAX_ENTRIES = 30;
const MAX_BODY = 100_000;

export function historyKey(projectPath) {
  return `apiHistory:${projectPath || '_none_'}`;
}

export function loadHistory(projectPath) {
  try { return JSON.parse(localStorage.getItem(historyKey(projectPath)) || '[]') || []; }
  catch { return []; }
}

// Grava a lista, aparando do fim (itens mais antigos) se a cota do localStorage estourar.
function persist(projectPath, list) {
  const key = historyKey(projectPath);
  let arr = list.slice(0, MAX_ENTRIES);
  while (arr.length) {
    try { localStorage.setItem(key, JSON.stringify(arr)); return arr; }
    catch { arr = arr.slice(0, arr.length - 1); }
  }
  try { localStorage.removeItem(key); } catch {}
  return [];
}

// Adiciona uma entrada no topo. Trunca o corpo da resposta se for muito grande.
export function addEntry(projectPath, entry) {
  const e = { ...entry };
  if (typeof e.resBody === 'string' && e.resBody.length > MAX_BODY) {
    e.resBody = e.resBody.slice(0, MAX_BODY);
    e.truncated = true;
  }
  return persist(projectPath, [e, ...loadHistory(projectPath)]);
}

export function deleteEntry(projectPath, id) {
  return persist(projectPath, loadHistory(projectPath).filter((x) => x.id !== id));
}

export function clearHistory(projectPath) {
  try { localStorage.removeItem(historyKey(projectPath)); } catch {}
  return [];
}
