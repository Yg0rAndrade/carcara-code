// Kanban cuja fonte da verdade é um Markdown (`tarefas.md` na raiz do projeto).
//
// Regra que governa este arquivo inteiro: NUNCA re-serializar o markdown. Round-trip de
// markdown não existe — mdast é AST, não CST, e a formatação é descartada por design
// (o readme do mdast-util-to-markdown admite: "complete roundtripping is impossible").
// Pior: remark converte CRLF→LF e fechou como wontfix (remark#660), o que num projeto
// Windows-first reescreveria toda linha do arquivo ao salvar.
//
// Então: parseamos só pra LOCALIZAR (os nós do mdast carregam offset em bytes) e
// recortamos a string original. Linha não tocada = byte idêntico. É o que o Obsidian
// Kanban faz nos cards (guarda o texto cru e nunca o re-serializa).
//
// Sem extensão GFM de propósito: sem ela o `- [x]` continua no texto cru do listItem,
// que é exatamente o que queremos ler e escrever. Menos dependência, mais controle.
import { fromMarkdown } from 'mdast-util-from-markdown';

// Header que ensina o Claude a mexer no board. É documentação, não mecanismo — o LLM
// pode ignorar. Mantido curto de propósito: instrução longa é instrução não lida.
//
// CUIDADO: comentário HTML NÃO aninha. Um "<!--" ou "-->" literal aqui dentro fecha o
// header mais cedo e vaza todo o resto como texto visível no markdown. Por isso a linha
// da cor é descrita por extenso, sem mostrar a sintaxe.
export const INSTRUCTION_HEADER = `<!--
Board do Carcará Code. Este arquivo É o quadro — a UI só o edita.

  ## Título      = uma coluna
  - [ ] Tarefa   = um card (a 1ª linha é o título; linhas indentadas são o corpo)
  - [x] Tarefa   = concluída (o board oculta, o toggle "mostrar concluídas" revela)
  ### Título     = separador dentro da coluna

A cor da coluna é um comentário HTML no fim do título (rose, amber, emerald, sky,
violet, stone). Ao renomear a coluna, mantenha esse comentário.

Mover de coluna = recortar o bloco do card e colar sob outro "##", inteiro.
Concluir = trocar "- [ ]" por "- [x]" NO LUGAR, sem mover.
Preserve o texto exato dos outros cards; nunca reformate o arquivo.
-->`;

// Templates prontos de board (pedido no item original: "To do / Doing / Done").
export const BOARD_TEMPLATES = {
  basico: { name: 'Básico', columns: ['A fazer', 'Fazendo', 'Concluídas'] },
  dev: {
    name: 'Desenvolvimento',
    columns: ['Ideias', 'A fazer', 'Fazendo', 'Revisão', 'Concluídas'],
  },
  simples: { name: 'Simples', columns: ['A fazer', 'Concluídas'] },
};

const CHECK_RE = /^(\s*[-*+]\s+)\[([ xX])\]\s?/;

// Cor da coluna. Mora no PRÓPRIO arquivo, como comentário HTML no fim do título:
//
//     ## A fazer <!--sky-->
//
// Por quê no arquivo e não na config do app: o board É o arquivo. Cor na config criaria
// uma segunda fonte de verdade — o quadro dependeria de duas coisas, e renomear/mover o
// projeto perderia as cores. Comentário HTML é invisível no markdown renderizado
// (GitHub, VS Code, o Preview daqui) e o Claude não tropeça nele.
export const COLUMN_COLORS = ['rose', 'amber', 'emerald', 'sky', 'violet', 'stone'];
const COLOR_RE = /\s*<!--\s*([a-z]+)\s*-->\s*$/;

// Só corta o comentário se ele for uma cor conhecida — senão um `<!-- TODO -->` que o
// usuário escreveu viraria "cor" e sumiria do nome da coluna.
function splitColor(text) {
  const m = text.match(COLOR_RE);
  if (!m || !COLUMN_COLORS.includes(m[1])) return { name: text, color: null };
  return { name: text.slice(0, m.index).trim(), color: m[1] };
}

const headingLine = (name, color) => '## ' + name + (color ? ` <!--${color}-->` : '');

