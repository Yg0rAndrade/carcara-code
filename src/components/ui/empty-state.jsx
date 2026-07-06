// Empty state padrão do app: o carcará cinza + um texto. Centralizado no espaço
// disponível. Use `size="lg"` pra tela de boas-vindas (nenhum projeto aberto),
// onde o carcará aparece bem grande.
import logoLight from '@/assets/logo-light.svg';
import logoDark from '@/assets/logo-dark.svg';
import { cn } from '@/lib/utils';

export function EmptyState({ children, size = 'sm', className }) {
  const lg = size === 'lg';
  // Carcará em cinza, na cor do --muted-foreground de cada tema (as próprias SVGs
  // já vêm pintadas: #6B7280 no claro, #A3A3A3 no escuro). Trocamos a imagem pela
  // classe .dark do <html> via variante `dark:` em vez de máscara CSS — máscara
  // não renderiza de forma confiável no Chromium do Electron.
  const imgCls = cn('shrink-0 select-none opacity-90', lg ? 'h-28 w-28' : 'h-14 w-14');
  return (
    <div
      className={cn(
        'flex h-full flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground',
        lg ? 'text-[15px]' : 'text-sm',
        className,
      )}
    >
      <img src={logoLight} alt="" aria-hidden="true" className={cn(imgCls, 'block dark:hidden')} />
      <img src={logoDark} alt="" aria-hidden="true" className={cn(imgCls, 'hidden dark:block')} />
      {children}
    </div>
  );
}
