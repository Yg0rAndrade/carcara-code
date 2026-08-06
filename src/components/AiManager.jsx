// Aba "Gerenciar IAs": lista as CLIs (instalada/versão/update) e, para a selecionada,
// MOSTRA o comando oficial ao lado de um terminal de verdade.
//
// O app não instala nada sozinho (mudou na 0.1.11). O botão antigo rodava o instalador
// do fornecedor num PTY próprio e falhava calado — travando em "Instalando…" para
// sempre quando o interpretador não existia na máquina. Ver
// docs/2026-08-06-gerenciar-ias-diagnostico-e-plano.md. Agora o fluxo é: leia o
// comando, edite se quiser, cole no terminal, aperte Enter, acompanhe. Um comando
// desatualizado vira algo que o usuário conserta na hora — não um botão quebrado.
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Loader2, MoreVertical, ExternalLink, RefreshCw } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme.jsx';
import { CliBadge, OPT } from '@/lib/aiOptions.jsx';
import { AiManagerSkeleton } from './AiManagerSkeleton.jsx';
import { TERM_THEMES, baseTerminalOptions, attachCopyPaste } from '@/lib/xtermShared';
import { cn } from '@/lib/utils';

const LABEL = (key) => OPT[key]?.label ?? key;
const keep = (r) => r.key !== 'custom' && r.key !== 'shell'; // custom/shell não são CLIs

