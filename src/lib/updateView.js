// Traduz o estado do update (vindo do main) num modelo de view pra pílula e aba Sobre.
// `t` é a função de i18n. Mantém zero JSX: é lógica pura e testável.
export function updateView(update, t) {
  const s = (update && update.state) || 'idle';
  // Base comum: evita repetir os mesmos campos em todos os ramos e garante que `detail`
  // exista sempre (quem consome não precisa testar undefined).
  const base = { visible: true, showProgress: false, action: null, detail: '' };
  switch (s) {
    case 'checking':
      return { ...base, title: t('update.checking') };
    case 'available':
      return {
        ...base,
        title: t('update.available', { version: update.version }),
        action: 'download',
      };
    case 'downloading': {
      const percent = (update && update.percent) || 0;
      return {
        ...base,
        title: t('update.downloading', { percent }),
        showProgress: true,
        percent,
      };
    }
    case 'downloaded':
      return { ...base, title: t('update.ready'), action: 'install' };
    case 'error':
      // `detail` é a mensagem crua do electron-updater. Sem ela a tela dizia só "Falha ao
      // atualizar", e um 404 de `latest.yml` (release publicada sem os assets do Windows)
      // ficava indistinguível de estar sem internet.
      return {
        ...base,
        title: t('update.error'),
        action: 'retry',
        detail: (update && update.message) || '',
      };
    case 'dev':
    case 'idle':
    default:
      return { ...base, visible: false, title: t('update.upToDate') };
  }
}

// Indicador no rail: ponto-brasa quando há update pra baixar ou instalar.
export function hasPendingUpdate(update) {
  const s = update && update.state;
  return s === 'available' || s === 'downloaded';
}
