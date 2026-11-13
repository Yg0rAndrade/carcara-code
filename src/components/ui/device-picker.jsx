// Seletor de dispositivo do Preview: computador, aparelhos reais (Android, Apple, tablets —
// catálogo em src/lib/devices.js) e "Personalizado" (largura × altura digitadas). Cada
// item mostra as medidas. Busca no topo. Compartilhado pelo Preview do projeto e pelo
// visualizador de HTML da aba Código (que não usa o "Personalizado": sem onCustomChange).
import { useEffect, useRef, useState } from 'react';
import { Monitor, Tablet, Smartphone, Search, Ruler } from 'lucide-react';
import { ToolButton } from './tool-button.jsx';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import {
  DEVICE_GROUPS,
  normalizeViewport,
  resolveDevice,
  clampCustom,
  CUSTOM_MIN,
  CUSTOM_MAX,
} from '@/lib/devices';

const GROUP_ICON = { android: Smartphone, apple: Smartphone, tablet: Tablet, custom: Ruler };

export function DevicePicker({ value, onChange, disabled, custom, onCustomChange }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState(() => clampCustom(custom));
  const ref = useRef(null);
  const current = normalizeViewport(value);
  const dev = resolveDevice(current, custom);
  const CurrentIcon = dev ? GROUP_ICON[dev.group] || Smartphone : Monitor;

  useEffect(() => {
    if (!open) return;
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
    onChange(v);
    setOpen(false);
  };
  const applyCustom = () => {
    const c = clampCustom(draft);
    setDraft(c);
    onCustomChange?.(c);
    pick('custom');
  };

  const needle = q.trim().toLowerCase();
  const groups = DEVICE_GROUPS.map((g) => ({
    ...g,
    devices: g.devices.filter((d) => !needle || d.name.toLowerCase().includes(needle)),
  })).filter((g) => g.devices.length);

  const row = (id, label, dims, Icon) => (
    <button
      key={id}
      type="button"
      role="menuitemradio"
      aria-checked={current === id}
      onClick={() => pick(id)}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted [&_svg]:size-3.5 [&_svg]:shrink-0',
        current === id && 'bg-muted/70 font-medium text-primary',
      )}
    >
      <Icon className="text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {dims && (
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          {dims}
        </span>
      )}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <ToolButton
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        active={open || current !== 'desktop'}
        title={
          dev
            ? `${dev.name || t('preview.device_custom')} · ${dev.w} × ${dev.h}`
            : t('preview.viewport')
        }
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <CurrentIcon />
      </ToolButton>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-9 z-50 w-[320px] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="flex items-center gap-2 border-b px-3 py-2 [&_svg]:size-3.5">
            <Search className="shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('preview.device_search')}
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5">
            {!needle && row('desktop', t('preview.viewport_desktop'), null, Monitor)}
            {groups.map((g) => (
              <div key={g.id} className="mt-1.5">
                <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t('preview.device_group_' + g.id)}
                </div>
                {g.devices.map((d) => row(d.id, d.name, `${d.w} × ${d.h}`, GROUP_ICON[g.id]))}
              </div>
            ))}
          </div>
          {onCustomChange && (
            <form
              className="flex items-center gap-1.5 border-t px-3 py-2 text-[12px]"
              onSubmit={(e) => {
                e.preventDefault();
                applyCustom();
              }}
            >
              <Ruler className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="mr-auto">{t('preview.device_custom')}</span>
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
                    className="h-7 w-16 rounded-md border bg-card px-1.5 text-center font-mono text-[12px] tabular-nums outline-none focus:ring-2 focus:ring-primary"
                  />
                </span>
              ))}
              <button
                type="submit"
                className={cn(
                  'h-7 rounded-md border px-2 text-[12px] hover:bg-muted',
                  current === 'custom' && 'border-primary text-primary',
                )}
              >
                OK
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
