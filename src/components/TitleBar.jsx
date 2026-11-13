// Barra de título enxuta, no espírito do SquadOS Studio: ícone do rail, dois menus em
// texto (Projetos e Configurações) e o tema à direita. O SO só desenha os botões da janela
// por cima (Win/Linux à direita, com fundo transparente; semáforo do Mac à esquerda). A
// área vazia arrasta a janela e o duplo clique maximiza; botões e menus ficam fora disso.
import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Folder as FolderIcon,
  FolderPlus,
  PanelLeft,
  Server,
  SquareTerminal,
} from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme.jsx';
import { cn } from '@/lib/utils';
import { toOpaqueHex } from '@/lib/titleBarColors.js';
import { ThemeMenu } from './ThemeMenu.jsx';
// SVG cru (fill="currentColor"): o carcará pega a cor do texto, então segue o tema.
import logoSvg from '@/assets/logo.svg?raw';

const DRAG = '[-webkit-app-region:drag]';
const NO_DRAG = '[-webkit-app-region:no-drag]';
const DEFAULT_HEIGHT = 36; // até o main responder; a fonte da verdade é platform.cjs

// Abas das Configurações, na mesma ordem da navegação do SettingsModal.
const SETTINGS_TABS = [
  ['ai', 'settings.tabAi'],
  ['clis', 'settings.tabClis'],
  ['appearance', 'settings.tabAppearance'],
  ['code', 'settings.tabCode'],
  ['terminal', 'settings.tabTerminal'],
  ['deps', 'settings.tabDeps'],
  ['language', 'settings.tabLanguage'],
  ['whatsnew', 'settings.tabWhatsNew'],
  null,
  ['about', 'settings.tabAbout'],
];

function MenuItem({ icon: Icon, checked, disabled, onClick, children }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] hover:bg-muted disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5 [&_svg]:shrink-0"
    >
      {Icon ? <Icon className="text-muted-foreground" /> : <span className="w-3.5" />}
      <span className="flex-1 truncate">{children}</span>
      {checked && <Check className="text-primary" />}
    </button>
  );
}

