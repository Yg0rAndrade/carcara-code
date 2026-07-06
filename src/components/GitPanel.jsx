import { useCallback, useEffect, useState } from 'react';
import {
  GitBranch,
  ArrowUp,
  ArrowDown,
  Plus,
  Minus,
  Check,
  AlertTriangle,
  Copy,
  X,
} from 'lucide-react';
// Ícones animados (lucide-animated) usados nos botões da barra do Git.
import { GitBranchIcon } from './ui/git-branch.jsx';
import { ChevronDownIcon } from './ui/chevron-down.jsx';
import { ArrowDownIcon } from './ui/arrow-down.jsx';
import { ArrowUpIcon } from './ui/arrow-up.jsx';
import { RefreshCCWIcon } from './ui/refresh-ccw.jsx';
import { HoverIcon } from './ui/hover-icon.jsx';
import CodeMirror from '@uiw/react-codemirror';
import { vscodeLight, vscodeDark } from '@uiw/codemirror-theme-vscode';
import { EditorView } from '@codemirror/view';
import { StreamLanguage } from '@codemirror/language';
import { diff as diffMode } from '@codemirror/legacy-modes/mode/diff';
import { Button } from './ui/button.jsx';
import { Input } from './ui/input.jsx';
import { useTheme } from '@/lib/theme.jsx';
import { toast } from '@/lib/toast.js';
import { useT } from '@/lib/i18n';

const diffEditorTheme = EditorView.theme({
  '&': { fontSize: '12.5px', height: '100%' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace',
    lineHeight: '1.6',
  },
});

// Letra/cor/descrição do badge de status por código do git (M/A/D/R/U/?).
function statusBadge(code, t) {
  const map = {
    M: ['M', 'text-amber-500', t('git.status_modified')],
    A: ['A', 'text-emerald-500', t('git.status_added')],
    D: ['D', 'text-red-500', t('git.status_deleted')],
    R: ['R', 'text-blue-500', t('git.status_renamed')],
    C: ['C', 'text-blue-500', t('git.status_copied')],
    U: ['U', 'text-red-500', t('git.status_conflict')],
    '?': ['U', 'text-emerald-500', t('git.status_untracked')],
  };
  return map[code] || [code, 'text-muted-foreground', code];
}

function isStaged(f) {
  return f.index !== ' ' && f.index !== '?';
}
function isChanged(f) {
  return (f.working !== ' ' && f.working !== '?') || (f.index === '?' && f.working === '?');
}

function FileRow({ f, area, onClick, onAct, selected, t }) {
  const code = area === 'staged' ? f.index : f.index === '?' ? '?' : f.working;
  const [letter, color, label] = statusBadge(code, t);
  const name = f.path.includes(' -> ') ? f.path.split(' -> ').pop() : f.path;
  return (
    <div
      onClick={onClick}
      className={
        'group flex h-7 cursor-pointer items-center gap-2 rounded px-2 text-[13px] ' +
        (selected ? 'bg-muted' : 'hover:bg-muted/60')
      }
      title={f.path}
    >
      <span className="min-w-0 flex-1 truncate text-foreground/90">{name}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onAct();
        }}
        title={area === 'staged' ? t('git.unstage_file') : t('git.stage_file')}
        className="grid size-5 shrink-0 cursor-pointer place-items-center rounded text-muted-foreground/50 hover:bg-foreground/10 hover:text-foreground [&_svg]:size-3.5"
      >
        {area === 'staged' ? <Minus /> : <Plus />}
      </button>
      <span
        title={label}
        className={'w-3 shrink-0 text-center font-mono text-[12px] font-semibold ' + color}
      >
        {letter}
      </span>
    </div>
  );
}

