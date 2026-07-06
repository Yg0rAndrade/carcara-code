// OAuth 2.0 do conector MCP (Bloco D). Roda no main process (precisa de
// shell/safeStorage/app do Electron). O cliente MCP fala OAuth via @modelcontextprotocol/sdk;
// aqui ficam: provider (storage de client/tokens), abertura do navegador e o
// servidor loopback que captura o ?code= do redirect.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { shell, safeStorage, app } = require('electron');

const REDIRECT_PORT = 33418; // porta fixa do callback (precisa bater com o redirect_uri registrado)
const REDIRECT_URL = `http://localhost:${REDIRECT_PORT}/callback`;
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

// ---------- storage (userData/mcp-oauth/<hash>.json), tokens criptografados ----------
function storeDir() {
  const d = path.join(app.getPath('userData'), 'mcp-oauth');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function storeFile(serverUrl) {
  const hash = crypto.createHash('sha256').update(serverUrl).digest('hex').slice(0, 16);
  return path.join(storeDir(), hash + '.json');
}
function readStore(serverUrl) {
  try {
    return JSON.parse(fs.readFileSync(storeFile(serverUrl), 'utf8'));
  } catch {
    return {};
  }
}
function writeStore(serverUrl, data) {
  fs.writeFileSync(storeFile(serverUrl), JSON.stringify(data, null, 2));
}
function encSecret(obj) {
  const s = JSON.stringify(obj);
  if (safeStorage.isEncryptionAvailable())
    return 'enc:' + safeStorage.encryptString(s).toString('base64');
  return 'raw:' + s; // fallback (ambiente sem keychain) — ainda fica fora do projeto/git
}
function decSecret(v) {
  if (!v) return undefined;
  if (v.startsWith('enc:')) {
    try {
      return JSON.parse(safeStorage.decryptString(Buffer.from(v.slice(4), 'base64')));
    } catch {
      return undefined;
    }
  }
  if (v.startsWith('raw:')) {
    try {
      return JSON.parse(v.slice(4));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function clearTokens(serverUrl) {
  try {
    fs.rmSync(storeFile(serverUrl));
    return true;
  } catch {
    return false;
  }
}

// ---------- OAuthClientProvider (interface do SDK) ----------
function makeProvider(serverUrl, onRedirect) {
  let codeVerifier; // transiente no fluxo (mesmo processo/instância)
  return {
    get redirectUrl() {
      return REDIRECT_URL;
    },
    get clientMetadata() {
      return {
        redirect_uris: [REDIRECT_URL],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        client_name: 'Carcará Code',
        client_uri: 'https://github.com/ygor/ygor-code',
      };
    },
    state() {
      return crypto.randomBytes(16).toString('hex');
    },
    clientInformation() {
      return readStore(serverUrl).client;
    },
    saveClientInformation(info) {
      const s = readStore(serverUrl);
      s.client = info;
      writeStore(serverUrl, s);
    },
    tokens() {
      return decSecret(readStore(serverUrl).tokens);
    },
    saveTokens(t) {
      const s = readStore(serverUrl);
      s.tokens = encSecret(t);
      writeStore(serverUrl, s);
    },
    saveCodeVerifier(v) {
      codeVerifier = v;
    },
    codeVerifier() {
      if (!codeVerifier) throw new Error('code verifier ausente');
      return codeVerifier;
    },
    redirectToAuthorization(url) {
      onRedirect(url.href);
    },
  };
}

// ---------- servidor loopback que captura o ?code= ----------
function startCallbackServer() {
  let resolveCode, rejectCode;
  const codePromise = new Promise((res, rej) => {
    resolveCode = res;
    rejectCode = rej;
  });
  const server = http.createServer((req, res) => {
    let u;
    try {
      u = new URL(req.url, REDIRECT_URL);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (u.pathname !== '/callback') {
      res.writeHead(404);
      res.end();
      return;
    }
    const code = u.searchParams.get('code');
    const error = u.searchParams.get('error_description') || u.searchParams.get('error');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#171411;color:#f0ece6;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0">
      <h2 style="color:${code ? '#e8722c' : '#e25555'}">${code ? 'Autorizado ✓' : 'Falha na autorização'}</h2>
      <p style="opacity:.7">Pode fechar esta aba e voltar ao Carcará Code.</p></body></html>`);
    if (code) resolveCode(code);
    else rejectCode(new Error(error || 'redirect sem code'));
  });
  return new Promise((resolve, reject) => {
    server.once('error', (e) =>
      reject(
        new Error(
          e.code === 'EADDRINUSE'
            ? `Porta ${REDIRECT_PORT} ocupada — feche o que estiver usando e tente de novo.`
            : e.message,
        ),
      ),
    );
    server.listen(REDIRECT_PORT, '127.0.0.1', () => {
      const timer = setTimeout(
        () => rejectCode(new Error('Tempo esgotado esperando a autorização no navegador.')),
        CALLBACK_TIMEOUT_MS,
      );
      resolve({
        waitForCode: () => codePromise.finally(() => clearTimeout(timer)),
        close: () => {
          try {
            server.close();
          } catch {}
          clearTimeout(timer);
        },
      });
    });
  });
}

// Prepara o fluxo OAuth pra um connect HTTP. Retorna { authProvider, waitForCode, cleanup }.
// onStatus(phase) avisa a UI ('awaiting' quando o navegador abre).
async function prepare(serverUrl, { onStatus } = {}) {
  const cb = await startCallbackServer();
  const authProvider = makeProvider(serverUrl, (href) => {
    onStatus && onStatus('awaiting');
    shell.openExternal(href);
  });
  return { authProvider, waitForCode: cb.waitForCode, cleanup: cb.close };
}

module.exports = { prepare, clearTokens, REDIRECT_URL };
