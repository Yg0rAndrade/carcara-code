// Sonda de aceitação do Preview (docs/plano-webcontentsview.md §5): mede, de dentro do site,
// rAF por segundo, elementos animando (moving.js) e visibilityState, antes e depois de
// minimizar/restaurar e de encobrir a janela.
//
//   node scripts/preview-raf-probe.cjs --engine=view|webview [--no-occlusion]
//        [--url=http://localhost:8081/] [--min-rounds=5] [--cover-rounds=3] [--json=saida.json]
//
// Hoje roda contra o harness isolado (scripts/preview-probe/spike-main.cjs). O alvo CDP é
// casado pela URL do site, não pelo tipo: com <webview> é 'webview', com WebContentsView é
// 'page' (DESAFIOS, "Sondas e harness...").
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repo = path.join(__dirname, '..');
const dir = path.join(__dirname, 'preview-probe');
const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const ENGINE = arg('engine', 'view');
const URL_ = arg('url', 'http://localhost:8081/');
const NO_OCC = process.argv.includes('--no-occlusion');
const MIN_ROUNDS = Number(arg('min-rounds', 5));
const COVER_ROUNDS = Number(arg('cover-rounds', 3));
const JSON_OUT = arg('json', null);
const PORT = 9300 + Math.floor(Math.random() * 500);
const CMD_PORT = PORT + 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'carcara-wcv-spike-'));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const exe = require(path.join(repo, 'node_modules', 'electron'));
const child = spawn(
  exe,
  [
    path.join(dir, 'spike-main.cjs'),
    `--engine=${ENGINE}`,
    `--url=${URL_}`,
    ...(NO_OCC ? ['--no-occlusion'] : []),
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    `--cmd-port=${CMD_PORT}`,
  ],
  { env, stdio: 'ignore' },
);

// Canal de comando com o main do harness (HTTP local).
const cmd = async (c) => {
  for (let i = 0; ; i++) {
    try {
      const r = await (
        await fetch(`http://127.0.0.1:${CMD_PORT}/`, { method: 'POST', body: JSON.stringify(c) })
      ).json();
      if (!r.ok) throw Object.assign(new Error(r.error), { fromHarness: true });
      return r.value;
    } catch (e) {
      if (e.fromHarness || i > 60) throw e;
      await sleep(500);
    }
  }
};

async function connect(pred) {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const t = list.find(pred);
      if (t) {
        const ws = new WebSocket(t.webSocketDebuggerUrl);
        await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
        let seq = 0;
        const pending = new Map();
        const logs = [];
        ws.onmessage = (m) => {
          const d = JSON.parse(m.data);
          if (d.id && pending.has(d.id)) (pending.get(d.id)(d), pending.delete(d.id));
          else if (d.method === 'Runtime.exceptionThrown')
            logs.push(
              'EXC ' +
                (d.params.exceptionDetails.exception?.description ||
                  d.params.exceptionDetails.text),
            );
          else if (d.method === 'Runtime.consoleAPICalled' && /error|warn/.test(d.params.type))
            logs.push(
              d.params.type + ' ' + d.params.args.map((a) => a.value ?? a.description).join(' '),
            );
        };
        const cdp = (method, params = {}) =>
          new Promise((r) => {
            const id = ++seq;
            pending.set(id, r);
            ws.send(JSON.stringify({ id, method, params }));
          });
        // Num site congelado o awaitPromise não volta nunca: sempre com guarda de 6 s.
        const ev = async (expression) => {
          const r = await Promise.race([
            cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
            sleep(6000).then(() => ({ result: { result: { value: 'SEM RESPOSTA em 6s' } } })),
          ]);
          if (r.result?.exceptionDetails)
            return (
              'ERR ' +
              (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)
            );
          return r.result.result.value;
        };
        return { cdp, ev, logs, type: t.type };
      }
    } catch {}
    await sleep(500);
  }
  throw new Error('alvo do site não achado no CDP');
}

