// Transformações puras do layout do Rail (cfg.rail) para o renderer. Sem dependências,
// nunca mutam a entrada — cada função devolve um rail novo. Testado em railTree.test.js.
// Item shapes idênticos a rail-core.cjs.

const clone = (rail) => rail.map((it) =>
  it.type === 'folder' ? { ...it, children: [...it.children] } : { ...it });

export function nextFolderId(rail) {
  let max = 0;
  for (const it of rail) {
    if (it.type === 'folder') {
      const m = /^f(\d+)$/.exec(it.id || '');
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return 'f' + (max + 1);
}

export function buildRows(rail, projectByPath) {
  const rows = [];
  for (const it of rail) {
    if (it.type === 'folder') {
      const kids = it.children.map((c) => projectByPath.get(c)).filter(Boolean);
      rows.push({ kind: 'folder', key: 'folder:' + it.id, folder: it, previews: kids.slice(0, 4), count: kids.length });
      if (!it.collapsed) {
        for (const c of it.children) {
          const p = projectByPath.get(c);
          if (p) rows.push({ kind: 'child', key: c, project: p, folderId: it.id });
        }
      }
    } else {
      const p = projectByPath.get(it.path);
      if (p) rows.push({ kind: 'project', key: it.path, project: p });
    }
  }
  return rows;
}

export function toggleCollapse(rail, folderId) {
  return rail.map((it) => (it.type === 'folder' && it.id === folderId ? { ...it, collapsed: !it.collapsed } : it));
}

export function renameFolder(rail, folderId, name) {
  return rail.map((it) => (it.type === 'folder' && it.id === folderId ? { ...it, name } : it));
}

export function dissolveFolder(rail, folderId) {
  const out = [];
  for (const it of rail) {
    if (it.type === 'folder' && it.id === folderId) {
      for (const c of it.children) out.push({ type: 'project', path: c });
    } else {
      out.push(it);
    }
  }
  return out;
}

// --- helpers internos de applyDrop ---

// Remove um path de onde quer que esteja (topo ou dentro de pasta). Pastas que ficam
// vazias são descartadas. Devolve um rail novo.
function removePath(rail, path) {
  const out = [];
  for (const it of rail) {
    if (it.type === 'folder') {
      const children = it.children.filter((c) => c !== path);
      if (children.length > 0) out.push({ ...it, children });
      // pasta vazia é descartada
    } else if (it.type === 'project' && it.path === path) {
      // dropa o projeto solto
    } else {
      out.push(it);
    }
  }
  return out;
}

function topIndexOfProject(rail, path) {
  return rail.findIndex((it) => it.type === 'project' && it.path === path);
}
function topIndexOfFolder(rail, folderId) {
  return rail.findIndex((it) => it.type === 'folder' && it.id === folderId);
}

// Matriz única de drop. ctx = { dragPath|dragFolderId, targetKind, targetPath,
// targetFolderId, zone: 'reorder'|'merge', newFolderName }.
export function applyDrop(rail, ctx) {
  const { dragPath, dragFolderId, targetKind, targetPath, targetFolderId, zone, newFolderName } = ctx;
  const base = clone(rail);

  // Arrastar PASTA: só reordena no topo (sem aninhar).
  if (dragFolderId) {
    const from = topIndexOfFolder(base, dragFolderId);
    if (from === -1) return base;
    const [moved] = base.splice(from, 1);
    let to = targetKind === 'folder' ? topIndexOfFolder(base, targetFolderId) : topIndexOfProject(base, targetPath);
    if (to === -1) to = base.length;
    base.splice(to, 0, moved);
    return base;
  }

  if (!dragPath) return base;

  // Arrastar PROJETO — merge criando pasta com o alvo do topo.
  if (zone === 'merge' && targetKind === 'project') {
    const afterRemove = removePath(base, dragPath);
    const ti = topIndexOfProject(afterRemove, targetPath);
    if (ti === -1) return base; // alvo sumiu (era o próprio arrastado) -> no-op
    const folder = { type: 'folder', id: nextFolderId(afterRemove), name: newFolderName || '', collapsed: false, children: [targetPath, dragPath] };
    afterRemove.splice(ti, 1, folder);
    return afterRemove;
  }

  // merge numa pasta (ou num filho dela) -> entra na pasta.
  if (zone === 'merge' && (targetKind === 'folder' || targetKind === 'child')) {
    const afterRemove = removePath(base, dragPath);
    const fi = topIndexOfFolder(afterRemove, targetFolderId);
    if (fi === -1) return base;
    if (!afterRemove[fi].children.includes(dragPath)) afterRemove[fi].children.push(dragPath);
    return afterRemove;
  }

  // reorder sobre um filho -> move pra dentro da pasta do filho, na posição dele.
  if (zone === 'reorder' && targetKind === 'child') {
    const afterRemove = removePath(base, dragPath);
    const fi = topIndexOfFolder(afterRemove, targetFolderId);
    if (fi === -1) return base;
    const idx = afterRemove[fi].children.indexOf(targetPath);
    afterRemove[fi].children.splice(idx === -1 ? afterRemove[fi].children.length : idx, 0, dragPath);
    return afterRemove;
  }

  // reorder no topo (alvo project/folder) -> move o projeto pro topo na posição do alvo.
  {
    const afterRemove = removePath(base, dragPath);
    let ti = targetKind === 'folder' ? topIndexOfFolder(afterRemove, targetFolderId) : topIndexOfProject(afterRemove, targetPath);
    if (ti === -1) ti = afterRemove.length;
    afterRemove.splice(ti, 0, { type: 'project', path: dragPath });
    return afterRemove;
  }
}
