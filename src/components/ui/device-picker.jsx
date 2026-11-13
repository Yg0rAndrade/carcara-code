// Dispositivo do Preview em duas peças:
// - DevicePicker: botão da barra com só duas opções, Computador e Celular. "Celular" volta
//   pro último aparelho escolhido (lastDevice).
// - DeviceList: painel ao lado do celular com os aparelhos (Android e Apple, com as medidas)
//   e o "Personalizado" (largura × altura digitadas). Catálogo em src/lib/devices.js.
// O DevicePicker também é usado pelo visualizador de HTML da aba Código.
import { useEffect, useRef, useState } from 'react';
import { Monitor, Smartphone, Search, Ruler } from 'lucide-react';
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

const LIST_W = 260;
const GAP = 32;

// Painel de aparelhos à direita da moldura. Some se não couber ao lado do celular.
export function DeviceList({ value, onChange, custom, onCustomChange, frameWidth }) {
  const t = useT();
  const ref = useRef(null);
  const [fits, setFits] = useState(false);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState(() => clampCustom(custom));
  const current = normalizeViewport(value);
  const selRef = useRef(null);

  useEffect(() => setDraft(clampCustom(custom)), [custom]);

  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return undefined;
    const check = () => setFits((parent.clientWidth - frameWidth) / 2 >= LIST_W + GAP * 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [frameWidth]);

  // Traz o aparelho escolhido pra vista ao abrir.
  useEffect(() => {
    if (fits) selRef.current?.scrollIntoView({ block: 'nearest' });
  }, [fits]);

  const pick = (v) => {
    rememberDevice(v);
    onChange(v);
  };
  const applyCustom = () => {
    const c = clampCustom(draft);
    setDraft(c);
    onCustomChange(c);
    pick('custom');
  };

  const needle = q.trim().toLowerCase();
  const groups = DEVICE_GROUPS.map((g) => ({
    ...g,
    devices: g.devices.filter((d) => !needle || d.name.toLowerCase().includes(needle)),
  })).filter((g) => g.devices.length);

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-y-0 right-0 z-10 flex items-center justify-center"
      style={{ left: `calc(50% + ${frameWidth / 2}px)`, display: fits ? undefined : 'none' }}
    >
      <div
        className="pointer-events-auto flex max-h-[calc(100%-48px)] flex-col overflow-hidden rounded-2xl border bg-background/95 shadow-xl backdrop-blur"
        style={{ width: LIST_W }}
      >
        <div className="flex items-center gap-2 border-b px-3 py-2.5 [&_svg]:size-3.5">
          <Search className="shrink-0 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('preview.device_search')}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {groups.map((g) => (
            <div key={g.id} className="mb-1">
              <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('preview.device_group_' + g.id)}
              </div>
              {g.devices.map((d) => {
                const on = current === d.id;
                return (
                  <button
                    key={d.id}
                    ref={on ? selRef : undefined}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pick(d.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-muted',
                      on && 'bg-primary/10 font-medium text-primary',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate" title={d.name}>
                      {d.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground">
                      {d.w}×{d.h}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <form
          className={cn('border-t px-3 py-2.5 text-[12px]', current === 'custom' && 'bg-primary/5')}
          onSubmit={(e) => {
            e.preventDefault();
            applyCustom();
          }}
        >
          <div className="mb-1.5 flex items-center gap-1.5 font-medium">
            <Ruler className="size-3.5 text-muted-foreground" />
            {t('preview.device_custom')}
          </div>
          <div className="flex items-center gap-1.5">
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
                'ml-auto h-7 rounded-md border px-2.5 text-[12px] hover:bg-muted',
                current === 'custom' && 'border-primary text-primary',
              )}
            >
              OK
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
