// Motor de IA local — sem dependência de Electron, testável por smoke via Node.
// node-llama-cpp v3 é ESM-only, então carregamos via import() dinâmico (lazy de fato:
// o binário nativo só entra na 1ª chamada que precisa dele).
const fs = require('fs');
const path = require('path');

const MODEL_ID = 'qwen3-0.6b-q4_k_m';
// node-llama-cpp v3 prefixes HuggingFace downloads with "hf_{org}_" — must match.
const MODEL_FILE = 'hf_unsloth_Qwen3-0.6B-Q4_K_M.gguf';
const MODEL_URI = 'hf:unsloth/Qwen3-0.6B-GGUF/Qwen3-0.6B-Q4_K_M.gguf';

// Qwen3 é um modelo "raciocinador": por padrão emite um bloco <think>…</think> antes
// da resposta. Pra tarefas curtas isso é lento e sujo, então desligamos com /no_think
// e limpamos qualquer <think> residual da saída.
const NO_THINK = true;

const GEN = { contextSize: 2048, temperature: 0.2, maxTokens: 120, timeoutMs: 30000 };

// Prompt de sistema fixo por tarefa. Travado: saída de uma linha, sem explicação.
const SYSTEM = {
  commit:
    'Você escreve mensagens de commit em PORTUGUÊS DO BRASIL, no estilo Conventional Commits. ' +
    'REGRA ABSOLUTA: a mensagem é SEMPRE em português, mesmo quando o código e o diff estão em inglês. ' +
    'NUNCA escreva a mensagem em inglês — traduza a intenção para o português. ' +
    'Formato: "tipo: descrição" (tipos válidos: feat, fix, refactor, docs, chore, style, test, perf). ' +
    'A descrição é uma frase clara de 6 a 14 palavras dizendo o que mudou. ' +
    'Responda APENAS a mensagem, em uma única linha, sem aspas e sem explicação.\n\n' +
    'Exemplos (repare: o diff está em inglês, mas a mensagem está em português):\n' +
    'Diff: +function validateEmail(email) { return /.+@.+/.test(email); }\n' +
    'Mensagem: feat: adiciona validação de email no formulário de cadastro\n' +
    'Diff: -const timeout = 30; +const timeout = 60;\n' +
    'Mensagem: fix: aumenta o tempo limite de conexão para 60 segundos\n' +
    'Diff: +The author has deep expertise in distributed systems and migrations\n' +
    'Mensagem: docs: descreve a experiência do autor em sistemas distribuídos',
};

// Moldura por tarefa aplicada à mensagem do usuário — reforça o idioma pra modelos pequenos.
const USER_FRAME = {
  commit: (input) => 'Escreva a mensagem de commit em português do Brasil para este diff:\n\n' + input,
};

let _libPromise; // cache do import() ESM
function lib() { return (_libPromise = _libPromise || import('node-llama-cpp')); }

let _llama, _model, _modelPathLoaded; // modelo fica quente após a 1ª geração

function modelsDir(userDataDir) { return path.join(userDataDir, 'models'); }
function modelPath(userDataDir) { return path.join(modelsDir(userDataDir), MODEL_FILE); }

// Caminho do modelo instalado: prefere o MODEL_FILE atual; se não houver, cai pro
// primeiro *.gguf que existir (resiliente a mudança de nome do downloader). Null se nada.
function installedModelPath(userDataDir) {
  const dir = modelsDir(userDataDir);
  try {
    const gguf = fs.readdirSync(dir).filter(name => name.endsWith('.gguf'));
    if (gguf.includes(MODEL_FILE)) return path.join(dir, MODEL_FILE);
    return gguf.length ? path.join(dir, gguf[0]) : null;
  } catch {
    return null;
  }
}

async function status(userDataDir) {
  const resolved = installedModelPath(userDataDir);
  if (resolved) {
    try {
      const st = fs.statSync(resolved);
      return { installed: true, path: resolved, sizeBytes: st.size };
    } catch {
      // file disappeared between readdir and stat
    }
  }
  return { installed: false, path: modelPath(userDataDir), sizeBytes: 0 };
}

