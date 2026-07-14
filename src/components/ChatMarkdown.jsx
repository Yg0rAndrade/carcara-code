import { lazy, Suspense } from 'react';

// Slot `Text` do assistant-ui (recebe { text }) que renderiza markdown reusando o
// Markdown.jsx do app (GFM + syntax highlight, tema .md-body). Compartilhado pelos DOIS
// chats (AssistantChat e CarcaraChat) — fonte única do markdown de resposta.
//
// Markdown.jsx é pesado (react-markdown + highlight.js), então continua lazy: enquanto o
// chunk carrega — ou no 1º token do streaming — o fallback mostra o texto CRU (whitespace
// preservado), sem nunca bloquear a bolha. Só usado no ASSISTENTE; texto do usuário/sistema
// segue em PlainText (não deve virar markdown).
const Markdown = lazy(() => import('./Markdown.jsx'));

export function MarkdownText({ text }) {
  return (
    <Suspense fallback={<span className="whitespace-pre-wrap">{text}</span>}>
      <Markdown text={text} className="text-foreground" />
    </Suspense>
  );
}
