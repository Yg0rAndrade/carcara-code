// Smoke test do parser de cURL. Rode com: node test/curl.smoke.mjs
// (O projeto não usa runner de teste; este é executável direto pelo Node, no
// estilo do mcp-core.cjs.)

import { parseCurl } from '../src/lib/curl.js';

let pass = 0,
  fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log('  ok  ', name);
  } else {
    fail++;
    console.error('  FAIL', name);
  }
}

// 1. GET simples
{
  const r = parseCurl('curl https://api.exemplo.com/x');
  check('GET simples: método', r.method === 'GET');
  check('GET simples: url', r.url === 'https://api.exemplo.com/x');
}

// 2. GET com query → params
{
  const r = parseCurl("curl 'https://api.exemplo.com/x?a=1&b=2'");
  check('query: url sem ?', r.url === 'https://api.exemplo.com/x');
  check(
    'query: 2 params',
    r.params.length === 2 && r.params[0].key === 'a' && r.params[1].val === '2',
  );
}

// 3. POST com header + JSON
{
  const r = parseCurl(
    `curl -X POST https://api.exemplo.com/u -H "Content-Type: application/json" -d '{"a":1}'`,
  );
  check('POST: método', r.method === 'POST');
  check(
    'POST: header',
    r.headers.some((h) => h.key === 'Content-Type' && h.val === 'application/json'),
  );
  check('POST: body', r.body === '{"a":1}');
}

// 4. -d sem -X infere POST
{
  const r = parseCurl(`curl https://api.exemplo.com/u -d 'x=1'`);
  check('infere POST com -d', r.method === 'POST' && r.body === 'x=1');
}

// 5. --json adiciona Content-Type
{
  const r = parseCurl(`curl https://api.exemplo.com/u --json '{"a":1}'`);
  check('--json: body', r.body === '{"a":1}');
  check(
    '--json: content-type',
    r.headers.some((h) => h.key === 'Content-Type' && h.val === 'application/json'),
  );
  check('--json: método POST', r.method === 'POST');
}

// 6. Multilinha com \
{
  const cmd = `curl https://api.exemplo.com/u \\\n  -H "Accept: application/json" \\\n  -d '{"a":1}'`;
  const r = parseCurl(cmd);
  check('multilinha: url', r.url === 'https://api.exemplo.com/u');
  check(
    'multilinha: header',
    r.headers.some((h) => h.key === 'Accept'),
  );
  check('multilinha: body', r.body === '{"a":1}');
}

// 7. -u vira Authorization: Basic
{
  const r = parseCurl('curl https://api.exemplo.com/u -u alice:secret');
  const auth = r.headers.find((h) => h.key === 'Authorization');
  check('-u: header existe', !!auth);
  check(
    '-u: base64',
    auth && auth.val === 'Basic ' + Buffer.from('alice:secret').toString('base64'),
  );
}

// 8. Flags ruidosas ignoradas
{
  const r = parseCurl('curl -sS -L --compressed -o saida.json https://api.exemplo.com/x');
  check('ruidosas: url correta (não pega -o saida.json)', r.url === 'https://api.exemplo.com/x');
}

// 9. Lixo → null
{
  check('lixo: retorna null', parseCurl('isso não é cURL') === null);
  check('vazio: retorna null', parseCurl('') === null);
}

// 10. Caso real (Supabase, com apikey + Bearer)
{
  const cmd = `curl 'https://abc.supabase.co/rest/v1/categories?select=*' -H "apikey: KEY" -H "Authorization: Bearer KEY"`;
  const r = parseCurl(cmd);
  check('supabase: url limpa', r.url === 'https://abc.supabase.co/rest/v1/categories');
  check(
    'supabase: param select',
    r.params.some((p) => p.key === 'select' && p.val === '*'),
  );
  check('supabase: 2 headers', r.headers.filter((h) => h.key).length === 2);
}

console.log(`\n${pass} passaram, ${fail} falharam.`);
process.exit(fail ? 1 : 0);
