// Placeholder que ocupa o lugar do conteúdo enquanto ele carrega. A regra é sempre a
// mesma: o esqueleto tem a MESMA caixa do conteúdo final, pra nada pular de lugar quando
// os dados chegam. Respeita `prefers-reduced-motion` (sem pulsar pra quem pediu menos
// movimento) e é `aria-hidden` — quem lê tela ouve o aviso do container, não a moldura.
import { cn } from '@/lib/utils';

export function Skeleton({ className }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)}
    />
  );
}
