import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

// Preview de markdown "estilo VS Code": GFM (tabelas, checkboxes, ~riscado~, links
// automáticos) + syntax highlight nos blocos de código via highlight.js (que já é
// dependência do projeto). Os tokens do hljs ganham cor pelo tema .md-body no index.css.
// Carregado sob demanda (React.lazy) pra não pesar o boot — ver memória startup-performance.
export default function Markdown({ text }) {
  return (
    <div className="md-body text-[13px] leading-relaxed text-muted-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          h1: ({ node, ...p }) => (
            <h1 className="mb-2 mt-3 text-[16px] font-semibold text-foreground first:mt-0" {...p} />
          ),
          h2: ({ node, ...p }) => (
            <h2
              className="mb-1.5 mt-3 text-[14.5px] font-semibold text-foreground first:mt-0"
              {...p}
            />
          ),
          h3: ({ node, ...p }) => (
            <h3
              className="mb-1 mt-2.5 text-[13.5px] font-semibold text-primary first:mt-0"
              {...p}
            />
          ),
          h4: ({ node, ...p }) => (
            <h4 className="mb-1 mt-2 text-[13px] font-semibold text-primary first:mt-0" {...p} />
          ),
          p: ({ node, ...p }) => <p className="my-2 first:mt-0 last:mb-0" {...p} />,
          strong: ({ node, ...p }) => <strong className="font-semibold text-foreground" {...p} />,
          em: ({ node, ...p }) => <em className="italic" {...p} />,
          a: ({ node, ...p }) => (
            <a
              className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
              target="_blank"
              rel="noreferrer"
              {...p}
            />
          ),
          ul: ({ node, ...p }) => <ul className="my-2 ml-1 list-none space-y-1" {...p} />,
          ol: ({ node, ...p }) => (
            <ol
              className="my-2 ml-5 list-decimal space-y-1 marker:text-primary marker:tabular-nums"
              {...p}
            />
          ),
          li: ({ node, children, ...p }) => (
            <li className="relative pl-4 [&>p]:my-0 [ol_&]:pl-0" {...p}>
              <span className="absolute left-0 top-0 text-primary [ol_&]:hidden">•</span>
              {children}
            </li>
          ),
          blockquote: ({ node, ...p }) => (
            <blockquote
              className="my-2 border-l-2 border-primary/50 pl-3 italic text-muted-foreground/90"
              {...p}
            />
          ),
          hr: ({ node, ...p }) => <hr className="my-3 border-border" {...p} />,
          code: ({ node, inline, className, children, ...p }) =>
            inline ? (
              <code
                className="rounded bg-muted-foreground/15 px-1 py-0.5 font-mono text-[12px] text-foreground"
                {...p}
              >
                {children}
              </code>
            ) : (
              <code className={className} {...p}>
                {children}
              </code>
            ),
          pre: ({ node, ...p }) => (
            <pre
              className="my-2.5 overflow-x-auto rounded-lg border border-border bg-card p-3 font-mono text-[12px] leading-relaxed"
              {...p}
            />
          ),
          table: ({ node, ...p }) => (
            <div className="my-2.5 overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px]" {...p} />
            </div>
          ),
          th: ({ node, ...p }) => (
            <th
              className="border border-border bg-muted-foreground/10 px-2.5 py-1.5 text-left font-semibold text-foreground"
              {...p}
            />
          ),
          td: ({ node, ...p }) => (
            <td className="border border-border px-2.5 py-1.5 align-top" {...p} />
          ),
          input: ({ node, ...p }) => (
            <input className="mr-1.5 align-middle accent-primary" disabled {...p} />
          ),
          img: ({ node, ...p }) => (
            <img className="my-2 max-w-full rounded-md border border-border" {...p} />
          ),
        }}
      >
        {String(text || '')}
      </ReactMarkdown>
    </div>
  );
}
