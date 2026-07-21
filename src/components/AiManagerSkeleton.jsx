// Esqueleto da aba "Gerenciar IAs". Vale por dois momentos de espera, e por isso mora
// fora do AiManager (que é lazy e pesado — xterm):
//   1. enquanto o chunk do AiManager baixa/parseia (fallback do Suspense);
//   2. enquanto a 1ª sondagem das CLIs não responde (lista ainda vazia).
// A caixa é a mesma do conteúdo final (lista à esquerda, terminal à direita, 300px de
// altura), então quando as linhas reais chegam nada pula de lugar.
import { Skeleton } from './ui/skeleton.jsx';

export function AiManagerSkeleton({ rows = 5 }) {
  return (
    <div className="flex h-[300px] gap-4" aria-hidden="true">
      <div className="w-[46%] shrink-0 space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
            <Skeleton className="size-7 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-8 w-20 shrink-0" />
          </div>
        ))}
      </div>
      <div className="flex h-full flex-1 flex-col gap-1.5">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="flex-1" />
      </div>
    </div>
  );
}
