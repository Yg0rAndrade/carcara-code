import { GripVertical } from 'lucide-react';
import * as ResizablePrimitive from 'react-resizable-panels';
import { cn } from '@/lib/utils';

const ResizablePanelGroup = ({ className, ...props }) => (
  <ResizablePrimitive.PanelGroup
    className={cn('flex h-full w-full data-[panel-group-direction=vertical]:flex-col', className)}
    {...props}
  />
);

const ResizablePanel = ResizablePrimitive.Panel;

// gripClassName: posição da alça (o App a encosta do lado do chat; ver handleEl em App.jsx).
const ResizableHandle = ({ withHandle, className, gripClassName, children, ...props }) => (
  <ResizablePrimitive.PanelResizeHandle
    className={cn(
      'relative flex w-px items-center justify-center bg-border transition-colors hover:bg-primary data-[resize-handle-state=drag]:bg-primary after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2 focus-visible:outline-none',
      className,
    )}
    {...props}
  >
    {withHandle && (
      <div
        className={cn(
          'z-10 flex h-5 w-3 items-center justify-center rounded-sm border bg-card',
          gripClassName && 'absolute left-1/2 top-1/2 -translate-y-1/2',
          gripClassName,
        )}
      >
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    )}
    {children}
  </ResizablePrimitive.PanelResizeHandle>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
