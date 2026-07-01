// Strings nativas do processo main (menus de contexto, diálogos, notificações).
// Ficam aqui (e não em src/lib/locales) porque o main é empacotado separado do
// renderer — importar de src/ no app distribuído é frágil. São poucas e estáveis.
module.exports = {
  pt: {
    ctx_back: 'Voltar',
    ctx_forward: 'Avançar',
    ctx_reload: 'Recarregar',
    ctx_cut: 'Recortar',
    ctx_copy: 'Copiar',
    ctx_paste: 'Colar',
    ctx_select_all: 'Selecionar tudo',
    ctx_copy_link: 'Copiar link',
    ctx_open_new_tab: 'Abrir link em nova aba',
    ctx_inspect: 'Inspecionar elemento',
    dialog_choose_folders: 'Escolha a(s) pasta(s) de projeto',
    notify_title: 'Carcará Code',
    notify_asking: 'Claude precisa de você em {name}',
    notify_done: 'Claude terminou em {name}',
    update_notify_body: 'Versão {version} disponível — abra para atualizar',
  },
  en: {
    ctx_back: 'Go back',
    ctx_forward: 'Go forward',
    ctx_reload: 'Reload',
    ctx_cut: 'Cut',
    ctx_copy: 'Copy',
    ctx_paste: 'Paste',
    ctx_select_all: 'Select all',
    ctx_copy_link: 'Copy link',
    ctx_open_new_tab: 'Open link in new tab',
    ctx_inspect: 'Inspect element',
    dialog_choose_folders: 'Choose project folder(s)',
    notify_title: 'Carcará Code',
    notify_asking: 'Claude needs you in {name}',
    notify_done: 'Claude finished in {name}',
    update_notify_body: 'Version {version} available — open to update',
  },
};
