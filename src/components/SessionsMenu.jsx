// Menu discreto das sessões do projeto, no cabeçalho do chat (à esquerda do "Reiniciar").
// Fechar todas derruba o que estiver rodando, então confirma num modal com a lista das abas.
import { useState } from 'react';
import { Ellipsis } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { CloseSessionsModal } from './CloseSessionsModal.jsx';

export function SessionsMenu({ controlsRef }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [confirmNames, setConfirmNames] = useState(null); // nomes no modal, ou null
  const count = open ? controlsRef.current?.sessionCount?.() || 0 : 0;

  const close = () => setOpen(false);
  const onCloseAll = () => {
    close();
    setConfirmNames(controlsRef.current?.sessionNames?.() || []);
  };
  const confirmCloseAll = () => {
    setConfirmNames(null);
    controlsRef.current?.closeAllSessions?.();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        title={t('session.menu')}
        aria-label={t('session.menu')}
        aria-expanded={open}
        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-[15px]"
      >
        <Ellipsis />
      </button>
      {open && (
        <>
          {/* Camada invisível que fecha o menu ao clicar fora. */}
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] overflow-hidden rounded-md border border-border bg-popover py-1 text-[13px] text-popover-foreground shadow-lg">
            <button
              type="button"
              disabled={count < 2}
              onClick={onCloseAll}
              className="flex w-full items-center whitespace-nowrap px-3 py-1.5 text-left hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            >
              {t('session.close_all')}
            </button>
          </div>
        </>
      )}
      <CloseSessionsModal
        names={confirmNames}
        onConfirm={confirmCloseAll}
        onClose={() => setConfirmNames(null)}
      />
    </div>
  );
}
