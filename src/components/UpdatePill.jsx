import { Download, RefreshCw, RotateCcw, X } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { updateView } from '@/lib/updateView';

// Pílula discreta no canto inferior esquerdo: aviso → barra de download → reiniciar.
export function UpdatePill({ update, onDownload, onInstall, onRetry, onDismiss }) {
  const t = useT();
  const v = updateView(update, t);
  if (!v.visible) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 w-72 rounded-xl border bg-card p-3 shadow-lg">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-foreground">{v.title}</div>
          {v.showProgress && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${v.percent}%` }} />
            </div>
          )}
          <div className="mt-2.5 flex gap-2">
            {v.action === 'download' && (
              <button onClick={onDownload} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 [&_svg]:size-3.5">
                <Download />{t('update.downloadBtn')}
              </button>
            )}
            {v.action === 'install' && (
              <button onClick={onInstall} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 [&_svg]:size-3.5">
                <RefreshCw />{t('update.installBtn')}
              </button>
            )}
            {v.action === 'retry' && (
              <button onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted [&_svg]:size-3.5">
                <RotateCcw />{t('update.retryBtn')}
              </button>
            )}
          </div>
        </div>
        <button onClick={onDismiss} title={t('update.dismiss')} className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-3.5">
          <X />
        </button>
      </div>
    </div>
  );
}
