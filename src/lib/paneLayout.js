// Árvore de layout dos painéis do Claude Code (estilo "editor groups" do VS Code).
//
// Dois tipos de nó:
//   pane  -> { kind:'pane',  id, tabs:[sessionId...], active }   (folha: um grupo de abas)
//   split -> { kind:'split', id, dir:'row'|'col', children:[a,b], sizes:[n,n] }
//
// 'row' = lado a lado (esquerda/direita). 'col' = empilhado (cima/baixo).
// As funções são puras: recebem uma árvore e devolvem uma NOVA árvore (clonada),
// pra casar com o fluxo de estado do React. Os terminais (xterm) seguem vivos
// porque a árvore só guarda ids de sessão — o ChatPanel reparenteia o DOM.

const uid = () => crypto.randomUUID();
const clone = (tree) => (tree ? structuredClone(tree) : tree);

export const isPane = (n) => !!n && n.kind === 'pane';
export const isSplit = (n) => !!n && n.kind === 'split';

export function makePane(tabs, active) {
  const t = Array.isArray(tabs) ? tabs.slice() : tabs == null ? [] : [tabs];
  return {
    kind: 'pane',
    id: uid(),
    tabs: t,
    active: active != null && t.includes(active) ? active : (t[0] ?? null),
  };
}

export function firstPane(node) {
  if (!node) return null;
  if (isPane(node)) return node;
  return firstPane(node.children[0]) || firstPane(node.children[1]);
}

export function findPane(node, paneId) {
  if (!node) return null;
  if (isPane(node)) return node.id === paneId ? node : null;
  return findPane(node.children[0], paneId) || findPane(node.children[1], paneId);
}

export function allPanes(node, out = []) {
  if (!node) return out;
  if (isPane(node)) {
    out.push(node);
    return out;
  }
  allPanes(node.children[0], out);
  allPanes(node.children[1], out);
  return out;
}

export function allSessionIds(node, out = []) {
  for (const p of allPanes(node)) for (const id of p.tabs) out.push(id);
  return out;
}

export function paneCount(node) {
  return allPanes(node).length;
}

// Colapsa qualquer split cujo filho seja um pane vazio, "promovendo" o irmão.
function collapse(node) {
  if (!node || isPane(node)) return node;
  const a = collapse(node.children[0]);
  const b = collapse(node.children[1]);
  const aEmpty = isPane(a) && a.tabs.length === 0;
  const bEmpty = isPane(b) && b.tabs.length === 0;
  if (aEmpty && bEmpty) return a; // tudo vazio: devolve um pane vazio (tratado acima)
  if (aEmpty) return b;
  if (bEmpty) return a;
  return { ...node, children: [a, b] };
}

// Garante que todo pane aponte para uma aba ativa que ele realmente contém.
function fixActive(node) {
  for (const p of allPanes(node)) {
    if (!p.tabs.includes(p.active)) p.active = p.tabs[p.tabs.length - 1] ?? null;
  }
  return node;
}

// Remove uma sessão de onde quer que ela esteja (mutação no clone).
function removeSession(node, sessionId) {
  for (const p of allPanes(node)) {
    const i = p.tabs.indexOf(sessionId);
    if (i !== -1) {
      p.tabs.splice(i, 1);
      if (p.active === sessionId) p.active = p.tabs[Math.max(0, i - 1)] ?? p.tabs[0] ?? null;
    }
  }
}

// Substitui o nó de id `id` por `replacement` (devolve nova árvore).
function replaceNode(node, id, replacement) {
  if (!node) return node;
  if (node.id === id) return replacement;
  if (isPane(node)) return node;
  return {
    ...node,
    children: [
      replaceNode(node.children[0], id, replacement),
      replaceNode(node.children[1], id, replacement),
    ],
  };
}

// Aplica o "soltar" de uma aba sobre um pane.
//   zone: 'center' -> move a sessão pra dentro do pane (sem dividir)
//         'left'|'right'|'top'|'bottom' -> divide o pane criando um novo ao lado
export function applyDrop(tree, targetPaneId, zone, sessionId) {
  const next = clone(tree);

  if (zone === 'center') {
    removeSession(next, sessionId);
    const target = findPane(next, targetPaneId);
    if (!target) return tree;
    if (!target.tabs.includes(sessionId)) target.tabs.push(sessionId);
    target.active = sessionId;
    return fixActive(collapse(next)) || makePane([sessionId]);
  }

  removeSession(next, sessionId);
  const target = findPane(next, targetPaneId);
  // Não dá pra dividir um pane usando a sua própria (e única) aba.
  if (!target || target.tabs.length === 0) return tree;

  const newPane = makePane([sessionId], sessionId);
  const dir = zone === 'left' || zone === 'right' ? 'row' : 'col';
  const targetFirst = zone === 'right' || zone === 'bottom';
  const split = {
    kind: 'split',
    id: uid(),
    dir,
    children: targetFirst ? [target, newPane] : [newPane, target],
    sizes: [50, 50],
  };
  const replaced = replaceNode(next, target.id, split);
  return fixActive(collapse(replaced)) || makePane([sessionId]);
}

export function addSessionToPane(tree, paneId, sessionId) {
  const next = clone(tree);
  const p = findPane(next, paneId) || firstPane(next);
  if (!p) return makePane([sessionId], sessionId);
  if (!p.tabs.includes(sessionId)) p.tabs.push(sessionId);
  p.active = sessionId;
  return next;
}

export function setActiveInPane(tree, paneId, sessionId) {
  const next = clone(tree);
  const p = findPane(next, paneId);
  if (p && p.tabs.includes(sessionId)) p.active = sessionId;
  return next;
}

export function closeSessionInTree(tree, sessionId) {
  const next = clone(tree);
  removeSession(next, sessionId);
  return fixActive(collapse(next)) || makePane([]);
}

// Casa a árvore salva com as sessões que realmente existem no projeto:
// remove ids fantasmas e injeta sessões novas no primeiro pane.
export function reconcile(tree, sessionIds, fallbackActive) {
  if (!tree) return makePane(sessionIds, fallbackActive);
  const valid = new Set(sessionIds);
  let next = clone(tree);
  for (const id of allSessionIds(next)) if (!valid.has(id)) removeSession(next, id);
  next = collapse(next) || makePane([]);

  const present = new Set(allSessionIds(next));
  const missing = sessionIds.filter((id) => !present.has(id));
  if (missing.length) {
    const p = firstPane(next);
    if (p) for (const id of missing) p.tabs.push(id);
    else next = makePane(missing, fallbackActive);
  }
  if (allSessionIds(next).length === 0 && sessionIds.length)
    next = makePane(sessionIds, fallbackActive);
  fixActive(next);
  return next;
}
