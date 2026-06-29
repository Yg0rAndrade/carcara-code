import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ThemeProvider } from './lib/theme.jsx';
import { LanguageProvider } from './lib/i18n.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import './index.css';

window.addEventListener('error', (e) => {
  console.error('GLOBAL ERROR:', e.message, '\n', e.error && e.error.stack);
});

createRoot(document.getElementById('root')).render(
  <ThemeProvider>
    <LanguageProvider>
      <ErrorBoundary label="Carcará Code">
        <App />
      </ErrorBoundary>
    </LanguageProvider>
  </ThemeProvider>
);

function dismissSplash() {
  const s = document.getElementById('splash');
  const root = document.getElementById('root');
  if (!s || !root || root.childElementCount === 0) return;
  s.style.opacity = '0';
  setTimeout(() => s.remove(), 400);
}
requestAnimationFrame(() => requestAnimationFrame(dismissSplash));
