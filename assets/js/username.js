/* PERFISIO — campo de username do link curto (perfis.io/username)
   Normaliza enquanto digita, checa se está livre e salva. Usado na Equipe (clínica)
   e na agenda do próprio fisioterapeuta. Requer api.js e app.js. */
(function () {
  if (!document.getElementById('estiloUsername')) {
    const s = document.createElement('style');
    s.id = 'estiloUsername';
    s.textContent = `
      .user-link { display: flex; align-items: center; border: 1px solid var(--line); border-radius: 9px; overflow: hidden; background: var(--bg); }
      .user-link .pref { padding: 0 2px 0 11px; font-weight: 700; color: var(--text-soft); font-size: .86rem; white-space: nowrap; }
      .user-link input { flex: 1; min-width: 110px; border: none; background: #fff; padding: 9px 10px; font-weight: 700;
        color: var(--primary-dark); font-size: .86rem; outline: none; border-left: 1px solid var(--line); }
      .user-link .btn { border-radius: 0; align-self: stretch; }`;
    document.head.appendChild(s);
  }

  // faixa de acentos combinantes montada por código (evita escapes que viram caractere literal)
  const ACENTOS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');

  window.ligarUsername = function ({ input, botao, status, fisioId, atual, aoSalvar }) {
    let base = atual || '', espera = null;
    const aviso = (msg, tipo) => {
      status.textContent = msg;
      status.style.color = tipo === 'erro' ? 'var(--red)' : tipo === 'ok' ? 'var(--primary-dark)' : 'var(--text-soft)';
    };
    input.value = base;
    botao.disabled = true;

    input.oninput = () => {
      const v = input.value.toLowerCase().normalize('NFD').replace(ACENTOS, '')
        .replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-');
      if (v !== input.value) input.value = v;
      clearTimeout(espera);
      botao.disabled = true;
      if (v === base) { aviso('', ''); return; }
      aviso('Verificando…', '');
      espera = setTimeout(async () => {
        try {
          const r = await PF.api(`/api/fisios/slug-disponivel?slug=${encodeURIComponent(v)}&id=${fisioId}`);
          if (input.value !== v || v === base) return; // já digitou outra coisa, ou acabou de salvar este
          aviso(r.disponivel ? `✓ perfis.io/${r.slug} está livre` : r.motivo, r.disponivel ? 'ok' : 'erro');
          botao.disabled = !r.disponivel;
        } catch (e) { aviso(e.message, 'erro'); }
      }, 350);
    };

    botao.onclick = async () => {
      clearTimeout(espera); // uma checagem pendente não pode sobrescrever o "Link salvo"
      botao.disabled = true;
      try {
        const r = await PF.api(`/api/fisios/${fisioId}/slug`, { method: 'PUT', body: { slug: input.value } });
        base = r.slug; input.value = r.slug;
        aviso(r.mudou
          ? `✓ Link salvo: perfis.io/${r.slug}` + (r.anterior ? ` — perfis.io/${r.anterior} continua levando para ele` : '')
          : 'Nada mudou', 'ok');
        if (aoSalvar) aoSalvar(r);
      } catch (e) { aviso(e.message, 'erro'); botao.disabled = false; }
    };

    return { atual: () => base, aviso };
  };
})();
