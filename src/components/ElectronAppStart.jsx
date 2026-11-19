// Tela do Preview para projeto que é um app Electron (ex.: o próprio Carcará). O Preview
// web só mostraria o renderer sem o main, então em vez dele: os scripts do package.json
// como ações com nome de gente. Cada ação roda no terminal do painel (PreviewPanel).
import { ChevronRight, Code2, Globe, Hammer, Package, Play, SquareTerminal } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { electronActions } from '@/lib/electronActions.js';
import { Button } from './ui/button.jsx';
import { EmptyState } from './ui/empty-state.jsx';

const OS_NAME = { windows: 'Windows', mac: 'macOS', linux: 'Linux' };
const ICON = { open: Play, dev: Code2, build: Hammer, package: Package, other: SquareTerminal };

function labelOf(a, t) {
  if (a.kind === 'open') return t('preview.electron_open');
  if (a.kind === 'dev') return t('preview.electron_dev');
  if (a.kind === 'build') return t('preview.electron_build');
  if (a.kind === 'package')
    return a.os
      ? `${t('preview.electron_package')} · ${OS_NAME[a.os]}`
      : t('preview.electron_package');
  return a.name;
}

function descOf(a, t) {
  if (a.kind === 'open') return t('preview.electron_open_desc');
  if (a.kind === 'dev') return t('preview.electron_dev_desc');
  if (a.kind === 'build') return t('preview.electron_build_desc');
  if (a.kind === 'package') return t('preview.electron_package_desc');
  return t('preview.electron_other_desc');
}

export function ElectronAppStart({ electron, onRun, onWebAnyway }) {
  const t = useT();
  const { primary, rest } = electronActions(electron.scripts);
  // O comando de verdade fica no tooltip: quem sabe o que é, confere; quem não sabe, não precisa.
  const cmdOf = (a) => `${electron.manager} run ${a.name}`;
  const PrimaryIcon = primary ? ICON[primary.kind] : Play;

  return (
    <EmptyState>
      <div className="flex max-w-sm flex-col items-center gap-1.5">
        <h2 className="text-balance text-base font-semibold text-foreground">
          {t('preview.electron_title')}
        </h2>
        <p className="text-pretty">{t('preview.electron_desc')}</p>
      </div>

      {primary && (
        <div className="mt-3 flex w-full max-w-sm flex-col gap-3">
          <Button
            size="default"
            onClick={() => onRun(primary.name)}
            title={cmdOf(primary)}
            className="h-11 w-full text-sm"
          >
            <PrimaryIcon aria-hidden="true" />
            {labelOf(primary, t)}
          </Button>

          {rest.length > 0 && (
            <ul className="overflow-hidden rounded-lg border border-border bg-card text-left">
              {rest.map((a) => {
                const Icon = ICON[a.kind];
                return (
                  <li key={a.name} className="border-b border-border last:border-b-0">
                    <button
                      type="button"
                      onClick={() => onRun(a.name)}
                      title={cmdOf(a)}
                      className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <Icon
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground"
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span
                          className="truncate text-sm font-medium text-foreground"
                          translate={a.kind === 'other' ? 'no' : undefined}
                        >
                          {labelOf(a, t)}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {descOf(a, t)}
                        </span>
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={onWebAnyway}
        className="mt-1 text-muted-foreground"
      >
        <Globe aria-hidden="true" />
        {t('preview.electron_web_anyway')}
      </Button>
    </EmptyState>
  );
}
