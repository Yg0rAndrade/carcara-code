// Converte a URL de um remote git na URL web navegável do repositório.
// Cobre os formatos que o `git remote -v` cospe: SSH scp-like (git@host:dono/repo.git),
// URLs com esquema (https://, http://, ssh://, git://) e SSH com porta (ssh://git@host:22/…).
// Serve GitHub/GitLab/Bitbucket e qualquer host self-hosted (a conversão é por host, não por marca).
// Retorna null quando não dá pra converter — a UI então só mostra a URL crua, sem link.
export function remoteToWebUrl(remote) {
  if (!remote || typeof remote !== 'string') return null;
  const s = remote.trim();
  if (!s) return null;

  let host = '';
  let path = '';

  const hasScheme = /:\/\//.test(s);
  // scp-like sem esquema: [user@]host:dono/repo(.git)
  const scp = s.match(/^(?:[^@/]+@)?([^:/]+):(.+)$/);
  if (!hasScheme && scp) {
    host = scp[1];
    path = scp[2];
  } else {
    // Com esquema: tira "proto://", depois "user@", isola host[:porta] do resto.
    let rest = s.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '').replace(/^[^@/]+@/, '');
    const slash = rest.indexOf('/');
    if (slash === -1) return null;
    host = rest.slice(0, slash).replace(/:\d+$/, ''); // descarta a porta (host:22)
    path = rest.slice(slash + 1);
  }

  if (!host) return null;
  path = path
    .replace(/^\/+/, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  if (!path) return null;
  return `https://${host}/${path}`;
}
