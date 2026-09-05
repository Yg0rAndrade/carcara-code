// Decisão do efeito "projeto ativo mudou" do PreviewPanel: mostrar, anexar, subir ou
// não fazer nada com o servidor de preview.
//
// Existe como função PURA porque a regra mais importante daqui é invisível pra revisão
// de diff e já ressuscitou servidor duas vezes: **o efeito não pode subir servidor a
// cada vez que roda**. Ele re-roda sempre que o OBJETO do projeto muda de identidade —
// e o objeto muda justamente quando o servidor morre (`preview:exit` → `onProjectsChanged`
// → `reload` → `running: false`). Sem trava vira laço de realimentação: o "Parar" é
// desfeito no mesmo instante, e um dev server que morre no boot relança pra sempre.
//
// `handled` é a trava: o auto-start é só a PRIMEIRA vez que o projeto passa por aqui.
// Depois disso, servidor fora do ar = decisão do usuário (ou queda), e quem sobe de
// novo é o botão Reiniciar.
//
// Entrada (tudo já resolvido pelo chamador, nada de I/O aqui):
//   hasUrl      — já sabemos a URL viva deste projeto (urlsRef)
//   running     — o main diz que o processo está de pé
//   statusUrl   — a URL que o main já descobriu (null enquanto procura a porta)
//   previewType — null = projeto sem servidor pra subir
//   handled     — este projeto já passou por este efeito nesta sessão
//   sameProject — é re-run no mesmo projeto (não troca de projeto)
//   autoStart   — o projeto quer o Preview subindo sozinho (Configurações › Projetos)
//
// Saída:
//   action: 'show'   — tem URL: mostra o site
//           'attach'  — servidor de pé sem porta ainda: mostra o log e fica procurando
//           'start'   — sobe o servidor (só na primeira vez)
//           'empty'   — estado vazio
//           'keep'    — não mexe em nada (mantém o log do erro à mostra)
//   markHandled: marcar este projeto como já tratado
export function decideAutoStart({
  hasUrl = false,
  running = false,
  statusUrl = null,
  previewType = null,
  handled = false,
  sameProject = false,
  autoStart = true,
} = {}) {
  if (hasUrl) return { action: 'show', markHandled: true };
  if (running && statusUrl) return { action: 'show', markHandled: true };
  // Projeto sem servidor (site estático, pasta solta): nada a subir.
  if (previewType == null) return { action: 'empty', markHandled: running };
  // De pé, mas ainda sem porta: acompanha o que já está subindo — nunca sobe outro.
  if (running) return { action: 'attach', markHandled: true };
  // Auto-start desligado no projeto: não sobe nada sozinho. Marca como tratado pra o
  // botão Iniciar continuar sendo o único caminho, mesmo se o efeito re-rodar. Vale só
  // pra este ramo: quem já está no ar continua sendo mostrado normalmente acima.
  if (!autoStart) return { action: 'empty', markHandled: true };
  // Fora do ar e já tratado: o usuário parou, ou o servidor caiu. NÃO relança.
  // Num re-run do mesmo projeto nem mexe no modo, senão o log com o erro de quem
  // caiu some da tela justo quando o usuário precisa lê-lo.
  if (handled) return { action: sameProject ? 'keep' : 'empty', markHandled: false };
  return { action: 'start', markHandled: true };
}
