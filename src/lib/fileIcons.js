// Ícones de arquivo/pasta no estilo VS Code (Material Icon Theme) — os mesmos do Lovable.
// Usa o manifesto gerado pelo pacote (mapeia extensão/nome -> ícone) e os SVGs originais.
import manifest from 'material-icon-theme/dist/material-icons.json';

// Vite emite cada SVG do tema como asset e devolve sua URL (carregado via file:// no Electron).
const svgModules = import.meta.glob('../../node_modules/material-icon-theme/icons/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

// mapa: nome-do-ícone ('javascript') -> URL do asset
const urlByIcon = {};
for (const [p, url] of Object.entries(svgModules)) {
  const name = p.slice(p.lastIndexOf('/') + 1, -4); // tira pasta e ".svg"
  urlByIcon[name] = url;
}

function urlForIcon(iconName) {
  return urlByIcon[iconName] || urlByIcon[manifest.file] || null;
}

// Resolve o ícone de um arquivo pelo nome completo e, se não houver, pela(s) extensão(ões).
export function fileIconUrl(fileName) {
  const lower = fileName.toLowerCase();

  // 1) nome completo: package.json, .gitignore, bun.lock, vite.config.ts, etc.
  let icon = manifest.fileNames[fileName] || manifest.fileNames[lower];

  // 2) extensão — tenta a composta primeiro (d.ts, gen.ts) e vai encurtando.
  if (!icon) {
    const parts = lower.split('.');
    for (let i = 1; i < parts.length; i++) {
      const ext = parts.slice(i).join('.');
      if (manifest.fileExtensions[ext]) {
        icon = manifest.fileExtensions[ext];
        break;
      }
    }
  }

  return urlForIcon(icon || manifest.file);
}

// Resolve o ícone de uma pasta pelo nome (fechada/aberta), com fallback pro genérico.
export function folderIconUrl(folderName, open) {
  const map = open ? manifest.folderNamesExpanded : manifest.folderNames;
  const lower = (folderName || '').toLowerCase();
  const icon = map[folderName] || map[lower] || (open ? manifest.folderExpanded : manifest.folder);
  return urlForIcon(icon);
}
