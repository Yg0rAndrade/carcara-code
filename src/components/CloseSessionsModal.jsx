// Modal central que confirma fechar várias sessões de uma vez ("fechar todas" e
// "fechar todas as outras"). Lista os nomes das abas que vão cair, porque fechar
// derruba o que estiver rodando nelas. O botão de fechar já nasce focado (Enter
// confirma, e o foco sai do terminal); Esc/clique fora/Cancelar fecha.
import { useEffect } from 'react';
import { CircleCheck, MessagesSquare, X } from 'lucide-react';
import { useT } from '@/lib/i18n';

// keep: nome da aba que FICA aberta ("fechar todas as outras"); sem ela, fecha todas.
export function CloseSessionsModal({ names, keep, onConfirm, onClose }) {
  const t = useT();
  useEffect(() => {
    if (!names) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [names, onClose]);
  if (!names) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-[540px] max-w-[92vw] rounded-xl border bg-background p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-sm font-semibold">
          {t('session.close_confirm_title', { count: names.length })}
        </div>
        <p className="mb-3 text-[13px] text-muted-foreground">{t('session.close_confirm_body')}</p>
        {keep != null && (
          <>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('session.close_keep_label')}
            </div>
            <div className="mb-3 flex items-center gap-2 rounded-md border border-green-500/40 bg-green-500/10 px-3 py-2 text-[13px]">
              <CircleCheck className="h-3.5 w-3.5 shrink-0 text-success-ink" />
              <span className="truncate font-medium">{keep}</span>
            </div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('session.close_list_label')}
            </div>
          </>
        )}
        <ul className="mb-4 max-h-[min(60vh,520px)] overflow-y-auto rounded-md border bg-card py-1">
          {names.map((name, i) => (
            <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
              {keep != null ? (
                <X className="h-3.5 w-3.5 shrink-0 text-destructive-ink" />
              ) : (
                <MessagesSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">{name}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-muted"
          >
            {t('dialog.cancel')}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className="rounded-md bg-red-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-red-700"
          >
            {t('session.close_confirm_action')}
          </button>
        </div>
      </div>
    </div>
  );
}