async function download(userDataDir, onProgress) {
  const { createModelDownloader } = await lib();
  fs.mkdirSync(modelsDir(userDataDir), { recursive: true });
  const downloader = await createModelDownloader({
    modelUri: MODEL_URI,
    dirPath: modelsDir(userDataDir),
    onProgress: ({ totalSize, downloadedSize }) => {
      if (typeof onProgress === 'function') onProgress({ done: downloadedSize ?? 0, total: totalSize ?? 0 });
    },
  });
  const outPath = await downloader.download();
  // Limpa modelos antigos (de outra versão): deixa só o que acabou de baixar.
  // Sem isso, trocar de modelo deixaria 2 .gguf na pasta e o resolver ficaria ambíguo.
  try {
    const kept = path.basename(outPath);
    for (const name of fs.readdirSync(modelsDir(userDataDir))) {
      if (name.endsWith('.gguf') && name !== kept) {
        try { fs.unlinkSync(path.join(modelsDir(userDataDir), name)); } catch {}
      }
    }
  } catch {}
  return { path: outPath };
}

async function remove(userDataDir) {
  // Descarrega o que estiver quente antes de apagar o arquivo.
  try { if (_model) await _model.dispose(); } catch {}
  _model = null; _modelPathLoaded = null;
  try { if (_llama) await _llama.dispose(); } catch {}
  _llama = null;
  // Delete all *.gguf in the models dir (glob-based, robust to filename changes).
  const dir = modelsDir(userDataDir);
  try {
    const entries = fs.readdirSync(dir);
    for (const name of entries) {
      if (name.endsWith('.gguf')) {
        try { fs.unlinkSync(path.join(dir, name)); } catch {}
      }
    }
  } catch {}
}

async function ensureModel(userDataDir) {
  const p = installedModelPath(userDataDir);
  if (!p) throw new Error('Modelo não baixado.');
  const { getLlama } = await lib();
  if (!_llama) _llama = await getLlama();
  if (!_model || _modelPathLoaded !== p) {
    if (_model) { try { await _model.dispose(); } catch {} }
    _model = await _llama.loadModel({ modelPath: p });
    _modelPathLoaded = p;
  }
  return _model;
}

// Pré-carrega o modelo na RAM em segundo plano (sem gerar), pra a 1ª geração
// já sair quente e rápida. Idempotente: ensureModel cacheia o modelo carregado.
// Resolve em { ok } e nunca lança — aquecimento é "melhor esforço".
async function warmup(userDataDir) {
  try { await ensureModel(userDataDir); return { ok: true }; }
  catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
}

async function generate({ userDataDir, task, input }) {
  const base = SYSTEM[task];
  if (!base) throw new Error('Tarefa de IA desconhecida: ' + task);
  // /no_think desliga o modo raciocinador do Qwen3 (resposta direta e rápida).
  const sys = (NO_THINK ? '/no_think\n' : '') + base;
  const model = await ensureModel(userDataDir);
  const { LlamaChatSession } = await lib();
  // Contexto fresco por chamada (sem histórico entre gerações); descartado no fim.
  const context = await model.createContext({ contextSize: GEN.contextSize });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), GEN.timeoutMs);
  try {
    const session = new LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt: sys });
    const frame = USER_FRAME[task];
    const framed = frame ? frame(String(input || '')) : String(input || '');
    // Qwen3: o soft-switch /no_think precisa estar na mensagem do usuário pra valer.
    const userMsg = (NO_THINK ? '/no_think ' : '') + framed;
    const out = await session.prompt(userMsg, {
      temperature: GEN.temperature,
      maxTokens: GEN.maxTokens,
      signal: ac.signal,
    });
    // Remove bloco de raciocínio do Qwen3 (<think>…</think>) e pega só a 1ª linha útil.
    const cleaned = String(out || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '').trim();
    const firstLine = cleaned.split('\n').map(s => s.trim()).filter(Boolean)[0] || '';
    return firstLine.replace(/^["'`]|["'`]$/g, '').trim();
  } finally {
    clearTimeout(timer);
    try { await context.dispose(); } catch {}
  }
}

module.exports = { MODEL_ID, MODEL_FILE, MODEL_URI, modelPath, status, download, remove, warmup, generate };
