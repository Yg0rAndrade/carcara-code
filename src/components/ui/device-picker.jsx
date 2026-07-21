// Seletor de tamanho de tela (computador/tablet/celular). Mostra só o dispositivo
// atual; ao clicar, abre um dropdown com as três opções — mesmo padrão visual do
// menu "Ferramentas", pra barra ficar coesa.
// Compartilhado pelo Preview do projeto e pelo visualizador de HTML da aba Código.
import { useEffect, useRef, useState } from 'react';
import { Monitor, Tablet, Smartphone } from 'lucide-react';
import { ToolButton } from './tool-button.jsx';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

export function DevicePicker({ value, onChange, disabled }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const DEVICES = [
    { value: 'desktop', label: t('preview.viewport_desktop'), Icon: Monitor },
    { value: 'tablet', label: t('preview.viewport_tablet'), Icon: Tablet },
    { value: 'mobile', label: t('preview.viewport_mobile'), Icon: Smartphone },
  ];
  const current = DEVICES.find((d) => d.value === value) || DEVICES[0];
  const CurrentIcon = current.Icon;

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <ToolButton
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        active={open || value !== 'desktop'}
        title={t('preview.viewport')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <CurrentIcon />
      </ToolButton>
      {open && (
        <div className="absolute left-0 top-9 z-50 min-w-[150px] overflow-hidden rounded-md border bg-popover py-1 shadow-md">
          {DEVICES.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => {
                onChange(d.value);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted [&_svg]:size-4',
                value === d.value && 'font-medium text-primary',
              )}
            >
              <d.Icon />
              {d.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
