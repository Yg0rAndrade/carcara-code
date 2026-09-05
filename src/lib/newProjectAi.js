// Regras puras da escolha de IA de um projeto recém-adicionado (NewProjectAiModal).
// Ficam aqui, fora do componente, pra serem testáveis sem DOM.

// custom/shell/carcara não são CLIs de terceiros: nunca ficam cinza por "não instalada".
// (carcara usa o motor OpenCode, que se auto-instala; shell é o terminal do próprio SO.)
export const alwaysAvailable = (key) => key === 'custom' || key === 'shell' || key === 'carcara';

// Nome curto da pasta, pro cabeçalho do card. Aceita separador do Windows e do POSIX.
export function baseName(p) {
  const parts = String(p).split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || String(p);
}

// Pré-seleção do modal. O Claude vem marcado quando existe na máquina (é o padrão
// histórico do app); senão, a primeira CLI instalada na ordem do catálogo. Máquina sem
// nenhuma CLI abre sem nada marcado — e o salvar fica travado até a pessoa escolher, que
// é justamente o caso que o padrão silencioso quebrava.
export function preselect(options, installed) {
  if (!installed) return [];
  if (installed.has('claude')) return ['claude'];
  const first = options.find((o) => !alwaysAvailable(o.key) && installed.has(o.key));
  return first ? [first.key] : [];
}

// CLIs escolhidas que ainda não existem na máquina (vira aviso, não bloqueio).
export function missingChosen(selections, installed) {
  if (!installed) return [];
  const out = new Set();
  for (const ais of selections)
    for (const k of ais) if (!alwaysAvailable(k) && !installed.has(k)) out.add(k);
  return [...out];
}
