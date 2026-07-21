// Botão de ícone pequeno e neutro das barras de ferramentas (cor só no hover/ativo).
// Compartilhado pelo Preview do projeto e pelo visualizador de HTML da aba Código —
// as duas barras são a mesma chrome de navegador, então o botão é um só.
import { cn } from '@/lib/utils';

export function ToolButton({ active, className, children, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        // Superfície de descanso: sem ela o botão é "texto fantasma" e some na barra.
        'grid h-7 w-7 place-items-center rounded-md bg-secondary text-muted-foreground transition-colors',
        'hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
        '[&_svg]:size-[15px]',
        // Ativo = brasa, igual à aba selecionada (data-[state=active]:text-primary).
        active && 'bg-background text-primary shadow-sm hover:bg-background hover:text-primary',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
