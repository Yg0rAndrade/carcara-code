// Aba "Gerenciar IAs": lista as CLIs de IA (instalada/versão/update) e roda
// instalação/atualização pelo instalador oficial, com um xterm ao vivo à direita.
// Reaproveita os canais aiInstall:* do main (PTY real). Ver
// docs/superpowers/specs/2026-07-10-gestao-clis-ia-design.md.
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Loader2, MoreVertical } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { CliBadge, OPT } from '@/lib/aiOptions.jsx';
import { AiManagerSkeleton } from './AiManagerSkeleton.jsx';
import { cn } from '@/lib/utils';

const LABEL = (key) => OPT[key]?.label ?? key;
const keep = (r) => r.key !== 'custom' && r.key !== 'shell'; // custom/shell não são instaláveis

// Menu ⋮ por linha (sem lib de dropdown no projeto — hand-rolled mínimo). Portal +
// posição fixa pra não ser cortado pelo `overflow-auto` da lista. Fecha ao clicar fora
// ou Esc; o menu para o mousedown de fechar (senão o clique fecharia antes do onClick).
function KebabMenu({ disabled, items, label }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (btnRef.current && !btnRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen((o) => !o);
  };
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
      >
        <MoreVertical className="size-4" />
      </button>
      {open && pos
        ? createPortal(
            <div
              role="menu"
              onMouseDown={(e) => e.stopPropagation()}
              style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 60 }}
              className="min-w-[150px] overflow-hidden rounded-md border bg-background py-1 shadow-lg"
            >
              {items.map((it) => (
                <button
                  key={it.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    it.onClick();
                  }}
                  className={cn(
                    'block w-full px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-muted',
                    it.danger && 'text-destructive',
                  )}
                >
                  {it.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export default function AiManager({ initialInstallKey = null }) {
  const t = useT();
  const [rows, setRows] = useState([]); // status por CLI
  const [probed, setProbed] = useState(false); // 1ª detecção respondeu (fim do esqueleto)
  const [busy, setBusy] = useState(null); // key em instalação/atualização
  const [busyMode, setBusyMode] = useState(null); // 'install' | 'update' | 'uninstall' — rótulo/fluxo
  const [installId, setInstallId] = useState(null);
  const [guides, setGuides] = useState({}); // key -> descritor uninstall (do catálogo)
  const [uninstall, setUninstall] = useState(null); // { key, note, kind, run, bin } — painel aberto
  const isWin = window.api.platform === 'win32';
  const termHostRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  // O listener de teclado do xterm é registrado uma vez (efeito de montagem); usamos um ref
  // pra sempre encaminhar pro installId mais recente, sem precisar recriar o terminal.
  const installIdRef = useRef(null);
  installIdRef.current = installId;

  const refresh = useCallback(async () => {
    // Fase 1 (rápida, só detecção local): renderiza a lista NA HORA. Cada linha entra
    // como `checking:true` — a área de status mostra "verificando…" até a fase 2.
    try {
      const det = await window.api.aiDetected();
      setRows(det.filter(keep).map((r) => ({ ...r, checking: true })));
    } catch {
      setRows([]);
    }
    // A fase 1 respondeu (mesmo que vazia): sai do esqueleto. Sem este marcador, uma
    // detecção que falha deixaria o esqueleto pulsando pra sempre.
    setProbed(true);
    // Fase 2 (lenta, com rede): force=true fura o cache de 24h de versão pra refletir o
    // "latest" fresco e preencher latest/updateAvailable. A lista já está visível.
    try {
      const s = await window.api.aiStatus(true);
      setRows(s.filter(keep).map((r) => ({ ...r, checking: false })));
    } catch {
      // Rede caiu: mantém as linhas da fase 1, só encerra o "verificando…".
      setRows((prev) => prev.map((r) => ({ ...r, checking: false })));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Descritores de desinstalação (kind/run/note por CLI) vêm do catálogo — carregados
  // uma vez; o painel "Desinstalar" os consulta pela key da linha.
  useEffect(() => {
    let alive = true;
    window.api
      .aiCatalog()
      .then((cat) => {
        if (!alive) return;
        const m = {};
        for (const e of cat || []) if (e.uninstall) m[e.key] = e.uninstall;
        setGuides(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Abre o painel guiado: pega o descritor do catálogo e (p/ kind 'command') resolve o
  // caminho do binário, pra oferecer remoção manual quando o método oficial não cobrir.
  const openUninstall = useCallback(
    async (key) => {
      const g = guides[key];
      if (!g) return;
      setUninstall({ key, kind: g.kind, run: g.run || null, note_key: g.note_key, bin: null });
      if (g.kind === 'command') {
        try {
          const bin = await window.api.whichBin(key);
          setUninstall((u) => (u && u.key === key ? { ...u, bin } : u));
        } catch {
          /* sem caminho: a linha "Binário em:" simplesmente não aparece */
        }
      }
    },
    [guides],
  );

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
    termRef.current = term;
    fitRef.current = fit;
    // Mede só depois do layout assentar (modal/sub-aba podem não ter estabilizado
    // ainda no momento do mount), igual ao ShellView.
    requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {}
    });
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
    // Backstop pra mudanças internas de layout (abrir modal, trocar sub-aba) que
    // não disparam o resize do window, igual ao ShellView.
    const ro = new ResizeObserver(onResize);
    ro.observe(termHostRef.current);
    return () => {
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, []);

  // eventos de stream/fim
  useEffect(() => {
    // Só roda uma instalação por vez (guard do `busy`), então não há stream concorrente
    // a diferenciar aqui. Filtrar por `installId` deixaria de fora o eco "$ <comando>" —
    // ele chega antes de setInstallId(id) commitar, com installId ainda null.
    const offData = window.api.on('aiInstall:data', ({ data }) => {
      if (termRef.current) termRef.current.write(data);
    });
    const offDone = window.api.on('aiInstall:done', async ({ installId: id, ok, error }) => {
      if (id !== installId) return;
      const key = busy;
      const label = LABEL(key);
      const term = termRef.current;
      // Falha real (kill do usuário não traz error → sem linha vermelha).
      if (term && !ok && error) term.write(`\r\n\x1b[31m${error}\x1b[0m\r\n`);
      // Mensagem HONESTA: re-checa a realidade (fura o cache) ANTES de decidir. Instaladores
      // que se auto-atualizam em background podem terminar sem mudar a versão — nesse caso
      // NÃO afirmamos sucesso verde.
      let fresh = [];
      try {
        fresh = (await window.api.aiStatus(true)).filter(keep);
      } catch {
        /* rede caiu: sem re-check, cai fora do bloco de mensagem */
      }
      const row = fresh.find((r) => r.key === key);
      if (busyMode === 'uninstall' && term && row) {
        // Mensagem HONESTA de desinstalação: baseada na realidade re-checada, não no
        // exit code (o kill do usuário ou uma remoção parcial não devem afirmar sucesso).
        if (!row.installed) {
          term.write(`\r\n\x1b[32m✓ ${t('settings.aiDoneUninstalled', { label })}\x1b[0m\r\n`);
        } else {
          term.write(`\r\n\x1b[33m⚠ ${t('settings.aiStillInstalled', { label })}\x1b[0m\r\n`);
        }
      } else if (ok && term && row) {
        if (row.installed && !row.updateAvailable) {
          term.write(
            `\r\n\x1b[32m✓ ${t('settings.aiDoneUpdated', { label, v: row.version })}\x1b[0m\r\n`,
          );
        } else if (row.updateAvailable) {
          term.write(
            `\r\n\x1b[33m⚠ ${t('settings.aiDoneNoChange', { label, v: row.version })}\x1b[0m\r\n`,
          );
        }
      }
      if (fresh.length) setRows(fresh.map((r) => ({ ...r, checking: false })));
      setBusy(null);
      setBusyMode(null);
      setInstallId(null);
    });
    return () => {
      offData && offData();
      offDone && offDone();
    };
  }, [installId, busy, busyMode, t]);

  // Encerra o instalador travado (prompt interativo / CLI aberta). Mata o PTY → o main
  // dispara aiInstall:done (ok:false, sem error → sem linha vermelha) e o busy limpa.
  const stop = useCallback(() => {
    const id = installIdRef.current;
    if (!id) return;
    window.api.aiInstallCancel(id);
    if (termRef.current) termRef.current.write('\r\n\x1b[2mEncerrado.\x1b[0m\r\n');
  }, []);

  // Limpa a tela do terminal (reset visual). Não mata a instalação em andamento — só
  // apaga o histórico exibido, útil quando o instalador cuspiu muito ruído.
  const clearTerm = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    term.reset();
    // Se há um PTY vivo, devolve o foco pra digitação continuar imediatamente.
    if (installIdRef.current) term.focus();
  }, []);

  const start = useCallback(
    async (key, mode) => {
      if (busy) return;
      setBusy(key);
      setBusyMode(mode);
      if (termRef.current) {
        termRef.current.clear();
        // Foca já: o instalador é um TTY real e pode perguntar (y/n, senha) logo de cara —
        // o usuário digita direto no terminal sem precisar clicar antes.
        termRef.current.focus();
      }
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

  const closeUninstall = useCallback(() => setUninstall(null), []);
  const runUninstall = useCallback(
    (key) => {
      const label = LABEL(key);
      if (!window.confirm(t('settings.aiUninstallConfirm', { label }))) return;
      setUninstall(null);
      start(key, 'uninstall');
    },
    [t, start],
  );

  // Antes da 1ª resposta do `aiDetected` não há linha nenhuma pra mostrar: sem isto a aba
  // ficava em branco e o conteúdo aparecia de uma vez. Mesmo esqueleto do Suspense.
  if (!probed) return <AiManagerSkeleton />;

  return (
    <div className="relative flex h-[300px] gap-4">
      {/* Lista */}
      <div className="w-[46%] shrink-0 space-y-2 overflow-auto">
        {rows.map((r) => {
          const installing = busy === r.key;
          return (
            <div
              key={r.key}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-3',
                installing && 'border-primary ring-1 ring-primary',
              )}
            >
              {/* Só a identidade + status esmaecem quando não instalada. O botão de ação
                  fica FORA deste bloco: grayscale/opacity herdam pros filhos e faziam o
                  "Instalar" perder o laranja e parecer desligado (cinza). */}
              <div
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-3',
                  !r.installed && 'opacity-60 grayscale',
                )}
              >
                <CliBadge optKey={r.key} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{LABEL(r.key)}</div>
                  <div className="text-xs text-muted-foreground">
                    {installing ? (
                      busyMode === 'update' ? (
                        t('settings.aiUpdating')
                      ) : (
                        t('settings.aiInstalling')
                      )
                    ) : !r.installed ? (
                      t('settings.aiNotInstalled')
                    ) : r.checking ? (
                      // Fase 1 (ai:detected): sabemos instalada+versão, mas ainda não o "latest".
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="size-3 animate-spin" />
                        {t('settings.aiChecking')}
                      </span>
                    ) : r.updateAvailable ? (
                      t('settings.aiUpdateAvailable', { v: r.latest })
                    ) : (
                      t('settings.aiUpToDate', { v: r.version })
                    )}
                  </div>
                </div>
              </div>
              {installing ? (
                // Ocupada: spinner + rótulo, desabilitada.
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[13px] text-muted-foreground opacity-70"
                >
                  <Loader2 className="size-3.5 animate-spin" />
                  {busyMode === 'update'
                    ? t('settings.aiUpdating')
                    : busyMode === 'uninstall'
                      ? t('settings.aiUninstall')
                      : t('settings.aiInstalling')}
                </button>
              ) : !r.installed ? (
                // Não instalada: "Instalar" NA HORA (já sabemos pela detecção local — não
                // espera a checagem de rede). Fica desabilitado só se a CLI não é instalável.
                <button
                  type="button"
                  disabled={!!busy || !r.installable}
                  onClick={() => start(r.key, 'install')}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[13px] font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-40"
                >
                  {t('settings.aiInstall')}
                </button>
              ) : (
                // Instalada: ação principal (Atualizar só quando há update) + menu ⋮
                // (Reinstalar / Desinstalar). Durante a fase 1 (checking) o update ainda
                // é desconhecido → só o ⋮; o "Atualizar" gritante surge no ai:status.
                <div className="flex items-center gap-1">
                  {!r.checking && r.updateAvailable ? (
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => start(r.key, 'update')}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[13px] font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-40"
                    >
                      {t('settings.aiUpdate')}
                    </button>
                  ) : null}
                  <KebabMenu
                    disabled={!!busy}
                    label={LABEL(r.key)}
                    items={[
                      ...(r.installable
                        ? [
                            {
                              label: t('settings.aiReinstall'),
                              onClick: () => start(r.key, 'install'),
                            },
                          ]
                        : []),
                      ...(guides[r.key]
                        ? [
                            {
                              label: t('settings.aiUninstall'),
                              danger: true,
                              onClick: () => openUninstall(r.key),
                            },
                          ]
                        : []),
                    ]}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* Coluna do terminal ao vivo — altura fixa (~300px) pra não esticar o modal inteiro. */}
      <div className="flex h-full flex-1 flex-col gap-1.5 overflow-hidden">
        {/* Aviso persistente: o PTY é um TTY real; alguns instaladores perguntam ou abrem
            a CLI e nunca saem. O usuário responde no terminal ou clica Encerrar. */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] leading-tight text-muted-foreground">
            {t('settings.aiInstallHint')}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={clearTerm}
              className="rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t('settings.aiTerminalClear')}
            </button>
            {busy && installId ? (
              <button
                type="button"
                onClick={stop}
                className="rounded-md border border-destructive/60 px-2 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10"
              >
                {t('settings.aiInstallStop')}
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex-1 overflow-hidden rounded-lg border bg-[#0d0f12]">
          {/* Clicar em qualquer lugar (inclusive no padding) foca o terminal pra digitar. */}
          <div
            ref={termHostRef}
            onMouseDown={() => termRef.current?.focus()}
            className="h-full w-full p-2"
          />
        </div>
      </div>

      {/* Painel "Desinstalar" GUIADO (por CLI): método oficial quando existe, senão
          instruções. Nunca apagamos arquivos — só mostramos/rodamos o comando reversível
          (após confirm) ou delegamos pros "Apps" do Windows (agy). Estilo do modal de
          confirmação de instalação (overlay sobre a aba). */}
      {uninstall ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center rounded-lg bg-black/55">
          <div className="w-[380px] max-w-[92%] rounded-2xl border border-primary/30 bg-background p-5 shadow-xl">
            <div className="mb-3 flex items-center gap-2.5">
              <CliBadge optKey={uninstall.key} />
              <div className="text-sm font-semibold">
                {t('settings.aiUninstallTitle', { label: LABEL(uninstall.key) })}
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{t(uninstall.note_key)}</p>

            {uninstall.kind === 'command' ? (
              <>
                <div className="mt-3 flex items-center gap-2">
                  <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md border bg-muted/50 px-2.5 py-1.5 font-mono text-[12px]">
                    {uninstall.run}
                  </code>
                  <button
                    type="button"
                    onClick={() => window.api.copyText(uninstall.run)}
                    className="shrink-0 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {t('settings.aiCopy')}
                  </button>
                </div>
                {uninstall.bin ? (
                  <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
                    {t('settings.aiBinaryAt', { path: uninstall.bin })}
                  </p>
                ) : null}
              </>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeUninstall}
                className="rounded-md px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {t('settings.aiClose')}
              </button>
              {uninstall.kind === 'command' ? (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => runUninstall(uninstall.key)}
                  className="rounded-md border border-destructive/60 px-3 py-1.5 text-[13px] text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
                >
                  {t('settings.aiRunInTerminal')}
                </button>
              ) : isWin ? (
                <button
                  type="button"
                  onClick={() => window.api.openExternal('ms-settings:appsfeatures')}
                  className="rounded-md border border-primary px-3 py-1.5 text-[13px] text-primary transition-colors hover:bg-primary/10"
                >
                  {t('settings.aiOpenWindowsApps')}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
