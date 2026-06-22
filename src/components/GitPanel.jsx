import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GitBranch, ArrowUp, ArrowDown, Plus, Minus, Check,
  AlertTriangle, Copy, X, Sparkles,
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

const diffEditorTheme = EditorView.theme({
  '&': { fontSize: '12.5px', height: '100%' },
  '.cm-scroller': { fontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace', lineHeight: '1.6' },
});

// Letra/cor/descrição do badge de status por código do git (M/A/D/R/U/?).
function statusBadge(code) {
  const map = {
    M: ['M', 'text-amber-500', 'Modificado'],
    A: ['A', 'text-emerald-500', 'Adicionado'],
    D: ['D', 'text-red-500', 'Excluído'],
    R: ['R', 'text-blue-500', 'Renomeado'],
    C: ['C', 'text-blue-500', 'Copiado'],
    U: ['U', 'text-red-500', 'Conflito'],
    '?': ['U', 'text-emerald-500', 'Novo (não rastreado)'],
  };
  return map[code] || [code, 'text-muted-foreground', code];
}

function isStaged(f) { return f.index !== ' ' && f.index !== '?'; }
function isChanged(f) {
  return (f.working !== ' ' && f.working !== '?') || (f.index === '?' && f.working === '?');
}

function FileRow({ f, area, onClick, onAct, selected }) {
  const code = area === 'staged' ? f.index : (f.index === '?' ? '?' : f.working);
  const [letter, color, label] = statusBadge(code);
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
        onClick={(e) => { e.stopPropagation(); onAct(); }}
        title={area === 'staged' ? 'Tirar do stage' : 'Adicionar ao stage'}
        className="grid size-5 shrink-0 cursor-pointer place-items-center rounded text-muted-foreground/50 hover:bg-foreground/10 hover:text-foreground [&_svg]:size-3.5"
      >
        {area === 'staged' ? <Minus /> : <Plus />}
      </button>
      <span title={label} className={'w-3 shrink-0 text-center font-mono text-[12px] font-semibold ' + color}>{letter}</span>
    </div>
  );
}

