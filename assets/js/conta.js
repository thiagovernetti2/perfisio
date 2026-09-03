/* PERFISIO — conta do paciente (agendamento online)
   Uso: await Conta.exigir()  → resolve com a conta logada, abrindo a modal se precisar.
   Guarda a sessão em localStorage (pf_conta_token / pf_conta). */
window.Conta = (function () {
  const TOKEN = 'pf_conta_token', DADOS = 'pf_conta';

  const token = () => localStorage.getItem(TOKEN);
  const atual = () => { try { return JSON.parse(localStorage.getItem(DADOS)); } catch { return null; } };
  function salvar(t, c) { localStorage.setItem(TOKEN, t); localStorage.setItem(DADOS, JSON.stringify(c)); }
  function sair() { localStorage.removeItem(TOKEN); localStorage.removeItem(DADOS); }

  async function api(caminho, body, metodo) {
    const headers = { 'Content-Type': 'application/json' };
    if (token()) headers.Authorization = 'Bearer ' + token();
    const res = await fetch(caminho, {
      method: metodo || (body ? 'POST' : 'GET'), headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const dados = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(dados.erro || 'Erro na requisição');
    return dados;
  }
  const apagar = caminho => api(caminho, null, 'DELETE');

  const CSS = `
    .cta-overlay { position: fixed; inset: 0; background: rgba(10,20,22,.55); z-index: 200;
      display: none; align-items: center; justify-content: center; padding: 20px; }
    .cta-overlay.aberta { display: flex; }
    .cta-modal { background: #fff; border-radius: 16px; width: 100%; max-width: 400px;
      box-shadow: 0 22px 60px rgba(0,0,0,.3); overflow: hidden; font-family: Inter, sans-serif; }
    .cta-topo { padding: 22px 24px 0; }
    .cta-topo h3 { font-size: 1.12rem; font-weight: 800; color: #0F2A2E; letter-spacing: -.3px; }
    .cta-topo p { font-size: .84rem; color: #64737A; line-height: 1.55; margin-top: 6px; }
    .cta-abas { display: flex; gap: 4px; padding: 18px 24px 0; }
    .cta-abas button { flex: 1; border: none; background: none; padding: 9px 0 11px; font-family: inherit;
      font-size: .88rem; font-weight: 700; color: #64737A; cursor: pointer; border-bottom: 2px solid #E4EBEA; }
    .cta-abas button.on { color: #0A8270; border-bottom-color: #0DA189; }
    .cta-corpo { padding: 18px 24px 24px; }
    .cta-corpo label { display: block; font-size: .78rem; font-weight: 600; color: #0F2A2E; margin-bottom: 5px; }
    .cta-corpo input { width: 100%; border: 1px solid #DDE6E4; border-radius: 9px; padding: 10px 12px;
      font-size: .92rem; font-family: inherit; margin-bottom: 12px; color: #0F2A2E; background: #fff; }
    .cta-corpo input:focus { outline: none; border-color: #0DA189; }
    .cta-erro { display: none; background: #FBE9E9; color: #D64545; border-radius: 8px;
      padding: 9px 12px; font-size: .82rem; font-weight: 600; margin-bottom: 12px; }
    .cta-btn { width: 100%; border: none; background: #0DA189; color: #fff; border-radius: 9px;
      padding: 12px; font-size: .92rem; font-weight: 700; font-family: inherit; cursor: pointer; }
    .cta-btn:disabled { opacity: .6; cursor: default; }
    .cta-fechar { background: none; border: none; font-size: .8rem; color: #64737A; cursor: pointer;
      font-family: inherit; display: block; margin: 12px auto 0; }
    .cta-google { padding: 0 24px 4px; }
    .cta-google .gbtn { display: flex; justify-content: center; min-height: 44px; }
    .cta-ou { display: flex; align-items: center; gap: 10px; color: #93A5A3; font-size: .74rem;
      font-weight: 600; text-transform: uppercase; letter-spacing: 1px; padding: 14px 24px 0; }
    .cta-ou::before, .cta-ou::after { content: ''; flex: 1; height: 1px; background: #E4EBEA; }
  `;

  let overlay = null, resolver = null, aba = 'entrar';
  const PADRAO = { titulo: 'Falta pouco para confirmar', texto: 'Sua conta guarda os agendamentos e deixa remarcar em um clique.' };
  let textos = PADRAO;

  function montar() {
    if (overlay) return overlay;
    const estilo = document.createElement('style');
    estilo.textContent = CSS;
    document.head.appendChild(estilo);

    overlay = document.createElement('div');
    overlay.className = 'cta-overlay';
    overlay.innerHTML = `
      <div class="cta-modal" role="dialog" aria-modal="true">
        <div class="cta-topo">
          <h3>Falta pouco para confirmar</h3>
          <p>Sua conta guarda os agendamentos e deixa remarcar em um clique.</p>
        </div>
        <div class="cta-google" id="ctaGoogleBox" style="display:none;">
          <div class="gbtn" id="ctaGoogle"></div>
          <div class="cta-ou">ou com e-mail</div>
        </div>
        <div class="cta-abas">
          <button type="button" data-aba="entrar">Entrar</button>
          <button type="button" data-aba="criar">Criar conta</button>
        </div>
        <div class="cta-corpo">
          <div class="cta-erro" id="ctaErro"></div>
          <div id="ctaCampos"></div>
          <button class="cta-btn" id="ctaOk"></button>
          <button class="cta-fechar" id="ctaCancelar">Agora não</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelectorAll('.cta-abas button').forEach(b =>
      b.addEventListener('click', () => { aba = b.dataset.aba; render(); }));
    overlay.querySelector('#ctaOk').addEventListener('click', enviar);
    overlay.querySelector('#ctaCancelar').addEventListener('click', () => fechar(null));
    overlay.addEventListener('click', e => { if (e.target === overlay) fechar(null); });
    return overlay;
  }

  /* botão oficial do Google (só aparece com GOOGLE_CLIENT_ID configurado) */
  let googlePronto = false;
  async function prepararGoogle() {
    if (googlePronto) return;
    let clientId = null;
    try { clientId = (await (await fetch('/api/public/config')).json()).google; } catch (e) { return; }
    if (!clientId) return;
    await new Promise((ok, falhou) => {
      if (window.google?.accounts?.id) return ok();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true; s.defer = true; s.onload = ok; s.onerror = falhou;
      document.head.appendChild(s);
    }).catch(() => {});
    if (!window.google?.accounts?.id) return;
    window.google.accounts.id.initialize({ client_id: clientId, callback: entrarComGoogle });
    window.google.accounts.id.renderButton(overlay.querySelector('#ctaGoogle'),
      { theme: 'outline', size: 'large', text: 'continue_with', locale: 'pt-BR', width: 320 });
    overlay.querySelector('#ctaGoogleBox').style.display = '';
    googlePronto = true;
  }

  async function entrarComGoogle(resposta) {
    try {
      const r = await api('/api/conta/google', { credential: resposta.credential });
      salvar(r.token, r.conta);
      fechar(r.conta);
    } catch (e) { erro(e.message); }
  }

  function render() {
    overlay.querySelector('.cta-topo h3').textContent = textos.titulo;
    overlay.querySelector('.cta-topo p').textContent = textos.texto;
    overlay.querySelectorAll('.cta-abas button').forEach(b => b.classList.toggle('on', b.dataset.aba === aba));
    overlay.querySelector('#ctaErro').style.display = 'none';
    overlay.querySelector('#ctaOk').textContent = aba === 'entrar' ? 'Entrar e confirmar' : 'Criar conta e confirmar';
    overlay.querySelector('#ctaCampos').innerHTML = aba === 'entrar' ? `
      <label>E-mail</label><input type="email" id="ctaEmail" autocomplete="email" placeholder="voce@email.com">
      <label>Senha</label><input type="password" id="ctaSenha" autocomplete="current-password" placeholder="••••••••">`
      : `
      <label>Seu nome</label><input type="text" id="ctaNome" autocomplete="name" placeholder="Nome e sobrenome">
      <label>E-mail</label><input type="email" id="ctaEmail" autocomplete="email" placeholder="voce@email.com">
      <label>WhatsApp</label><input type="tel" id="ctaTel" autocomplete="tel" placeholder="(51) 9 0000-0000">
      <label>Senha</label><input type="password" id="ctaSenha" autocomplete="new-password" placeholder="mínimo 6 caracteres">`;
    const primeiro = overlay.querySelector('#ctaCampos input');
    if (primeiro) setTimeout(() => primeiro.focus(), 50);
    overlay.querySelectorAll('#ctaCampos input').forEach(i =>
      i.addEventListener('keydown', e => { if (e.key === 'Enter') enviar(); }));
  }

  function erro(msg) {
    const el = overlay.querySelector('#ctaErro');
    el.textContent = msg; el.style.display = 'block';
  }

  async function enviar() {
    const btn = overlay.querySelector('#ctaOk');
    const v = id => (overlay.querySelector('#' + id) || {}).value?.trim() || '';
    btn.disabled = true;
    const rotulo = btn.textContent;
    btn.textContent = 'Aguarde...';
    try {
      const r = aba === 'entrar'
        ? await api('/api/conta/login', { email: v('ctaEmail'), senha: v('ctaSenha') })
        : await api('/api/conta/registrar', { nome: v('ctaNome'), email: v('ctaEmail'), telefone: v('ctaTel'), senha: v('ctaSenha') });
      salvar(r.token, r.conta);
      fechar(r.conta);
    } catch (e) {
      erro(e.message);
      btn.disabled = false; btn.textContent = rotulo;
    }
  }

  function fechar(conta) {
    overlay.classList.remove('aberta');
    const f = resolver; resolver = null;
    if (f) f(conta);
  }

  function abrir(inicial, msgs) {
    montar();
    textos = msgs || PADRAO;
    aba = inicial || 'entrar';
    render();
    overlay.classList.add('aberta');
    prepararGoogle();
    return new Promise(res => { resolver = res; });
  }

  /* garante uma conta logada: devolve a conta ou null se a pessoa desistir */
  async function exigir(msgs) {
    if (token()) {
      try { const r = await api('/api/conta/me'); salvar(token(), r.conta); return r.conta; }
      catch (e) { sair(); }
    }
    return abrir('entrar', msgs);
  }

  return { token, atual, exigir, abrir, sair, api, apagar };
})();
