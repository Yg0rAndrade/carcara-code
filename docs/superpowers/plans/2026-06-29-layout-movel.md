# Layout Móvel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir mover o painel do Claude Code (por projeto) e o rail de ícones (global) de lado, via arrastar-e-soltar e via 4 presets em Configurações › Aparência.

**Architecture:** Estado de layout em dois níveis — global no `config.json` (`layout`) e override por projeto (`projectLayout[path]`), espelhados em `localStorage` para boot sem piscar. Uma função pura `resolveLayout` decide o layout efetivo; o `App` renderiza rail e painéis em ordem condicional. O arraste reusa o gesto HTML5 das sessões do `ChatPanel`, com um overlay full-screen para contornar o `webview` do Preview.

**Tech Stack:** Electron (main + preload IPC), React 19, react-resizable-panels, TailwindCSS, lucide-react, Vitest (novo, só para a função pura).

## Global Constraints

- Usar assinatura do Claude, nunca API (não afeta este plano, mas é regra do projeto).
- Renderer carrega `dist/` — edições em `src/` só aparecem após `npm run build`. NÃO matar/relançar o app em execução; o usuário valida manualmente.
- Padrão de config por projeto já existe: `config.json` → `projectCli[path]` via `ai:set` ([main.js:372-379](../../../main.js)). Espelhar esse padrão.
- Espelhos de boot já usados: `localStorage` para `theme`, `appZoom`, `railWidth`. Seguir o mesmo estilo.
- Valores de lado são sempre a string `'left'` ou `'right'`; qualquer outro valor cai em `'left'`.
- Sem StrictMode (ver [main.jsx](../../../src/main.jsx)) — não duplicar listeners de IPC.
- Comentários no código em pt-BR, no tom do restante do projeto.

---

### Task 1: Função pura `resolveLayout` + setup de testes (Vitest)

**Files:**
- Create: `src/lib/layout.js`
- Create: `src/lib/layout.test.js`
- Modify: `package.json` (adiciona devDep `vitest` e script `test`)

**Interfaces:**
- Produces: `resolveLayout(global, projectOverride) → { railSide: 'left'|'right', claudeSide: 'left'|'right' }`. `global` é `{ railSide, claudeSide }`; `projectOverride` é `{ claudeSide }` ou `null`. Override vence global; ausência/valor inválido cai no global; global ausente/inválido cai em `'left'`.

- [ ] **Step 1: Instalar o Vitest (devDependency)**

Run: `npm i -D vitest`
Expected: `vitest` aparece em `devDependencies` no `package.json` e instala sem erro.

- [ ] **Step 2: Adicionar o script de teste**

No `package.json`, dentro de `"scripts"`, adicionar a linha `test` (após `"start"`):

```json
"start": "electron .",
"test": "vitest run",
```

- [ ] **Step 3: Escrever o teste que falha**

Create `src/lib/layout.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { resolveLayout } from './layout.js';

describe('resolveLayout', () => {
  it('usa o global quando não há override', () => {
    expect(resolveLayout({ railSide: 'right', claudeSide: 'right' }, null))
      .toEqual({ railSide: 'right', claudeSide: 'right' });
  });

  it('override vence o global no lado do Claude', () => {
    expect(resolveLayout({ railSide: 'left', claudeSide: 'left' }, { claudeSide: 'right' }))
      .toEqual({ railSide: 'left', claudeSide: 'right' });
  });

  it('override não afeta o lado do rail', () => {
    expect(resolveLayout({ railSide: 'right', claudeSide: 'left' }, { claudeSide: 'right' }).railSide)
      .toBe('right');
  });

  it('valor inválido no override cai no global', () => {
    expect(resolveLayout({ railSide: 'left', claudeSide: 'right' }, { claudeSide: 'banana' }).claudeSide)
      .toBe('right');
  });

  it('global ausente/inválido cai em left', () => {
    expect(resolveLayout(null, null)).toEqual({ railSide: 'left', claudeSide: 'left' });
    expect(resolveLayout({ railSide: 'x', claudeSide: 'y' }, null)).toEqual({ railSide: 'left', claudeSide: 'left' });
  });
});
```

- [ ] **Step 4: Rodar o teste e ver falhar**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./layout.js"` (o arquivo ainda não existe).

- [ ] **Step 5: Implementar a função mínima**

Create `src/lib/layout.js`:

