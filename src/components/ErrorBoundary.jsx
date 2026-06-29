import { Component, useState } from 'react';
import { Bug, RotateCw, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from './ui/button.jsx';
import { tStatic } from '@/lib/i18n';

// Gera um código curto e estável a partir do erro, pra pessoa reportar ("deu o ERR-1A2B3C4D").
// Mesmo erro → mesmo código, então dá pra comparar/agrupar sem precisar do stack inteiro.
function errCode(error) {
  const s = String((error && (error.stack || error.message)) || error || 'unknown');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return 'ERR-' + (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

// Card de erro mostrado NO LUGAR do painel que quebrou. Estilo "carvão quente":
// mono pra detalhe técnico, laranja da brasa no acento. Não cobre a barra de abas
// nem o resto do app — a pessoa troca de aba e continua usando normalmente.
function PanelError({ label, error, onRetry }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const code = errCode(error);
  const message = String((error && error.message) || error || tStatic('error.unknown_error'));
  const stack = (error && error.stack) || '';

  const copy = async () => {
    const payload = `[${code}] ${label || tStatic('error.panel_label')}\n${message}\n\n${stack}`;
    try {
      if (window.api?.copyText) await window.api.copyText(payload);
      else await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard indisponível: ignora */ }
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center overflow-auto bg-background/85 p-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-lg border bg-card shadow-xl">
        <div className="flex items-center gap-2.5 border-b px-5 py-3.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary [&_svg]:size-4">
            <Bug />
          </span>
          <div className="min-w-0">
            <p className="eyebrow text-primary">{tStatic('error.something_broke')}</p>
            <p className="truncate text-sm font-semibold text-foreground">{label || tStatic('error.panel_label')}</p>
          </div>
        </div>

        <div className="px-5 py-4">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {tStatic('error.rest_of_app_works')}
          </p>

          <div className="mt-3.5 rounded-md border bg-background p-3">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="eyebrow text-muted-foreground">{tStatic('error.code_label')}</span>
              <code className="select-all font-mono font-semibold text-primary">{code}</code>
            </div>
            <p className="mt-1.5 break-words font-mono text-xs leading-relaxed text-red-500">{message}</p>
          </div>

          {stack && (
            <div className="mt-2.5">
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
              >
                {open ? <ChevronDown /> : <ChevronRight />}{tStatic('error.technical_details')}
              </button>
              {open && (
                <pre className="mt-1.5 max-h-48 overflow-auto rounded-md border bg-background px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {stack}
                </pre>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t px-5 py-3">
          <Button variant="ghost" size="sm" onClick={copy}>
            {copied ? <Check className="mr-1" /> : <Copy className="mr-1" />}{copied ? tStatic('error.copied_button') : tStatic('error.copy_error_button')}
          </Button>
          <div className="flex-1" />
          {/* Recarrega só o renderer (index.html novo, hashes de chunk certos). As sessões
              do Claude e os terminais vivem no processo principal e NÃO são afetados — é a
              saída garantida quando "Tentar novamente" não resolve (ex: chunk velho). */}
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
            {tStatic('error.reload_button')}
          </Button>
          <Button size="sm" onClick={onRetry}>
            <RotateCw className="mr-1" />{tStatic('error.retry_button')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Boundary genérico: captura erros de render/commit dos filhos e mostra o card acima
// em vez de derrubar o app inteiro. Cada painel tem o seu, então a falha fica isolada.
//
// Props:
//   label    — nome do painel (aparece no card e no log)
//   fallback — (error, retry) => ReactNode, opcional, pra customizar a tela de erro
//   onReset  — callback opcional disparado ao "Tentar novamente"
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Loga com o código pra casar com o que a pessoa vê na tela.
    console.error(`[ErrorBoundary] ${this.props.label || 'painel'} ${errCode(error)}`, error, info?.componentStack);
  }

  retry = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.retry);
      return <PanelError label={this.props.label} error={error} onRetry={this.retry} />;
    }
    return this.props.children;
  }
}
