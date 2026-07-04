// Visualizador read-only de planilhas (.xlsx/.xlsm). O parse acontece no main
// (ExcelJS, com cache); aqui montamos a grade aplicando os estilos inline (cor de
// fundo, fonte, alinhamento, merges, larguras). As linhas são carregadas SOB DEMANDA,
// de ~150 em 150 conforme o scroll ("estilo Minecraft"), então o open é rápido, o
// payload do IPC é pequeno e a memória do renderer fica baixa mesmo com várias abas.
// Carregado sob demanda (React.lazy) pelo CodeView, fora do bundle inicial.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

const CHUNK = 150; // linhas por página

// Índice 1-based -> letra de coluna do Excel (1->A, 27->AA).
function numToCol(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Estilo compacto da célula -> props de CSS inline.
function styleOf(s) {
  if (!s) return undefined;
  const css = {};
  if (s.bg) css.background = s.bg;
  if (s.c) css.color = s.c;
  if (s.b) css.fontWeight = 600;
  if (s.i) css.fontStyle = 'italic';
  if (s.u) css.textDecoration = 'underline';
  if (s.fs) css.fontSize = `${s.fs}px`;
  if (s.ta)
    css.textAlign =
      s.ta === 'center'
        ? 'center'
        : s.ta === 'right'
          ? 'right'
          : s.ta === 'justify'
            ? 'justify'
            : 'left';
  if (s.va) css.verticalAlign = s.va === 'middle' ? 'middle' : s.va === 'bottom' ? 'bottom' : 'top';
  if (s.wrap) {
    css.whiteSpace = 'normal';
    css.wordBreak = 'break-word';
  }
  return css;
}

function SheetGrid({ filePath, sheetIndex, meta }) {
  const t = useT();
  const nCols = meta.shownCols || 0;
  const shownRows = meta.shownRows || 0;
  const cols = meta.cols || [];

  // Linhas já carregadas (esparsas) e até qual índice de linha já paginamos.
  const [rows, setRows] = useState([]);
  const [loadedUpto, setLoadedUpto] = useState(0);
  const loadedUptoRef = useRef(0);
  loadedUptoRef.current = loadedUpto;
  const loadingRef = useRef(false);
  const scrollRef = useRef(null);
  const tickingRef = useRef(false);

  // Indexa as células carregadas por "r:c", marca as posições cobertas por merges e
  // coleta as alturas de linha. Recalcula só quando chega um novo chunk.
  const { byPos, covered, heights } = useMemo(() => {
    const byPos = new Map();
    const covered = new Set();
    const heights = new Map();
    for (const row of rows) {
      if (row.h) heights.set(row.r, row.h);
      for (const cell of row.cells || []) {
        byPos.set(row.r + ':' + cell.c, cell);
        const cs = cell.cs || 1,
          rs = cell.rs || 1;
        if (cs > 1 || rs > 1) {
          for (let dr = 0; dr < rs; dr++) {
            for (let dc = 0; dc < cs; dc++) {
              if (dr === 0 && dc === 0) continue;
              covered.add(row.r + dr + ':' + (cell.c + dc));
            }
          }
        }
      }
    }
    return { byPos, covered, heights };
  }, [rows]);

  // Carrega o próximo chunk de linhas do main (serializado por loadingRef).
  const loadNext = async () => {
    if (loadingRef.current) return;
    const from = loadedUptoRef.current;
    if (from >= shownRows) return;
    loadingRef.current = true;
    try {
      const res = await window.api.getXlsxRows(filePath, sheetIndex, from + 1, CHUNK);
      if (res && res.rows && res.rows.length) setRows((cur) => cur.concat(res.rows));
      setLoadedUpto(Math.min(from + CHUNK, shownRows));
    } finally {
      loadingRef.current = false;
    }
  };

  // Primeiro chunk ao montar (remonta a cada troca de aba via key no pai).
  useEffect(() => {
    loadNext();  
  }, []);

  // Se o conteúdo carregado ainda não preenche a viewport, busca mais — senão não há
  // scroll pra disparar o onScroll. Roda de novo a cada chunk até encher ou acabar.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && loadedUpto < shownRows && el.scrollHeight <= el.clientHeight + 4) loadNext();
     
  }, [loadedUpto, shownRows]);

  // Carrega o próximo chunk ao chegar perto do fim (throttle por rAF).
  const onScroll = () => {
    if (tickingRef.current) return;
    tickingRef.current = true;
    requestAnimationFrame(() => {
      tickingRef.current = false;
      const el = scrollRef.current;
      if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 800) loadNext();
    });
  };

  if (!nCols || !shownRows) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('xlsx.empty_sheet')}
      </div>
    );
  }

  const rowNums = Array.from({ length: Math.min(loadedUpto, shownRows) }, (_, i) => i + 1);
  const colNums = Array.from({ length: nCols }, (_, i) => i + 1);
  // Largura total fixa (gutter + colunas). Com table-layout:fixed, o navegador usa
  // só estas larguras e NÃO remede as células no reflow — resize/scroll ficam baratos.
  const totalWidth = 44 + colNums.reduce((a, c) => a + (cols[c - 1] || 80), 0);

  return (
    <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto">
      <table
        className="border-collapse text-[12.5px] tabular-nums"
        style={{ borderSpacing: 0, tableLayout: 'fixed', width: totalWidth }}
      >
        <colgroup>
          {/* Coluna de números de linha (gutter) */}
          <col style={{ width: 44 }} />
          {colNums.map((c) => (
            <col key={c} style={{ width: cols[c - 1] || 80 }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-30 h-6 border-b border-r bg-muted" />
            {colNums.map((c) => (
              <th
                key={c}
                className="sticky top-0 z-20 h-6 border-b border-r bg-muted px-1 text-center text-[11px] font-medium text-muted-foreground"
              >
                {numToCol(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowNums.map((r) => (
            <tr
              key={r}
              className="ygc-xlsx-row"
              style={heights.has(r) ? { height: heights.get(r) } : undefined}
            >
              <td className="sticky left-0 z-10 border-b border-r bg-muted px-1 text-center text-[11px] text-muted-foreground">
                {r}
              </td>
              {colNums.map((c) => {
                const key = r + ':' + c;
                if (covered.has(key)) return null;
                const cell = byPos.get(key);
                const span = {};
                if (cell?.cs > 1) span.colSpan = cell.cs;
                if (cell?.rs > 1) span.rowSpan = cell.rs;
                return (
                  <td
                    key={c}
                    {...span}
                    style={styleOf(cell?.s)}
                    className="overflow-hidden whitespace-nowrap border-b border-r px-1.5 align-top text-foreground"
                  >
                    {cell?.t || ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function XlsxViewer({ data, name }) {
  const t = useT();
  const sheets = data?.sheets || [];
  const filePath = data?.filePath;
  const [active, setActive] = useState(0);
  const sheet = sheets[active] || sheets[0];

  if (!sheets.length || !filePath) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('xlsx.no_sheets')}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-background">
      {/* Barra de informações + aviso de truncamento (raro: só acima do teto de segurança) */}
      <div className="flex h-8 shrink-0 items-center gap-2 border-b bg-card px-3 text-xs text-muted-foreground">
        <Sheet className="size-3.5 text-primary" />
        <span className="truncate">{name}</span>
        <span className="opacity-50">·</span>
        <span>{t('xlsx.read_only')}</span>
        <span className="opacity-50">·</span>
        <span>
          {sheet.totalRows} {t('xlsx.rows')}
        </span>
        {sheet?.truncated && (
          <span className="ml-auto rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
            {t('xlsx.truncated', {
              shownRows: sheet.shownRows,
              shownCols: sheet.shownCols,
              totalRows: sheet.totalRows,
              totalCols: sheet.totalCols,
            })}
          </span>
        )}
      </div>

      <SheetGrid key={active} filePath={filePath} sheetIndex={active} meta={sheet} />

      {/* Abas de planilha (rodapé estilo Excel), só quando há mais de uma */}
      {sheets.length > 1 && (
        <div className="flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-t bg-card px-1.5">
          {sheets.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              title={s.name}
              className={cn(
                'flex h-6 shrink-0 items-center rounded px-2.5 text-[12px] transition-colors',
                i === active
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60',
              )}
            >
              <span className="max-w-[160px] truncate">{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// memo: durante o arraste da barra de resize do painel, o CodeView re-renderiza a cada
// mousemove. Como data/name são estáveis, o memo evita reconciliar a grade inteira aí.
export default memo(XlsxViewer);
