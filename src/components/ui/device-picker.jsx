// Dispositivo do Preview em duas peças:
// - DevicePicker: botão da barra com só duas opções, Computador e Celular. "Celular" volta
//   pro último aparelho escolhido (lastDevice).
// - DeviceSwitcher: botão embaixo do aparelho (nome + medidas) que abre a grade de aparelhos
//   (Android e Apple, com miniaturas) e o "Personalizado" (largura × altura).
// O DevicePicker também é usado pelo visualizador de HTML da aba Código.
import { useEffect, useRef, useState } from 'react';
import { Monitor, Smartphone, Search, Ruler, ChevronUp } from 'lucide-react';
import { ToolButton } from './tool-button.jsx';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import {
  DEVICE_GROUPS,
  normalizeViewport,
  lastDevice,
  rememberDevice,
  clampCustom,
  CUSTOM_MIN,
  CUSTOM_MAX,
} from '@/lib/devices';

export function DevicePicker({ value, onChange, disabled }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const isPhone = normalizeViewport(value) !== 'desktop';

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const OPTIONS = [
    { id: 'desktop', label: t('preview.viewport_desktop'), Icon: Monitor },
    { id: 'phone', label: t('preview.viewport_mobile'), Icon: Smartphone },
  ];
  const CurrentIcon = isPhone ? Smartphone : Monitor;

  return (
    <div ref={ref} className="relative">
      <ToolButton
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        active={open || isPhone}
        title={t('preview.viewport')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <CurrentIcon />
      </ToolButton>
      {open && (
        <div className="absolute left-0 top-9 z-50 min-w-[160px] overflow-hidden rounded-md border bg-popover py-1 shadow-md">
          {OPTIONS.map((o) => {
            const on = o.id === 'phone' ? isPhone : !isPhone;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onChange(o.id === 'phone' ? (isPhone ? value : lastDevice()) : 'desktop');
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted [&_svg]:size-4',
                  on && 'font-medium text-primary',
                )}
              >
                <o.Icon />
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Miniatura do aparelho: contorno na proporção real, com a câmera de cada um. Desenhada
// (não é imagem), na cor do texto — some com o tema.
function MiniDevice({ d, on }) {
  const H = 38;
  const W = Math.max(14, Math.round((H * d.w) / d.h));
  const r = Math.max(2, Math.round((d.radius / d.h) * H) + 2);
  return (
    <span
      className={cn(
        'relative block shrink-0 border-[1.5px]',
        on ? 'border-primary' : 'border-foreground/45 group-hover:border-foreground/70',
      )}
      style={{ width: W, height: H, borderRadius: r }}
    >
      {d.cutout === 'island' && (
        <span className="absolute left-1/2 top-[3px] h-[3px] w-[7px] -translate-x-1/2 rounded-full bg-current opacity-60" />
      )}
      {d.cutout === 'notch' && (
        <span className="absolute left-1/2 top-0 h-[3px] w-[9px] -translate-x-1/2 rounded-b-[2px] bg-current opacity-60" />
      )}
      {(d.cutout === 'punch' || d.cutout === 'drop') && (
        <span className="absolute left-1/2 top-[3px] size-[3px] -translate-x-1/2 rounded-full bg-current opacity-60" />
      )}
    </span>
  );
}

// Botão embaixo do aparelho (nome + medidas da área do site) que abre a grade de
// aparelhos pra cima. Fica no lugar do rótulo da moldura (DeviceFrame showLabel=false).
const COACH_KEY = 'coach:deviceSwitcher';

export function DeviceSwitcher({ value, onChange, custom, onCustomChange, geometry, device }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // Dica da primeira vez (balão em cima do botão), até a pessoa abrir a grade ou fechar.
  const [coach, setCoach] = useState(() => {
    try {
      return !localStorage.getItem(COACH_KEY);
    } catch {
      return false;
    }
  });
  const dismissCoach = () => {
    setCoach(false);
    try {
      localStorage.setItem(COACH_KEY, '1');
    } catch {}
  };
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState(() => clampCustom(custom));
  const ref = useRef(null);
  const current = normalizeViewport(value);

  useEffect(() => {
    if (!open) return undefined;
    setQ('');
    setDraft(clampCustom(custom));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (v) => {
    rememberDevice(v);
    onChange(v);
    setOpen(false);
  };
  const applyCustom = () => {
    const c = clampCustom(draft);
    onCustomChange(c);
    pick('custom');
  };

  const needle = q.trim().toLowerCase();
  const groups = DEVICE_GROUPS.map((g) => ({
    ...g,
    devices: g.devices.filter((d) => !needle || d.name.toLowerCase().includes(needle)),
  })).filter((g) => g.devices.length);

  const g = geometry;
  const label = device.id === 'custom' ? t('preview.device_custom') : device.name;

  return (
    <div
      ref={ref}
      className="absolute z-20 -translate-x-1/2"
      style={{ left: g.frame.x + g.frame.w / 2, top: g.frame.y + g.frame.h + 6 }}
    >
      {coach && !open && (
        <div
          role="status"
          className="absolute bottom-full left-1/2 mb-3 w-[260px] -translate-x-1/2 rounded-xl bg-primary p-3.5 text-[12.5px] leading-snug text-primary-foreground shadow-[0_12px_32px_rgba(0,0,0,0.3)] duration-300 animate-in fade-in slide-in-from-bottom-2"
        >
          <div className="mb-1 font-semibold">{t('preview.device_coach_title')}</div>
          <p className="opacity-90">{t('preview.device_coach_body')}</p>
          <button
            type="button"
            onClick={dismissCoach}
            className="mt-2.5 rounded-md bg-primary-foreground/15 px-2.5 py-1 text-[12px] font-medium hover:bg-primary-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground"
          >
            {t('preview.device_coach_ok')}
          </button>
          {/* setinha apontando pro botão */}
          <span className="absolute left-1/2 top-full size-3 -translate-x-1/2 -translate-y-1.5 rotate-45 bg-primary" />
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          dismissCoach();
          setOpen((o) => !o);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t('preview.device_change')}
        className={cn(
          'flex items-center gap-2 whitespace-nowrap rounded-full border bg-card py-1.5 pl-2.5 pr-3 text-[12px] text-muted-foreground shadow-sm transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          (open || coach) && 'border-primary/60 text-foreground',
        )}
      >
        <Smartphone className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span className="font-medium text-foreground">{label}</span>
        <span className="font-mono text-[11px] tabular-nums" title={t('preview.device_viewport')}>
          {g.viewport.w} × {g.viewport.h}
        </span>
        {g.scale < 0.995 && (
          <span className="font-mono text-[11px] tabular-nums">· {Math.round(g.scale * 100)}%</span>
        )}
        <ChevronUp
          className={cn('size-3.5 transition-transform', !open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('preview.device_change')}
          className="absolute bottom-full left-1/2 mb-2 flex max-h-[min(70vh,560px)] w-[min(560px,calc(100vw-48px))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-[0_16px_48px_rgba(0,0,0,0.35)] duration-150 animate-in fade-in slide-in-from-bottom-1"
        >
          <div className="flex items-center gap-2 border-b px-3 py-2.5 [&_svg]:size-3.5">
            <Search className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('preview.device_search')}
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {groups.map((grp) => (
              <section key={grp.id}>
                <h3 className="sticky top-0 z-[1] bg-popover pb-1.5 pt-3 text-[12px] font-semibold text-foreground/80">
                  {t('preview.device_group_' + grp.id)}
                </h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1.5">
                  {grp.devices.map((d) => {
                    const on = current === d.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => pick(d.id)}
                        title={`${d.name} · ${d.w} × ${d.h}`}
                        className={cn(
                          'group flex min-w-0 flex-col items-center gap-1.5 rounded-lg border px-1.5 pb-1.5 pt-2.5 text-center transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                          on ? 'border-primary bg-primary/10' : 'border-transparent',
                        )}
                      >
                        <MiniDevice d={d} on={on} />
                        <span
                          className={cn(
                            'line-clamp-2 text-[11.5px] leading-tight',
                            on && 'font-medium text-primary',
                          )}
                        >
                          {d.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            {groups.length === 0 && (
              <p className="py-6 text-center text-[12px] text-muted-foreground">
                {t('preview.device_none')}
              </p>
            )}
          </div>
          <form
            className={cn(
              'flex items-center gap-2 border-t px-3 py-2.5 text-[12px]',
              current === 'custom' && 'bg-primary/5',
            )}
            onSubmit={(e) => {
              e.preventDefault();
              applyCustom();
            }}
          >
            <Ruler className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="mr-auto font-medium">{t('preview.device_custom')}</span>
            {['w', 'h'].map((k, i) => (
              <span key={k} className="flex items-center gap-1.5">
                {i === 1 && <span className="text-muted-foreground">×</span>}
                <input
                  type="number"
                  min={CUSTOM_MIN}
                  max={CUSTOM_MAX}
                  value={draft[k]}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                  aria-label={t(k === 'w' ? 'preview.device_width' : 'preview.device_height')}
                  title={t(k === 'w' ? 'preview.device_width' : 'preview.device_height')}
                  className="h-7 w-[72px] rounded-md border bg-card px-1.5 text-center font-mono text-[12px] tabular-nums outline-none focus:ring-2 focus:ring-primary"
                />
              </span>
            ))}
            <button
              type="submit"
              className={cn(
                'h-7 rounded-md border px-2.5 text-[12px] hover:bg-muted',
                current === 'custom' && 'border-primary text-primary',
              )}
            >
              {t('preview.device_apply')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
