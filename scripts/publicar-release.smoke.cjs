#!/usr/bin/env node
// Smoke da action composta `.github/actions/publicar-release`.
//
// Roda o `publicar.sh` de verdade contra um `gh` falso (scripts/fixtures/gh-falso.sh),
// cobrindo os três casos que importam. O caso 2 é literalmente o bug da v0.1.13: o
// publish "deu certo", mas o `latest.yml` não chegou na release e o auto-update de
// todos os usuários virou 404 com a tela "Falha ao atualizar".

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const SCRIPT = path.join(RAIZ, '.github', 'actions', 'publicar-release', 'publicar.sh');
const GH_FALSO = path.join(__dirname, 'fixtures', 'gh-falso.sh');

const ASSETS = [
  'CarcaraCode-Setup-9.9.9.exe',
  'latest.yml',
  'CarcaraCode-Setup-9.9.9.exe.blockmap',
];
const GLOBS = ['release/*.exe', 'release/latest.yml', 'release/*.blockmap'].join('\n');

// O PATH do sandbox precisa ir em formato POSIX: no Git Bash o "C:" de um caminho
// Windows é lido como separador de PATH e o stub simplesmente some.
function paraPosix(p) {
  return p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, letra) => '/' + letra.toLowerCase());
}

function montarSandbox(assetsNaRelease) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'publicar-release-'));
  fs.mkdirSync(path.join(base, 'bin'));
  fs.mkdirSync(path.join(base, 'estado'));
  fs.mkdirSync(path.join(base, 'repo', 'release'), { recursive: true });

  fs.copyFileSync(GH_FALSO, path.join(base, 'bin', 'gh'));
  fs.chmodSync(path.join(base, 'bin', 'gh'), 0o755);
  fs.writeFileSync(path.join(base, 'estado', 'assets'), assetsNaRelease.join('\n') + '\n');
  for (const nome of ASSETS) {
    fs.writeFileSync(path.join(base, 'repo', 'release', nome), 'conteudo');
  }
  return base;
}

function rodar({ assetsNaRelease = ASSETS, falhas = 1, files = GLOBS } = {}) {
  const base = montarSandbox(assetsNaRelease);
  try {
    const saida = execFileSync('bash', [paraPosix(SCRIPT)], {
      cwd: path.join(base, 'repo'),
      encoding: 'utf8',
      stdio: 'pipe',
      env: {
        ...process.env,
        PATH: paraPosix(path.join(base, 'bin')) + ':' + process.env.PATH,
        GH_FAKE_STATE: paraPosix(path.join(base, 'estado')),
        GH_FAKE_FALHAS: String(falhas),
        GITHUB_REF_NAME: 'v9.9.9',
        RETRY_ESPERA_INICIAL: '0',
        FILES: files,
      },
    });
    return { ok: true, saida };
  } catch (erro) {
    return { ok: false, saida: String(erro.stdout || '') + String(erro.stderr || '') };
  }
}

const casos = [
  {
    nome: 'sobrevive a dois 5xx transitorios no upload',
    executar: () => rodar({ falhas: 3 }),
    esperaSucesso: true,
  },
  {
    nome: 'falha quando o latest.yml nao chega na release (bug da v0.1.13)',
    executar: () => rodar({ assetsNaRelease: ['CarcaraCode-Setup-9.9.9.exe'] }),
    esperaSucesso: false,
    esperaTexto: 'Assets ausentes',
  },
  {
    nome: 'falha quando nenhum arquivo casa com o glob',
    executar: () => rodar({ files: 'release/*.naoexiste' }),
    esperaSucesso: false,
    esperaTexto: 'Nenhum arquivo casou',
  },
];

let falharam = 0;
for (const caso of casos) {
  const r = caso.executar();
  const statusBate = r.ok === caso.esperaSucesso;
  const textoBate = !caso.esperaTexto || (r.saida || '').includes(caso.esperaTexto);
  if (statusBate && textoBate) {
    console.log('ok    - ' + caso.nome);
  } else {
    falharam += 1;
    console.error('FALHA - ' + caso.nome);
    if (r.saida) console.error(r.saida);
  }
}

if (falharam) {
  console.error('\n' + falharam + ' caso(s) falharam.');
  process.exit(1);
}
console.log('\n' + casos.length + ' casos passaram.');