// Hash estável do texto cru. O id NÃO pode ser o offset (muda a cada edição) nem
// "coluna:índice" (muda no move, e o dnd-kit perde o card no meio do arraste).
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function headingText(md, node) {
  // O texto cru do heading menos o "## " e o espaço — sem passar por inline parsing,
  // pra um `**negrito**` no título continuar sendo `**negrito**` no arquivo.
  const raw = md.slice(node.position.start.offset, node.position.end.offset);
  return raw.replace(/^#{1,6}\s+/, '').trim();
}

// Fim do bloco de um card, incluindo as linhas em branco que o separam do próximo.
// Sem isso, mover um card deixaria um buraco de linhas em branco na origem.
function blockEnd(md, end) {
  let i = end;
  while (i < md.length) {
    const nl = md.indexOf('\n', i);
    if (nl === -1) return md.length;
    const line = md.slice(i, nl);
    if (line.trim() !== '') return i;
    i = nl + 1;
  }
  return md.length;
}

function makeCard(md, li, group, seen) {
  const start = li.position.start.offset;
  const end = li.position.end.offset;
  const raw = md.slice(start, end);
  const m = raw.match(CHECK_RE);
  // Um listItem sem checkbox não é um card — é bullet solto (ex.: uma nota na coluna).
  if (!m) return null;
  const done = m[2].toLowerCase() === 'x';
  const body = raw.slice(m[0].length);
  const nl = body.indexOf('\n');
  const titleRaw = (nl === -1 ? body : body.slice(0, nl)).trim();
  const bodyRaw = nl === -1 ? '' : body.slice(nl + 1);

  let id = 'c' + hash(raw);
  // Dois cards com texto idêntico existem no mundo real (ex.: "- [ ] TODO" duplicado).
  const n = (seen.get(id) || 0) + 1;
  seen.set(id, n);
  if (n > 1) id += '-' + n;

  return { id, done, group, raw, titleRaw, bodyRaw, start, end, blockEnd: blockEnd(md, end) };
}

/**
 * Lê o markdown como banco de dados do board. Só localiza — não transforma nada.
 * @returns {{preamble:{start:number,end:number}, columns:Array}}
 */
export function parseBoard(md) {
  const tree = fromMarkdown(md);
  const columns = [];
  const seen = new Map();
  let col = null;
  let group = null;
  let firstColStart = md.length;

  for (const node of tree.children) {
    const isH2 = node.type === 'heading' && node.depth === 2;
    const isH3 = node.type === 'heading' && node.depth === 3;

    if (isH2) {
      if (col) col.end = node.position.start.offset;
      else firstColStart = Math.min(firstColStart, node.position.start.offset);
      const { name, color } = splitColor(headingText(md, node));
      col = {
        name,
        color,
        headingStart: node.position.start.offset,
        headingEnd: node.position.end.offset,
        start: node.position.start.offset,
        end: md.length,
        groups: [],
        cards: [],
      };
      columns.push(col);
      group = null;
    } else if (isH3 && col) {
      group = {
        name: headingText(md, node),
        level: 3,
        start: node.position.start.offset,
        end: node.position.end.offset,
      };
      col.groups.push(group);
    } else if (node.type === 'list' && col) {
      for (const li of node.children) {
        const card = makeCard(md, li, group ? group.name : null, seen);
        if (card) col.cards.push(card);
      }
    }
  }

  // Preâmbulo: o "# Tarefas" + a intro antes da 1ª coluna. Nunca tocado, só preservado.
  return { preamble: { start: 0, end: columns.length ? columns[0].start : md.length }, columns };
}

// Aplica recortes na string original. Do MAIOR offset pro menor — senão o primeiro
// splice invalida os offsets de todos os seguintes.
function spliceAll(md, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = md;
  for (const e of sorted) out = out.slice(0, e.start) + (e.text ?? '') + out.slice(e.end);
  return out;
}

function findCard(board, cardId) {
  for (const c of board.columns) {
    const card = c.cards.find((x) => x.id === cardId);
    if (card) return { col: c, card };
  }
  return null;
}

// Onde enfiar um card numa coluna: imediatamente ANTES de `beforeCardId`, ou no fim
// da coluna se for null.
//
// Posição é expressa por card-alvo, não por índice, de propósito: a UI indexa entre os
// cards VISÍVEIS (as concluídas ficam ocultas) e o splice conta TODOS. Um índice teria
// que ser traduzido entre os dois mundos a cada chamada — e errar a tradução põe o card
// no lugar errado, calado. "Antes deste card" tem o mesmo significado nos dois.
function insertOffset(md, col, beforeCardId) {
  if (beforeCardId) {
    const before = col.cards.find((c) => c.id === beforeCardId);
    if (before) return before.start;
  }
  if (col.cards.length === 0) {
    // Coluna vazia: logo depois do heading (e de um eventual `###`).
    const after = col.groups.length ? col.groups[col.groups.length - 1].end : col.headingEnd;
    return Math.min(after + 1, md.length);
  }
  return col.cards[col.cards.length - 1].blockEnd;
}

/**
 * Move um card pra outra coluna (ou outra posição na mesma), inserindo antes de
 * `beforeCardId` — ou no fim da coluna quando ele é null. Retorna markdown novo.
 */
export function moveCard(md, cardId, toColumnName, beforeCardId = null) {
  const board = parseBoard(md);
  const found = findCard(board, cardId);
  const target = board.columns.find((c) => c.name === toColumnName);
  if (!found || !target) return md;

  const { card } = found;
  const raw = md.slice(card.start, card.end);
  // Soltar em cima de si mesmo não é um movimento.
  if (beforeCardId === cardId) return md;
  const insertAt = insertOffset(md, target, beforeCardId);

  // Mover pro lugar onde já está = no-op. Evita um write inútil (e o eco do watcher).
  if (insertAt >= card.start && insertAt <= card.blockEnd) return md;

  return spliceAll(md, [
    { start: card.start, end: card.blockEnd, text: '' },
    { start: insertAt, end: insertAt, text: raw + '\n\n' },
  ]);
}

/** Marca/desmarca concluída, NO LUGAR — não move o card. */
export function toggleDone(md, cardId) {
  const found = findCard(parseBoard(md), cardId);
  if (!found) return md;
  const { card } = found;
  const m = card.raw.match(CHECK_RE);
  if (!m) return md;
  // Só o caractere dentro dos colchetes muda. O resto da linha nem é olhado.
  const boxAt = card.start + m[1].length + 1;
  return spliceAll(md, [{ start: boxAt, end: boxAt + 1, text: card.done ? ' ' : 'x' }]);
}

/** Cria um card no fim de uma coluna. `text` pode ser multi-linha. */
export function addCard(md, columnName, text) {
  const board = parseBoard(md);
  const col = board.columns.find((c) => c.name === columnName);
  if (!col || !text.trim()) return md;

  const lines = text.trim().split('\n');
  // Linhas 2+ viram corpo do card: indentadas em 2 espaços pra continuarem no listItem.
  const raw =
    '- [ ] ' +
    lines[0] +
    lines
      .slice(1)
      .map((l) => '\n  ' + l)
      .join('');
  const at = insertOffset(md, col, null);
  const sep = md.slice(0, at).endsWith('\n\n') || at === 0 ? '' : '\n';
  return spliceAll(md, [{ start: at, end: at, text: sep + raw + '\n\n' }]);
}

/** Apaga um card (o bloco inteiro, incluindo corpo e as linhas em branco de baixo). */
export function removeCard(md, cardId) {
  const found = findCard(parseBoard(md), cardId);
  if (!found) return md;
  return spliceAll(md, [{ start: found.card.start, end: found.card.blockEnd, text: '' }]);
}

/** Renomeia uma coluna. Só o texto do heading muda; os cards nem são tocados. */
export function renameColumn(md, oldName, newName) {
  const board = parseBoard(md);
  const col = board.columns.find((c) => c.name === oldName);
  if (!col || !newName.trim()) return md;
  // Reescreve o título inteiro, então a cor tem que ser recolocada — senão renomear
  // apagaria a cor calado.
  const text = headingLine(newName.trim(), col.color);
  return spliceAll(md, [{ start: col.headingStart, end: col.headingEnd, text }]);
}

/** Pinta (ou despinta, com `null`) uma coluna. A cor vai no título, no próprio arquivo. */
export function setColumnColor(md, name, color) {
  const board = parseBoard(md);
  const col = board.columns.find((c) => c.name === name);
  if (!col) return md;
  const next = color && COLUMN_COLORS.includes(color) ? color : null;
  if (next === col.color) return md;
  return spliceAll(md, [
    { start: col.headingStart, end: col.headingEnd, text: headingLine(col.name, next) },
  ]);
}

/**
 * Cria uma coluna vazia no fim do board, já pintada com a primeira cor ainda não usada
 * (cai no ciclo da paleta quando todas já estão em uso) — pra coluna nova não destoar
 * do board, que nasce pastel.
 */
export function addColumn(md, name) {
  if (!name.trim()) return md;
  const cols = parseBoard(md).columns;
  const used = new Set(cols.map((c) => c.color).filter(Boolean));
  const color =
    COLUMN_COLORS.find((c) => !used.has(c)) || COLUMN_COLORS[cols.length % COLUMN_COLORS.length];
  const tail = md.endsWith('\n') ? '' : '\n';
  return md + tail + '\n' + headingLine(name.trim(), color) + '\n';
}

/** Apaga uma coluna e tudo que está nela. */
export function removeColumn(md, name) {
  const board = parseBoard(md);
  const col = board.columns.find((c) => c.name === name);
  if (!col) return md;
  return spliceAll(md, [{ start: col.start, end: col.end, text: '' }]);
}

/**
 * Uma coluna é "arquivo" quando tem cards e TODOS estão concluídos — caso do
 * `## Concluídas` do tarefas.md real. Sem isto, a regra "[x] oculta o card" faria a
 * coluna de histórico renderizar vazia, que é exatamente o que o usuário não quer ver.
 */
export function isArchiveColumn(col) {
  return col.cards.length > 0 && col.cards.every((c) => c.done);
}

/** Cards visíveis numa coluna, dado o toggle "mostrar concluídas". */
export function visibleCards(col, showDone) {
  if (showDone || isArchiveColumn(col)) return col.cards;
  return col.cards.filter((c) => !c.done);
}

/** Markdown inicial de um board novo, com o header de instrução e as colunas já pintadas. */
export function templateMarkdown(templateKey, title = 'Tarefas') {
  const tpl = BOARD_TEMPLATES[templateKey] || BOARD_TEMPLATES.basico;
  const cols = tpl.columns
    .map((c, i) => headingLine(c, COLUMN_COLORS[i % COLUMN_COLORS.length]) + '\n')
    .join('\n');
  return `# ${title}\n\n${INSTRUCTION_HEADER}\n\n${cols}`;
}
