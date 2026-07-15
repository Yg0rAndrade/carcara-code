// Fonte única das CLIs de IA suportadas + o badge de logo. Usado pelas Configurações
// (SettingsModal) e pela tela de escolha (AiPicker). 'cmd' é o comando digitado no
// terminal; 'desc' é uma CHAVE de i18n (resolvida com t(opt.desc) no render).
import { Wrench, Terminal as TerminalIcon } from 'lucide-react';
import {
  ClaudeCodeIcon,
  CodexIcon,
  OpenCodeIcon,
  AntigravityIcon,
  CarcaraIcon,
} from '@/lib/cliIcons.jsx';
import { cn } from '@/lib/utils';

export const AI_OPTIONS = [
  {
    key: 'claude',
    label: 'Claude Code',
    cmd: 'claude',
    color: '#d97757',
    Icon: ClaudeCodeIcon,
    fullColor: true,
    desc: 'settings.aiClaudeDesc',
  },
  {
    key: 'codex',
    label: 'Codex (OpenAI)',
    cmd: 'codex',
    color: '#5b6bff',
    Icon: CodexIcon,
    fullColor: true,
    desc: 'settings.aiCodexDesc',
  },
  {
    key: 'opencode',
    label: 'OpenCode',
    cmd: 'opencode',
    color: '#7c5cff',
    Icon: OpenCodeIcon,
    fullColor: true,
    desc: 'settings.aiOpencodeDesc',
  },
  {
    key: 'agy',
    label: 'Antigravity',
    cmd: 'agy',
    color: '#4285f4',
    Icon: AntigravityIcon,
    fullColor: true,
    desc: 'settings.aiAgyDesc',
  },
  {
    key: 'carcara',
    label: 'Carcará Code AI',
    cmd: '',
    color: '#e8590c',
    Icon: CarcaraIcon,
    fullColor: true,
    desc: 'settings.aiCarcaraDesc',
    // Oculto no 0.1.9: o motor precisa de chave de API pra funcionar; sem ela o chat
    // quebraria. Some da escolha de IA (filtrado por `hidden`) até termos a chave —
    // reativar é só remover esta linha. O routing/CarcaraChat continua no bundle.
    hidden: true,
  },
  {
    key: 'shell',
    label: 'Terminal limpo',
    cmd: '',
    color: '#10b981',
    Icon: TerminalIcon,
    desc: 'settings.aiShellDesc',
  },
  {
    key: 'custom',
    label: null,
    cmd: '',
    color: '#6b7280',
    Icon: Wrench,
    desc: 'settings.aiCustomDesc',
  },
];

export const OPT = Object.fromEntries(AI_OPTIONS.map((o) => [o.key, o]));

export function CliBadge({ optKey, small }) {
  const o = OPT[optKey] || OPT.custom;
  const Icon = o.Icon;
  // Logo colorido (tem fundo próprio) preenche o badge sem o quadrado tingido.
  if (o.fullColor) {
    return <Icon className={cn('shrink-0 rounded', small ? 'size-4' : 'size-5')} />;
  }
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded', small ? 'size-4' : 'size-5')}
      style={{ background: o.color + '22', color: o.color }}
    >
      <Icon className={small ? 'size-3' : 'size-3.5'} />
    </span>
  );
}