export function TitleBar({
  active,
  onAdd,
  onAddFolder,
  onAddRemote,
  railHidden,
  onToggleRail,
  terminalOpen,
  onToggleTerminal,
  onOpenSettingsTab,
}) {
  const t = useT();
  const { theme } = useTheme();
  const barRef = useRef(null);
  const [info, setInfo] = useState({ insetLeft: 0, height: DEFAULT_HEIGHT });
  const [openMenu, setOpenMenu] = useState(null); // 'projects' | 'settings' | null

  useEffect(() => {
    window.api
      .titleBarInfo?.()
      .then(
        (i) => i && setInfo({ insetLeft: i.insetLeft || 0, height: i.height || DEFAULT_HEIGHT }),
      )
      .catch(() => {});
  }, []);

  // Telas cheias (Configurações, preparo, paleta) começam abaixo da barra: a área de
  // arrastar e os botões nativos ficam por cima de tudo e engoliriam os cliques ali.
  useEffect(() => {
    document.documentElement.style.setProperty('--titlebar-h', `${info.height}px`);
  }, [info.height]);

  // Cor do símbolo dos botões nativos segue o texto da barra. Lê no quadro seguinte: o
  // efeito do ThemeProvider (que troca a classe `.dark`) roda DEPOIS deste, porque efeito
  // de filho roda antes do de pai — ler agora pegaria a cor antiga.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const el = barRef.current;
      if (!el) return;
      const cs = getComputedStyle(el);
      const symbolColor = toOpaqueHex(cs.color, cs.backgroundColor);
      if (symbolColor) window.api.setTitleBarColors?.({ symbolColor });
    });
    return () => cancelAnimationFrame(raf);
  }, [theme]);

  // Menu aberto: fecha no clique fora ou no Esc.
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e) => {
      if (barRef.current && !barRef.current.contains(e.target)) setOpenMenu(null);
    };
    const onKey = (e) => e.key === 'Escape' && setOpenMenu(null);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  const run = (fn) => () => {
    setOpenMenu(null);
    fn?.();
  };

  // Botão de menu: clique abre/fecha; com um menu aberto, passar o mouse troca de menu
  // (como a barra de menus do Windows e do VS Code).
  const menu = (id, label, items) => (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={openMenu === id}
        onClick={() => setOpenMenu((cur) => (cur === id ? null : id))}
        onMouseEnter={() => openMenu && openMenu !== id && setOpenMenu(id)}
        className={cn(
          NO_DRAG,
          'flex h-7 items-center rounded-md px-2.5 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground',
          openMenu === id && 'bg-muted text-foreground',
        )}
      >
        {label}
      </button>
      {openMenu === id && (
        <div
          role="menu"
          className={cn(
            NO_DRAG,
            'absolute left-0 top-full z-50 mt-1 min-w-[220px] overflow-hidden rounded-md border bg-popover py-1 text-popover-foreground shadow-lg duration-100 animate-in fade-in slide-in-from-top-1',
          )}
        >
          {items}
        </div>
      )}
    </div>
  );

  const iconButton =
    'grid size-7 place-items-center rounded-md text-foreground/70 transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4';

  return (
    <header
      ref={barRef}
      className={cn(DRAG, 'relative z-[80] shrink-0 select-none border-b bg-card text-foreground')}
      style={{ height: info.height, paddingLeft: info.insetLeft }}
    >
      {/* Largura útil = a janela menos os botões do SO (variável CSS do Window Controls
          Overlay; sem overlay, ocupa tudo). */}
      <div
        className="flex h-full items-center gap-1 px-2"
        style={{ width: 'env(titlebar-area-width, 100%)' }}
      >
        {/* Marca do app no canto (área de arrastar: não é botão). */}
        <span
          aria-hidden="true"
          className="ml-0.5 mr-1 grid size-5 shrink-0 place-items-center [&_svg]:h-full [&_svg]:w-full"
          // Cor da marca (a mesma do ícone do app e do favicon do site), não a primary.
          style={{ color: '#D99748' }}
          dangerouslySetInnerHTML={{ __html: logoSvg }}
        />
        <button
          type="button"
          onClick={onToggleRail}
          title={t('titlebar.toggle_rail')}
          aria-label={t('titlebar.toggle_rail')}
          aria-pressed={!railHidden}
          className={cn(NO_DRAG, iconButton)}
        >
          <PanelLeft />
        </button>

        <nav className="ml-1 flex items-center gap-0.5" role="menubar">
          {menu(
            'projects',
            t('titlebar.projects'),
            <>
              <MenuItem icon={FolderPlus} onClick={run(onAdd)}>
                {t('rail.add_menu_project')}
              </MenuItem>
              <MenuItem icon={FolderIcon} onClick={run(onAddFolder)}>
                {t('rail.add_menu_folder')}
              </MenuItem>
              <MenuItem icon={Server} onClick={run(onAddRemote)}>
                {t('rail.add_remote')}
              </MenuItem>
              <div className="my-1 border-t" />
              <MenuItem
                icon={SquareTerminal}
                checked={terminalOpen}
                disabled={!active}
                onClick={run(onToggleTerminal)}
              >
                {t('preview.open_terminal')}
              </MenuItem>
            </>,
          )}
          {menu(
            'settings',
            t('rail.settings_tooltip'),
            SETTINGS_TABS.map((tab, i) =>
              tab ? (
                <MenuItem key={tab[0]} onClick={run(() => onOpenSettingsTab(tab[0]))}>
                  {t(tab[1])}
                </MenuItem>
              ) : (
                <div key={`sep-${i}`} className="my-1 border-t" />
              ),
            ),
          )}
        </nav>

        <div className="flex-1" />

        <ThemeMenu buttonClassName={iconButton} noDragClassName={NO_DRAG} />
      </div>
    </header>
  );
}
