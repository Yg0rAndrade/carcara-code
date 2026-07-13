// Idiomas suportados pela interface.
//
// Fonte única da verdade: o seletor de idioma (SettingsModal), a detecção inicial e
// a validação no processo main derivam desta lista. Adicionar um idioma novo =
//   1. uma entrada aqui (na ordem de exibição desejada);
//   2. um arquivo src/lib/locales/<code>.json (o i18n carrega TODOS via import.meta.glob);
//   3. traduzir o bloco nativo correspondente em electron/main.i18n.cjs.
// O par pt/en é sempre a base de fallback — nunca remover.
//
// `native`  = nome do idioma na própria língua (mostrado no seletor, não traduzido).
// `htmlLang`= valor de <html lang="…"> (BCP-47).
// `rtl`     = escrita da direita p/ esquerda (só semântico por ora; ver nota no i18n.jsx).
// A bandeira NÃO fica aqui: é um SVG indexado por `code` em src/lib/flags.jsx (emoji de
// bandeira não renderiza no Windows — vira as letras do país).
export const LANGUAGES = [
  { code: 'pt', native: 'Português (Brasil)', htmlLang: 'pt-BR' },
  { code: 'en', native: 'English', htmlLang: 'en' },
  { code: 'es', native: 'Español', htmlLang: 'es' },
  { code: 'fr', native: 'Français', htmlLang: 'fr' },
  { code: 'de', native: 'Deutsch', htmlLang: 'de' },
  { code: 'it', native: 'Italiano', htmlLang: 'it' },
  { code: 'zh', native: '中文', htmlLang: 'zh' },
  { code: 'ja', native: '日本語', htmlLang: 'ja' },
  { code: 'ko', native: '한국어', htmlLang: 'ko' },
  { code: 'th', native: 'ไทย', htmlLang: 'th' },
  { code: 'ru', native: 'Русский', htmlLang: 'ru' },
  { code: 'ar', native: 'العربية', htmlLang: 'ar', rtl: true },
  { code: 'hi', native: 'हिन्दी', htmlLang: 'hi' },
  { code: 'id', native: 'Bahasa Indonesia', htmlLang: 'id' },
  { code: 'tr', native: 'Türkçe', htmlLang: 'tr' },
  { code: 'vi', native: 'Tiếng Việt', htmlLang: 'vi' },
  { code: 'nl', native: 'Nederlands', htmlLang: 'nl' },
  { code: 'pl', native: 'Polski', htmlLang: 'pl' },
];

export const LANG_CODES = LANGUAGES.map((l) => l.code);

export function isSupportedLang(code) {
  return LANG_CODES.includes(code);
}

// Metadados de um idioma; cai no primeiro (pt) se o código for desconhecido.
export function langMeta(code) {
  return LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];
}
