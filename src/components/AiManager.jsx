// Sub-aba "Instaladas": lista as CLIs de IA (instalada/versão/update) e roda
// instalação/atualização pelo instalador oficial, com um xterm ao vivo à direita.
// Reaproveita os canais aiInstall:* do main (PTY real). Ver
// docs/superpowers/specs/2026-07-10-gestao-clis-ia-design.md.
import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useT } from '@/lib/i18n';
import { CliBadge, OPT } from '@/lib/aiOptions.jsx';
import { cn } from '@/lib/utils';

const LABEL = (key) => OPT[key]?.label ?? key;

export default function AiManager({ initialInstallKey = null }) {
  const t = useT();
  const [rows, setRows] = useState([]); // status por CLI
  const [busy, setBusy] = useState(null); // key em instalação/atualização
  const [installId, setInstallId] = useState(null);
  const termHostRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  // O listener de teclado do xterm é registrado uma vez (efeito de montagem); usamos um ref
  // pra sempre encaminhar pro installId mais recente, sem precisar recriar o terminal.
  const installIdRef = useRef(null);
  installIdRef.current = installId;

  const refresh = useCallback(async () => {
    try {
      const s = await window.api.aiStatus();
      // custom/shell não entram nesta lista (não instaláveis).
      setRows(s.filter((r) => r.key !== 'custom' && r.key !== 'shell'));
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // xterm ao vivo: mostra o progresso da instalação e encaminha entrada do usuário
  // (senha de sudo, confirmações y/n do instalador, etc.) de volta pro PTY.
  useEffect(() => {
    if (!termHostRef.current || termRef.current) return;
    const term = new Terminal({
      fontSize: 12,
      convertEol: true,
      disableStdin: false,
      theme: { background: '#0d0f12' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termHostRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;
    term.onData((data) => {
      const id = installIdRef.current;
      if (id) window.api.aiInstallInput(id, data);
    });
    const onResize = () => {
      try {
        fit.fit();
        const id = installIdRef.current;
        if (id) window.api.aiInstallResize(id, term.cols, term.rows);
      } catch {}
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      term.dispose();
      termRef.current = null;
    };
  }, []);

  // eventos de stream/fim
  useEffect(() => {
    const offData = window.api.on('aiInstall:data', ({ installId: id, data }) => {
      if (id === installId && termRef.current) termRef.current.write(data);
    });
    const offDone = window.api.on('aiInstall:done', ({ installId: id }) => {
      if (id !== installId) return;
      setBusy(null);
      setInstallId(null);
      refresh();
    });
    return () => {
      offData && offData();
      offDone && offDone();
    };
  }, [installId, refresh]);

  const start = useCallback(
    async (key, mode) => {
      if (busy) return;
      setBusy(key);
      if (termRef.current) termRef.current.clear();
      const { installId: id } = await window.api.aiInstallStart(key, mode);
      setInstallId(id);
      if (fitRef.current && termRef.current) {
        window.api.aiInstallResize(id, termRef.current.cols, termRef.current.rows);
      }
    },
    [busy],
  );

  // auto-install vindo de um chip (Task 8)
  useEffect(() => {
    if (initialInstallKey) start(initialInstallKey, 'install');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInstallKey]);

  return (
    <div className="flex min-h-[360px] gap-4">
      {/* Lista */}
      <div className="w-[46%] shrink-0 space-y-2 overflow-auto">
        {rows.map((r) => {
          const installing = busy === r.key;
          return (
            <div
              key={r.key}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-3',
                !r.installed && 'opacity-60 grayscale',
                installing && 'border-primary ring-1 ring-primary',
              )}
            >
              <CliBadge optKey={r.key} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{LABEL(r.key)}</div>
                <div className="text-xs text-muted-foreground">
                  {installing
                    ? t('settings.aiInstalling')
                    : r.installed
                      ? r.updateAvailable
                        ? t('settings.aiUpdateAvailable', { v: r.latest })
                        : t('settings.aiUpToDate', { v: r.version })
                      : t('settings.aiNotInstalled')}
                </div>
              </div>
              {r.installed ? (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => start(r.key, 'update')}
                  className={cn(
                    'rounded-md border px-2.5 py-1.5 text-[13px] transition-colors hover:bg-muted disabled:opacity-40',
                    r.updateAvailable && 'border-primary text-primary',
                  )}
                >
                  {t('settings.aiUpdate')}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!!busy || !r.installable}
                  onClick={() => start(r.key, 'install')}
                  className="rounded-md border border-primary px-2.5 py-1.5 text-[13px] text-primary transition-colors hover:bg-primary/10 disabled:opacity-40"
                >
                  {t('settings.aiInstall')}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {/* Terminal ao vivo */}
      <div className="flex-1 overflow-hidden rounded-lg border bg-[#0d0f12]">
        <div ref={termHostRef} className="h-full w-full p-2" />
      </div>
    </div>
  );
}