// Menu ⋮ por linha (sem lib de dropdown no projeto — hand-rolled mínimo). Portal +
// posição fixa pra não ser cortado pelo `overflow-auto` da lista. Fecha ao clicar fora
// ou Esc; o menu para o mousedown de fechar (senão o clique fecharia antes do onClick).
function KebabMenu({ items, label }) {
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
  const toggle = (e) => {
    e.stopPropagation();
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
        onClick={toggle}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
  const [cat, setCat] = useState({}); // key -> entrada do catálogo (receita + guia)
  const [sel, setSel] = useState(initialInstallKey); // CLI selecionada
  const [action, setAction] = useState('install'); // 'install' | 'update' | 'uninstall'
  const [edits, setEdits] = useState({}); // `${key}:${action}:${i}` -> comando editado
  const [consoleErr, setConsoleErr] = useState(null);
  const [rechecking, setRechecking] = useState(false);
  const [copied, setCopied] = useState(null); // id do passo copiado (feedback do botão)
  const isWin = window.api.platform === 'win32';
  const termRef = useRef(null);
  const fitRef = useRef(null);
  // O terminal é criado uma vez (ref-callback) e captura o tema do momento; o ref
  // mantém o valor atual pra criação, e o efeito abaixo repinta os já abertos.
  const { terminalTheme } = useTheme();
  const themeRef = useRef(terminalTheme);
  useEffect(() => {
    themeRef.current = terminalTheme;
    if (termRef.current) termRef.current.options.theme = TERM_THEMES[terminalTheme];
  }, [terminalTheme]);

  const refresh = useCallback(async (force = false) => {
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
    // Fase 2 (lenta, com rede): preenche latest/updateAvailable. A lista já está visível.
    try {
      const s = await window.api.aiStatus(force);
      setRows(s.filter(keep).map((r) => ({ ...r, checking: false })));
    } catch {
      // Rede caiu: mantém as linhas da fase 1, só encerra o "verificando…".
      setRows((prev) => prev.map((r) => ({ ...r, checking: false })));
    }
  }, []);

  useEffect(() => {
    refresh(true);
  }, [refresh]);

  // Catálogo: receita (comandos + doc oficial) e guia de desinstalação por CLI.
  useEffect(() => {
    let alive = true;
    window.api
      .aiCatalog()
      .then((list) => {
        if (!alive) return;
        const m = {};
        for (const e of list || []) m[e.key] = e;
        setCat(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Seleciona a 1ª CLI assim que a lista chega, pra o painel nunca ficar vazio.
  useEffect(() => {
    if (!sel && rows.length) setSel(rows[0].key);
  }, [rows, sel]);

  // Ação padrão ao trocar de CLI: quem já está instalada cai em "atualizar".
  const selRow = rows.find((r) => r.key === sel) || null;
  useEffect(() => {
    if (selRow) setAction(selRow.installed ? 'update' : 'install');
  }, [sel, selRow?.installed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Terminal: um shell COMUM na pasta do usuário, criado quando o elemento host entra
  // no DOM e mantido vivo enquanto a aba estiver aberta.
  //
  // É um REF-CALLBACK (React 19 aceita cleanup no retorno), não um `useEffect([])`, e a
  // diferença não é estilo: com efeito de deps vazias o terminal nunca nascia. No 1º
  // render `probed` é false, a tela devolve o esqueleto, o host não existe, o efeito
  // desistia no `if (!ref.current)` — e, com deps `[]`, não rodava de novo quando
  // o host aparecia. Resultado: PTY nenhum, e "Colar no terminal" escrevia no vazio
  // (medido: nenhum cmd.exe filho do app). O ref-callback dispara pelo DOM, então não
  // existe ordem de render que o fure.
  const attachTerm = useCallback((node) => {
    if (!node || termRef.current) return;
    // Terminal COMPLETO, igual ao livre do projeto: mesma paleta por tema, mesmo
    // Ctrl+C/Ctrl+V (módulo compartilhado), scrollback e links clicáveis. Dá pra colar
    // o comando com Ctrl+V e rodar qualquer outra coisa — não é um visor de saída.
    const term = new Terminal(baseTerminalOptions(themeRef.current));
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon((e, uri) => window.api.openExternal(uri)));
    attachCopyPaste(term);
    term.open(node);
    termRef.current = term;
    fitRef.current = fit;
    term.onData((d) => window.api.aiConsoleInput(d));
    const offData = window.api.on('aiConsole:data', ({ data }) => term.write(data));

    // Mede só depois do layout assentar (modal/sub-aba podem não ter estabilizado
    // ainda no momento do mount), igual ao ShellView.
    requestAnimationFrame(async () => {
      try {
        fit.fit();
      } catch {}
      const res = await window.api.aiConsoleEnsure(term.cols || 80, term.rows || 24);
      // O erro vem no RETORNO (não por evento): o construtor do PTY lança síncrono
      // quando o shell não existe, e por evento isso corria com o estado do React.
      if (res?.error) setConsoleErr(res.error);
      else if (res?.buffer) term.write(res.buffer);
    });

    const onResize = () => {
      try {
        fit.fit();
        window.api.aiConsoleResize(term.cols, term.rows);
      } catch {}
    };
    window.addEventListener('resize', onResize);
    // Backstop pra mudanças internas de layout (abrir modal, trocar sub-aba) que
    // não disparam o resize do window, igual ao ShellView.
    const ro = new ResizeObserver(onResize);
    ro.observe(node);
    return () => {
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      offData && offData();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // Passos da receita da ação atual, já com as edições do usuário aplicadas.
  const steps = useMemo(() => {
    const e = cat[sel];
    if (!e) return [];
    const base =
      action === 'uninstall'
        ? e.uninstall && e.uninstall.kind === 'command'
          ? [e.uninstall.run]
          : []
        : action === 'update'
          ? e.update
          : e.install;
    return (base || []).map((cmd, i) => {
      const id = `${sel}:${action}:${i}`;
      return { id, cmd: edits[id] !== undefined ? edits[id] : cmd };
    });
  }, [cat, sel, action, edits]);

  // Escreve a linha no terminal SEM Enter: o usuário confere e confirma. É o passo
  // que devolve o controle pra ele — nada roda sem alguém ter lido.
  const paste = useCallback((cmd) => {
    const term = termRef.current;
    if (!term) return;
    window.api.aiConsoleInput(cmd);
    term.focus();
  }, []);

  // "Copiar" sem retorno visual parece botão quebrado — foi reportado exatamente assim.
  const copy = useCallback((id, cmd) => {
    window.api.copyText(cmd);
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
  }, []);

  const clearTerm = useCallback(() => {
    termRef.current?.reset();
    termRef.current?.focus();
  }, []);

  const recheck = useCallback(async () => {
    setRechecking(true);
    await refresh(true);
    setRechecking(false);
  }, [refresh]);

  // Antes da 1ª resposta do `aiDetected` não há linha nenhuma pra mostrar: sem isto a aba
  // ficava em branco e o conteúdo aparecia de uma vez. Mesmo esqueleto do Suspense.
  if (!probed) return <AiManagerSkeleton />;

  const entry = cat[sel] || null;
  const titleKey =
    action === 'uninstall'
      ? 'settings.aiRecipeTitleUninstall'
      : action === 'update'
        ? 'settings.aiRecipeTitleUpdate'
        : 'settings.aiRecipeTitleInstall';
  const noteKey =
    action === 'uninstall' ? entry?.uninstall?.note_key || null : entry?.note_key || null;

  return (
    <div className="flex h-[420px] gap-4">
      {/* Lista de CLIs — selecionar troca a receita ao lado. */}
      <div className="w-[38%] shrink-0 space-y-2 overflow-auto">
        {rows.map((r) => (
          <div
            key={r.key}
            role="button"
            tabIndex={0}
            onClick={() => setSel(r.key)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSel(r.key)}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
              sel === r.key ? 'border-primary ring-1 ring-primary' : 'hover:bg-muted/50',
            )}
          >
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
                  {!r.installed ? (
                    t('settings.aiNotInstalled')
                  ) : r.checking ? (
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
            <KebabMenu
              label={LABEL(r.key)}
              items={[
                {
                  label: t('settings.aiInstall'),
                  onClick: () => {
                    setSel(r.key);
                    setAction('install');
                  },
                },
                {
                  label: t('settings.aiUpdate'),
                  onClick: () => {
                    setSel(r.key);
                    setAction('update');
                  },
                },
                {
                  label: t('settings.aiUninstall'),
                  danger: true,
                  onClick: () => {
                    setSel(r.key);
                    setAction('uninstall');
                  },
                },
              ]}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={recheck}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RefreshCw className={cn('size-3.5', rechecking && 'animate-spin')} />
          {t('settings.aiRecheck')}
        </button>
      </div>

      {/* Receita + terminal */}
      <div className="flex h-full flex-1 flex-col gap-2 overflow-hidden">
        {entry ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-sm font-semibold">{t(titleKey, { label: LABEL(sel) })}</div>
              {entry.docs ? (
                <button
                  type="button"
                  onClick={() => window.api.openExternal(entry.docs)}
                  className="inline-flex shrink-0 items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <ExternalLink className="size-3" />
                  {t('settings.aiOfficialDocs')}
                </button>
              ) : null}
            </div>

            {noteKey ? (
              <p className="text-[11px] leading-snug text-muted-foreground">{t(noteKey)}</p>
            ) : null}

            {/* Antigravity no Windows não tem comando de remoção: delega pros "Apps". */}
            {action === 'uninstall' && entry.uninstall?.kind === 'os-apps' ? (
              isWin ? (
                <button
                  type="button"
                  onClick={() => window.api.openExternal('ms-settings:appsfeatures')}
                  className="self-start rounded-md border border-primary px-3 py-1.5 text-[13px] text-primary transition-colors hover:bg-primary/10"
                >
                  {t('settings.aiOpenWindowsApps')}
                </button>
              ) : null
            ) : (
              <>
                {steps.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-1.5">
                    {steps.length > 1 ? (
                      <span className="w-4 shrink-0 text-center font-mono text-[11px] text-muted-foreground">
                        {i + 1}
                      </span>
                    ) : null}
                    {/* Editável de propósito: se o fornecedor mudar o instalador, o
                        usuário ajusta a linha aqui em vez de esperar uma release nossa. */}
                    <input
                      value={s.cmd}
                      onChange={(e) => setEdits((p) => ({ ...p, [s.id]: e.target.value }))}
                      spellCheck={false}
                      aria-label={t(titleKey, { label: LABEL(sel) })}
                      className="min-w-0 flex-1 rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-primary"
                    />
                    {/* Copiar sem retorno visual parece botão quebrado (foi reportado
                        exatamente assim). O rótulo vira "Copiado!" por 1,5 s. */}
                    <button
                      type="button"
                      onClick={() => copy(s.id, s.cmd)}
                      className="w-[76px] shrink-0 rounded-md border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {copied === s.id ? t('settings.aiCopied') : t('settings.aiCopy')}
                    </button>
                    <button
                      type="button"
                      onClick={() => paste(s.cmd)}
                      className="shrink-0 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:opacity-90"
                    >
                      {t('settings.aiPaste')}
                    </button>
                  </div>
                ))}
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {t('settings.aiRecipeHint')}
                </p>
              </>
            )}
          </>
        ) : null}

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="truncate text-[11px] text-muted-foreground">
            {consoleErr ? t('settings.aiConsoleError', { err: consoleErr }) : null}
          </span>
          <button
            type="button"
            onClick={clearTerm}
            className="shrink-0 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {t('settings.aiTerminalClear')}
          </button>
        </div>
        {/* Terminal livre: ocupa todo o espaço que sobra (mín. 160px). Dá pra digitar,
            colar com Ctrl+V e rodar qualquer comando — não só o da receita. */}
        <div
          className="min-h-[160px] flex-1 overflow-hidden rounded-lg border"
          style={{ background: TERM_THEMES[terminalTheme].background }}
        >
          {/* Clicar em qualquer lugar (inclusive no padding) foca o terminal pra digitar. */}
          <div
            ref={attachTerm}
            onMouseDown={() => termRef.current?.focus()}
            className="h-full w-full p-2"
          />
        </div>
      </div>
    </div>
  );
}
