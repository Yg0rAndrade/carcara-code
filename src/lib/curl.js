// Importador de comando cURL → forma da UI da aba API.
//
// `parseCurl(text)` devolve exatamente `{ method, url, params, headers, body }`,
// a mesma forma que `parseHttp` (em ApiPanel.jsx) produz a partir de um .http.
// Assim, importar cURL reusa todo o resto do painel sem mudanças.
//
// Escopo: o "comum das docs" (Stripe, OpenAI, Supabase…): -X, -H, -d/--data*,
// --json, -u e comandos multilinha com `\`. Multipart (-F), cookies (-b) e -G
// ficam de fora — se aparecerem, são ignorados sem quebrar o parse.
//
// Módulo puro (sem React/UI): também roda direto no Node, então é testável por
// smoke test (test/curl.smoke.mjs).

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const emptyRow = () => ({ on: true, key: '', val: '' });

// Flags que carregam um valor no token seguinte mas que não nos interessam.
// Listadas pra que o valor delas não seja confundido com a URL.
const NOISY_VALUE_FLAGS = new Set([
  '-A',
  '--user-agent',
  '-e',
  '--referer',
  '-o',
  '--output',
  '-m',
  '--max-time',
  '--connect-timeout',
  '-x',
  '--proxy',
  '-T',
  '--upload-file',
  '-w',
  '--write-out',
  '--retry',
  '--cacert',
  '--cert',
  '--key',
  '-b',
  '--cookie',
  '-c',
  '--cookie-jar',
]);

// Base64 que funciona tanto no renderer (btoa) quanto no Node (Buffer).
function toBase64(s) {
  try {
    return btoa(s);
  } catch {}
  try {
    return Buffer.from(s, 'utf8').toString('base64');
  } catch {}
  return s;
}

// Tokeniza o comando como um shell faria: respeita aspas simples/duplas e a
// continuação de linha com `\` (e o `^` do cmd do Windows).
function tokenize(input) {
  const s = String(input || '')
    .replace(/\r\n/g, '\n')
    .replace(/\\\n/g, ' ') // continuação de linha do bash
    .replace(/\^\n/g, ' '); // continuação de linha do cmd (Windows)

  const tokens = [];
  let cur = '';
  let has = false; // já acumulou algo no token atual (distingue "" de vazio)
  let i = 0;
  const n = s.length;

  while (i < n) {
    const c = s[i];
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      has = true;
      while (i < n && s[i] !== q) {
        if (q === '"' && s[i] === '\\' && i + 1 < n) {
          cur += s[i + 1];
          i += 2;
        } else {
          cur += s[i];
          i++;
        }
      }
      i++; // pula a aspa de fechamento
    } else if (/\s/.test(c)) {
      if (has) {
        tokens.push(cur);
        cur = '';
        has = false;
      }
      i++;
    } else if (c === '\\' && i + 1 < n) {
      cur += s[i + 1];
      i += 2;
      has = true; // escape fora de aspas
    } else {
      cur += c;
      i++;
      has = true;
    }
  }
  if (has) tokens.push(cur);
  return tokens;
}

function pushHeader(arr, raw) {
  if (raw == null) return;
  const s = String(raw);
  const idx = s.indexOf(':');
  if (idx < 0) {
    if (s.trim()) arr.push({ on: true, key: s.trim(), val: '' });
    return;
  }
  arr.push({ on: true, key: s.slice(0, idx).trim(), val: s.slice(idx + 1).trim() });
}

// Separa a query string da URL em pares (igual ao que parseHttp faz).
export function splitUrlParams(rawUrl) {
  const s = String(rawUrl || '');
  const qi = s.indexOf('?');
  if (qi < 0) return { url: s, params: [] };
  const url = s.slice(0, qi);
  const params = [];
  for (const pair of s.slice(qi + 1).split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const k = eq >= 0 ? pair.slice(0, eq) : pair;
    const v = eq >= 0 ? pair.slice(eq + 1) : '';
    try {
      params.push({ on: true, key: decodeURIComponent(k), val: decodeURIComponent(v) });
    } catch {
      params.push({ on: true, key: k, val: v });
    }
  }
  return { url, params };
}

// Heurística: este token solto parece uma URL?
function looksLikeUrl(t) {
  return /:\/\//.test(t) || /^[\w.-]+\.[a-z]{2,}([/:?]|$)/i.test(t);
}

/**
 * Interpreta um comando cURL.
 * @returns {{method,url,params,headers,body}|null}  null se não houver URL reconhecível.
 */
export function parseCurl(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const tokens = tokenize(raw);
  const hadCurl = tokens.length && /^curl$/i.test(tokens[0]);
  if (hadCurl) tokens.shift();

  let method = '';
  let user = '';
  let jsonFlag = false;
  const headers = [];
  const dataParts = [];
  const bare = [];
  let urlFromFlag = '';

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = () => tokens[++i];

    if (t === '-X' || t === '--request') method = (next() || '').toUpperCase();
    else if (t.startsWith('--request=')) method = t.slice(10).toUpperCase();
    else if (t === '-H' || t === '--header') pushHeader(headers, next());
    else if (t.startsWith('--header=')) pushHeader(headers, t.slice(9));
    else if (t.startsWith('-H') && t.length > 2) pushHeader(headers, t.slice(2));
    else if (
      t === '-d' ||
      t === '--data' ||
      t === '--data-raw' ||
      t === '--data-binary' ||
      t === '--data-ascii'
    )
      dataParts.push(next() || '');
    else if (t.startsWith('--data=')) dataParts.push(t.slice(7));
    else if (t.startsWith('-d') && t.length > 2) dataParts.push(t.slice(2));
    else if (t === '--json') {
      dataParts.push(next() || '');
      jsonFlag = true;
    } else if (t.startsWith('--json=')) {
      dataParts.push(t.slice(7));
      jsonFlag = true;
    } else if (t === '-u' || t === '--user') user = next() || '';
    else if (t.startsWith('--user=')) user = t.slice(7);
    else if (t.startsWith('-u') && t.length > 2) user = t.slice(2);
    else if (t === '--url') urlFromFlag = urlFromFlag || next() || '';
    else if (t.startsWith('-')) {
      // Flag desconhecida: se for uma das que levam valor, consome o valor pra
      // ele não virar "URL" por engano. Caso contrário, ignora só a flag.
      if (NOISY_VALUE_FLAGS.has(t)) i++;
    } else bare.push(t); // token solto → candidato a URL
  }

  // Fallback pra bare[0] (ex.: "curl localhost:3000", sem ponto/TLD) só quando o
  // comando começou com `curl` — senão um texto qualquer viraria "URL".
  const url = urlFromFlag || bare.find(looksLikeUrl) || (hadCurl ? bare[0] : '') || '';
  if (!url) return null;

  if (!method) method = dataParts.length ? 'POST' : 'GET';
  if (!METHODS.includes(method)) method = 'GET';

  const body = dataParts.join('&');

  if (jsonFlag && !headers.some((h) => h.key.toLowerCase() === 'content-type')) {
    headers.push({ on: true, key: 'Content-Type', val: 'application/json' });
  }
  if (user && !headers.some((h) => h.key.toLowerCase() === 'authorization')) {
    headers.push({ on: true, key: 'Authorization', val: 'Basic ' + toBase64(user) });
  }

  const { url: cleanUrl, params } = splitUrlParams(url);

  return {
    method,
    url: cleanUrl,
    params: params.length ? params : [emptyRow()],
    headers: headers.length ? headers : [emptyRow()],
    body,
  };
}
