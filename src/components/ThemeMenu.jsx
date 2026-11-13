// Seletor de tema da barra de título: ícone de paleta que abre um painel com todos os
// temas (miniatura + nome), entrando em cascata. Troca na hora; Esc/clique fora fecha.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Palette } from 'lucide-react';
import { useTheme, THEME_ORDER, THEME_SWATCH } from '@/lib/theme.jsx';
import { ThemePreview } from './ui/theme-preview.jsx';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

// "Carvão puro (AMOLED)" -> "Carvão puro"; "Papel / Sépia" -> "Papel".
const shortLabel = (s) => s.replace(/\s*\(.*\)\s*$/, '').replace(/\s*\/.*$/, '');

export function ThemeMenu({ buttonClassName, noDragClassName }) {
  const t = useT();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const listRef = useRef(null);

  // Ao abrir, traz o tema em uso pra vista (pode estar nas linhas de baixo).
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      listRef.current?.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn('relative', noDragClassName)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={t('titlebar.theme')}
        aria-label={t('titlebar.theme')}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(buttonClassName, open && 'bg-muted text-foreground')}
      >
        <Palette />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
            style={{ transformOrigin: 'top right' }}
            className="absolute right-0 top-full z-50 mt-1.5 w-[312px] rounded-xl border bg-popover p-2.5 text-popover-foreground shadow-xl"
          >
            <div className="mb-2 px-1 text-[12px] font-medium text-muted-foreground">
              {t('titlebar.theme')}
            </div>
            {/* Todos os temas numa lista rolável: ~3,5 linhas visíveis (a linha cortada
                avisa que tem mais embaixo); rola com a roda, sem clique extra. */}
            <motion.div
              ref={listRef}
              className="-mr-1 grid max-h-[300px] grid-cols-3 gap-1.5 overflow-y-auto pr-1 [&>*]:min-w-0"
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.03, delayChildren: 0.04 } } }}
            >
              {THEME_ORDER.map((key) => {
                const on = theme === key;
                return (
                  <motion.button
                    key={key}
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    onClick={() => setTheme(key)}
                    variants={{
                      hidden: { opacity: 0, y: 8, scale: 0.94 },
                      show: { opacity: 1, y: 0, scale: 1 },
                    }}
                    transition={{ type: 'spring', stiffness: 520, damping: 32 }}
                    className={cn(
                      'group flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-lg border border-transparent p-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      on && 'border-primary bg-muted/60',
                    )}
                  >
                    <ThemePreview
                      theme={key}
                      className="h-12 transition-transform duration-150 group-hover:scale-[1.03]"
                    />
                    <span className="flex min-w-0 items-center gap-1 px-0.5 text-[12px] leading-tight">
                      {/* Nome curto no painel (sem o "(AMOLED)" etc.); o completo fica no
                          title e nas Configurações. min-w-0: sem ele o truncate não encolhe
                          e o texto invade o tema vizinho. */}
                      <span className="min-w-0 flex-1 truncate" title={t(THEME_SWATCH[key].label)}>
                        {shortLabel(t(THEME_SWATCH[key].label))}
                      </span>
                      {on && <Check className="size-3 shrink-0 text-primary" />}
                    </span>
                  </motion.button>
                );
              })}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
