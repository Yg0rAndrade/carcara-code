// Motor de IA local — sem dependência de Electron, testável por smoke via Node.
// node-llama-cpp v3 é ESM-only, então carregamos via import() dinâmico (lazy de fato:
// o binário nativo só entra na 1ª chamada que precisa dele).
const fs = require('fs');
const path = require('path');

const MODEL_ID = 'qwen3-0.6b-q8_0';
// Q8_0 (não Q4): a quantização Q4 fazia o 0.6B "parar cedo" (saída vazia/cortada).
// node-llama-cpp v3 prefixes HuggingFace downloads with "hf_{org}_" — must match.
const MODEL_FILE = 'hf_unsloth_Qwen3-0.6B-Q8_0.gguf';
const MODEL_URI = 'hf:unsloth/Qwen3-0.6B-GGUF/Qwen3-0.6B-Q8_0.gguf';

// Qwen3 é um modelo "raciocinador": emite um bloco <think>…</think> antes da resposta.
// Pra esta tarefa curta, raciocinar só deixou mais lento e menos preciso (testado),
// então desligamos com /no_think e ficamos só com o texto após o </think>. Pra religar
// o raciocínio, basta NO_THINK = false (e subir maxTokens/timeout, que ele gera mais).
const NO_THINK = true;

const GEN = { contextSize: 6144, temperature: 0.2, maxTokens: 256, timeoutMs: 120000 };
// Reserva de tokens pra resposta + margem, ao orçar quanto do diff cabe no contexto.
const OUTPUT_RESERVE = 160;
const BUDGET_MARGIN = 64;

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
  promptTitle:
    'Você cria títulos curtos em PORTUGUÊS DO BRASIL para um prompt salvo numa biblioteca. ' +
    'Máximo 5 palavras, sem aspas e sem pontuação final. Responda APENAS o título.\n\n' +
    'Exemplo:\nPrompt: rode os testes e corrija o que quebrar\nTítulo: Rodar e corrigir testes',
  checkpointTitle:
    'Você resume em PORTUGUÊS DO BRASIL o que mudou num conjunto de arquivos, em uma frase curta ' +
    'de até 8 palavras (ex.: "ajusta validação do login"). Sem aspas e sem explicação. Responda APENAS a frase.',
};

// Moldura por tarefa aplicada à mensagem do usuário — reforça o idioma pra modelos pequenos.
const USER_FRAME = {
  commit: (input) => 'Escreva a mensagem de commit em português do Brasil para este diff:\n\n' + input,
  promptTitle: (input) => 'Crie um título curto em português para este prompt:\n\n' + input,
  checkpointTitle: (input) => 'Resuma em português, em uma frase curta, o que mudou:\n\n' + input,
};

// Limiares de "resposta completa" por tarefa (título é curto; commit precisa ser maior).
const COMPLETE = {
  commit: { chars: 16, words: 4 },
  promptTitle: { chars: 4, words: 1 },
  checkpointTitle: { chars: 8, words: 2 },
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

// Trunca um texto pra caber em maxTokens, medindo com o tokenizer do próprio modelo.
// Sem isso, um diff grande estoura o contexto e a geração falha antes de começar.
function fitToBudget(model, text, maxTokens) {
  if (!text) return text;
  const toks = model.tokenize(text);
  if (toks.length <= maxTokens) return text;
  const marker = '\n…[diff truncado]…';
  const keep = Math.max(1, maxTokens - model.tokenize(marker).length);
  return model.detokenize(toks.slice(0, keep)) + marker;
}

// Extrai a mensagem da saída crua: descarta o raciocínio (<think>…</think>) e pega a
// 1ª linha útil. Vazio se o modelo só raciocinou sem concluir.
function parseOut(raw) {
  raw = String(raw || '');
  const closeIdx = raw.lastIndexOf('</think>');
  if (/<think>/i.test(raw) && closeIdx === -1) return '';
  let text = closeIdx !== -1 ? raw.slice(closeIdx + '</think>'.length) : raw;
  text = text.replace(/<\/?think>/gi, '').trim();
  const firstLine = text.split('\n').map(s => s.trim()).filter(Boolean)[0] || '';
  return firstLine.replace(/^["'`]|["'`]$/g, '').trim();
}

async function generate({ userDataDir, task, input, onToken }) {
  const base = SYSTEM[task];
  if (!base) throw new Error('Tarefa de IA desconhecida: ' + task);
  // /no_think desliga o modo raciocinador do Qwen3 (resposta direta e rápida).
  const sys = (NO_THINK ? '/no_think\n' : '') + base;
  const model = await ensureModel(userDataDir);
  const { LlamaChatSession } = await lib();
  const frame = USER_FRAME[task];
  // Orça quanto do diff cabe: contexto − prompt do sistema − moldura − reserva de saída.
  const prefix = NO_THINK ? '/no_think ' : '';
  const overhead = model.tokenize(sys).length
    + (frame ? model.tokenize(frame('')).length : 0)
    + model.tokenize(prefix).length;
  const budget = GEN.contextSize - overhead - OUTPUT_RESERVE - BUDGET_MARGIN;
  const fitted = fitToBudget(model, String(input || ''), Math.max(64, budget));
  // Qwen3: o soft-switch /no_think precisa estar na mensagem do usuário pra valer.
  const userMsg = prefix + (frame ? frame(fitted) : fitted);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), GEN.timeoutMs);
  // O 0.6B às vezes devolve vazio pro MESMO input (é não-determinístico). Tentamos de
  // novo com temperatura um pouco maior até sair algo. O contador de tokens continua
  // subindo entre as tentativas (feedback de que está trabalhando).
  const temps = [GEN.temperature, 0.5, 0.7, 0.9];
  let toks = 0;
  let best = '';
  try {
    for (let i = 0; i < temps.length; i++) {
      const context = await model.createContext({ contextSize: GEN.contextSize });
      try {
        const session = new LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt: sys });
        const out = await session.prompt(userMsg, {
          onToken: (tokens) => { toks += (tokens && tokens.length) || 0; if (typeof onToken === 'function') onToken(toks); },
          temperature: temps[i],
          maxTokens: GEN.maxTokens,
          signal: ac.signal,
        });
        const msg = parseOut(out);
        if (looksComplete(msg, task)) return msg; // resposta boa → pronto
        if (msg.length > best.length) best = msg; // guarda a melhor parcial
      } finally {
        try { await context.dispose(); } catch {}
      }
    }
    return best; // nenhuma "completa": devolve a melhor parcial (melhor que vazio)
  } finally {
    clearTimeout(timer);
  }
}

// Heurística de "resposta completa" por tarefa: evita aceitar saídas vazias ou cortadas
// (o 0.6B às vezes para cedo, gerando "feat: adicion"). Título aceita ser curto.
function looksComplete(msg, task) {
  if (!msg) return false;
  const m = COMPLETE[task] || COMPLETE.commit;
  const words = msg.split(/\s+/).filter(Boolean);
  return msg.length >= m.chars && words.length >= m.words;
}

module.exports = { MODEL_ID, MODEL_FILE, MODEL_URI, modelPath, status, download, remove, warmup, generate };
