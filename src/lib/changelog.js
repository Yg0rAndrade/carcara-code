// Decide se a aba "Novidades" abre sozinha ao subir de versão. Regra: só quando já
// havia uma versão salva (não incomoda no 1º uso) e ela é diferente da atual.
export function shouldShowChangelog(current, lastSeen) {
  if (!current) return false;
  if (!lastSeen) return false;
  return current !== lastSeen;
}
