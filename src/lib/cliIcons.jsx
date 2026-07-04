// Logos das CLIs de IA, renderizados como <img> a partir dos SVGs em src/assets/cli/.
// Preserva as cores originais de cada marca. O OpenCode tem duas versões (clara/escura)
// e troca conforme o tema.
import { useTheme } from '@/lib/theme.jsx';
import { cn } from '@/lib/utils';
import claudeCodeUrl from '@/assets/cli/claudecode-color.svg';
import codexUrl from '@/assets/cli/codex-color.svg';
import antigravityUrl from '@/assets/cli/antigravity-color.svg';
import opencodeDarkUrl from '@/assets/cli/opencode-logo-dark.svg';
import opencodeLightUrl from '@/assets/cli/opencode-logo-light.svg';

function LogoImg({ src, className }) {
  return <img src={src} alt="" draggable={false} className={cn('object-contain', className)} />;
}

export function ClaudeCodeIcon({ className }) {
  return <LogoImg src={claudeCodeUrl} className={className} />;
}
export function CodexIcon({ className }) {
  return <LogoImg src={codexUrl} className={className} />;
}
export function AntigravityIcon({ className }) {
  return <LogoImg src={antigravityUrl} className={className} />;
}

// OpenCode é o único com duas cores: usa a versão clara no tema escuro e vice-versa.
export function OpenCodeIcon({ className }) {
  const { theme } = useTheme();
  return (
    <LogoImg src={theme === 'dark' ? opencodeDarkUrl : opencodeLightUrl} className={className} />
  );
}
