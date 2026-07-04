import { GripHorizontal, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

// Handle de redimensionamento manual (fora de um <ResizablePanelGroup>).
// Mesmo visual do ResizableHandle do app: uma linha fina que fica destacada no
// hover, com um "grip" arredondado no meio. Use `orientation`:
//   - 'horizontal' (padrão): barra horizontal que redimensiona na vertical (ex.: terminal).
//   - 'vertical': barra vertical que redimensiona na horizontal.
export function DragHandle({ orientation = 'horizontal', className, ...props }) {
  const vertical = orientation === 'vertical';
  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center bg-border transition-colors hover:bg-primary',
        vertical
          ? 'h-full w-px cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2'
          : 'h-px w-full cursor-row-resize after:absolute after:inset-x-0 after:top-1/2 after:h-2 after:-translate-y-1/2',
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          'z-10 flex items-center justify-center rounded-sm border bg-card',
          vertical ? 'h-5 w-3' : 'h-3 w-5',
        )}
      >
        {vertical ? (
          <GripVertical className="h-2.5 w-2.5" />
        ) : (
          <GripHorizontal className="h-2.5 w-2.5" />
        )}
      </div>
    </div>
  );
}
