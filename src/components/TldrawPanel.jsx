import { useCallback } from 'react';
import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';
import { useTheme } from '@/lib/theme.jsx';

// Quadro branco (tldraw) embutido — roda 100% local, sem servidor.
// Persistência automática no IndexedDB do usuário via `persistenceKey`
// (cada projeto tem seu próprio quadro). Este módulo arrasta todo o
// tldraw + CSS, então só é importado sob demanda (lazy) ao abrir a aba
// Quadro — fica fora do bundle de boot, igual CodeView/ShellView.
export function TldrawPanel({ active }) {
  const { isDark } = useTheme();
  // Quadro por projeto; sem projeto, um quadro global.
  const persistenceKey = `carcara-board:${active?.path || 'global'}`;

  const onMount = useCallback(
    (editor) => {
      editor.user.updateUserPreferences({ colorScheme: isDark ? 'dark' : 'light' });
    },
    [isDark],
  );

  return (
    <div className="absolute inset-0 bg-background">
      <Tldraw persistenceKey={persistenceKey} onMount={onMount} />
    </div>
  );
}

export default TldrawPanel;