const RAF = `(async () => {
  const n = await new Promise((r) => { let n = 0; const t0 = performance.now();
    const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(n); };
    requestAnimationFrame(f); setTimeout(() => r(n), 2500); });
  return { raf: n, vis: document.visibilityState, focus: document.hasFocus() };
})()`;
// Estado do site (não do motor): o GSAP montou a entrada? Os textos do hero estão visíveis?
const DIAG = `(() => {
  const g = window.gsap; const q = (s) => document.querySelector(s);
  const cs = (s) => { const e = q(s); if (!e) return null; const c = getComputedStyle(e); const r = e.getBoundingClientRect();
    return { op: c.opacity, tf: c.transform, vis: c.visibility, top: Math.round(r.top), h: Math.round(r.height) }; };
  return { url: location.href, vw: innerWidth, vh: innerHeight, scrollY, jsClass: document.documentElement.classList.contains('js'),
    movimento: !!window.__digoMovimento, gsap: !!g, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    tick: g && g.ticker.frame, gtime: g && +g.globalTimeline.time().toFixed(2),
    ativos: g && g.globalTimeline.getChildren(true, true, false).filter((t) => t.isActive()).length,
    hero: cs('[data-hero]'), balao: cs('[data-h-balao]'), linha: cs('[data-h-linha]'), info: cs('[data-h-info]') };
})()`;
const MOV = fs.readFileSync(path.join(dir, 'moving.js'), 'utf8');

let hwnd;
const win = (action, extra = []) =>
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(dir, 'win.ps1'),
      '-Hwnd',
      hwnd,
      '-Action',
      action,
      ...extra,
    ],
    {
      encoding: 'utf8',
    },
  ).trim();

async function measure(site, label, rows) {
  const r = await site.ev(RAF);
  const m = await site.ev(MOV);
  const row = {
    label,
    ...(typeof r === 'object' ? r : { raf: String(r) }),
    moving: m,
    win: win('state'),
  };
  rows.push(row);
  console.log(
    label.padEnd(18),
    JSON.stringify(row.raf).padEnd(5),
    String(row.vis).padEnd(8),
    m,
    row.win,
  );
  return row;
}

async function main() {
  const info = await cmd({ cmd: 'info' });
  hwnd = info.hwnd;
  const host = new URL(URL_).host;
  const site = await connect((t) => t.url.includes(host));
  await site.cdp('Runtime.enable');
  for (let i = 0; i < 40 && (await site.ev('document.readyState')) !== 'complete'; i++)
    await sleep(250);
  console.log(
    `motor=${ENGINE} tipo-cdp=${site.type} getType=${info.type} sem-oclusao-nativa=${NO_OCC}`,
  );
  win('top');
  const rows = [];
  if (process.argv.includes('--diag')) {
    await sleep(5000);
    console.log(JSON.stringify(await site.ev(DIAG), null, 1));
    console.log('console:', site.logs.slice(0, 20));
    return;
  }
  await sleep(2500);
  await measure(site, 'carga', rows);
  await sleep(1500);
  await measure(site, 'carga +3s', rows);
  for (let i = 1; i <= MIN_ROUNDS; i++) {
    win('untop');
    win('min');
    await sleep(5000);
    win('restore');
    win('top');
    win('front');
    await sleep(1000);
    await measure(site, `min/rest #${i}`, rows);
  }
  for (let i = 1; i <= COVER_ROUNDS; i++) {
    win('untop');
    win('cover', ['-Seconds', '5']);
    win('top');
    win('front');
    await sleep(1000);
    await measure(site, `encoberta #${i}`, rows);
  }
  win('untop');
  const summary = {
    engine: ENGINE,
    noOcclusion: NO_OCC,
    cdpType: site.type,
    getType: info.type,
    rows,
  };
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2));
}

main()
  .catch((e) => console.error('ERRO', e))
  .finally(() => {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {}
    setTimeout(() => {
      fs.rmSync(profile, { recursive: true, force: true });
      process.exit(0);
    }, 800);
  });
