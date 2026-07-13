// Puro: monta o objeto opencode.json da Carcará AI. Um provider OpenAI-compatible
// custom ("carcara") + modelo default + escrita em modo "ask" (aprovação na UI).
// Skills/MCP NÃO são declarados aqui — o OpenCode os descobre sozinho (inclusive
// .claude/skills), então herdam de fábrica.
function buildOpencodeConfig({ providerBaseUrl, apiKey, model }) {
  return {
    $schema: 'https://opencode.ai/config.json',
    model: `carcara/${model}`,
    provider: {
      carcara: {
        npm: '@ai-sdk/openai-compatible',
        name: 'Carcará Code AI',
        options: {
          baseURL: providerBaseUrl,
          apiKey: apiKey,
        },
        models: {
          [model]: { name: model },
        },
      },
    },
    permission: {
      edit: 'ask',
      bash: 'ask',
      webfetch: 'allow',
    },
  };
}

module.exports = { buildOpencodeConfig };
