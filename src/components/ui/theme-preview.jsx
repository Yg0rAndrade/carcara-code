// Mini-janela da IDE que representa um tema (usada em Configurações → Aparência e no
// seletor de tema da barra de título). A MOLDURA é o fundo do tema (mostra o matiz),
// o painel é o card, as barrinhas são "texto" e a pílula é a cor de destaque (com
// brilho nos temas que pedem). As cores vêm de THEME_SWATCH (src/lib/theme.jsx).
import { THEME_SWATCH } from '@/lib/theme.jsx';
import { cn } from '@/lib/utils';

export function ThemePreview({ theme, className }) {
  const p = THEME_SWATCH[theme];
  if (!p) return null;
  return (
    <div
      className={cn('overflow-hidden rounded-[5px] border p-1.5', className)}
      style={{ background: p.bg, borderColor: p.border }}
    >
      <div
        className="flex h-full flex-col justify-center gap-1.5 rounded-[4px] border px-2"
        style={{ background: p.card, borderColor: p.border }}
      >
        <span className="h-1 w-4/5 rounded-full" style={{ background: p.line }} />
        <span className="h-1 w-3/5 rounded-full" style={{ background: p.line }} />
        <span
          className="mt-0.5 h-1.5 rounded-full"
          style={{
            width: p.glow ? '2.25rem' : '1.5rem',
            background: p.primary,
            boxShadow: p.glow ? `0 0 7px 0 ${p.primary}` : 'none',
          }}
        />
      </div>
    </div>
  );
}
