/* PERFISIO — ícones que se desenham
   Mesmo efeito das páginas internas do Domínio Médico, adaptado para ícone sólido:
   o contorno nasce de uma ponta à outra (stroke-dasharray/offset), uma luz corre pelo
   caminho e, no fim, o preenchimento aparece. Dispara quando a seção entra na tela e
   repete quando o mouse passa pelo cartão.

   A página funciona sem este arquivo: o ícone já está desenhado e preenchido no HTML.
   Uso: <section data-icones-animados> … <svg class="i"><use href="…#casa"></use></svg> */
(function () {
  const SELETOR = '[data-icones-animados]';
  const DURACAO = 1150;
  const parado = matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (parado || !document.querySelector(SELETOR)) return;

  const SPRITE = '/assets/img/icones.svg';
  let desenhos = null; // id → { d, viewBox }

  async function carregarDesenhos() {
    if (desenhos) return desenhos;
    const txt = await (await fetch(SPRITE)).text();
    const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
    desenhos = {};
    doc.querySelectorAll('symbol').forEach(s => {
      const partes = [...s.querySelectorAll('path')].map(p => p.getAttribute('d')).filter(Boolean);
      if (partes.length) desenhos[s.id] = { d: partes.join(' '), viewBox: s.getAttribute('viewBox') };
    });
    return desenhos;
  }

  /* troca o <use> por três camadas: contorno, luz e o ícone cheio */
  function montar(svg, desenho) {
    svg.setAttribute('viewBox', desenho.viewBox);
    svg.classList.add('i-anima');
    svg.innerHTML =
      `<path class="i-traco" d="${desenho.d}"></path>` +
      `<path class="i-luz" d="${desenho.d}"></path>` +
      `<path class="i-cheio" d="${desenho.d}"></path>`;
    return {
      traco: svg.querySelector('.i-traco'),
      luz: svg.querySelector('.i-luz'),
      cheio: svg.querySelector('.i-cheio'),
    };
  }

  function animar({ traco, luz, cheio }, total) {
    const pedaco = total * 0.08;
    traco.animate([{ strokeDashoffset: total }, { strokeDashoffset: 0 }],
      { duration: DURACAO, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'forwards' });
    luz.animate(
      [{ strokeDashoffset: pedaco, opacity: 1 }, { strokeDashoffset: -total, opacity: 1, offset: .92 }, { strokeDashoffset: -total, opacity: 0 }],
      { duration: DURACAO + 150, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'forwards' });
    // o preenchimento entra quando o contorno já fechou quase todo o caminho
    cheio.animate([{ opacity: 0 }, { opacity: 0, offset: .6 }, { opacity: 1 }],
      { duration: DURACAO + 250, easing: 'ease-out', fill: 'forwards' });
  }

  (async function ligar() {
    let mapa;
    try { mapa = await carregarDesenhos(); } catch (e) { return; } // sem o sprite, fica o ícone parado

    document.querySelectorAll(SELETOR).forEach(secao => {
      const alvos = [];
      secao.querySelectorAll('svg.i').forEach(svg => {
        const id = (svg.querySelector('use')?.getAttribute('href') || '').split('#')[1];
        const desenho = id && mapa[id];
        if (!desenho) return;
        const camadas = montar(svg, desenho);
        const total = camadas.traco.getTotalLength();
        if (!total) return;
        camadas.traco.style.strokeDasharray = total;
        camadas.luz.style.strokeDasharray = `${total * 0.08} ${total}`;
        const cartao = svg.closest('.feat, .card, article, li') || svg;
        alvos.push({ camadas, total, cartao });
        // de novo com o mouse em cima, como nos cartões do Domínio Médico
        cartao.addEventListener('mouseenter', () => animar(camadas, total));
      });
      if (!alvos.length) return;

      const olho = new IntersectionObserver((entradas, obs) => {
        entradas.forEach(e => {
          if (!e.isIntersecting) return;
          obs.disconnect();
          alvos.forEach((a, i) => setTimeout(() => animar(a.camadas, a.total), i * 160));
        });
      }, { threshold: .25 });
      olho.observe(secao);
    });
  })();
})();
