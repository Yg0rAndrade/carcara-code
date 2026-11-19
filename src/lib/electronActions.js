// Tela "Este é um app em Electron" do Preview: traduz os scripts do package.json em ações
// com nome de gente ("Abrir o app", "Gerar instalador · Windows") em vez de start/dev/build.
// Função pura: quem lê o package.json é o main (electron/run-command.cjs).
//
// kind: 'open' | 'dev' | 'build' | 'package' | 'other'
// os:   'windows' | 'mac' | 'linux' | null (só em 'package')

const OS_HINTS = [
  ['windows', /(^|[:\-_])(exe|win|windows|nsis|msi|portable)($|[:\-_])/i],
  ['mac', /(^|[:\-_])(mac|macos|osx|dmg|darwin)($|[:\-_])/i],
  ['linux', /(^|[:\-_])(linux|appimage|deb|rpm|snap)($|[:\-_])/i],
];

function osOf(name) {
  for (const [os, re] of OS_HINTS) if (re.test(name)) return os;
  return null;
}

export function classifyScript(name) {
  if (name === 'start' || /^(electron|app)(:start)?$/.test(name)) return { kind: 'open', os: null };
  if (name === 'dev' || /^(electron|app):dev$/.test(name)) return { kind: 'dev', os: null };
  if (name === 'build') return { kind: 'build', os: null };
  if (/^(pack|dist|make|package)(:|$)/.test(name)) return { kind: 'package', os: osOf(name) };
  return { kind: 'other', os: null };
}

// Divide em { primary, rest }: a ação principal (abrir o app; senão a primeira) vira o
// botão grande, o resto vira lista. Sem scripts: primary null.
export function electronActions(scripts = []) {
  const list = scripts.map((s) => ({ ...s, ...classifyScript(s.name) }));
  const i = list.findIndex((a) => a.kind === 'open');
  const at = i >= 0 ? i : 0;
  const primary = list[at] || null;
  const rest = list.filter((_, j) => j !== at);
  return { primary, rest };
}
