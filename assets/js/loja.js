/* PERFISIO — Loja: catálogo, carrinho e pedido
   Usado pela loja pública (loja.html, produto.html) e pela loja do painel
   (app/loja.html). O carrinho vive no localStorage; os preços e o desconto de
   quem usa o PerFisio são sempre recalculados no servidor ao fechar o pedido. */
window.Loja = (function () {
  const CHAVE = 'pf_carrinho';
  const ENTREGA = 'pf_entrega';
  const ICO = n => `<svg class="i" aria-hidden="true"><use href="/assets/img/icones.svg#${n}"></use></svg>`;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const moeda = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
  const arred = v => Math.round(Number(v) * 100) / 100;

  /* ---------- dados ---------- */
  let itens = (() => { try { return JSON.parse(localStorage.getItem(CHAVE)) || []; } catch { return []; } })();
  let resumo = { profissional: false, desconto_pct: 0, nome: null, email: null, clinica_nome: null,
    loja: { desconto: 5, frete: 29.9, freteGratis: 399 } };
  const catalogo = new Map();

  const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(itens)); } catch (e) {} };
  const quantos = () => itens.reduce((s, i) => s + i.qtd, 0);
  const registrar = lista => (lista || []).forEach(p => catalogo.set(p.id, p));

  // preço para quem usa o PerFisio (os 5%)
  const precoFisio = p => arred(Number(p.preco) * (1 - (resumo.loja.desconto || 0) / 100));

  function conta() {
    const subtotal = arred(itens.reduce((s, i) => s + i.preco * i.qtd, 0));
    const pct = resumo.desconto_pct || 0;
    const desconto = arred(subtotal * pct / 100);
    const frete = !itens.length || subtotal - desconto >= resumo.loja.freteGratis ? 0 : resumo.loja.frete;
    return { subtotal, pct, desconto, frete, total: arred(subtotal - desconto + frete) };
  }

  async function pedir(caminho, opcoes = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const tok = window.PF && PF.token && PF.token();
    if (tok) headers.Authorization = 'Bearer ' + tok;
    const r = await fetch(caminho, {
      method: opcoes.method || 'GET', headers,
      body: opcoes.body !== undefined ? JSON.stringify(opcoes.body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erro || 'Não foi possível concluir');
    return d;
  }

  /* ---------- carrinho ---------- */
  function adicionar(id, qtd = 1) {
    const p = catalogo.get(id);
    if (!p) return;
    const achado = itens.find(i => i.id === id);
    if (achado) achado.qtd = Math.min(99, achado.qtd + qtd);
    else itens.push({ id: p.id, slug: p.slug, nome: p.nome, preco: Number(p.preco), icone: p.icone, cor: p.cor, qtd });
    salvar(); pintar();
    if (window.App && App.toast) App.toast(`${p.nome} no carrinho`);
  }
  function mudarQtd(id, delta) {
    const i = itens.find(x => x.id === id);
    if (!i) return;
    i.qtd += delta;
    if (i.qtd < 1) itens = itens.filter(x => x.id !== id);
    salvar(); pintar();
  }
  const remover = id => { itens = itens.filter(x => x.id !== id); salvar(); pintar(); };
  const limpar = () => { itens = []; salvar(); pintar(); };

  /* ---------- cartão do produto ---------- */
  function cartao(p, opcoes = {}) {
    const alvo = opcoes.novaAba ? ' target="_blank" rel="noopener"' : '';
    const economia = p.preco_de && p.preco_de > p.preco;
    return `
      <article class="lj-card">
        <a class="lj-art" style="--c:${esc(p.cor)}" href="/loja/${esc(p.slug)}"${alvo} aria-label="${esc(p.nome)}">
          ${ICO(p.icone || 'caixa')}
          ${economia ? '<span class="badge amber lj-tag">Oferta</span>'
            : (p.destaque ? '<span class="badge primary lj-tag">Destaque</span>' : '')}
        </a>
        <div class="lj-corpo">
          <div class="lj-cat">${esc(p.categoria)}${p.marca ? ' · ' + esc(p.marca) : ''}</div>
          <a class="lj-nome" href="/loja/${esc(p.slug)}"${alvo}>${esc(p.nome)}</a>
          <p class="lj-resumo">${esc(p.resumo || '')}</p>
          <div class="lj-precos">
            ${economia ? `<div class="lj-de">${moeda(p.preco_de)}</div>` : ''}
            <div class="lj-preco">${moeda(p.preco)}</div>
            <div class="lj-fisio">${resumo.profissional
              ? `${moeda(precoFisio(p))} com seus ${resumo.loja.desconto}% de desconto`
              : `${moeda(precoFisio(p))} para quem usa o PerFisio`}</div>
          </div>
          <div class="lj-acoes">
            <button class="btn btn-primary btn-sm" type="button" data-loja-add="${esc(p.id)}">
              ${ICO('carrinho')} Adicionar</button>
            <a class="btn btn-ghost btn-sm" href="/loja/${esc(p.slug)}"${alvo}>Detalhes</a>
          </div>
        </div>
      </article>`;
  }

  /* ---------- gaveta ---------- */
  let veu, gaveta, etapa = 'carrinho', pedidoFeito = null, enviando = false;

  function montar() {
    if (gaveta) return;
    veu = document.createElement('div');
    veu.className = 'lj-veu';
    gaveta = document.createElement('aside');
    gaveta.className = 'lj-gaveta';
    gaveta.setAttribute('aria-label', 'Carrinho');
    gaveta.innerHTML = `
      <div class="lj-gaveta-topo">
        ${ICO('carrinho')}<h3>Seu carrinho</h3>
        <button class="fechar" type="button" aria-label="Fechar">${ICO('fechar')}</button>
      </div>
      <div class="lj-gaveta-corpo" id="ljCorpo"></div>
      <div class="lj-gaveta-pe" id="ljPe"></div>`;
    document.body.append(veu, gaveta);
    veu.addEventListener('click', fechar);
    gaveta.querySelector('.fechar').addEventListener('click', fechar);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(); });
  }

  const abrir = () => { montar(); etapa = itens.length ? etapa : 'carrinho'; desenhar(); veu.classList.add('abre'); gaveta.classList.add('abre'); };
  const fechar = () => { if (gaveta) { veu.classList.remove('abre'); gaveta.classList.remove('abre'); } };

  function pintar() {
    document.querySelectorAll('[data-loja-cart]').forEach(b => {
      let c = b.querySelector('.lj-contador');
      if (!c) { c = document.createElement('span'); c.className = 'lj-contador'; b.classList.add('lj-btn-cart'); b.appendChild(c); }
      c.textContent = quantos();
      c.hidden = !quantos();
    });
    // os preços dos cartões mudam quando o desconto do profissional entra
    document.querySelectorAll('.lj-grid').forEach(g => g.dispatchEvent(new CustomEvent('loja:repintar', { bubbles: true })));
    if (gaveta && gaveta.classList.contains('abre')) desenhar();
  }

  function desenhar() {
    const corpo = gaveta.querySelector('#ljCorpo');
    const pe = gaveta.querySelector('#ljPe');
    const c = conta();

    if (etapa === 'ok' && pedidoFeito) {
      corpo.innerHTML = `
        <div class="lj-ok">
          <span style="display:inline-grid;place-items:center;width:58px;height:58px;border-radius:50%;background:var(--green-soft);color:var(--green);">
            <svg class="i" style="width:28px;height:28px;" aria-hidden="true"><use href="/assets/img/icones.svg#confirmado"></use></svg></span>
          <div class="codigo">${esc(pedidoFeito.codigo)}</div>
          <p style="font-size:.86rem;color:var(--text-soft);line-height:1.6;">
            Pedido registrado. Guarde este código: nossa equipe confirma o pagamento e o prazo de entrega
            pelo e-mail que você informou.</p>
          ${pedidoFeito.desconto > 0 ? `<p style="margin-top:12px;font-size:.84rem;font-weight:700;color:var(--green);">
            Você economizou ${moeda(pedidoFeito.desconto)} com os ${pedidoFeito.desconto_pct}% de quem usa o PerFisio.</p>` : ''}
          <div class="lj-conta" style="margin-top:18px;text-align:left;">
            <div><span>Produtos</span><span>${moeda(pedidoFeito.subtotal)}</span></div>
            ${pedidoFeito.desconto > 0 ? `<div class="desc"><span>Desconto PerFisio</span><span>− ${moeda(pedidoFeito.desconto)}</span></div>` : ''}
            <div><span>Frete</span><span>${pedidoFeito.frete ? moeda(pedidoFeito.frete) : 'grátis'}</span></div>
            <div class="total"><span>Total</span><span>${moeda(pedidoFeito.total)}</span></div>
          </div>
        </div>`;
      pe.innerHTML = `<button class="btn btn-ghost" type="button" style="width:100%;justify-content:center;" id="ljVoltarLoja">Continuar comprando</button>`;
      pe.querySelector('#ljVoltarLoja').addEventListener('click', () => { etapa = 'carrinho'; fechar(); desenhar(); });
      return;
    }

    if (!itens.length) {
      corpo.innerHTML = `<div class="lj-vazio">${ICO('sacola')}<p style="margin-top:10px;">Seu carrinho está vazio.</p></div>`;
      pe.innerHTML = '';
      return;
    }

    const avisoDesconto = resumo.profissional
      ? `<div class="lj-aviso">${ICO('desconto')}<span><b>${resumo.loja.desconto}% de desconto aplicado</b> — você usa o PerFisio${resumo.clinica_nome ? ' (' + esc(resumo.clinica_nome) + ')' : ''}.</span></div>`
      : `<div class="lj-aviso">${ICO('desconto')}<span>Fisioterapeuta que usa o PerFisio tem <b>${resumo.loja.desconto}% de desconto</b> em todo o pedido.
           <a href="/login.html">Entre na sua conta</a> ou <a href="/cadastro">crie a sua</a> antes de fechar.</span></div>`;

    const resumoConta = `
      <div class="lj-conta">
        <div><span>Produtos</span><span>${moeda(c.subtotal)}</span></div>
        ${c.desconto > 0 ? `<div class="desc"><span>Desconto PerFisio (${c.pct}%)</span><span>− ${moeda(c.desconto)}</span></div>` : ''}
        <div><span>Frete</span><span>${c.frete ? moeda(c.frete) : 'grátis'}</span></div>
        ${c.frete ? `<div style="font-size:.75rem;color:var(--text-soft);display:block;">Frete grátis a partir de ${moeda(resumo.loja.freteGratis)}</div>` : ''}
        <div class="total"><span>Total</span><span>${moeda(c.total)}</span></div>
      </div>`;

    if (etapa === 'dados') {
      const g = (() => { try { return JSON.parse(localStorage.getItem(ENTREGA)) || {}; } catch { return {}; } })();
      corpo.innerHTML = `
        <h4 style="font-size:.92rem;font-weight:800;color:var(--ink);margin-bottom:12px;">Entrega e contato</h4>
        <div class="field" style="margin-bottom:10px;"><label>Nome de quem recebe</label>
          <input type="text" id="ljNome" value="${esc(g.nome || resumo.nome || '')}" placeholder="Seu nome"></div>
        <div class="field" style="margin-bottom:10px;"><label>E-mail</label>
          <input type="email" id="ljEmail" value="${esc(g.email || resumo.email || '')}" placeholder="voce@clinica.com.br"></div>
        <div class="field" style="margin-bottom:10px;"><label>Telefone com DDD</label>
          <input type="tel" id="ljTel" value="${esc(g.telefone || '')}" placeholder="(53) 99999-0000"></div>
        <div class="field" style="margin-bottom:10px;"><label>CEP</label>
          <input type="text" id="ljCep" value="${esc(g.cep || '')}" placeholder="96000-000"></div>
        <div class="field" style="margin-bottom:10px;"><label>Endereço completo</label>
          <input type="text" id="ljEnd" value="${esc(g.endereco || '')}" placeholder="Rua, número, complemento, bairro"></div>
        <div class="field" style="margin-bottom:10px;"><label>Cidade</label>
          <input type="text" id="ljCidade" value="${esc(g.cidade || '')}" placeholder="Pelotas/RS"></div>
        <div class="field"><label>Observação (opcional)</label>
          <textarea id="ljObs" rows="2" placeholder="Horário para entrega, nota fiscal, etc."></textarea></div>`;
      pe.innerHTML = `${resumoConta}
        <button class="btn btn-primary" type="button" id="ljConfirmar" style="width:100%;justify-content:center;margin-top:12px;padding:11px;">
          Confirmar pedido · ${moeda(c.total)}</button>
        <button class="btn btn-ghost btn-sm" type="button" id="ljVoltar" style="width:100%;justify-content:center;margin-top:8px;">Voltar ao carrinho</button>`;
      pe.querySelector('#ljVoltar').addEventListener('click', () => { etapa = 'carrinho'; desenhar(); });
      pe.querySelector('#ljConfirmar').addEventListener('click', confirmar);
      return;
    }

    corpo.innerHTML = avisoDesconto + itens.map(i => `
      <div class="lj-item">
        <span class="mini" style="--c:${esc(i.cor || '#0DA189')}">${ICO(i.icone || 'caixa')}</span>
        <div style="flex:1;min-width:0;">
          <div class="nome">${esc(i.nome)}</div>
          <div class="linha">
            <span class="lj-qtd">
              <button type="button" data-menos="${esc(i.id)}" aria-label="Menos um">${ICO('menos')}</button>
              <span>${i.qtd}</span>
              <button type="button" data-mais="${esc(i.id)}" aria-label="Mais um">${ICO('mais')}</button>
            </span>
            <button class="tirar" type="button" data-tirar="${esc(i.id)}">remover</button>
            <span class="val">${moeda(i.preco * i.qtd)}</span>
          </div>
        </div>
      </div>`).join('');
    corpo.querySelectorAll('[data-menos]').forEach(b => b.addEventListener('click', () => mudarQtd(b.dataset.menos, -1)));
    corpo.querySelectorAll('[data-mais]').forEach(b => b.addEventListener('click', () => mudarQtd(b.dataset.mais, 1)));
    corpo.querySelectorAll('[data-tirar]').forEach(b => b.addEventListener('click', () => remover(b.dataset.tirar)));

    pe.innerHTML = `${resumoConta}
      <button class="btn btn-primary" type="button" id="ljIrDados" style="width:100%;justify-content:center;margin-top:12px;padding:11px;">
        Finalizar pedido</button>`;
    pe.querySelector('#ljIrDados').addEventListener('click', () => { etapa = 'dados'; desenhar(); });
  }

  async function confirmar() {
    if (enviando) return;
    const btn = gaveta.querySelector('#ljConfirmar');
    const campo = id => (gaveta.querySelector('#' + id) || {}).value || '';
    const dados = {
      nome: campo('ljNome').trim(), email: campo('ljEmail').trim(), telefone: campo('ljTel').trim(),
      cep: campo('ljCep').trim(), endereco: campo('ljEnd').trim(), cidade: campo('ljCidade').trim(),
      obs: campo('ljObs').trim(),
    };
    enviando = true; btn.disabled = true; btn.textContent = 'Enviando...';
    try {
      const r = await pedir('/api/loja/pedidos', {
        method: 'POST',
        body: { ...dados, itens: itens.map(i => ({ id: i.id, qtd: i.qtd })) },
      });
      try { localStorage.setItem(ENTREGA, JSON.stringify(dados)); } catch (e) {}
      if (r.checkout) { location.href = r.checkout; return; }
      pedidoFeito = r; etapa = 'ok'; limpar(); desenhar();
      document.dispatchEvent(new CustomEvent('loja:pedido', { detail: r }));
    } catch (e) {
      if (window.App && App.toast) App.toast(e.message, 'error'); else alert(e.message);
    }
    enviando = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar pedido'; }
    if (etapa === 'dados') desenhar();
  }

  /* ---------- início ---------- */
  async function iniciar() {
    montar();
    document.addEventListener('click', e => {
      const add = e.target.closest('[data-loja-add]');
      if (add) { adicionar(add.dataset.lojaAdd, parseInt(add.dataset.lojaQtd, 10) || 1); return; }
      const cart = e.target.closest('[data-loja-cart]');
      if (cart) { e.preventDefault(); abrir(); }
    });
    pintar();
    try {
      const r = await pedir('/api/loja/resumo');
      resumo = { ...resumo, ...r, loja: { ...resumo.loja, ...(r.loja || {}) } };
    } catch (e) { /* visitante sem sessão: segue com o preço de tabela */ }
    document.dispatchEvent(new CustomEvent('loja:resumo', { detail: resumo }));
    pintar();
  }

  return {
    iniciar, registrar, cartao, adicionar, remover, mudarQtd, limpar, abrir, fechar,
    itens: () => itens.slice(), quantos, conta, moeda, precoFisio, pedir, ICO, esc,
    get resumo() { return resumo; },
  };
})();
