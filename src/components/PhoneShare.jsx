// "Abrir no celular": expõe o site do projeto na rede local (repasse no main,
// electron/lan-share.cjs) e mostra um QR Code pra escanear. Duas entradas pro MESMO
// estado (useLanShare): o botão da barra do Preview (abre um modal) e o card que
// aparece no espaço vazio ao lado da moldura de celular/tablet.
// O repasse desliga sozinho quando o servidor do projeto para ou o app fecha
// ('lan:stopped'); o botão fica aceso enquanto a rede estiver aberta.
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Wifi, WifiOff, Copy, Check, X } from 'lucide-react';
import { ToolButton } from './ui/tool-button.jsx';
import { useT } from '@/lib/i18n';
import { ShareLogs } from './ShareLogs.jsx';

// Estado do compartilhamento de UM projeto. `result`: { url } | { error } | null.
export function useLanShare(projectPath, url) {
  const [active, setActive] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const urlRef = useRef(url);
  urlRef.current = url;

  const start = async () => {
    if (!projectPath) return;
    setBusy(true);
    const r = await window.api.lanStart(projectPath, urlRef.current);
    setBusy(false);
    setResult(r);
    setActive(!!r?.url);
  };
  const stop = async () => {
    await window.api.lanStop(projectPath);
    setActive(false);
    setResult(null);
  };

  useEffect(() => {
    setActive(false);
    setResult(null);
    if (!projectPath) return;
    let alive = true;
    // Já estava aberto (ex.: voltou pra este projeto)? Recupera o endereço — o
    // lan:start é idempotente e devolve o mesmo repasse.
    window.api.lanStatus(projectPath).then((s) => {
      if (!alive || !s?.active) return;
      setActive(true);
      window.api.lanStart(projectPath, urlRef.current).then((r) => alive && setResult(r));
    });
    const off = window.api.on('lan:stopped', (e) => {
      if (e?.projectPath !== projectPath) return;
      setActive(false);
      setResult(null);
    });
    return () => {
      alive = false;
      off?.();
    };
  }, [projectPath]);

  return { projectPath, active, result, busy, start, stop };
}