```js
// Resolve o layout EFETIVO de um projeto a partir do padrão global e do override
// do projeto. Override (só o lado do Claude) vence o global; o lado do rail é
// sempre global. Qualquer valor que não seja 'left'/'right' cai em 'left'.
const side = (v, fallback = 'left') => (v === 'right' ? 'right' : v === 'left' ? 'left' : fallback);

export function resolveLayout(global, projectOverride) {
  const railSide = side(global?.railSide);
  const globalClaude = side(global?.claudeSide);
  const claudeSide = side(projectOverride?.claudeSide, globalClaude);
  return { railSide, claudeSide };
}
```

- [ ] **Step 6: Rodar o teste e ver passar**

Run: `npm test`
Expected: PASS — 5 testes verdes.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/layout.js src/lib/layout.test.js
git commit -m "feat: resolveLayout puro + setup de testes (vitest)"
```

---

### Task 2: Handlers IPC + pontes no preload

**Files:**
- Modify: `main.js` (após o handler `ai:set`, ~linha 379)
- Modify: `preload.js` (junto de `getAi`/`setAi`, ~linha 33)

**Interfaces:**
- Consumes: `loadConfig()` / `saveConfig(c)` já existentes no `main.js`.
- Produces (no `window.api`):
  - `getLayout() → Promise<{ railSide, claudeSide }>`
  - `setLayout({ railSide, claudeSide }) → Promise<{ ok: true }>`
  - `getProjectLayout(projectPath) → Promise<{ claudeSide } | null>`
  - `setProjectLayout(projectPath, claudeSide) → Promise<{ ok: true }>`

- [ ] **Step 1: Adicionar os handlers no `main.js`**

Logo após o bloco `ipcMain.handle('ai:set', ...)` (termina na linha 379), inserir:

```js
// ---- Layout (lado do rail/Claude) ----
// Global: lado do rail (global) + lado padrão do Claude. Por projeto: só o lado
// do Claude (override). Espelha o padrão de projectCli — string 'left'/'right',
// qualquer outra coisa cai em 'left'.
const sideOf = (v) => (v === 'right' ? 'right' : 'left');
ipcMain.handle('layout:get', () => {
  const l = loadConfig().layout || {};
  return { railSide: sideOf(l.railSide), claudeSide: sideOf(l.claudeSide) };
});
ipcMain.handle('layout:set', (evt, { railSide, claudeSide }) => {
  const c = loadConfig();
  c.layout = { railSide: sideOf(railSide), claudeSide: sideOf(claudeSide) };
  saveConfig(c);
  return { ok: true };
});
ipcMain.handle('layout:getProject', (evt, { projectPath }) => {
  const p = loadConfig().projectLayout?.[projectPath];
  return (p && (p.claudeSide === 'left' || p.claudeSide === 'right')) ? { claudeSide: p.claudeSide } : null;
});
ipcMain.handle('layout:setProject', (evt, { projectPath, claudeSide }) => {
  const c = loadConfig();
  c.projectLayout = c.projectLayout || {};
  if (claudeSide === 'left' || claudeSide === 'right') c.projectLayout[projectPath] = { claudeSide };
  else delete c.projectLayout[projectPath];
  saveConfig(c);
  return { ok: true };
});
```

- [ ] **Step 2: Expor as pontes no `preload.js`**

Logo após a linha `setAi: (projectPath, cli, custom) => ...` (linha 33), inserir:

```js
  getLayout: () => ipcRenderer.invoke('layout:get'),
  setLayout: (layout) => ipcRenderer.invoke('layout:set', layout),
  getProjectLayout: (projectPath) => ipcRenderer.invoke('layout:getProject', { projectPath }),
  setProjectLayout: (projectPath, claudeSide) => ipcRenderer.invoke('layout:setProject', { projectPath, claudeSide }),
```

- [ ] **Step 3: Verificar manualmente a ponte**

Run: `npm run build`
Expected: build conclui sem erro. (O efeito real é testado nas tasks seguintes, dentro do app.)

- [ ] **Step 4: Commit**

```bash
git add main.js preload.js
git commit -m "feat: handlers IPC de layout (global + por projeto)"
```

---

### Task 3: `LayoutProvider` (estado global + espelho + sync com o main)

**Files:**
- Create: `src/lib/layoutContext.jsx`
- Modify: `src/main.jsx` (envolver `<App/>` com `<LayoutProvider>`)

**Interfaces:**
- Consumes: `window.api.getLayout()` / `setLayout()` (Task 2).
- Produces: hook `useLayout()` → `{ railSide, claudeSide, setRailSide(side), setClaudeSideGlobal(side), setPreset(railSide, claudeSide) }`. Cada setter persiste no `localStorage` (chave `layoutGlobal:v1`) e no `config.json` via `setLayout`.

- [ ] **Step 1: Criar o provider**

Create `src/lib/layoutContext.jsx`:

```jsx
import { createContext, useContext, useEffect, useState } from 'react';

