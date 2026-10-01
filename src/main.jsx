import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ThemeProvider } from './lib/theme.jsx';
import { LanguageProvider } from './lib/i18n.jsx';
import { LayoutProvider } from './lib/layoutContext.jsx';
import { ChatModeProvider } from './lib/chatModeContext.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import './index.css';
import { applyTextScale } from './lib/textScale';

// Tamanho do texto salvo (Configurações > Aparência) antes do 1º render: sem piscar.
applyTextScale();

window.addEventListener('error', (e) => {
  console.error('GLOBAL ERROR:', e.message, '\n', e.error && e.error.stack);
});

// Chunk lazy que falha ao carregar = o dist/ foi reconstruído embaixo da janela aberta
// (o hash do arquivo muda a cada build; a index.html em memória aponta pro nome antigo,
// que já não existe → "Failed to fetch dynamically imported module"). O Vite dispara
// 'vite:preloadError' nesse caso. Recarrega UMA vez pra buscar a index/chunks novos —
// reconecta às sessões vivas (os pty ficam no main, iguais ao botão Recarregar). O
// throttle evita loop apertado se o reload não resolver (ex.: build quebrado): aí deixa
// o ErrorBoundary aparecer com o "Recarregar" manual.
window.addEventListener('vite:preloadError', (e) => {
  const KEY = 'preloadReloadAt';
  const last = Number(sessionStorage.getItem(KEY) || 0);
  if (Date.now() - last < 10000) return;
  e.preventDefault();
  sessionStorage.setItem(KEY, String(Date.now()));
  window.location.reload();
});

createRoot(document.getElementById('root')).render(
  <ThemeProvider>
    <LanguageProvider>
      <LayoutProvider>
        <ChatModeProvider>
          <ErrorBoundary label="Carcará Code">
            <App />
          </ErrorBoundary>
        </ChatModeProvider>
      </LayoutProvider>
    </LanguageProvider>
  </ThemeProvider>,
);

function dismissSplash() {
  const s = document.getElementById('splash');
  const root = document.getElementById('root');
  if (!s || !root || root.childElementCount === 0) return;
  s.style.opacity = '0';
  setTimeout(() => s.remove(), 400);
}
requestAnimationFrame(() => requestAnimationFrame(dismissSplash));
