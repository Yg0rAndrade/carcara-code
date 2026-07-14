// Smoke do montador de parts da mensagem (texto + imagens). Puro, sem subir serve.
// Uso: node scripts/carcara-message-smoke.cjs
const { buildMessageParts } = require('../electron/carcara/manager.cjs');

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
}

// só texto
const a = buildMessageParts({ text: 'oi', images: [] });
assert(a.length === 1 && a[0].type === 'text' && a[0].text === 'oi', 'só texto → 1 parte text');

// texto + 1 imagem
const b = buildMessageParts({
  text: 'olha',
  images: [{ dataUrl: 'data:image/png;base64,AAA', mime: 'image/png', name: 'p.png' }],
});
assert(b.length === 2, 'texto + imagem → 2 partes');
assert(b[0].type === 'text', 'primeira é o texto');
assert(
  b[1].type === 'file' &&
    b[1].url === 'data:image/png;base64,AAA' &&
    b[1].mime === 'image/png' &&
    b[1].filename === 'p.png',
  'segunda é file com url/mime/filename',
);

// só imagem (sem texto) — não emite parte text vazia
const c = buildMessageParts({
  text: '',
  images: [{ dataUrl: 'data:image/jpeg;base64,BBB', mime: 'image/jpeg', name: 'x.jpg' }],
});
assert(c.length === 1 && c[0].type === 'file', 'só imagem → 1 parte file, sem text vazio');

// várias imagens
const d = buildMessageParts({
  text: 'tres',
  images: [
    { dataUrl: 'data:image/png;base64,1', mime: 'image/png', name: '1.png' },
    { dataUrl: 'data:image/png;base64,2', mime: 'image/png', name: '2.png' },
  ],
});
assert(d.length === 3, 'texto + 2 imagens → 3 partes');

// nada → array vazio
assert(buildMessageParts({ text: '', images: [] }).length === 0, 'vazio → []');
// defaults
assert(buildMessageParts({ text: 'só' }).length === 1, 'images ausente = []');

console.log('carcara-message-smoke OK');
