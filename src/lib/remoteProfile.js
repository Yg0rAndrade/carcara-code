export function validateRemoteProfile(p) {
  if (!p || !p.host || !p.host.trim()) return { ok: false, error: 'Informe o host.' };
  if (!p.user || !p.user.trim()) return { ok: false, error: 'Informe o usuário.' };
  if (!p.remoteDir || !p.remoteDir.trim()) return { ok: false, error: 'Informe o diretório remoto.' };
  if (p.authType === 'key' && !(p.keyPath && p.keyPath.trim())) {
    return { ok: false, error: 'Informe o arquivo da chave privada.' };
  }
  return { ok: true };
}