export function GitPanel({ active, visible }) {
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
  const [branchMenu, setBranchMenu] = useState(null); // { all } quando aberto
  const [newBranch, setNewBranch] = useState('');
  const [llm, setLlm] = useState({ enabled: false, ready: false, commit: false });
  const [genBusy, setGenBusy] = useState(false);
  const [genTokens, setGenTokens] = useState(0); // tokens gerados ao vivo (feedback visual)
  const warmedRef = useRef(false); // já disparou o aquecimento do modelo nesta sessão do app?

  // Tokens chegando ao vivo durante a geração: alimenta o "Gerando… N tokens".
  useEffect(() => {
    const off = window.api.onLlmGenProgress?.((p) => setGenTokens(p?.tokens || 0));
    return off;
  }, []);

  const refresh = useCallback(async (silent) => {
    if (!projectPath) { setStatus(null); return; }
    if (!silent) setLoading(true);
    const res = await window.api.gitStatus(projectPath);
    setStatus(res);
    if (!silent) setLoading(false);
  }, [projectPath]);

  // Recarrega ao abrir a aba / trocar de projeto.
  useEffect(() => { if (visible) refresh(); }, [visible, refresh]);

  // Config da IA local: o botão "✨ Gerar" só aparece se ligada + modelo pronto + recurso ativo.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      const [cfg, st] = await Promise.all([window.api.llmGetConfig(), window.api.llmStatus()]);
      if (cancelled) return;
      const on = !!cfg?.enabled && !!cfg?.features?.commit && !!st?.installed;
      setLlm({ enabled: !!cfg?.enabled, commit: !!cfg?.features?.commit, ready: !!st?.installed });
      // Aquece o modelo em segundo plano (uma vez) pra o 1º clique já sair rápido —
      // sem isso, a primeira geração paga o custo de carregar o modelo na RAM.
      if (on && !warmedRef.current) {
        warmedRef.current = true;
        window.api.llmWarmup?.().catch(() => { warmedRef.current = false; });
      }
    })();
    return () => { cancelled = true; };
  }, [visible]);

  // Auto-refresh enquanto a aba está aberta: poll leve + ao voltar o foco da janela.
  // Assim as alterações feitas pelo Claude (no chat) aparecem sem clicar em atualizar.
  useEffect(() => {
    if (!visible || !projectPath) return;
    const id = setInterval(() => { if (!document.hidden) refresh(true); }, 4000);
    const onFocus = () => refresh(true);
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [visible, projectPath, refresh]);

  // (Re)carrega o diff do arquivo selecionado. (Sem 'status' nas deps pra o poll
  // não recarregar o diff a cada 4s; ações que mexem no stage recarregam via refresh.)
  useEffect(() => {
    if (!selected || !projectPath) { setDiffText(''); return; }
    let cancelled = false;
    (async () => {
      const res = await window.api.gitDiff(projectPath, selected.path, selected.staged, selected.untracked);
      if (!cancelled) setDiffText(res.ok ? (res.diff || '(sem alterações de texto)') : ('Erro: ' + res.error));
    })();
    return () => { cancelled = true; };
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
    return <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-muted-foreground">Abra um projeto para ver o Git aqui.</div>;
  }

  // Erro geral (ex.: git não instalado).
  if (status && status.ok === false) {
    return <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-red-500">Erro do Git: {status.error}</div>;
  }

  // Projeto ainda não é um repositório git.
  if (status && status.ok && status.isRepo === false) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
        <GitBranch className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Este projeto ainda não é um repositório Git.</p>
        <Button size="sm" disabled={!!busy} onClick={() => run('init', () => window.api.gitInit(projectPath), 'Repositório criado')}>
          Inicializar Git
        </Button>
        <div className="flex w-full max-w-sm items-center gap-2">
          <Input value={remoteUrl} onChange={(e) => setRemoteUrl(e.target.value)} placeholder="URL do GitHub (opcional)" className="h-8 text-xs" />
          <Button size="sm" variant="secondary" disabled={!remoteUrl || !!busy}
            onClick={() => run('remote', () => window.api.gitAddRemote(projectPath, remoteUrl.trim()), 'Remoto conectado')}>
            Conectar
          </Button>
        </div>
        {notice && <div className="w-full max-w-sm text-left"><ErrorCard text={notice.text} onClose={() => setNotice(null)} /></div>}
      </div>
    );
  }

  const files = status?.files || [];
  const staged = files.filter(isStaged);
  const changes = files.filter(isChanged);
  const hasChanges = staged.length > 0 || changes.length > 0;
  const commitAll = staged.length === 0 && changes.length > 0; // nada em stage → commita tudo
  const canCommit = hasChanges && message.trim().length > 0 && !busy;

  const generateCommit = async () => {
    const list = staged.length > 0 ? staged : changes;
    if (list.length === 0) return;
    setGenTokens(0);
    setGenBusy(true);
    try {
      // Junta os diffs dos arquivos relevantes (truncado pra caber no contexto do modelo).
      const parts = [];
      for (const f of list.slice(0, 20)) {
        const r = await window.api.gitDiff(projectPath, f.path, isStaged(f), f.index === '?' && f.working === '?');
        if (r?.ok && r.diff) parts.push(r.diff);
      }
      const diff = parts.join('\n').slice(0, 6000);
      const res = await window.api.llmGenerate('commit', diff || list.map((f) => f.path).join('\n'));
      if (res?.ok && res.text) setMessage(res.text);
      else toast.error('Não consegui gerar agora.');
    } catch {
      toast.error('Não consegui gerar agora.');
    } finally {
      setGenBusy(false);
    }
  };

  const openBranchMenu = async () => {
    if (branchMenu) { setBranchMenu(null); return; }
    const res = await window.api.gitBranches(projectPath);
    setBranchMenu(res.ok ? { all: res.all || [] } : { all: [] });
  };

  const needsPush = status?.ahead > 0 || !status?.tracking;

  return (
    <div className="absolute inset-0 z-10 flex flex-col overflow-hidden bg-background">
      {/* Toolbar: branch + sync */}
      <div className="relative flex h-10 shrink-0 items-center gap-1 border-b bg-card px-2">
        <button type="button" onClick={openBranchMenu}
          className="flex h-7 items-center gap-1.5 rounded px-2 text-[13px] text-foreground transition-colors hover:bg-muted [&_svg]:size-[15px]">
          <HoverIcon as={GitBranchIcon} className="text-muted-foreground" />
          <span className="font-medium">{status?.branch || '—'}</span>
          <ChevronDownIcon className="text-muted-foreground" />
        </button>
        {(status?.ahead > 0 || status?.behind > 0) && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {status.behind > 0 && <span className="flex items-center"><ArrowDown className="size-3" />{status.behind}</span>}
            {status.ahead > 0 && <span className="flex items-center"><ArrowUp className="size-3" />{status.ahead}</span>}
          </span>
        )}
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="size-7" disabled={!!busy} title="Pull"
          onClick={() => run('pull', () => window.api.gitPull(projectPath), 'Pull concluído')}>
          <ArrowDownIcon className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7" disabled={!!busy} title="Push"
          onClick={() => run('push', () => window.api.gitPush(projectPath), 'Push concluído')}>
          <ArrowUpIcon className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7" disabled={loading || !!busy} title="Atualizar" onClick={refresh}>
          <RefreshCCWIcon className={'size-4 ' + (loading ? 'animate-spin' : '')} />
        </Button>

        {branchMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setBranchMenu(null)} />
            <div className="absolute left-2 top-9 z-50 w-60 rounded-md border bg-popover p-1 shadow-lg">
              <div className="max-h-48 overflow-auto">
                {branchMenu.all.map((b) => (
                  <button key={b} type="button"
                    onClick={() => { setBranchMenu(null); run('checkout', () => window.api.gitCheckout(projectPath, b), 'Branch: ' + b); }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-muted">
                    {b === status?.branch ? <Check className="size-3.5 text-emerald-500" /> : <span className="size-3.5" />}
                    <span className="truncate">{b}</span>
                  </button>
                ))}
              </div>
              <div className="mt-1 flex items-center gap-1 border-t pt-1">
                <Input value={newBranch} onChange={(e) => setNewBranch(e.target.value)} placeholder="nova branch" className="h-7 text-xs" />
                <Button size="sm" className="h-7" disabled={!newBranch.trim()}
                  onClick={() => { const n = newBranch.trim(); setNewBranch(''); setBranchMenu(null); run('branch', () => window.api.gitCreateBranch(projectPath, n), 'Branch: ' + n); }}>
                  Criar
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
          placeholder={staged.length > 0 ? `Mensagem do commit (${staged.length} em stage)` : `Mensagem do commit (${changes.length} alteração${changes.length === 1 ? '' : 'ões'})`}
          rows={2}
          className="w-full resize-none rounded-md border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:ring-1 focus:ring-ring"
        />
        {llm.enabled && llm.commit && llm.ready && (
          <>
            <Button size="sm" variant="ghost" className="mt-1.5 w-full gap-1.5 text-muted-foreground"
              disabled={genBusy || !hasChanges}
              onClick={generateCommit}>
              <Sparkles className={'size-4 ' + (genBusy ? 'animate-pulse' : '')} />
              {genBusy ? `Gerando… ${genTokens} ${genTokens === 1 ? 'token' : 'tokens'}` : 'Gerar mensagem'}
            </Button>
            {/* Laser loading: faixa fininha com um feixe de luz varrendo enquanto a IA gera. */}
            {genBusy && (
              <div className="relative mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-primary/15">
                <style>{'@keyframes carcaraLaser{0%{left:-45%}100%{left:100%}}'}</style>
                <span
                  className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_10px_2px] shadow-primary/50"
                  style={{ animation: 'carcaraLaser 0.9s ease-in-out infinite' }}
                />
              </div>
            )}
          </>
        )}
        <Button size="sm" className="mt-1.5 w-full gap-1.5" disabled={!canCommit}
          onClick={() => run('commit', async () => {
            // Nada em stage? Adiciona tudo antes (igual ao "Commit All" do VS Code).
            if (commitAll) {
              const r1 = await window.api.gitStage(projectPath, changes.map((f) => f.path));
              if (r1 && r1.ok === false) return r1;
            }
            return window.api.gitCommit(projectPath, message.trim());
          }, 'Commit feito').then((r) => { if (r && r.ok !== false) setMessage(''); })}>
          <Check className="size-4" />{commitAll ? 'Commit de tudo' : 'Commit'}
        </Button>
        {/* Push: o "deploy" pro GitHub. Aparece quando há commits locais a enviar. */}
        {needsPush && (
          <Button size="sm" variant="secondary" className="mt-1.5 w-full gap-1.5" disabled={!!busy}
            onClick={() => run('push', () => window.api.gitPush(projectPath), 'Enviado pro GitHub')}>
            <ArrowUp className="size-4" />
            {!status?.tracking ? 'Publicar branch no GitHub' : `Enviar ${status.ahead} commit${status.ahead > 1 ? 's' : ''} pro GitHub`}
          </Button>
        )}
        {notice && <ErrorCard text={notice.text} onClose={() => setNotice(null)} />}
      </div>

      {/* Listas + diff */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className={(selected ? 'h-[45%] shrink-0 ' : 'flex-1 ') + 'overflow-y-auto overflow-x-hidden p-1.5'}>
          {staged.length > 0 && (
            <Section title="Staged" count={staged.length}
              action={{ icon: <Minus />, title: 'Tirar tudo do stage',
                onClick: () => run('unstage', () => window.api.gitUnstage(projectPath, staged.map((f) => f.path))) }}>
              {staged.map((f) => (
                <FileRow key={'s' + f.path} f={f} area="staged" selected={selected?.path === f.path && selected?.staged}
                  onClick={() => setSelected({ path: f.path, staged: true, untracked: false })}
                  onAct={() => run('unstage', () => window.api.gitUnstage(projectPath, [f.path]))} />
              ))}
            </Section>
          )}
          {changes.length > 0 && (
            <Section title="Alterações" count={changes.length}
              action={{ icon: <Plus />, title: 'Adicionar tudo ao stage',
                onClick: () => run('stage', () => window.api.gitStage(projectPath, changes.map((f) => f.path))) }}>
              {changes.map((f) => {
                const untracked = f.index === '?' && f.working === '?';
                return (
                  <FileRow key={'c' + f.path} f={f} area="changes" selected={selected?.path === f.path && !selected?.staged}
                    onClick={() => setSelected({ path: f.path, staged: false, untracked })}
                    onAct={() => run('stage', () => window.api.gitStage(projectPath, [f.path]))} />
                );
              })}
            </Section>
          )}
          {staged.length === 0 && changes.length === 0 && (
            <div className="flex h-full min-h-[120px] items-center justify-center text-sm text-muted-foreground">Nenhuma alteração.</div>
          )}
        </div>

        {selected && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col border-t">
            <div className="flex h-7 shrink-0 items-center justify-between border-b bg-card px-2 text-xs text-muted-foreground">
              <span className="truncate font-medium">{selected.path}{selected.untracked ? ' (novo)' : ''}</span>
              <button type="button" onClick={() => setSelected(null)} className="rounded px-1.5 hover:bg-muted">fechar</button>
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
function ErrorCard({ text, onClose }) {
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
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide">Erro no Git</span>
        <button
          type="button"
          onClick={copy}
          title="Copiar erro"
          className="flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-medium hover:bg-red-500/15"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
        {onClose && (
          <button type="button" onClick={onClose} title="Fechar"
            className="grid size-6 place-items-center rounded hover:bg-red-500/15 [&_svg]:size-3.5">
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
          <button type="button" onClick={action.onClick} title={action.title}
            className="grid size-5 cursor-pointer place-items-center rounded text-muted-foreground/50 hover:bg-foreground/10 hover:text-foreground [&_svg]:size-3.5">
            {action.icon}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
