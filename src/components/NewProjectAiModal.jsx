import { useEffect, useState } from 'react';
import { Check, Download } from 'lucide-react';
import { AI_OPTIONS, OPT, CliBadge } from '@/lib/aiOptions.jsx';
import { alwaysAvailable, baseName, missingChosen, preselect } from '@/lib/newProjectAi.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

// Escolha da IA logo depois de adicionar uma pasta de projeto.
//
// Sem esta tela, todo projeto novo nascia em Claude Code por padrão (o fallback do
// `ai:set`), e quem não tem o Claude instalado só descobria isso quando a primeira aba
// subia num comando que não existe. A escolha passa a acontecer no momento em que a
// pessoa está pensando no projeto, não depois do erro.
//
// `paths` são só as pastas que ENTRARAM agora (o main devolve isso em projects:add).
// Fechar sem salvar é permitido: o projeto fica no padrão e a pessoa ajusta em
// Configurações › IA por projeto.
const PICKABLE = AI_OPTIONS.filter((o) => !o.hidden);

export function NewProjectAiModal({ paths = [], onClose, onOpenInstall }) {
  const t = useT();
  const [installed, setInstalled] = useState(null); // Set | null (null = ainda carregando)
  const [sel, setSel] = useState({}); // path -> { ais, custom }

  useEffect(() => {
    if (!paths.length) return;
    let alive = true;
    // `aiDetected` (detecção local) e não `aiStatus`: aqui só interessa QUEM está
    // instalado, e o aiStatus vai à rede atrás da última versão de cada CLI — o modal
    // abriria sem nada marcado enquanto isso.
    window.api
      .aiDetected()
      .then((s) => (alive ? new Set(s.filter((r) => r.installed).map((r) => r.key)) : null))
      .catch(() => (alive ? new Set() : null))
      .then((set) => {
        if (!alive || !set) return;
        setInstalled(set);
        const base = preselect(PICKABLE, set);
        setSel(Object.fromEntries(paths.map((p) => [p, { ais: [...base], custom: '' }])));
      });
    return () => {
      alive = false;
    };
  }, [paths]);

  if (!paths.length) return null;

  const cur = (p) => sel[p] || { ais: [], custom: '' };
  const toggle = (p, key) =>
    setSel((s) => {
      const c = s[p] || { ais: [], custom: '' };
      const ais = c.ais.includes(key) ? c.ais.filter((k) => k !== key) : [...c.ais, key];
      return { ...s, [p]: { ...c, ais } };
    });
  const setCustom = (p, val) =>
    setSel((s) => ({ ...s, [p]: { ...(s[p] || { ais: [] }), custom: val } }));

  // Só salva quando TODO projeto tem pelo menos uma IA: gravar lista vazia cairia no
  // fallback do main e traria de volta exatamente o padrão que esta tela evita.
  const ready = paths.every((p) => cur(p).ais.length > 0);
  // CLIs escolhidas que ainda não existem na máquina (aviso, não bloqueio).
  const chosenMissing = missingChosen(
    paths.map((p) => cur(p).ais),
    installed,
  );

  const save = async () => {
    for (const p of paths) {
      const c = cur(p);
      if (c.ais.length) await window.api.setAi(p, c.ais, c.custom || '');
    }
    onClose();
  };

  const many = paths.length > 1;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[86vh] w-[520px] max-w-[92vw] overflow-auto rounded-2xl border border-border bg-background p-5 shadow-xl">
        <h2 className="text-lg font-semibold">{t('newProjectAi.title')}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          {t(many ? 'newProjectAi.subtitleMany' : 'newProjectAi.subtitle')}
        </p>

        <div className="mt-4 space-y-3">
          {paths.map((p) => {
            const c = cur(p);
            return (
              <div key={p} className="overflow-hidden rounded-lg border">
                {many && (
                  <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold uppercase">
                      {baseName(p)[0] || '?'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={p}>
                      {baseName(p)}
                    </span>
                  </div>
                )}
                <div className="p-3">
                  <div className="flex flex-wrap gap-2">
                    {PICKABLE.map((opt) => {
                      const active = c.ais.includes(opt.key);
                      const missing =
                        !alwaysAvailable(opt.key) && installed && !installed.has(opt.key);
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggle(p, opt.key)}
                          title={missing ? t('settings.aiNotInstalled') : t(opt.desc)}
                          className={cn(
                            'flex h-9 items-center gap-2 rounded-md border px-2.5 text-[13px] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                            active && 'border-primary bg-muted ring-1 ring-primary',
                            missing && 'border-dashed opacity-60 grayscale',
                          )}
                        >
                          <CliBadge optKey={opt.key} />
                          {opt.key === 'custom' ? t('settings.aiCustomLabel') : opt.label}
                          {missing && <Download aria-hidden="true" className="size-3" />}
                          {active && <Check aria-hidden="true" className="size-3.5 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                  {c.ais.includes('custom') && (
                    <Input
                      value={c.custom || ''}
                      onChange={(e) => setCustom(p, e.target.value)}
                      placeholder={t('settings.aiCustomPlaceholder')}
                      className="mt-2.5 h-8 font-mono text-xs"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {chosenMissing.length > 0 && (
          <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
            {t('newProjectAi.notInstalled', {
              list: chosenMissing.map((k) => OPT[k]?.label || k).join(', '),
            })}{' '}
            <button
              type="button"
              onClick={() => onOpenInstall?.(chosenMissing[0])}
              className="text-primary underline"
            >
              {t('newProjectAi.openInstall')}
            </button>
          </p>
        )}
        {!ready && (
          <p className="mt-3 text-[12px] text-muted-foreground">{t('settings.aiMinOne')}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t('newProjectAi.skip')}
          </Button>
          <Button size="sm" disabled={!ready} onClick={save}>
            {t('newProjectAi.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