export function GitPanel({ active, visible }) {
  const t = useT();
  const { theme } = useTheme();
  const projectPath = active?.path || null;
  const [status, setStatus] = useState(null); // resultado de git:status (ok/erro)
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null); // { path, staged, untracked }
  const [diffText, setDiffText] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(null); // texto da operação em curso
  const [notice, setNotice] = useState(null); // só erros { text }; o stderr é longo e copiável → fica inline no ErrorCard
  const [remoteUrl, setRemoteUrl] = useState('');
  const [publishOpen, setPublishOpen] = useState(false); // form "definir repositório" ao publicar sem remote
  const [branchMenu, setBranchMenu] = useState(null); // { all } quando aberto
  const [newBranch, setNewBranch] = useState('');

  const refresh = useCallback(
    async (silent) => {
      if (!projectPath) {
        setStatus(null);
        return;
      }
      if (!silent) setLoading(true);
      const res = await window.api.gitStatus(projectPath);
      setStatus(res);
      if (!silent) setLoading(false);
    },
    [projectPath],
  );

  // Recarrega ao abrir a aba / trocar de projeto.
  useEffect(() => {
    if (visible) refresh();
  }, [visible, refresh]);

  // Auto-refresh enquanto a aba está aberta: poll leve + ao voltar o foco da janela.
  // Assim as alterações feitas pelo Claude (no chat) aparecem sem clicar em atualizar.
  useEffect(() => {
    if (!visible || !projectPath) return;
    const id = setInterval(() => {
      if (!document.hidden) refresh(true);
    }, 4000);
    const onFocus = () => refresh(true);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [visible, projectPath, refresh]);

  // (Re)carrega o diff do arquivo selecionado. (Sem 'status' nas deps pra o poll
  // não recarregar o diff a cada 4s; ações que mexem no stage recarregam via refresh.)
  useEffect(() => {
    if (!selected || !projectPath) {
      setDiffText('');
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await window.api.gitDiff(
        projectPath,
        selected.path,
        selected.staged,
        selected.untracked,
      );
      if (!cancelled)
        setDiffText(res.ok ? res.diff || '(sem alterações de texto)' : 'Erro: ' + res.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [selected, projectPath]);

  const run = async (label, fn, okMsg) => {
    setBusy(label);
    setNotice(null);
    const res = await fn();
    setBusy(null);
    // Erro: fica inline no ErrorCard (stderr longo, copiável pro Claude).
    // Sucesso: vira toast — "avisos do sistema" falam a mesma língua no app.
    if (res && res.ok === false) setNotice({ text: res.error });
    else if (okMsg) toast.success(okMsg);
    await refresh();
    return res;
  };

  if (!projectPath) {
    return (
      <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-muted-foreground">
        {t('git.open_project')}
      </div>
    );
  }

  // Git não instalado na máquina: aviso amigável + botão pra baixar (comum em PC de não-dev).
  if (status && status.ok === false && status.gitMissing) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
        <GitBranch className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">{t('git.not_installed')}</p>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          {t('git.not_installed_help')}
        </p>
        <Button
          size="sm"
          onClick={() => window.api.openExternal('https://git-scm.com/download/win')}
        >
          {t('git.download_git')}
        </Button>
      </div>
    );
  }

  // Erro geral.
  if (status && status.ok === false) {
    return (
      <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-red-500">
        {t('git.git_error', { error: status.error })}
      </div>
    );
  }

  // Projeto ainda não é um repositório git.
  if (status && status.ok && status.isRepo === false) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
        <GitBranch className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t('git.not_repository')}</p>
        <Button
          size="sm"
          disabled={!!busy}
          onClick={() => run('init', () => window.api.gitInit(projectPath), t('git.toast_init'))}
        >
          {t('git.init_repository')}
        </Button>
        <div className="flex w-full max-w-sm items-center gap-2">
          <Input
            value={remoteUrl}
            onChange={(e) => setRemoteUrl(e.target.value)}
            placeholder={t('git.remote_url_placeholder')}
            className="h-8 text-xs"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={!remoteUrl || !!busy}
            onClick={() =>
              run(
                'remote',
                () => window.api.gitAddRemote(projectPath, remoteUrl.trim()),
                t('git.toast_remote'),
              )
            }
          >
            {t('git.connect')}
          </Button>
        </div>
        {notice && (
          <div className="w-full max-w-sm text-left">
            <ErrorCard text={notice.text} onClose={() => setNotice(null)} t={t} />
          </div>
        )}
      </div>
    );
  }

  const files = status?.files || [];
  const staged = files.filter(isStaged);
  const changes = files.filter(isChanged);
  const hasChanges = staged.length > 0 || changes.length > 0;
  const commitAll = staged.length === 0 && changes.length > 0; // nada em stage → commita tudo
  const canCommit = hasChanges && message.trim().length > 0 && !busy;

  const openBranchMenu = async () => {
    if (branchMenu) {
      setBranchMenu(null);
      return;
    }
    const res = await window.api.gitBranches(projectPath);
    setBranchMenu(res.ok ? { all: res.all || [] } : { all: [] });
  };

  const needsPush = status?.ahead > 0 || !status?.tracking;

  return (
    <div className="absolute inset-0 z-10 flex flex-col overflow-hidden bg-background">
      {/* Toolbar: branch + sync */}
      <div className="relative flex h-10 shrink-0 items-center gap-1 border-b bg-card px-2">
        <button
          type="button"
          onClick={openBranchMenu}
          className="flex h-7 items-center gap-1.5 rounded px-2 text-[13px] text-foreground transition-colors hover:bg-muted [&_svg]:size-[15px]"
        >
          <HoverIcon as={GitBranchIcon} className="text-muted-foreground" />
          <span className="font-medium">{status?.branch || '—'}</span>
          <ChevronDownIcon className="text-muted-foreground" />
        </button>
        {(status?.ahead > 0 || status?.behind > 0) && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {status.behind > 0 && (
              <span className="flex items-center">
                <ArrowDown className="size-3" />
                {status.behind}
              </span>
            )}
            {status.ahead > 0 && (
              <span className="flex items-center">
                <ArrowUp className="size-3" />
                {status.ahead}
              </span>
            )}
          </span>
        )}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={!!busy}
          title={t('git.pull')}
          onClick={() => run('pull', () => window.api.gitPull(projectPath), t('git.toast_pull'))}
        >
          <ArrowDownIcon className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={!!busy}
          title={t('git.push')}
          onClick={() => run('push', () => window.api.gitPush(projectPath), t('git.toast_push'))}
        >
          <ArrowUpIcon className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={loading || !!busy}
          title={t('git.refresh')}
          onClick={refresh}
        >
          <RefreshCCWIcon className={'size-4 ' + (loading ? 'animate-spin' : '')} />
        </Button>

        {branchMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setBranchMenu(null)} />
            <div className="absolute left-2 top-9 z-50 w-60 rounded-md border bg-popover p-1 shadow-lg">
              <div className="max-h-48 overflow-auto">
                {branchMenu.all.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      setBranchMenu(null);
                      run(
                        'checkout',
                        () => window.api.gitCheckout(projectPath, b),
                        t('git.toast_checkout', { name: b }),
                      );
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-muted"
                  >
                    {b === status?.branch ? (
                      <Check className="size-3.5 text-emerald-500" />
                    ) : (
                      <span className="size-3.5" />
                    )}
                    <span className="truncate">{b}</span>
                  </button>
                ))}
              </div>
              <div className="mt-1 flex items-center gap-1 border-t pt-1">
                <Input
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                  placeholder={t('git.new_branch')}
                  className="h-7 text-xs"
                />
                <Button
                  size="sm"
                  className="h-7"
                  disabled={!newBranch.trim()}
                  onClick={() => {
                    const n = newBranch.trim();
                    setNewBranch('');
                    setBranchMenu(null);
                    run(
                      'branch',
                      () => window.api.gitCreateBranch(projectPath, n),
                      t('git.toast_checkout', { name: n }),
                    );
                  }}
                >
                  {t('git.create_branch')}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Commit */}
      <div className="shrink-0 border-b p-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            staged.length > 0
              ? t('git.commit_message_staged', { count: staged.length })
              : t('git.commit_message_changes', { count: changes.length })
          }
          rows={2}
          className="w-full resize-none rounded-md border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:ring-1 focus:ring-ring"
        />
        <Button
          size="sm"
          className="mt-1.5 w-full gap-1.5"
          disabled={!canCommit}
          onClick={() =>
            run(
              'commit',
              async () => {
                // Nada em stage? Adiciona tudo antes (igual ao "Commit All" do VS Code).
                if (commitAll) {
                  const r1 = await window.api.gitStage(
                    projectPath,
                    changes.map((f) => f.path),
                  );
                  if (r1 && r1.ok === false) return r1;
                }
                return window.api.gitCommit(projectPath, message.trim());
              },
              t('git.toast_commit'),
            ).then((r) => {
              if (r && r.ok !== false) setMessage('');
            })
          }
        >
          <Check className="size-4" />
          {commitAll ? t('git.commit_all_button') : t('git.commit_button')}
        </Button>
        {/* Push: o "deploy" pro GitHub. Aparece quando há commits locais a enviar. */}
        {needsPush &&
          (status?.hasRemote === false ? (
            // Sem 'origin': não dá pra publicar sem saber pra qual repositório. Pede a URL primeiro.
            <div className="mt-1.5">
              <Button
                size="sm"
                variant="secondary"
                className="w-full gap-1.5"
                disabled={!!busy}
                onClick={() => setPublishOpen((v) => !v)}
              >
                <ArrowUp className="size-4" />
                {t('git.publish_branch')}
              </Button>
              {publishOpen && (
                <div className="mt-1.5 rounded-md border bg-card p-2">
                  <p className="mb-2 text-[11.5px] leading-relaxed text-muted-foreground">
                    {t('git.publish_help')}
                  </p>
                  <button
                    type="button"
                    onClick={() => window.api.openExternal('https://github.com/new')}
                    className="mb-2 inline-flex items-center gap-1 text-[11.5px] font-medium text-primary hover:underline"
                  >
                    {t('git.create_repo_github')}
                  </button>
                  <Input
                    value={remoteUrl}
                    onChange={(e) => setRemoteUrl(e.target.value)}
                    placeholder={t('git.remote_url_publish_placeholder')}
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    className="mt-1.5 w-full gap-1.5"
                    disabled={!remoteUrl.trim() || !!busy}
                    onClick={() =>
                      run(
                        'publish',
                        async () => {
                          const r1 = await window.api.gitAddRemote(projectPath, remoteUrl.trim());
                          if (r1 && r1.ok === false) return r1;
                          return window.api.gitPush(projectPath);
                        },
                        t('git.toast_pushed'),
                      ).then((r) => {
                        if (r && r.ok !== false) {
                          setPublishOpen(false);
                          setRemoteUrl('');
                        }
                      })
                    }
                  >
                    <ArrowUp className="size-4" />
                    {t('git.connect_and_publish')}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className="mt-1.5 w-full gap-1.5"
              disabled={!!busy}
              onClick={() =>
                run('push', () => window.api.gitPush(projectPath), t('git.toast_pushed'))
              }
            >
              <ArrowUp className="size-4" />
              {!status?.tracking
                ? t('git.publish_branch')
                : t('git.push_commits', { count: status.ahead })}
            </Button>
          ))}
        {notice && <ErrorCard text={notice.text} onClose={() => setNotice(null)} t={t} />}
      </div>

      {/* Listas + diff */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          className={
            (selected ? 'h-[45%] shrink-0 ' : 'flex-1 ') + 'overflow-y-auto overflow-x-hidden p-1.5'
          }
        >
          {staged.length > 0 && (
            <Section
              title={t('git.staged')}
              count={staged.length}
              action={{
                icon: <Minus />,
                title: t('git.unstage_all'),
                onClick: () =>
                  run('unstage', () =>
                    window.api.gitUnstage(
                      projectPath,
                      staged.map((f) => f.path),
                    ),
                  ),
              }}
            >
              {staged.map((f) => (
                <FileRow
                  key={'s' + f.path}
                  f={f}
                  area="staged"
                  selected={selected?.path === f.path && selected?.staged}
                  onClick={() => setSelected({ path: f.path, staged: true, untracked: false })}
                  onAct={() => run('unstage', () => window.api.gitUnstage(projectPath, [f.path]))}
                  t={t}
                />
              ))}
            </Section>
          )}
          {changes.length > 0 && (
            <Section
              title={t('git.changes')}
              count={changes.length}
              action={{
                icon: <Plus />,
                title: t('git.stage_all'),
                onClick: () =>
                  run('stage', () =>
                    window.api.gitStage(
                      projectPath,
                      changes.map((f) => f.path),
                    ),
                  ),
              }}
            >
              {changes.map((f) => {
                const untracked = f.index === '?' && f.working === '?';
                return (
                  <FileRow
                    key={'c' + f.path}
                    f={f}
                    area="changes"
                    selected={selected?.path === f.path && !selected?.staged}
                    onClick={() => setSelected({ path: f.path, staged: false, untracked })}
                    onAct={() => run('stage', () => window.api.gitStage(projectPath, [f.path]))}
                    t={t}
                  />
                );
              })}
            </Section>
          )}
          {staged.length === 0 && changes.length === 0 && (
            <div className="flex h-full min-h-[120px] items-center justify-center text-sm text-muted-foreground">
              {t('git.no_changes')}
            </div>
          )}
        </div>

        {selected && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col border-t">
            <div className="flex h-7 shrink-0 items-center justify-between border-b bg-card px-2 text-xs text-muted-foreground">
              <span className="truncate font-medium">
                {selected.path}
                {selected.untracked ? ' ' + t('git.new_file') : ''}
              </span>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded px-1.5 hover:bg-muted"
              >
                {t('git.close_file')}
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <CodeMirror
                value={diffText}
                theme={theme === 'dark' ? vscodeDark : vscodeLight}
                height="100%"
                style={{ height: '100%' }}
                editable={false}
                extensions={[diffEditorTheme, StreamLanguage.define(diffMode)]}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Card vermelho de erro com botão de copiar (pra mandar pra IA).
function ErrorCard({ text, onClose, t }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard pode falhar sem foco/permissão; ignora silenciosamente.
    }
  };
  return (
    <div className="mt-1.5 rounded-md border border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <AlertTriangle className="size-3.5 shrink-0" />
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide">
          {t('git.error_git')}
        </span>
        <button
          type="button"
          onClick={copy}
          title={t('git.copy_error')}
          className="flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-medium hover:bg-red-500/15"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? t('git.copied') : t('git.copy')}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title={t('git.close')}
            className="grid size-6 place-items-center rounded hover:bg-red-500/15 [&_svg]:size-3.5"
          >
            <X />
          </button>
        )}
      </div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words px-2.5 pb-2 font-mono text-[11.5px] leading-relaxed text-red-700 dark:text-red-300">
        {text}
      </pre>
    </div>
  );
}

function Section({ title, count, action, children }) {
  return (
    <div className="mb-1">
      <div className="flex h-6 items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{title}</span>
        <span className="rounded bg-muted px-1 text-[10px]">{count}</span>
        <div className="flex-1" />
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            title={action.title}
            className="grid size-5 cursor-pointer place-items-center rounded text-muted-foreground/50 hover:bg-foreground/10 hover:text-foreground [&_svg]:size-3.5"
          >
            {action.icon}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
