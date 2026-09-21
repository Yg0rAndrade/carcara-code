import { useCallback, useEffect, useState } from 'react';
import { Globe, Loader2, RotateCw } from 'lucide-react';
import { Button } from './ui/button.jsx';
import { Input } from './ui/input.jsx';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

// Tela inicial do Preview num projeto REMOTO (SSH).
//
// O <webview> não fala SSH, então não há como apontar pra "localhost da VPS". O que
// existe é um túnel (o `ssh -L` do OpenSSH, feito no main sobre a conexão que o projeto
// já mantém): o app escuta numa porta local e joga tudo pro `127.0.0.1:<porta>` de lá.
// Esta tela é só a escolha da porta — a partir do "abrir", o preview é o de sempre.
//
// A lista vem do `ss`/`netstat` rodado na VPS. Serviço em 127.0.0.1 ganha destaque
// porque é exatamente o caso que o túnel resolve: de fora, ele não responderia nunca.
export function RemotePreviewStart({ projectPath, onOpen }) {
  const t = useT();
  const [ports, setPorts] = useState(null); // null = carregando
  const [err, setErr] = useState('');
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(0); // porta que está abrindo (0 = nenhuma)

  const load = useCallback(() => {
    setPorts(null);
    setErr('');
    window.api
      .remotePorts(projectPath)
      .then((r) => {
        if (r?.error) {
          setErr(r.error);
          setPorts([]);
        } else setPorts(r?.ports || []);
      })
      .catch((e) => {
        setErr(String(e?.message || e));
        setPorts([]);
      });
  }, [projectPath]);

  useEffect(() => {
    load();
  }, [load]);

  const open = async (port) => {
    const n = Number(port);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      setErr(t('remotePreview.bad_port'));
      return;
    }
    setBusy(n);
    setErr('');
    const r = await window.api.openRemoteTunnel(projectPath, n);
    setBusy(0);
    if (r?.error) {
      setErr(r.error);
      return;
    }
    onOpen(r.url, n);
  };

  return (
    <div className="absolute inset-0 overflow-auto bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 py-10">
        <div className="text-center">
          <Globe className="mx-auto size-7 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-[15px] font-semibold">{t('remotePreview.title')}</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            {t('remotePreview.subtitle')}
          </p>
        </div>

        <div className="rounded-lg border">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
            <span className="flex-1 text-[12px] font-medium text-muted-foreground">
              {t('remotePreview.detected')}
            </span>
            <button
              type="button"
              onClick={load}
              title={t('remotePreview.rescan')}
              aria-label={t('remotePreview.rescan')}
              className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <RotateCw className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="p-2">
            {ports === null ? (
              <div className="flex items-center justify-center gap-2 py-6 text-[12.5px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {t('remotePreview.scanning')}
              </div>
            ) : ports.length === 0 ? (
              <p className="px-1 py-5 text-center text-[12.5px] text-muted-foreground">
                {t('remotePreview.none')}
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {ports.map((p) => (
                  <li key={p.port}>
                    <button
                      type="button"
                      onClick={() => open(p.port)}
                      disabled={busy !== 0}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors hover:border-primary hover:bg-muted disabled:pointer-events-none disabled:opacity-60',
                      )}
                    >
                      <span className="w-14 shrink-0 font-mono text-[13px] font-semibold tabular-nums">
                        {p.port}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
                        {p.proc || t('remotePreview.unknown_proc')}
                      </span>
                      {p.loopback && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                          {t('remotePreview.loopback')}
                        </span>
                      )}
                      {busy === p.port && (
                        <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
            {t('remotePreview.manual')}
          </label>
          <div className="flex items-center gap-2">
            <Input
              value={manual}
              inputMode="numeric"
              onChange={(e) => setManual(e.target.value.replace(/\D/g, '').slice(0, 5))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') open(manual);
              }}
              placeholder="3000"
              className="h-8 w-28 font-mono text-xs"
            />
            <Button size="sm" disabled={!manual || busy !== 0} onClick={() => open(manual)}>
              {t('remotePreview.open')}
            </Button>
          </div>
        </div>

        {err && <p className="text-[12px] leading-relaxed text-red-500">{err}</p>}
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          {t('remotePreview.hint')}
        </p>
      </div>
    </div>
  );
}
