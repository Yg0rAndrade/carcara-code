import { GripVertical, GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

// Alça de redimensionamento, igual à do shadcn (ResizableHandle withHandle),
// mas controlada por onMouseDown (pros nossos resizers custom: rail, devtools, árvore, drawer).
// orientation="vertical" (padrão) separa colunas; "horizontal" separa linhas (drawer inferior).
export function ResizeBar({ onMouseDown, className, orientation = 'vertical' }) {
  const horizontal = orientation === 'horizontal';
  return (
    <div
      onMouseDown={onMouseDown}
      title="Arraste para redimensionar"
      className={cn(
        'relative flex shrink-0 items-center justify-center bg-border transition-colors hover:bg-primary',
        horizontal
          ? 'h-px w-full cursor-row-resize after:absolute after:inset-x-0 after:top-1/2 after:h-3 after:-translate-y-1/2'
          : 'w-px cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2',
        className,
      )}
    >
      <div
        className={cn(
          'z-10 flex items-center justify-center rounded-sm border bg-card',
          horizontal ? 'h-3 w-5' : 'h-5 w-3',
        )}
      >
        {horizontal ? (
          <GripHorizontal className="h-2.5 w-2.5" />
        ) : (
          <GripVertical className="h-2.5 w-2.5" />
        )}
      </div>
    </div>
  );
}
