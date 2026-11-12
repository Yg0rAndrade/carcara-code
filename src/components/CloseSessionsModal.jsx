// Modal central que confirma fechar várias sessões de uma vez ("fechar todas" e
// "fechar todas as outras"). Lista os nomes das abas que vão cair, porque fechar
// derruba o que estiver rodando nelas. O botão de fechar já nasce focado (Enter
// confirma, e o foco sai do terminal); Esc/clique fora/Cancelar fecha.
import { useEffect } from 'react';
import { MessagesSquare } from 'lucide-react';
import { useT } from '@/lib/i18n';

export function CloseSessionsModal({ names, onConfirm, onClose }) {
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
        className="w-[360px] max-w-[90vw] rounded-xl border bg-background p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-sm font-semibold">
          {t('session.close_confirm_title', { count: names.length })}
        </div>
        <p className="mb-3 text-[13px] text-muted-foreground">{t('session.close_confirm_body')}</p>
        <ul className="mb-4 max-h-56 overflow-y-auto rounded-md border bg-card py-1">
          {names.map((name, i) => (
            <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
              <MessagesSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
