import { useId, useState } from 'react';
import { Input } from './ui/input.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.jsx';
import { useT } from '@/lib/i18n';

// Gera campos a partir do inputSchema (JSON Schema) de uma tool MCP.
// Suporta como campo: string, number/integer, boolean, enum.
// object/array (aninhado) => editado como JSON cru no MCPPanel, não aqui. YAGNI.
// onComplete(argName, value) => Promise<string[]>: se passado, campos string ganham
// autocomplete (datalist) — usado p/ prompts e resource templates (Bloco A). Opcional.
export function McpToolForm({ schema, value, onChange, onComplete }) {
  const t = useT();
  const props = (schema && schema.properties) || {};
  const required = (schema && schema.required) || [];
  const names = Object.keys(props);
  const set = (k, v) => onChange({ ...value, [k]: v });
  const uid = useId();
  const [suggest, setSuggest] = useState({});
  const fetchSuggest = (k, v) => {
    if (!onComplete) return;
    Promise.resolve(onComplete(k, v))
      .then((vals) => setSuggest((s) => ({ ...s, [k]: vals || [] })))
      .catch(() => {});
  };

  if (!names.length) {
    return <p className="text-xs text-muted-foreground">{t('mcp.form.no_args')}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {names.map((k) => {
        const p = props[k] || {};
        const isReq = required.includes(k);
        const label = (
          <label className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-medium">
            <span className="font-mono">{k}</span>
            {isReq && <span className="text-primary">*</span>}
            {p.description && (
              <span className="font-normal text-muted-foreground">— {p.description}</span>
            )}
          </label>
        );

        if (Array.isArray(p.enum)) {
          return (
            <div key={k}>
              {label}
              <Select value={value[k] ?? ''} onValueChange={(v) => set(k, v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder={t('mcp.form.select_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {p.enum.map((o) => (
                    <SelectItem key={String(o)} value={String(o)} className="text-xs">
                      {String(o)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        if (p.type === 'boolean') {
          return (
            <label key={k} className="flex items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                checked={!!value[k]}
                onChange={(e) => set(k, e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              <span className="font-mono">{k}</span>
              {isReq && <span className="text-primary">*</span>}
            </label>
          );
        }

        const isNum = p.type === 'number' || p.type === 'integer';
        const canComplete = !!onComplete && !isNum;
        const listId = `${uid}-${k}`;
        return (
          <div key={k}>
            {label}
            <Input
              type={isNum ? 'number' : 'text'}
              value={value[k] ?? ''}
              onChange={(e) => {
                const v = isNum
                  ? e.target.value === ''
                    ? ''
                    : Number(e.target.value)
                  : e.target.value;
                set(k, v);
                if (canComplete) fetchSuggest(k, e.target.value);
              }}
              onFocus={canComplete ? () => fetchSuggest(k, value[k] ?? '') : undefined}
              list={canComplete ? listId : undefined}
              placeholder={p.type || 'string'}
              spellCheck={false}
              autoComplete="off"
              className="h-8 font-mono text-xs"
            />
            {canComplete && (suggest[k] || []).length > 0 && (
              <datalist id={listId}>
                {suggest[k].map((o) => (
                  <option key={String(o)} value={String(o)} />
                ))}
              </datalist>
            )}
          </div>
        );
      })}
    </div>
  );
}
