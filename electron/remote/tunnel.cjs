'use strict';

// Encaminhamento de porta local → remota sobre a conexão ssh2 que o projeto já tem
// aberta. É o mesmo que `ssh -L <local>:127.0.0.1:<remota> host`: um servidor TCP em
// 127.0.0.1 e, pra cada conexão aceita, um canal `forwardOut` no cliente ssh2.
//
// Existe porque o <webview> do preview não fala SSH — mas fala http://127.0.0.1:<porta>.
// Com o túnel de pé, o dev server da VPS aparece no preview como se fosse local, e todo
// o resto do painel (abas, barra de URL, DevTools, print) funciona sem saber de nada.
//
// Puro no sentido do CLAUDE.md: recebe `net` (o módulo do Node) e `connFor(hostKey)`
// por injeção, então dá pra testar com um cliente ssh2 de mentira.
function makeTunnels({ net, connFor }) {
  const tunnels = new Map(); // `${hostKey}|${remotePort}` -> rec

  const keyOf = (hostKey, remotePort) => `${hostKey}|${remotePort}`;

  function destroySockets(rec) {
    for (const s of rec.sockets) {
      try {
        s.destroy();
      } catch {}
    }
    rec.sockets.clear();
  }

  // Abre (ou reusa) o túnel pra uma porta remota. Resolve com a porta local efêmera
  // que o SO escolheu — quem chama monta a URL.
  async function open(hostKey, remotePort) {
    const port = Number(remotePort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('porta remota inválida: ' + remotePort);
    }
    const key = keyOf(hostKey, port);
    const cur = tunnels.get(key);
    if (cur) return { localPort: cur.localPort, reused: true };

    // Garante conexão viva ANTES de abrir o servidor: se a autenticação falhar, o erro
    // sobe pra UI em vez de virar um túnel que recusa toda conexão em silêncio.
    const client = await connFor(hostKey);

    const rec = { hostKey, remotePort: port, sockets: new Set(), server: null, localPort: 0 };
    const server = net.createServer((sock) => {
      rec.sockets.add(sock);
      // Pacote pequeno (um GET, um frame de websocket) sai na hora, sem esperar o
      // Nagle juntar com o próximo — é o que mantém o preview responsivo.
      try {
        sock.setNoDelay(true);
      } catch {}
      sock.on('close', () => rec.sockets.delete(sock));
      sock.on('error', () => {
        try {
          sock.destroy();
        } catch {}
      });
      // `srcPort` só aparece no log do servidor SSH; qualquer valor serve.
      client.forwardOut('127.0.0.1', sock.remotePort || 0, '127.0.0.1', port, (err, stream) => {
        if (err) {
          try {
            sock.destroy();
          } catch {}
          return;
        }
        stream.on('error', () => {
          try {
            sock.destroy();
          } catch {}
        });
        sock.pipe(stream).pipe(sock);
      });
    });
    rec.server = server;

    await new Promise((resolve, reject) => {
      const onErr = (err) => reject(err);
      server.once('error', onErr);
      // Só 127.0.0.1: a porta da VPS NUNCA fica exposta na rede local da máquina.
      // Porta 0 = efêmera, escolhida pelo SO (não há o que colidir).
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', onErr);
        resolve();
      });
    });

    const addr = server.address();
    rec.localPort = (addr && addr.port) || 0;
    // Depois do listen o servidor não pode mais derrubar a Promise; erros tardios só
    // fecham o túnel (quem estiver navegando vê a página cair, o app segue vivo).
    server.on('error', () => close(hostKey, port));
    tunnels.set(key, rec);
    return { localPort: rec.localPort, reused: false };
  }

  function close(hostKey, remotePort) {
    const key = keyOf(hostKey, Number(remotePort));
    const rec = tunnels.get(key);
    if (!rec) return false;
    tunnels.delete(key);
    destroySockets(rec);
    try {
      rec.server.close();
    } catch {}
    return true;
  }

  // Todos os túneis de um host (usado ao remover o projeto / cair a conexão).
  function closeHost(hostKey) {
    let n = 0;
    for (const rec of [...tunnels.values()]) {
      if (rec.hostKey === hostKey && close(rec.hostKey, rec.remotePort)) n++;
    }
    return n;
  }

  function closeAll() {
    for (const rec of [...tunnels.values()]) close(rec.hostKey, rec.remotePort);
  }

  // Túneis abertos (de um host, ou todos). A UI usa pra saber o que já está de pé.
  function list(hostKey) {
    return [...tunnels.values()]
      .filter((r) => !hostKey || r.hostKey === hostKey)
      .map((r) => ({ hostKey: r.hostKey, remotePort: r.remotePort, localPort: r.localPort }));
  }

  return { open, close, closeHost, closeAll, list };
}

module.exports = { makeTunnels };
