import { Check, Download } from 'lucide-react';
import { AI_OPTIONS, CliBadge } from '@/lib/aiOptions.jsx';
import { alwaysAvailable } from '@/lib/newProjectAi.js';
import { Input } from './ui/input.jsx';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { useEffect, useState } from 'react';

// Os chips de escolha de IA de UM projeto. Fonte única das três telas que pedem a mesma
// coisa: o modal do projeto recém-adicionado, Configurações › IA por projeto e as
// configurações do próprio projeto (aba IA). Antes era o mesmo desenho copiado três
// vezes — e cada cópia foi ganhando um detalhe diferente.
//
// A única divergência real entre elas é o que acontece ao clicar numa CLI que não está
// instalada: as Configurações abrem o fluxo de instalação, as outras só marcam e avisam
// depois. Isso virou a prop `onMissing` (sem ela, o clique alterna normalmente).

// As CLIs que aparecem na escolha (as `hidden` do catálogo ficam de fora). Exportada
// porque a pré-seleção do projeto novo (`preselect`) precisa da MESMA lista.
export const PICKABLE_AIS = AI_OPTIONS.filter((o) => !o.hidden);

export function ProjectAiChips({
  ais = [],
  custom = '',
  installed, // Set | null — null = ainda carregando (não pinta cinza, evita flicker)
  onToggle,
  onCustom,
  onMissing,
  showMinOne = true,
}) {
  const t = useT();
  const isMissing = (key) => !alwaysAvailable(key) && !!installed && !installed.has(key);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {PICKABLE_AIS.map((opt) => {
          const active = ais.includes(opt.key);
          const missing = isMissing(opt.key);
          return (
            <button
              key={opt.key}
              type="button"
              aria-pressed={active}
              onClick={() => (missing && onMissing ? onMissing(opt.key) : onToggle?.(opt.key))}
              title={
                missing
                  ? t(onMissing ? 'settings.aiClickToInstall' : 'settings.aiNotInstalled')
                  : t(opt.desc)
              }
              className={cn(
                // Altura fixa: os rótulos têm tamanhos bem diferentes e, sem isso, a
                // linha de chips ficava serrilhada.
                'flex h-9 items-center gap-2 rounded-md border px-2.5 text-[13px] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                active && 'border-primary bg-muted ring-1 ring-primary',
                missing && 'border-dashed opacity-60 grayscale',
              )}
            >
              <CliBadge optKey={opt.key} />
              {opt.key === 'custom' ? t('settings.aiCustomLabel') : opt.label}
              {missing && <Download aria-hidden="true" className="size-3" />}
              {active && !missing && <Check aria-hidden="true" className="size-3.5 text-primary" />}
            </button>
          );
        })}
      </div>
      {ais.includes('custom') && (
        <Input
          value={custom || ''}
          onChange={(e) => onCustom?.(e.target.value)}
          placeholder={t('settings.aiCustomPlaceholder')}
          className="mt-2.5 h-8 font-mono text-xs"
        />
      )}
      {/* O aviso só aparece quando explica algo: com uma IA marcada, ela não desmarca.
          Antes ele se repetia em TODO card, virando ruído. */}
      {showMinOne && ais.length === 1 && (
        <p className="mt-2 text-[11px] text-muted-foreground">{t('settings.aiMinOne')}</p>
      )}
    </>
  );
}

// Quem já está instalado na máquina, como Set. `null` enquanto carrega.
// `deep` usa o aiStatus (vai à rede atrás da última versão de cada CLI); o padrão é o
// aiDetected, que só olha a máquina e responde na hora.
export function useInstalledAis(enabled = true, deep = false) {
  const [installed, setInstalled] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const call = deep ? window.api.aiStatus() : window.api.aiDetected();
    call
      .then((s) => alive && setInstalled(new Set(s.filter((r) => r.installed).map((r) => r.key))))
      .catch(() => alive && setInstalled(new Set()));
    return () => {
      alive = false;
    };
  }, [enabled, deep]);
  return installed;
}
