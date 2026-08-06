import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme.jsx';
import { OPT, CliBadge } from '@/lib/aiOptions.jsx';
import { terminalSurface } from '@/lib/xtermShared';
import { cn } from '@/lib/utils';

// Tela de escolha da IA de uma aba nova (mostrada quando o projeto tem 2+ IAs e a
// aba ainda não escolheu). Grade de cards sobre o fundo do terminal. onPick(key)
// sobe aquela CLI (a ChatPanel grava e cria o xterm). CLIs não instaladas ficam
// cinza; clicar nelas abre Configurações › Instaladas já instalando (onOpenAiInstall).
export function AiPicker({ ais, onPick, onOpenAiInstall }) {
  const t = useT();
  const { terminalTheme } = useTheme();
  const opts = (ais || []).map((k) => OPT[k]).filter(Boolean);
  // Status de instalação: null enquanto carrega (não pinta cinza pra evitar flicker).
  const [installed, setInstalled] = useState(null);
  useEffect(() => {
    let alive = true;
    window.api
      .aiStatus()
      .then((s) => alive && setInstalled(new Set(s.filter((r) => r.installed).map((r) => r.key))))
      .catch(() => alive && setInstalled(new Set()));
    return () => {
      alive = false;
    };
  }, []);
  const missing = (key) =>
    key !== 'custom' && key !== 'shell' && key !== 'carcara' && installed && !installed.has(key);
  // A família de cores vem junto com o fundo (terminalSurface): os cards e os textos
  // daqui são UI do app sobre o fundo do TERMINAL — sem escopar, o texto resolvia pelo
  // tema do root e sumia quando os dois divergiam (terminal escuro + app claro).
  const surface = terminalSurface(terminalTheme);

  return (
    <div
      className={cn(
        'absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 p-6',
        surface.className,
      )}
      style={surface.style}
    >
      <div className="text-center">
        <h2 className="text-[15px] font-semibold text-foreground">{t('aiPicker.title')}</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">{t('aiPicker.subtitle')}</p>
      </div>
      <div className="grid w-full max-w-md grid-cols-2 gap-2.5">
        {opts.map((o) => {
          const isMissing = missing(o.key);
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => (isMissing ? onOpenAiInstall?.(o.key) : onPick(o.key))}
              title={isMissing ? t('settings.aiClickToInstall') : t(o.desc)}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary hover:bg-muted',
                isMissing && 'opacity-60 grayscale',
              )}
            >
              <CliBadge optKey={o.key} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-foreground">
                  {o.key === 'custom' ? t('settings.aiCustomLabel') : o.label}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {isMissing ? t('settings.aiClickToInstall') : t(o.desc)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
