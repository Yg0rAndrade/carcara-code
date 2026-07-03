import { useState } from 'react';
import { validateRemoteProfile } from '@/lib/remoteProfile.js';

const EMPTY = { host: '', port: 22, user: '', authType: 'key', keyPath: '', remoteDir: '', label: '' };

export function RemoteProjectModal({ open, onClose, onAdded }) {
  const [p, setP] = useState(EMPTY);
  const [secret, setSecret] = useState('');
  const [test, setTest] = useState(null); // { ok, message }
  const [busy, setBusy] = useState(false);
  const [hosts, setHosts] = useState(null);
  if (!open) return null;
  const set = (k) => (e) => setP((v) => ({ ...v, [k]: e.target.value }));

  async function importConfig() {
    const { hosts } = await window.api.sshConfigHosts();
    setHosts(hosts);
  }
  function pickHost(h) {
    setP((v) => ({ ...v, host: h.hostName || h.host, user: h.user || v.user,
      port: h.port || 22, authType: h.identityFile ? 'key' : v.authType,
      keyPath: h.identityFile || v.keyPath, label: h.host }));
    setHosts(null);
  }
  async function doTest() {
    const v = validateRemoteProfile(p);
    if (!v.ok) { setTest({ ok: false, message: v.error }); return; }
    setBusy(true);
    setTest(await window.api.testRemote(p, secret));
    setBusy(false);
  }
  async function save() {
    const v = validateRemoteProfile(p);
    if (!v.ok) { setTest({ ok: false, message: v.error }); return; }
    setBusy(true);
    const res = await window.api.addRemote(p, secret);
    setBusy(false);
    onAdded?.(res.uri);
    onClose?.();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-[460px] rounded-xl border border-border bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-lg font-semibold">Novo projeto remoto (SSH)</h2>
        <button className="mb-3 text-sm text-primary underline" onClick={importConfig} disabled={busy}>Importar do ~/.ssh/config</button>
        {hosts && (
          <ul className="mb-3 max-h-32 overflow-auto rounded border border-border">
            {hosts.length === 0 && <li className="p-2 text-sm text-muted-foreground">Nenhum host encontrado.</li>}
            {hosts.map((h) => (
              <li key={h.host}><button className="w-full p-2 text-left text-sm hover:bg-muted" onClick={() => pickHost(h)}>{h.host} — {h.hostName || '?'}</button></li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-2">
          <input className="col-span-2 rounded border border-border bg-background p-2 text-sm" placeholder="Host (ex.: 203.0.113.10)" value={p.host} onChange={set('host')} />
          <input className="rounded border border-border bg-background p-2 text-sm" placeholder="Usuário" value={p.user} onChange={set('user')} />
          <input className="rounded border border-border bg-background p-2 text-sm" placeholder="Porta" value={p.port} onChange={set('port')} />
          <select className="col-span-2 rounded border border-border bg-background p-2 text-sm" value={p.authType} onChange={set('authType')}>
            <option value="key">Chave privada (arquivo)</option>
            <option value="password">Senha</option>
            <option value="agent">ssh-agent</option>
          </select>
          {p.authType === 'key' && (
            <input className="col-span-2 rounded border border-border bg-background p-2 text-sm" placeholder="Caminho da chave (ex.: ~/.ssh/id_ed25519)" value={p.keyPath} onChange={set('keyPath')} />
          )}
          {(p.authType === 'password' || p.authType === 'key') && (
            <input type="password" className="col-span-2 rounded border border-border bg-background p-2 text-sm" placeholder={p.authType === 'key' ? 'Passphrase da chave (opcional)' : 'Senha'} value={secret} onChange={(e) => setSecret(e.target.value)} />
          )}
          <input className="col-span-2 rounded border border-border bg-background p-2 text-sm" placeholder="Diretório remoto (ex.: /home/ygor/app)" value={p.remoteDir} onChange={set('remoteDir')} />
          <input className="col-span-2 rounded border border-border bg-background p-2 text-sm" placeholder="Rótulo (opcional)" value={p.label} onChange={set('label')} />
        </div>
        {test && (
          <p className={`mt-2 text-sm ${test.ok ? 'text-green-600' : 'text-red-500'}`}>{test.ok ? '✓ ' : '✗ '}{test.message}</p>
        )}
        <div className="mt-4 flex justify-between">
          <button className="rounded border border-border px-3 py-1.5 text-sm" onClick={doTest} disabled={busy}>Testar conexão</button>
          <div className="flex gap-2">
            <button className="rounded border border-border px-3 py-1.5 text-sm" onClick={onClose} disabled={busy}>Cancelar</button>
            <button className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground" onClick={save} disabled={busy}>Salvar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
