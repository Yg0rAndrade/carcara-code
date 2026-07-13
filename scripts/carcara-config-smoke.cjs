// Smoke do builder de opencode.json. Uso: node scripts/carcara-config-smoke.cjs
const { buildOpencodeConfig } = require('../electron/carcara/config.cjs');

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
}

const cfg = buildOpencodeConfig({
  providerBaseUrl: 'https://example.com/v1',
  apiKey: 'dev-key',
  model: 'openrouter/free-model',
});

assert(cfg.model === 'carcara/openrouter/free-model', 'model prefixado com provider id');
assert(cfg.provider && cfg.provider.carcara, 'tem provider carcara');
assert(cfg.provider.carcara.options.baseURL === 'https://example.com/v1', 'baseURL no provider');
assert(cfg.provider.carcara.options.apiKey === 'dev-key', 'apiKey no provider');
assert(cfg.permission && cfg.permission.edit === 'ask', 'escrita em modo ask');
assert(JSON.stringify(cfg).length > 0, 'serializável');

console.log('carcara-config-smoke OK');
