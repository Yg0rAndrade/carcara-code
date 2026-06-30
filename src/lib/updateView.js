// Traduz o estado do update (vindo do main) num modelo de view pra pílula e aba Sobre.
// `t` é a função de i18n. Mantém zero JSX: é lógica pura e testável.
export function updateView(update, t) {
  const s = (update && update.state) || 'idle';
  switch (s) {
    case 'checking':
      return { visible: true, title: t('update.checking'), showProgress: false, action: null };
    case 'available':
      return { visible: true, title: t('update.available', { version: update.version }), showProgress: false, action: 'download' };
    case 'downloading': {
      const percent = (update && update.percent) || 0;
      return { visible: true, title: t('update.downloading', { percent }), showProgress: true, percent, action: null };
    }
    case 'downloaded':
      return { visible: true, title: t('update.ready'), showProgress: false, action: 'install' };
    case 'error':
      return { visible: true, title: t('update.error'), showProgress: false, action: 'retry' };
    case 'dev':
    case 'idle':
    default:
      return { visible: false, title: t('update.upToDate'), showProgress: false, action: null };
  }
}

// Indicador no rail: ponto-brasa quando há update pra baixar ou instalar.
export function hasPendingUpdate(update) {
  const s = update && update.state;
  return s === 'available' || s === 'downloaded';
}
