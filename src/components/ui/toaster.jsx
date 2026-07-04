import { useEffect, useRef, useState } from 'react';
import { Info, X } from 'lucide-react';
import { CheckIcon } from './check.jsx';
import { BadgeAlertIcon } from './badge-alert.jsx';
import { subscribe } from '@/lib/toast.js';

// Mapa de aparência por tipo. O acento (faixa + ícone + rótulo) é o que comunica
// a natureza do aviso: verde = sucesso, vermelho = erro, âmbar = atenção, laranja
// da marca = aviso neutro. O texto principal fica em foreground pra ler bem.
// Success/erro/atenção usam ícones animados (lucide-animated) que tocam ao
// APARECER (não no hover) — ver startAnimation no mount do ToastItem.
const KINDS = {
  success: { label: 'Concluído', Icon: CheckIcon, accent: 'hsl(var(--success))' },
  error: { label: 'Erro', Icon: BadgeAlertIcon, accent: 'hsl(var(--destructive))' },
  warning: { label: 'Atenção', Icon: BadgeAlertIcon, accent: 'hsl(var(--warning))' },
  info: { label: 'Aviso', Icon: Info, accent: 'hsl(var(--primary))' },
};

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function ToastItem({ t, onDone }) {
  const meta = KINDS[t.kind] || KINDS.info;
  const { Icon } = meta;
  const [shown, setShown] = useState(false); // entrada (desliza da direita)
  const [leaving, setLeaving] = useState(false); // saída
  const timer = useRef(null);
  const iconRef = useRef(null); // ícones animados expõem startAnimation() via ref

  const close = () => {
    setLeaving((cur) => {
      if (cur) return cur;
      setTimeout(() => onDone(t.id), prefersReduced() ? 0 : 180);
      return true;
    });
  };

  // (Re)arma o auto-dismiss. Pausa no hover é só não rearmar enquanto o mouse
  // está em cima (onMouseEnter limpa, onMouseLeave rearma).
  const arm = () => {
    clearTimeout(timer.current);
    if (t.duration) timer.current = setTimeout(close, t.duration);
  };

  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    arm();
    // Toca a animação do ícone quando o toast termina de entrar (não no hover).
    // Ícones estáticos (info) não têm startAnimation — o ?. ignora em silêncio.
    const a = prefersReduced() ? null : setTimeout(() => iconRef.current?.startAnimation?.(), 180);
    return () => {
      cancelAnimationFrame(r);
      clearTimeout(timer.current);
      clearTimeout(a);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settled = shown && !leaving;

  return (
    <div
      role="status"
      onMouseEnter={() => clearTimeout(timer.current)}
      onMouseLeave={arm}
      className="pointer-events-auto relative overflow-hidden rounded-[var(--radius)] border bg-popover/95 shadow-lg backdrop-blur-sm transition-all duration-200 ease-out"
      style={{
        transform: settled ? 'translateX(0)' : 'translateX(14px)',
        opacity: settled ? 1 : 0,
      }}
    >
      {/* Faixa "brasa" — a assinatura. */}
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: meta.accent }} />
      <div className="flex items-start gap-2.5 py-2.5 pl-3.5 pr-2">
        <Icon ref={iconRef} size={16} className="mt-0.5 shrink-0" style={{ color: meta.accent }} />
        <div className="min-w-0 flex-1">
          <div className="eyebrow leading-none" style={{ color: meta.accent }}>
            {t.title || meta.label}
          </div>
          <p className="mt-1 break-words text-[13px] leading-snug text-foreground/90">
            {t.message}
          </p>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action.onClick?.();
                close();
              }}
              className="mt-1.5 text-[12px] font-medium text-primary hover:underline"
            >
              {t.action.label}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          title="Fechar"
          className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground [&_svg]:size-3.5"
        >
          <X />
        </button>
      </div>
    </div>
  );
}

/** Pilha de toasts. Montar uma única vez (no App). */
export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => subscribe((t) => setItems((cur) => [...cur, t].slice(-4))), []);
  const remove = (id) => setItems((cur) => cur.filter((t) => t.id !== id));
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {items.map((t) => (
        <ToastItem key={t.id} t={t} onDone={remove} />
      ))}
    </div>
  );
}
