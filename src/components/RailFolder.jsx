import { colorFor, initials } from '@/lib/projectColor';
import { cn } from '@/lib/utils';

// Célula do mini-grid: usa o ícone do projeto se houver, senão cor + inicial.
function Mini({ p }) {
  if (!p) return <span className="rounded-[3px] bg-muted/40" />;
  return p.icon ? (
    <span className="overflow-hidden rounded-[3px] bg-secondary">
      <img src={p.icon} alt="" draggable={false} className="h-full w-full object-contain" />
    </span>
  ) : (
    <span
      className="grid place-items-center rounded-[3px] text-[7px] font-bold leading-none text-white"
      style={{ background: p.color || colorFor(p.name) }}
    >
      {initials(p.name)}
    </span>
  );
}

// Ícone da pasta FECHADA (ou o miolo da aberta): quadrado com mini-grid 2×2 dos 4
// primeiros filhos. Se houver mais de 4, o 4º slot mostra "+N".
export function RailFolderIcon({ previews, count, moreLabel, open }) {
  const cells = count > 4 ? previews.slice(0, 3) : previews.slice(0, 4);
  const fillers = count <= 4 ? Math.max(0, 4 - cells.length) : 0;
  return (
    <span
      className={cn('flex h-full w-full rounded-[inherit] bg-secondary p-1', open && 'opacity-80')}
    >
      <span className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5">
        {cells.map((p, i) => (
          <Mini key={p?.path || i} p={p} />
        ))}
        {count > 4 && (
          <span className="grid place-items-center rounded-[3px] bg-muted/60 text-[7px] font-bold leading-none text-muted-foreground">
            {moreLabel}
          </span>
        )}
        {Array.from({ length: fillers }).map((_, i) => (
          <Mini key={'e' + i} p={null} />
        ))}
      </span>
    </span>
  );
}
