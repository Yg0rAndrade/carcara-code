import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseBoard,
  moveCard,
  toggleDone,
  addCard,
  removeCard,
  renameColumn,
  addColumn,
  removeColumn,
  isArchiveColumn,
  visibleCards,
  templateMarkdown,
  setColumnColor,
  COLUMN_COLORS,
} from './kanban.js';

// Fixture minúscula, mas com as formas que o tarefas.md real tem: preâmbulo, card
// multi-linha com sub-bullets, e uma coluna de histórico com `###` por versão.
const MD = `# Tarefas

Intro do arquivo.

## A fazer

- [ ] **Primeira** — uma tarefa
  com continuação indentada.
  - **Sub:** um detalhe com [link](main.js).

- [ ] **Segunda** — outra

## Fazendo

- [ ] **Terceira**

## Concluídas

### 0.1.9

- [x] **Antiga** — já feita
`;

describe('parseBoard', () => {
  it('lê colunas, cards e o estado do checkbox', () => {
    const b = parseBoard(MD);
    expect(b.columns.map((c) => c.name)).toEqual(['A fazer', 'Fazendo', 'Concluídas']);
    expect(b.columns[0].cards).toHaveLength(2);
    expect(b.columns[0].cards[0].done).toBe(false);
    expect(b.columns[2].cards[0].done).toBe(true);
  });

  it('separa título do corpo, preservando o markdown cru do título', () => {
    const card = parseBoard(MD).columns[0].cards[0];
    expect(card.titleRaw).toBe('**Primeira** — uma tarefa');
    expect(card.bodyRaw).toContain('com continuação indentada.');
    expect(card.bodyRaw).toContain('[link](main.js)');
  });

  it('associa o card ao separador ### em que está', () => {
    const col = parseBoard(MD).columns[2];
    expect(col.groups.map((g) => g.name)).toEqual(['0.1.9']);
    expect(col.cards[0].group).toBe('0.1.9');
  });

  it('preserva o preâmbulo (H1 + intro) fora das colunas', () => {
    const b = parseBoard(MD);
    expect(MD.slice(b.preamble.start, b.preamble.end)).toContain('# Tarefas');
    expect(MD.slice(b.preamble.start, b.preamble.end)).toContain('Intro do arquivo.');
  });

  it('dá ids estáveis entre parses e distintos para cards de texto idêntico', () => {
    expect(parseBoard(MD).columns[0].cards[0].id).toBe(parseBoard(MD).columns[0].cards[0].id);
    const dup = '## X\n\n- [ ] igual\n\n- [ ] igual\n';
    const ids = parseBoard(dup).columns[0].cards.map((c) => c.id);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('ignora bullet sem checkbox (não é card)', () => {
    expect(parseBoard('## X\n\n- só uma nota solta\n').columns[0].cards).toHaveLength(0);
  });
});

describe('moveCard', () => {
  it('move o card inteiro, com corpo e sub-bullets', () => {
    const out = moveCard(MD, parseBoard(MD).columns[0].cards[0].id, 'Fazendo', null);
    const b = parseBoard(out);
    expect(b.columns[0].cards.map((c) => c.titleRaw)).toEqual(['**Segunda** — outra']);
    expect(b.columns[1].cards.map((c) => c.titleRaw)).toContain('**Primeira** — uma tarefa');
    expect(b.columns[1].cards.find((c) => c.titleRaw.includes('Primeira')).bodyRaw).toContain(
      '[link](main.js)',
    );
  });

  it('não altera um único byte das linhas que não foram tocadas', () => {
    const out = moveCard(MD, parseBoard(MD).columns[0].cards[0].id, 'Fazendo', null);
    // Toda linha do original que não é do card movido tem que sobreviver idêntica.
    for (const line of [
      '# Tarefas',
      'Intro do arquivo.',
      '## A fazer',
      '## Concluídas',
      '### 0.1.9',
      '- [ ] **Segunda** — outra',
      '- [x] **Antiga** — já feita',
    ]) {
      expect(out).toContain(line);
    }
    // E o conjunto de linhas não-vazias é exatamente o mesmo, só reordenado.
    const lines = (s) =>
      s
        .split('\n')
        .filter((l) => l.trim())
        .sort();
    expect(lines(out)).toEqual(lines(MD));
  });

  it('não deixa buraco de linhas em branco na origem', () => {
    const out = moveCard(MD, parseBoard(MD).columns[0].cards[0].id, 'Fazendo', null);
    expect(out).not.toMatch(/\n{3,}/);
  });

  it('insere ANTES do card indicado', () => {
    const b = parseBoard(MD);
    const terceira = b.columns[1].cards[0].id;
    const out = moveCard(MD, b.columns[0].cards[0].id, 'Fazendo', terceira);
    expect(parseBoard(out).columns[1].cards.map((c) => c.titleRaw)).toEqual([
      '**Primeira** — uma tarefa',
      '**Terceira**',
    ]);
  });

  it('beforeCardId null = fim da coluna', () => {
    const b = parseBoard(MD);
    const out = moveCard(MD, b.columns[0].cards[0].id, 'Fazendo', null);
    expect(parseBoard(out).columns[1].cards.map((c) => c.titleRaw)).toEqual([
      '**Terceira**',
      '**Primeira** — uma tarefa',
    ]);
  });

  it('reordena dentro da própria coluna', () => {
    const b = parseBoard(MD);
    const out = moveCard(MD, b.columns[0].cards[1].id, 'A fazer', b.columns[0].cards[0].id);
    expect(parseBoard(out).columns[0].cards.map((c) => c.titleRaw)).toEqual([
      '**Segunda** — outra',
      '**Primeira** — uma tarefa',
    ]);
  });

  // O índice era ambíguo entre "visível" e "real"; posição por card-alvo não é.
  it('acerta a posição mesmo com concluídas ocultas no meio da coluna', () => {
    const md = '## A fazer\n\n- [x] oculta\n\n- [ ] alvo\n\n## Fazendo\n\n- [ ] vinda\n';
    const b = parseBoard(md);
    const alvo = b.columns[0].cards[1].id;
    const out = moveCard(md, b.columns[1].cards[0].id, 'A fazer', alvo);
    // Entra antes de "alvo" — e depois da oculta, que continua onde estava.
    expect(parseBoard(out).columns[0].cards.map((c) => c.titleRaw)).toEqual([
      'oculta',
      'vinda',
      'alvo',
    ]);
  });

  it('mover pro lugar onde já está é no-op (evita write e eco do watcher)', () => {
    const b = parseBoard(MD);
    expect(moveCard(MD, b.columns[0].cards[0].id, 'A fazer', b.columns[0].cards[1].id)).toBe(MD);
  });

  it('soltar em cima de si mesmo é no-op', () => {
    const id = parseBoard(MD).columns[0].cards[0].id;
    expect(moveCard(MD, id, 'A fazer', id)).toBe(MD);
  });

  it('move para coluna vazia', () => {
    const md = MD + '\n## Vazia\n';
    const out = moveCard(md, parseBoard(md).columns[0].cards[0].id, 'Vazia', null);
    expect(parseBoard(out).columns[3].cards[0].titleRaw).toBe('**Primeira** — uma tarefa');
  });

  it('card inexistente ou coluna inexistente = no-op', () => {
    expect(moveCard(MD, 'nada', 'Fazendo', null)).toBe(MD);
    expect(moveCard(MD, parseBoard(MD).columns[0].cards[0].id, 'Inexistente', null)).toBe(MD);
  });
});

describe('toggleDone', () => {
  it('troca [ ] por [x] sem mover nem reformatar o card', () => {
    const out = toggleDone(MD, parseBoard(MD).columns[0].cards[0].id);
    expect(out).toContain('- [x] **Primeira** — uma tarefa');
    expect(parseBoard(out).columns[0].cards[0].done).toBe(true);
    // Mesmo tamanho: um único byte trocado, nada mais.
    expect(out.length).toBe(MD.length);
  });

  it('desmarca de volta, voltando ao arquivo original byte a byte', () => {
    const id = parseBoard(MD).columns[0].cards[0].id;
    const marked = toggleDone(MD, id);
    expect(toggleDone(marked, parseBoard(marked).columns[0].cards[0].id)).toBe(MD);
  });

  it('desmarca um [x] existente', () => {
    const out = toggleDone(MD, parseBoard(MD).columns[2].cards[0].id);
    expect(out).toContain('- [ ] **Antiga** — já feita');
  });
});

describe('addCard / removeCard', () => {
  it('adiciona no fim da coluna', () => {
    const out = addCard(MD, 'A fazer', 'Nova tarefa');
    const cards = parseBoard(out).columns[0].cards;
    expect(cards).toHaveLength(3);
    expect(cards[2].titleRaw).toBe('Nova tarefa');
    expect(cards[2].done).toBe(false);
  });

  it('indenta as linhas seguintes pra virarem corpo do card', () => {
    const out = addCard(MD, 'A fazer', 'Título\nlinha de corpo');
    expect(out).toContain('- [ ] Título\n  linha de corpo');
    expect(parseBoard(out).columns[0].cards[2].bodyRaw).toContain('linha de corpo');
  });

  it('adiciona em coluna vazia', () => {
    const md = MD + '\n## Vazia\n';
    expect(parseBoard(addCard(md, 'Vazia', 'Só eu')).columns[3].cards[0].titleRaw).toBe('Só eu');
  });

  it('texto vazio ou coluna inexistente = no-op', () => {
    expect(addCard(MD, 'A fazer', '   ')).toBe(MD);
    expect(addCard(MD, 'Nada', 'x')).toBe(MD);
  });

  it('remove o card com corpo junto, sem tocar nos vizinhos', () => {
    const out = removeCard(MD, parseBoard(MD).columns[0].cards[0].id);
    expect(out).not.toContain('**Primeira**');
    expect(out).not.toContain('[link](main.js)');
    expect(out).toContain('- [ ] **Segunda** — outra');
    expect(out).not.toMatch(/\n{3,}/);
  });

  it('add seguido de remove volta ao original', () => {
    const added = addCard(MD, 'A fazer', 'Efêmera');
    const id = parseBoard(added).columns[0].cards[2].id;
    expect(removeCard(added, id)).toBe(MD);
  });
});

describe('colunas', () => {
  it('renomeia só o heading, sem tocar nos cards', () => {
    const out = renameColumn(MD, 'A fazer', 'Backlog');
    expect(out).toContain('## Backlog');
    expect(out).not.toContain('## A fazer');
    expect(parseBoard(out).columns[0].cards).toHaveLength(2);
  });

  it('adiciona coluna vazia no fim', () => {
    const b = parseBoard(addColumn(MD, 'Bloqueado'));
    expect(b.columns.map((c) => c.name)).toEqual(['A fazer', 'Fazendo', 'Concluídas', 'Bloqueado']);
    expect(b.columns[3].cards).toHaveLength(0);
  });

  it('coluna nova já nasce pintada, sem repetir cor das irmãs', () => {
    const painted = setColumnColor(setColumnColor(MD, 'A fazer', 'rose'), 'Fazendo', 'amber');
    const b = parseBoard(addColumn(painted, 'Bloqueado'));
    const nova = b.columns[3];
    expect(COLUMN_COLORS).toContain(nova.color);
    expect(['rose', 'amber']).not.toContain(nova.color);
  });

  it('com a paleta toda em uso, a cor cicla em vez de sair sem cor', () => {
    let md = MD;
    for (const c of COLUMN_COLORS) md = addColumn(md, 'Col ' + c);
    const nova = parseBoard(addColumn(md, 'Mais uma')).columns.at(-1);
    expect(nova.name).toBe('Mais uma');
    expect(COLUMN_COLORS).toContain(nova.color);
  });

  it('adicionar não mexe nas colunas nem nos cards que já existiam', () => {
    const out = addColumn(MD, 'Bloqueado');
    expect(out.startsWith(MD.trimEnd())).toBe(true);
    expect(parseBoard(out).columns[0].cards).toHaveLength(2);
  });

  it('remove coluna com tudo dentro, sem afetar as outras', () => {
    const out = removeColumn(MD, 'Fazendo');
    expect(parseBoard(out).columns.map((c) => c.name)).toEqual(['A fazer', 'Concluídas']);
    expect(out).not.toContain('**Terceira**');
    expect(out).toContain('**Primeira**');
    expect(out).toContain('**Antiga**');
  });

  it('nome vazio / coluna inexistente = no-op', () => {
    expect(renameColumn(MD, 'A fazer', '  ')).toBe(MD);
    expect(removeColumn(MD, 'Nada')).toBe(MD);
  });
});

describe('cor da coluna', () => {
  const painted = '## A fazer <!--sky-->\n\n- [ ] uma\n\n## Fazendo\n';

  it('lê a cor do título e a tira do nome', () => {
    const b = parseBoard(painted);
    expect(b.columns[0].name).toBe('A fazer');
    expect(b.columns[0].color).toBe('sky');
    expect(b.columns[1].color).toBe(null);
  });

  it('pinta e despinta', () => {
    const out = setColumnColor(MD, 'A fazer', 'rose');
    expect(out).toContain('## A fazer <!--rose-->');
    expect(parseBoard(out).columns[0].color).toBe('rose');
    expect(parseBoard(setColumnColor(out, 'A fazer', null)).columns[0].color).toBe(null);
    // Despintar volta ao arquivo original, byte a byte.
    expect(setColumnColor(out, 'A fazer', null)).toBe(MD);
  });

  it('troca de cor não duplica o comentário', () => {
    const out = setColumnColor(setColumnColor(MD, 'A fazer', 'rose'), 'A fazer', 'emerald');
    expect(out).toContain('## A fazer <!--emerald-->');
    expect(out).not.toContain('rose');
    expect(out.match(/<!--/g) || []).toHaveLength(1);
  });

  it('pintar não mexe nos cards nem nas outras colunas', () => {
    const out = setColumnColor(MD, 'A fazer', 'sky');
    expect(parseBoard(out).columns[0].cards).toHaveLength(2);
    expect(out).toContain('- [ ] **Primeira** — uma tarefa');
    expect(out).toContain('## Fazendo');
  });

  it('renomear PRESERVA a cor', () => {
    const out = renameColumn(painted, 'A fazer', 'Backlog');
    expect(out).toContain('## Backlog <!--sky-->');
    expect(parseBoard(out).columns[0].color).toBe('sky');
  });

  it('comentário que não é cor conhecida fica no nome, não vira cor', () => {
    const b = parseBoard('## A fazer <!-- TODO revisar -->\n');
    expect(b.columns[0].color).toBe(null);
    expect(b.columns[0].name).toBe('A fazer <!-- TODO revisar -->');
  });

  it('cor inválida = sem cor, e mesma cor = no-op', () => {
    expect(parseBoard(setColumnColor(MD, 'A fazer', 'roxo-neon')).columns[0].color).toBe(null);
    expect(setColumnColor(painted, 'A fazer', 'sky')).toBe(painted);
    expect(setColumnColor(MD, 'Inexistente', 'sky')).toBe(MD);
  });

  it('board novo já vem com as colunas pintadas em cores distintas', () => {
    const cols = parseBoard(templateMarkdown('basico')).columns;
    expect(cols.map((c) => c.name)).toEqual(['A fazer', 'Fazendo', 'Concluídas']);
    expect(cols.every((c) => COLUMN_COLORS.includes(c.color))).toBe(true);
    expect(new Set(cols.map((c) => c.color)).size).toBe(3);
  });
});

describe('ocultar concluídas', () => {
  it('coluna só de [x] é arquivo: mostra tudo mesmo com o toggle desligado', () => {
    const b = parseBoard(MD);
    expect(isArchiveColumn(b.columns[2])).toBe(true);
    // Sem esta regra, "Concluídas" renderizaria vazia — o bug que ela existe pra evitar.
    expect(visibleCards(b.columns[2], false)).toHaveLength(1);
  });

  it('coluna de fluxo oculta os [x] até o toggle', () => {
    const marked = toggleDone(MD, parseBoard(MD).columns[0].cards[0].id);
    const col = parseBoard(marked).columns[0];
    expect(isArchiveColumn(col)).toBe(false);
    expect(visibleCards(col, false).map((c) => c.titleRaw)).toEqual(['**Segunda** — outra']);
    expect(visibleCards(col, true)).toHaveLength(2);
  });

  it('coluna vazia não é arquivo', () => {
    expect(isArchiveColumn(parseBoard('## Vazia\n').columns[0])).toBe(false);
  });
});

describe('fidelidade do arquivo', () => {
  // O motivo de existir do splice: remark converte CRLF→LF e fechou como wontfix
  // (remark#660). Num projeto Windows-first, um round-trip reescreveria TODA linha.
  it('preserva CRLF', () => {
    const crlf = MD.replace(/\n/g, '\r\n');
    const out = toggleDone(crlf, parseBoard(crlf).columns[0].cards[0].id);
    expect(out).toContain('\r\n');
    expect(out.split('\n').length).toBe(crlf.split('\n').length);
    expect(out).not.toMatch(/[^\r]\n/);
  });

  it('preserva formatação exótica que um round-trip destruiria', () => {
    // Cada linha aqui é uma perda documentada do mdast-util-to-markdown.
    const exotic = [
      '# Tarefas',
      '',
      'Setext title',
      '=============',
      '',
      '## A fazer',
      '',
      '+ [ ] bullet com + em vez de -',
      '+ [ ] outro',
      '',
      '## Fazendo',
      '',
    ].join('\n');
    const b = parseBoard(exotic);
    const out = moveCard(exotic, b.columns[0].cards[0].id, 'Fazendo', null);
    expect(out).toContain('=============');
    expect(out).toContain('+ [ ] bullet com + em vez de -');
    expect(out).toContain('Setext title');
  });

  it('não confunde ## dentro de bloco de código com coluna', () => {
    const withCode =
      '## A fazer\n\n- [ ] usar css\n\n  ```css\n  ## não é coluna\n  ```\n\n## Fazendo\n';
    expect(parseBoard(withCode).columns.map((c) => c.name)).toEqual(['A fazer', 'Fazendo']);
  });
});

describe('templateMarkdown', () => {
  it('gera board novo com header de instrução e as colunas do template', () => {
    const md = templateMarkdown('basico');
    expect(md).toContain('# Tarefas');
    expect(md).toContain('Board do Carcará Code');
    expect(parseBoard(md).columns.map((c) => c.name)).toEqual(['A fazer', 'Fazendo', 'Concluídas']);
  });

  it('template desconhecido cai no básico', () => {
    expect(parseBoard(templateMarkdown('inexistente')).columns).toHaveLength(3);
  });

  // Comentário HTML NÃO aninha: um "<!--" ou "-->" no meio do header fecha ele mais cedo
  // e o resto da instrução vaza como texto visível. Já aconteceu uma vez.
  it('o header de instrução é UM comentário só, bem fechado', () => {
    const md = templateMarkdown('basico');
    // Do "<!--" de abertura até o PRIMEIRO "-->" — que é onde o header realmente acaba,
    // queira ele ou não. Se sobrar texto de instrução depois disso, vazou.
    const header = md.slice(md.indexOf('<!--'), md.indexOf('-->') + 3);
    expect(header.match(/<!--/g)).toHaveLength(1);
    expect(header).toContain('Preserve o texto exato'); // a última linha ainda está DENTRO
    // Depois do header só vêm as colunas — nenhuma sobra da instrução solta no arquivo.
    const rest = md.slice(md.indexOf('-->') + 3).trim();
    expect(rest.startsWith('##')).toBe(true);
    expect(rest).not.toContain('Concluir =');
  });

  it('o board novo sobrevive a um ciclo de uso', () => {
    const md = addCard(templateMarkdown('dev'), 'A fazer', 'Primeira tarefa');
    const out = moveCard(md, parseBoard(md).columns[1].cards[0].id, 'Fazendo', null);
    expect(parseBoard(out).columns[2].cards[0].titleRaw).toBe('Primeira tarefa');
  });
});

// O teste que mais importa: o arquivo REAL do usuário, não uma fixture que eu inventei.
// Ele tem preâmbulo, cards de 22 linhas com sub-bullets e links, e `###` por versão.
describe('tarefas.md real deste projeto', () => {
  const real = path.resolve(process.cwd(), 'tarefas.md');
  const has = fs.existsSync(real);
  const md = has ? fs.readFileSync(real, 'utf8') : '';

  it.skipIf(!has)('parseia o arquivo real', () => {
    const b = parseBoard(md);
    expect(b.columns.length).toBeGreaterThanOrEqual(2);
    expect(b.columns[0].cards.length).toBeGreaterThan(0);
    expect(MD.length).toBeGreaterThan(0);
  });

  it.skipIf(!has)('mover um card não perde NENHUMA linha do arquivo', () => {
    const b = parseBoard(md);
    const to = b.columns[1].name;
    const out = moveCard(md, b.columns[0].cards[0].id, to, null);
    const lines = (s) =>
      s
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .sort();
    // Igualdade de multiset: nada some, nada nasce, nada é reformatado. Só a ordem muda.
    expect(lines(out)).toEqual(lines(md));
  });

  it.skipIf(!has)('concluir um card do arquivo real troca exatamente 1 byte', () => {
    const b = parseBoard(md);
    const out = toggleDone(md, b.columns[0].cards[0].id);
    expect(out.length).toBe(md.length);
    let diff = 0;
    for (let i = 0; i < md.length; i++) if (md[i] !== out[i]) diff++;
    expect(diff).toBe(1);
  });
});