// QR + endereço copiável + avisos. Usado no modal e no card.
function ShareDetails({ result, size }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  if (result?.error) {
    return (
      <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-[13px] text-red-500">
        {t('lan.error_' + result.error)}
      </p>
    );
  }
  if (!result?.url) return null;
  const copy = () => {
    navigator.clipboard.writeText(result.url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <>
      {/* Fundo branco fixo: QR escuro sobre claro é o que as câmeras leem melhor. */}
      <div className="mx-auto mb-3 w-fit rounded-lg bg-white p-3">
        <QRCodeSVG value={result.url} size={size} marginSize={0} />
      </div>
      <div className="mb-3 flex items-center gap-1 rounded-md border bg-card px-2 py-1.5">
        <span className="flex-1 truncate font-mono text-[12px]">{result.url}</span>
        <button
          type="button"
          onClick={copy}
          title={t('lan.copy')}
          className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-3.5"
        >
          {copied ? <Check /> : <Copy />}
        </button>
      </div>
      <p className="flex items-start gap-2 text-[13px]">
        <Wifi className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        {t('lan.same_wifi')}
      </p>
    </>
  );
}

// Botão da barra do Preview + modal.
export function PhoneShareButton({ share, disabled }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  // O repasse caiu (servidor parou) com o modal aberto: fecha.
  useEffect(() => {
    if (!share.active && !share.busy && !share.result) setOpen(false);
  }, [share.active, share.busy, share.result]);

  return (
    <>
      <ToolButton
        onClick={() => {
          setOpen(true);
          share.start();
        }}
        disabled={disabled || !share.projectPath}
        active={share.active}
        title={share.active ? t('lan.button_active') : t('lan.button')}
      >
        <QrCode />
      </ToolButton>
      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40"
          onMouseDown={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-[340px] max-w-[90vw] rounded-xl border bg-background p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <QrCode className="h-4 w-4 text-primary" />
              {t('lan.title')}
            </div>
            {share.busy && !share.result && (
              <div className="py-10 text-center text-[13px] text-muted-foreground">
                {t('lan.starting')}
              </div>
            )}
            <ShareDetails result={share.result} size={200} />
            {share.result?.url && (
              <p className="mt-1.5 text-[12px] text-muted-foreground">{t('lan.notice')}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              {share.active && (
                <button
                  type="button"
                  onClick={() => {
                    share.stop();
                    setOpen(false);
                  }}
                  className="mr-auto flex items-center gap-1.5 rounded-md border border-red-500/40 px-3 py-1.5 text-[13px] font-medium text-red-500 hover:bg-red-500/10 [&_svg]:size-3.5"
                >
                  <WifiOff />
                  {t('lan.stop')}
                </button>
              )}
              <button
                type="button"
                autoFocus
                onClick={() => setOpen(false)}
                className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:opacity-90"
              >
                {t('lan.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const CARD_MIN = 248;
const CARD_MAX = 340;
const SIDE_PAD = 24; // respiro entre a moldura do celular e o card (e até a borda)
const DISMISS_KEY = 'phoneShareCardDismissed';

// Card na área livre à direita da moldura de celular/tablet, centralizado nos dois
// eixos e crescendo com o espaço (até CARD_MAX). Os dois estados dividem o MESMO
// "lugar do QR": desligado, um quadro tracejado espera o código; ligado, o QR ocupa
// esse lugar — gerar só preenche o quadro, sem o card mudar de forma.
// Some se não couber, ou se o usuário fechou o convite (lembrado por aparelho;
// reaparece quando já está ligado).
// side: de que lado da moldura o card fica ('right' padrão; 'left' quando a lista de
// aparelhos ocupa a direita).
export function PhoneShareCard({ share, frameWidth, side = 'right' }) {
  const t = useT();
  const ref = useRef(null);
  const [cardW, setCardW] = useState(0); // 0 = não cabe
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const check = () => {
      const side = (parent.clientWidth - frameWidth) / 2 - SIDE_PAD * 2;
      setCardW(side >= CARD_MIN ? Math.min(CARD_MAX, side) : 0);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [frameWidth]);

  const on = share.active;
  const url = share.result?.url;
  const error = share.result?.error;
  const hidden = !cardW || (dismissed && !on);
  // QR quadrado preenchendo a largura útil do card (padding do card + moldura branca).
  const qr = Math.max(140, cardW - 40 - 24);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {}
  };
  const copy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      ref={ref}
      className={
        'pointer-events-none absolute inset-y-0 z-10 flex flex-col items-center justify-center gap-3 ' +
        (side === 'left' ? 'left-0' : 'right-0')
      }
      style={{
        [side === 'left' ? 'right' : 'left']: `calc(50% + ${frameWidth / 2}px)`,
        display: hidden ? 'none' : undefined,
      }}
    >
      <div
        className="pointer-events-auto relative rounded-2xl border bg-background/95 p-5 shadow-xl backdrop-blur"
        style={{ width: cardW || CARD_MIN }}
      >
        {!on && (
          <button
            type="button"
            onClick={dismiss}
            title={t('lan.close')}
            aria-label={t('lan.close')}
            className="absolute right-3 top-3 grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&_svg]:size-3.5"
          >
            <X />
          </button>
        )}

        {/* Cabeçalho: título no convite; selo "ao vivo" quando a rede está aberta. */}
        {on ? (
          <div className="mb-4 flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-500 opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2 rounded-full bg-green-500" />
            </span>
            <span className="text-[12px] font-medium text-green-500">{t('lan.status_on')}</span>
          </div>
        ) : (
          <div className="mb-4 pr-6">
            <div className="text-[15px] font-semibold leading-snug">{t('lan.card_title')}</div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              {t('lan.card_body')}
            </p>
          </div>
        )}

        {/* O lugar do QR: mesmo tamanho nos dois estados. */}
        <div
          className="mx-auto grid place-items-center rounded-xl"
          style={{ width: qr + 24, height: qr + 24 }}
        >
          {on && url ? (
            <div className="rounded-xl bg-white p-3">
              <QRCodeSVG value={url} size={qr} marginSize={0} />
            </div>
          ) : (
            <div className="grid size-full place-items-center rounded-xl border-2 border-dashed border-border text-muted-foreground/50">
              <QrCode className="size-16" strokeWidth={1.25} />
            </div>
          )}
        </div>

        {error && (
          <p className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 p-2.5 text-[12px] text-red-500">
            {t('lan.error_' + error)}
          </p>
        )}

        {on && url ? (
          <>
            <button
              type="button"
              onClick={copy}
              title={t('lan.copy')}
              className="mt-4 flex w-full items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="flex-1 truncate font-mono text-[12px]">
                {url.replace(/^https?:\/\//, '')}
              </span>
              <span className="text-muted-foreground [&_svg]:size-3.5">
                {copied ? <Check className="text-green-500" /> : <Copy />}
              </span>
            </button>
            <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground">
              <Wifi className="mt-0.5 size-3.5 shrink-0 text-primary" />
              {t('lan.same_wifi')}
            </p>
            <button
              type="button"
              onClick={share.stop}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/40 px-3 py-2 text-[13px] font-medium text-red-500 transition-colors hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 [&_svg]:size-4"
            >
              <WifiOff />
              {t('lan.stop')}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={share.start}
            disabled={share.busy}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60 [&_svg]:size-4"
          >
            <QrCode />
            {share.busy ? t('lan.starting') : t('lan.card_action')}
          </button>
        )}
      </div>
      {/* Logs do repasse (recolhido): só com a rede aberta. */}
      {on && <ShareLogs projectPath={share.projectPath} width={cardW || CARD_MIN} />}
    </div>
  );
}