// Layout GLOBAL (lado do rail + lado padrão do Claude). Espelhado em localStorage
// pra ler síncrono no boot (sem piscar); o config.json é a fonte da verdade e
// re-sincroniza ao montar. O override POR PROJETO mora no App (depende do ativo).
const LKEY = 'layoutGlobal:v1';
const sideOf = (v) => (v === 'right' ? 'right' : 'left');

function readMirror() {
  try {
    const s = JSON.parse(localStorage.getItem(LKEY) || '{}');
    return { railSide: sideOf(s.railSide), claudeSide: sideOf(s.claudeSide) };
  } catch { return { railSide: 'left', claudeSide: 'left' }; }
}

const LayoutCtx = createContext({
  railSide: 'left', claudeSide: 'left',
  setRailSide: () => {}, setClaudeSideGlobal: () => {}, setPreset: () => {},
});

export function LayoutProvider({ children }) {
  const [global, setGlobal] = useState(readMirror);

  // Re-sincroniza com o config.json ao montar (fonte da verdade).
  useEffect(() => {
    let alive = true;
    window.api.getLayout?.().then((l) => {
      if (!alive || !l) return;
      setGlobal({ railSide: sideOf(l.railSide), claudeSide: sideOf(l.claudeSide) });
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Grava no espelho local + main sempre que muda.
  const persist = (next) => {
    setGlobal(next);
    try { localStorage.setItem(LKEY, JSON.stringify(next)); } catch {}
    window.api.setLayout?.(next);
  };

  const value = {
    railSide: global.railSide,
    claudeSide: global.claudeSide,
    setRailSide: (s) => persist({ ...global, railSide: sideOf(s) }),
    setClaudeSideGlobal: (s) => persist({ ...global, claudeSide: sideOf(s) }),
    setPreset: (r, c) => persist({ railSide: sideOf(r), claudeSide: sideOf(c) }),
  };
  return <LayoutCtx.Provider value={value}>{children}</LayoutCtx.Provider>;
}

export function useLayout() { return useContext(LayoutCtx); }
```

- [ ] **Step 2: Montar o provider no `main.jsx`**

Em `src/main.jsx`, adicionar o import e envolver o `<App/>` (dentro do `ThemeProvider`):

```jsx
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ThemeProvider } from './lib/theme.jsx';
import { LayoutProvider } from './lib/layoutContext.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import './index.css';
```

E o render:

```jsx
createRoot(document.getElementById('root')).render(
  <ThemeProvider>
    <LayoutProvider>
      <ErrorBoundary label="Carcará Code">
        <App />
      </ErrorBoundary>
    </LayoutProvider>
  </ThemeProvider>
);
```

- [ ] **Step 3: Build e fumaça**

Run: `npm run build`
Expected: build conclui sem erro. (O provider ainda não muda nada visível — consumido na Task 4.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/layoutContext.jsx src/main.jsx
git commit -m "feat: LayoutProvider com espelho local e sync com o main"
```

---

### Task 4: `App` renderiza rail e painéis pelo layout efetivo (sem drag ainda)

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `useLayout()` (Task 3), `resolveLayout` (Task 1), `window.api.getProjectLayout()` / `setProjectLayout()` (Task 2).
- Produces (dentro do `App`, usadas pelas Tasks 6/8):
  - estado `projectOverride` (`{ claudeSide } | null`) e setter `setClaudeSideForProject(side)` que persiste o override do projeto ativo.
  - `eff = resolveLayout({ railSide, claudeSide }, projectOverride)` com `eff.railSide` / `eff.claudeSide`.

- [ ] **Step 1: Importar layout e ícones**

No topo de `src/App.jsx`, ajustar os imports:

```jsx
import { useLayout } from './lib/layoutContext.jsx';
import { resolveLayout } from './lib/layout.js';
```

(Os ícones `ChevronLeft`/`ChevronRight` já são importados de `lucide-react` na linha 2 — manter.)

- [ ] **Step 2: Ler o layout efetivo e o override do projeto**

Dentro do componente `App`, logo após `const { toggle: toggleTheme } = useTheme();` (linha 24), adicionar:

```jsx
  const { railSide, claudeSide } = useLayout();
  // Override de layout do projeto ATIVO (só o lado do Claude). Cache local primeiro
  // (sem piscar), depois confirma com o main. Chave por caminho.
  const PKEY = (p) => `projectLayout:v1:${p}`;
  const [projectOverride, setProjectOverride] = useState(null);
```

E, junto dos outros `useEffect`, adicionar o carregamento por projeto ativo (pode ficar logo após o effect que sincroniza `activeRef`/`projectsRef`, ~linha 103):

```jsx
  // Carrega o override de layout do projeto ativo ao trocar de projeto.
  useEffect(() => {
    if (!active) { setProjectOverride(null); return; }
    try { const s = localStorage.getItem(PKEY(active.path)); setProjectOverride(s ? JSON.parse(s) : null); }
    catch { setProjectOverride(null); }
    let alive = true;
    window.api.getProjectLayout?.(active.path).then((o) => {
      if (!alive) return;
      setProjectOverride(o || null);
      try {
        if (o) localStorage.setItem(PKEY(active.path), JSON.stringify(o));
        else localStorage.removeItem(PKEY(active.path));
      } catch {}
    }).catch(() => {});
    return () => { alive = false; };
  }, [active]);

  // Grava o lado do Claude SÓ pro projeto ativo (usado pelo drag do painel).
  const setClaudeSideForProject = (side) => {
    if (!active) return;
    const o = { claudeSide: side === 'right' ? 'right' : 'left' };
    setProjectOverride(o);
    try { localStorage.setItem(PKEY(active.path), JSON.stringify(o)); } catch {}
    window.api.setProjectLayout?.(active.path, o.claudeSide);
  };

  const eff = resolveLayout({ railSide, claudeSide }, projectOverride);
  const claudeLeft = eff.claudeSide === 'left';
  const railFirst = eff.railSide === 'left';
  // Posição da "bolinha" de reabrir o chat: colada na borda EXTERNA do chat.
  const expandStyle = claudeLeft
    ? { left: Math.max(0, (railFirst ? railWidth : 0) - 14) }
    : { right: Math.max(0, (railFirst ? 0 : railWidth) - 14) };
```

- [ ] **Step 3: Substituir o `return` por uma versão com ordem condicional**

Trocar o JSX do `return (...)` (linhas 275-409) por esta versão. As mudanças: rail+resizebar viram blocos reordenáveis; chat e preview trocam de ordem e de `order`; os ícones de recolher/expandir seguem o lado.

```jsx
  const railEl = (
    <Rail
      projects={projects}
      active={active}
      activity={activity}
      onOpen={setActive}
      onAdd={addProjects}
      onRemove={setPendingRemove}
      onRestart={restartProject}
      onStop={stopProject}
      onReorder={reorderProjects}
      onOpenSettings={() => setSettingsOpen(true)}
      onSearch={() => setPaletteOpen(true)}
      width={railWidth}
    />
  );
  const barEl = <ResizeBar onMouseDown={startRailResize} />;

  const chatPanel = (
    <ResizablePanel
      ref={chatPanelRef}
      id="chat"
      order={claudeLeft ? 1 : 2}
      defaultSize={34}
      minSize={22}
      collapsible
      collapsedSize={0}
      onCollapse={() => setChatCollapsed(true)}
      onExpand={() => setChatCollapsed(false)}
      className={'flex flex-col ' + (claudeLeft ? 'border-r' : 'border-l')}
    >
      <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <span className="truncate text-[15px] font-semibold">
          {active ? active.name : 'Selecione um projeto'}
        </span>
        {active?.hasPkg && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => previewControls.current?.restart?.()}
              onMouseEnter={() => restartIcon.current?.startAnimation?.()}
              onMouseLeave={() => restartIcon.current?.stopAnimation?.()}
              title="Reiniciar servidor"
              className="flex h-8 items-center gap-1.5 rounded-md bg-secondary px-2.5 text-[13px] font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground [&_svg]:size-[15px]"
            >
              <RefreshCCWIcon ref={restartIcon} />Reiniciar
            </button>
            <button
              type="button"
              onClick={() => previewControls.current?.stop?.()}
              onMouseEnter={() => stopIcon.current?.startAnimation?.()}
              onMouseLeave={() => stopIcon.current?.stopAnimation?.()}
              disabled={serverMode !== 'web'}
              title="Parar servidor"
              className="flex h-8 items-center gap-1.5 rounded-md bg-secondary px-2.5 text-[13px] font-medium text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[15px]"
            >
              <XIcon ref={stopIcon} />Parar
            </button>
          </div>
        )}
      </div>
      <ErrorBoundary label="Chat">
        <ChatPanel activeProject={active?.path || null} controlsRef={chatControls} />
      </ErrorBoundary>
    </ResizablePanel>
  );

  const handleEl = (
    <ResizableHandle withHandle>
      {!chatCollapsed && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={toggleChat}
          title="Recolher chat"
          className="absolute left-1/2 top-1/3 z-20 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-md transition-colors hover:bg-muted hover:text-foreground"
        >
          {claudeLeft ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      )}
    </ResizableHandle>
  );

  const previewPanel = (
    <ResizablePanel id="preview" order={claudeLeft ? 2 : 1} minSize={28} className="flex flex-col">
      <ErrorBoundary label="Preview">
        <PreviewPanel active={active} onProjectsChanged={reload} controlsRef={previewControls} onModeChange={setServerMode} />
      </ErrorBoundary>
    </ResizablePanel>
  );

  return (
    <div className="relative flex h-screen bg-background text-foreground">
      {railFirst && <>{railEl}{barEl}</>}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {claudeLeft ? <>{chatPanel}{handleEl}{previewPanel}</> : <>{previewPanel}{handleEl}{chatPanel}</>}
      </ResizablePanelGroup>
      {!railFirst && <>{barEl}{railEl}</>}

      {pendingRemove && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onMouseDown={() => setPendingRemove(null)}
        >
          <div
            className="w-[340px] rounded-lg border bg-background p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold">Remover projeto</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Remover <span className="font-medium text-foreground">{pendingRemove.name}</span> da lista?
              <br />O projeto no disco NÃO é apagado.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPendingRemove(null)}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={confirmRemove}>Remover</Button>
            </div>
          </div>
        </div>
      )}

      {/* Bolinha de reabrir o chat: colada na borda externa do chat (segue o lado). */}
      {chatCollapsed && (
        <button
          type="button"
          onClick={() => chatPanelRef.current?.expand()}
          style={expandStyle}
          title="Expandir chat"
          className="absolute top-1/3 z-40 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-md transition-colors hover:bg-muted hover:text-foreground"
        >
          {claudeLeft ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      )}

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <SetupScreen open={setupOpen} onClose={closeSetup} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
        activePath={active?.path || null}
        onOpenFile={openFileFromPalette}
      />
      {railResizing && <div className="fixed inset-0 z-50 cursor-col-resize" />}
      <Toaster />
    </div>
  );
```

- [ ] **Step 4: Build e teste manual**

Run: `npm run build`
Expected: build sem erro.

Teste manual (com o app reaberto pelo usuário):
1. No DevTools do app: `localStorage.setItem('layoutGlobal:v1', JSON.stringify({railSide:'right',claudeSide:'right'}))` e recarregar (Ctrl+R) → rail vai pra direita e o Claude fica à direita do Preview.
2. Voltar: `localStorage.setItem('layoutGlobal:v1', JSON.stringify({railSide:'left',claudeSide:'left'}))` + Ctrl+R → layout original.
3. Recolher/expandir o chat nas duas configurações → os ícones e a bolinha aparecem no lado certo.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: App renderiza rail/paineis pelo layout efetivo (lado do rail e do Claude)"
```

---

### Task 5: Extrair `computeZone`/`ZONE_STYLE` para módulo compartilhado

**Files:**
- Create: `src/lib/dropZones.js`
- Modify: `src/components/ChatPanel.jsx` (remover as cópias locais, importar do módulo)

**Interfaces:**
- Produces: `computeZone(x, y) → 'center'|'left'|'right'|'top'|'bottom'` e `ZONE_STYLE` (mapa de estilos inline por zona). Comportamento idêntico ao atual em `ChatPanel.jsx`.

- [ ] **Step 1: Criar o módulo compartilhado**

Create `src/lib/dropZones.js` (copiar verbatim de [ChatPanel.jsx:84-102](../../../src/components/ChatPanel.jsx)):

```js
// Zonas de drop pro arrastar-e-soltar (sessões e painéis). 'center' = miolo;
// senão, a borda/canto mais próxima do cursor (coords relativas 0..1).
export function computeZone(x, y) {
  const margin = 0.28;
  const d = { left: x, right: 1 - x, top: y, bottom: 1 - y };
  const min = Math.min(d.left, d.right, d.top, d.bottom);
  if (min > margin) return 'center';
  if (min === d.left) return 'left';
  if (min === d.right) return 'right';
  if (min === d.top) return 'top';
  return 'bottom';
}

// Estilo (inset) do realce de cada zona — metade/inteiro do alvo.
export const ZONE_STYLE = {
  center: { inset: 0 },
  left: { left: 0, top: 0, bottom: 0, width: '50%' },
  right: { right: 0, top: 0, bottom: 0, width: '50%' },
  top: { left: 0, right: 0, top: 0, height: '50%' },
  bottom: { left: 0, right: 0, bottom: 0, height: '50%' },
};
```

- [ ] **Step 2: Importar no `ChatPanel.jsx` e remover as cópias locais**

Em `src/components/ChatPanel.jsx`, adicionar ao bloco de imports (junto da linha 12-13):

```jsx
import { computeZone, ZONE_STYLE } from '@/lib/dropZones.js';
```

E **remover** as definições locais `computeZone` (linhas 84-94) e `ZONE_STYLE` (linhas 96-102) — agora vêm do módulo.

- [ ] **Step 3: Build e fumaça**

Run: `npm run build`
Expected: build sem erro.

Teste manual: abrir um projeto, criar 2 sessões, arrastar uma aba pela metade da tela → o realce de zona (esquerda/direita/cima/baixo) continua funcionando como antes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/dropZones.js src/components/ChatPanel.jsx
git commit -m "refactor: extrai computeZone/ZONE_STYLE pra lib/dropZones (compartilhado)"
```

---

### Task 6: Arrastar o painel do Claude (override por projeto)

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `setClaudeSideForProject(side)` e `eff` (Task 4); `ZONE_STYLE` (Task 5).
- Produces: estado `dragMode` (`null | 'panel' | 'rail'`) + `dragZone` (`'left'|'right'|null`) e o overlay full-screen de drop — reaproveitado pela Task 7. Punho arrastável no cabeçalho do chat.

- [ ] **Step 1: Importar o ícone de punho e o ZONE_STYLE**

No topo de `src/App.jsx`:

```jsx
import { GripVertical } from 'lucide-react';
import { ZONE_STYLE } from './lib/dropZones.js';
```

(Adicionar `GripVertical` à lista já importada de `lucide-react`, ou em import separado.)

- [ ] **Step 2: Estado do arraste de painel**

Junto dos outros `useState` do `App` (após `chatCollapsed`, ~linha 46):

```jsx
  // Arraste do painel inteiro (Claude) ou do rail. dragMode diz o quê; dragZone, o lado.
  const [dragMode, setDragMode] = useState(null);   // null | 'panel' | 'rail'
  const [dragZone, setDragZone] = useState(null);    // 'left' | 'right' | null
  const endLayoutDrag = () => { setDragMode(null); setDragZone(null); };
  const onLayoutDrop = (zone) => {
    if (dragMode === 'panel') setClaudeSideForProject(zone);
    else if (dragMode === 'rail') setRailSide(zone);
    endLayoutDrag();
  };
```

`setRailSide` vem do `useLayout()` — ajustar a desestruturação da Task 4 para incluí-lo:

```jsx
  const { railSide, claudeSide, setRailSide } = useLayout();
```

- [ ] **Step 3: Punho arrastável no cabeçalho do chat**

Dentro de `chatPanel` (Task 4), no `<div className="flex h-12 ...">`, adicionar o punho como PRIMEIRO filho (antes do `<span>` do nome), visível quando há projeto:

```jsx
        {active && (
          <span
            draggable
            onDragStart={(e) => { try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'panel'); } catch {} setDragMode('panel'); setDragZone(null); }}
            onDragEnd={endLayoutDrag}
            title="Arraste para mover o Claude de lado"
            className="grid size-7 shrink-0 cursor-grab place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing [&_svg]:size-[15px]"
          >
            <GripVertical />
          </span>
        )}
```

- [ ] **Step 4: Overlay full-screen de drop (contorna o webview)**

Adicionar, logo antes do `{railResizing && ...}` no `return`:

```jsx
      {dragMode && (
        <div
          className="fixed inset-0 z-50"
          onDragOver={(e) => { e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch {} const z = e.clientX < window.innerWidth / 2 ? 'left' : 'right'; setDragZone((p) => (p === z ? p : z)); }}
          onDrop={(e) => { e.preventDefault(); onLayoutDrop(e.clientX < window.innerWidth / 2 ? 'left' : 'right'); }}
          onDragEnd={endLayoutDrag}
        >
          {dragZone && (
            <div
              className="pointer-events-none absolute rounded-sm border-2 border-primary bg-primary/20 transition-all duration-100"
              style={ZONE_STYLE[dragZone]}
            />
          )}
        </div>
      )}
```

- [ ] **Step 5: Build e teste manual**

Run: `npm run build`
Expected: build sem erro.

Teste manual:
1. Abrir projeto A. Pegar o punho (☰) no cabeçalho do Claude e arrastar pra metade direita → realce acende à direita; soltar → Claude vai pra direita.
2. Reabrir projeto A depois de trocar pra outro e voltar → Claude continua à direita (override salvo).
3. Abrir projeto B → continua com o padrão (esquerda); o override é só do A.
4. Soltar com o cursor SOBRE a área do Preview funciona (overlay cobre o webview).

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: arrastar o painel do Claude pra trocar de lado (override por projeto)"
```

---

### Task 7: Arrastar o rail (global)

**Files:**
- Modify: `src/components/Rail.jsx` (punho de arraste no topo)
- Modify: `src/App.jsx` (passar callbacks ao Rail)

**Interfaces:**
- Consumes: `dragMode`/`setDragMode`/`endLayoutDrag` e o overlay (Task 6); `setRailSide` (Task 3, já tratado no `onLayoutDrop`).
- Produces: props novas no `Rail`: `onRailDragStart()` e `onRailDragEnd()`.

- [ ] **Step 1: Aceitar as props no `Rail`**

Em `src/components/Rail.jsx`, na assinatura da função (linha 8), adicionar `onRailDragStart` e `onRailDragEnd`:

```jsx
export function Rail({ projects, active, activity = {}, onOpen, onAdd, onRemove, onRestart, onStop, onReorder, onOpenSettings, onSearch, onRailDragStart, onRailDragEnd, width = 64 }) {
```

- [ ] **Step 2: Importar o ícone de punho**

No import de `lucide-react` (linha 2), adicionar `GripHorizontal`:

```jsx
import { Plus, Trash2, RotateCcw, Square, GripHorizontal } from 'lucide-react';
```

- [ ] **Step 3: Punho de arraste no topo do rail**

Dentro do `<div className="flex shrink-0 flex-col items-center px-2">` (logo antes do botão de busca, ~linha 49), adicionar o punho — `draggable`, separado do drag de reordenar itens:

```jsx
        <span
          draggable
          onDragStart={(e) => { try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'rail'); } catch {} onRailDragStart?.(); }}
          onDragEnd={() => onRailDragEnd?.()}
          title="Arraste para mover a barra de lado"
          className="mb-1.5 grid h-5 w-7 cursor-grab place-items-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing [&_svg]:size-3.5"
        >
          <GripHorizontal />
        </span>
```

- [ ] **Step 4: Ligar os callbacks no `App`**

No `railEl` (Task 4), adicionar as props:

```jsx
      onRailDragStart={() => { setDragMode('rail'); setDragZone(null); }}
      onRailDragEnd={endLayoutDrag}
```

- [ ] **Step 5: Build e teste manual**

Run: `npm run build`
Expected: build sem erro.

Teste manual:
1. Pegar o punho (⋯) no topo do rail e arrastar pra metade direita → soltar → o rail vai pra direita.
2. Trocar de projeto → o rail continua à direita (é global).
3. Recarregar o app (Ctrl+R) → o rail continua à direita (persistido).
4. Reordenar projetos (arrastar um ícone) continua funcionando — o punho não atrapalha.

- [ ] **Step 6: Commit**

```bash
git add src/components/Rail.jsx src/App.jsx
git commit -m "feat: arrastar o rail pra trocar de lado (global)"
```

---

### Task 8: Presets de layout em Configurações › Aparência

**Files:**
- Modify: `src/components/SettingsModal.jsx`

**Interfaces:**
- Consumes: `useLayout()` → `{ railSide, claudeSide, setPreset }` (Task 3).
- Produces: seção "Layout" na aba Aparência com 4 presets clicáveis e miniaturas.

- [ ] **Step 1: Importar o hook de layout**

Em `src/components/SettingsModal.jsx`, adicionar:

```jsx
import { useLayout } from '@/lib/layoutContext.jsx';
```

E dentro de `SettingsModal`, junto do `useTheme()` (linha 94):

```jsx
  const { railSide, claudeSide, setPreset } = useLayout();
```

- [ ] **Step 2: Componente de miniatura + lista de presets**

Antes do `export function SettingsModal` (após os ícones, ~linha 91), adicionar:

```jsx
// Os 4 layouts possíveis (lado do rail x lado do Claude). 'r' = rail, 'c'=Claude, 'p'=preview.
const LAYOUT_PRESETS = [
  { rail: 'left', claude: 'left', label: 'Rail e Claude à esquerda' },
  { rail: 'left', claude: 'right', label: 'Rail à esquerda, Claude à direita' },
  { rail: 'right', claude: 'left', label: 'Rail à direita, Claude à esquerda' },
  { rail: 'right', claude: 'right', label: 'Rail e Claude à direita' },
];

// Miniatura do layout: barra fina = rail; bloco com borda = Claude; bloco claro = preview.
function LayoutThumb({ rail, claude }) {
  const railBar = <span key="r" className="h-full w-1.5 rounded-sm bg-primary/70" />;
  const claudeBox = <span key="c" className="h-full flex-1 rounded-sm border border-primary bg-primary/20" />;
  const previewBox = <span key="p" className="h-full flex-1 rounded-sm bg-muted-foreground/20" />;
  const panels = claude === 'left' ? [claudeBox, previewBox] : [previewBox, claudeBox];
  const all = rail === 'left' ? [railBar, ...panels] : [...panels, railBar];
  return <span className="flex h-10 w-full items-stretch gap-1">{all}</span>;
}
```

- [ ] **Step 3: Renderizar a seção na aba Aparência**

Dentro do bloco `{tab === 'appearance' && (...)}`, após o bloco "Aparência do terminal" (depois do `</div>` que fecha o grid de 3 colunas, ~linha 318), adicionar:

```jsx
              <div className="mt-8 flex items-center gap-2 text-[13px] font-medium">
                <Monitor className="h-4 w-4" /> Layout (posição do painel e do rail)
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Define o padrão de TODOS os projetos. Você ainda pode arrastar o painel do
                Claude num projeto específico pra trocar só o lado dele.
              </p>
              <div className="mt-3 grid max-w-md grid-cols-2 gap-2">
                {LAYOUT_PRESETS.map((preset) => {
                  const active = railSide === preset.rail && claudeSide === preset.claude;
                  return (
                    <button
                      key={preset.rail + preset.claude}
                      type="button"
                      onClick={() => setPreset(preset.rail, preset.claude)}
                      title={preset.label}
                      className={cn(
                        'flex flex-col gap-2 rounded-md border p-3 transition-colors hover:bg-muted',
                        active && 'border-primary ring-1 ring-primary'
                      )}
                    >
                      <LayoutThumb rail={preset.rail} claude={preset.claude} />
                      <span className="text-[11px] text-muted-foreground">{preset.label}</span>
                    </button>
                  );
                })}
              </div>
```

(`Monitor` e `cn` já estão importados no arquivo.)

- [ ] **Step 4: Build e teste manual**

Run: `npm run build`
Expected: build sem erro.

Teste manual:
1. Abrir Configurações › Aparência → ver os 4 presets; o ativo está realçado.
2. Clicar no preset "Rail e Claude à direita" → fechar Configurações → rail e Claude vão pra direita.
3. Num projeto com override (arrastado antes), o override do Claude continua valendo; trocar o preset muda só os projetos sem override.
4. Recarregar (Ctrl+R) → o preset escolhido persiste.

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsModal.jsx
git commit -m "feat: presets de layout em Configuracoes > Aparencia"
```

---

## Self-Review

**Spec coverage:**
- Modelo de estado (global + por projeto) → Task 1 (`resolveLayout`), Task 2 (persistência), Task 3 (global no renderer), Task 4 (override por projeto). ✓
- IPC/preload → Task 2. ✓
- Boot instantâneo com espelho local → Task 3 (`layoutGlobal:v1`) e Task 4 (`projectLayout:v1:<path>`). ✓
- Renderização condicional (rail/painéis + botões flutuantes) → Task 4. ✓
- Drag do painel do Claude (override) com overlay anti-webview → Task 6. ✓
- Drag do rail (global) → Task 7. ✓
- Reuso `computeZone`/`ZONE_STYLE` → Task 5. ✓
- Presets em Configurações › Aparência → Task 8. ✓
- Testes (unidade na função pura + manual) → Task 1 (vitest) + passos manuais em cada task. ✓
- Fora de escopo (stacked, override de rail) → respeitado (só left/right; rail global). ✓

**Placeholder scan:** sem TBD/TODO; todo passo de código mostra o código completo.

**Type consistency:**
- `resolveLayout(global, projectOverride)` → `{ railSide, claudeSide }` usado igual nas Tasks 4/6/8.
- `setClaudeSideForProject(side)` (Task 4) consumido na Task 6.
- `setRailSide`/`setPreset` (Task 3) consumidos nas Tasks 7/8.
- `dragMode`/`dragZone`/`onLayoutDrop` (Task 6) reaproveitados na Task 7.
- `window.api`: `getLayout/setLayout/getProjectLayout/setProjectLayout` (Task 2) consumidos nas Tasks 3/4 com as mesmas assinaturas.
- `computeZone`/`ZONE_STYLE` (Task 5) consumidos nas Tasks 6 (ZONE_STYLE) e ChatPanel.

Nenhuma inconsistência encontrada.
