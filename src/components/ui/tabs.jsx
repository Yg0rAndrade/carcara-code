import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

// A "alavanca": uma pílula branca única que desliza por baixo das abas até a aba
// ativa, em vez de a cor de fundo aparecer/sumir em cada gatilho. Medimos o
// gatilho ativo e animamos posição/largura de um indicador absoluto.
const TabsList = React.forwardRef(({ className, children, ...props }, ref) => {
  const listRef = React.useRef(null);
  const [pill, setPill] = React.useState(null); // { left, top, width, height }
  const [animate, setAnimate] = React.useState(false);

  React.useImperativeHandle(ref, () => listRef.current);

  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      const activeEl = list.querySelector('[role="tab"][data-state="active"]');
      if (!activeEl) {
        setPill(null);
        return;
      }
      const lr = list.getBoundingClientRect();
      const ar = activeEl.getBoundingClientRect();
      setPill({
        left: ar.left - lr.left,
        top: ar.top - lr.top,
        width: ar.width,
        height: ar.height,
      });
    };

    measure();
    // Liga a transição só depois do primeiro posicionamento, pra a pílula não
    // "voar" do canto na montagem.
    const raf = requestAnimationFrame(() => setAnimate(true));

    // data-state muda quando a aba ativa muda; o tamanho muda quando o painel
    // redimensiona ou um gatilho aparece/some (ex.: aba condicional).
    const mo = new MutationObserver(measure);
    mo.observe(list, { attributes: true, attributeFilter: ['data-state'], subtree: true });
    const ro = new ResizeObserver(measure);
    ro.observe(list);

    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      ro.disconnect();
    };
  }, []);

  return (
    <TabsPrimitive.List
      ref={listRef}
      className={cn(
        'relative inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground',
        className,
      )}
      {...props}
    >
      {pill && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 rounded-md bg-background shadow-sm"
          style={{
            width: pill.width,
            height: pill.height,
            transform: `translate(${pill.left}px, ${pill.top}px)`,
            // Easing tipo "alavanca": acelera e assenta suave (cubic-bezier custom).
            // Só liga depois do primeiro posicionamento pra não animar na montagem.
            transition: animate
              ? 'transform 300ms cubic-bezier(0.22, 1, 0.36, 1), width 300ms cubic-bezier(0.22, 1, 0.36, 1)'
              : 'none',
          }}
        />
      )}
      {children}
    </TabsPrimitive.List>
  );
});
TabsList.displayName = 'TabsList';

const TabsTrigger = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // relative + z-10 mantêm o texto/ícone acima da pílula que desliza por baixo.
      'relative z-10 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:font-semibold data-[state=active]:text-primary [&_svg]:size-4',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

const TabsContent = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('mt-2 focus-visible:outline-none', className)}
    {...props}
  />
));
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsList, TabsTrigger, TabsContent };
