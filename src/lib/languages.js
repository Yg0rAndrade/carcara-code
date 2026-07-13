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
// `flag`    = emoji de bandeira (convenção de país; idioma ≠ país, mas é o padrão de picker).
// `htmlLang`= valor de <html lang="…"> (BCP-47).
// `rtl`     = escrita da direita p/ esquerda (só semântico por ora; ver nota no i18n.jsx).
export const LANGUAGES = [
  { code: 'pt', native: 'Português (Brasil)', flag: '🇧🇷', htmlLang: 'pt-BR' },
  { code: 'en', native: 'English', flag: '🇺🇸', htmlLang: 'en' },
  { code: 'es', native: 'Español', flag: '🇪🇸', htmlLang: 'es' },
  { code: 'fr', native: 'Français', flag: '🇫🇷', htmlLang: 'fr' },
  { code: 'de', native: 'Deutsch', flag: '🇩🇪', htmlLang: 'de' },
  { code: 'it', native: 'Italiano', flag: '🇮🇹', htmlLang: 'it' },
  { code: 'zh', native: '中文', flag: '🇨🇳', htmlLang: 'zh' },
  { code: 'ja', native: '日本語', flag: '🇯🇵', htmlLang: 'ja' },
  { code: 'ko', native: '한국어', flag: '🇰🇷', htmlLang: 'ko' },
  { code: 'th', native: 'ไทย', flag: '🇹🇭', htmlLang: 'th' },
  { code: 'ru', native: 'Русский', flag: '🇷🇺', htmlLang: 'ru' },
  { code: 'ar', native: 'العربية', flag: '🇸🇦', htmlLang: 'ar', rtl: true },
  { code: 'hi', native: 'हिन्दी', flag: '🇮🇳', htmlLang: 'hi' },
  { code: 'id', native: 'Bahasa Indonesia', flag: '🇮🇩', htmlLang: 'id' },
  { code: 'tr', native: 'Türkçe', flag: '🇹🇷', htmlLang: 'tr' },
  { code: 'vi', native: 'Tiếng Việt', flag: '🇻🇳', htmlLang: 'vi' },
  { code: 'nl', native: 'Nederlands', flag: '🇳🇱', htmlLang: 'nl' },
  { code: 'pl', native: 'Polski', flag: '🇵🇱', htmlLang: 'pl' },
];

export const LANG_CODES = LANGUAGES.map((l) => l.code);

export function isSupportedLang(code) {
  return LANG_CODES.includes(code);
}

// Metadados de um idioma; cai no primeiro (pt) se o código for desconhecido.
export function langMeta(code) {
  return LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];
}
