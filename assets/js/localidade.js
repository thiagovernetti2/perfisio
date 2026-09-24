/* PERFISIO — seletor de Estado + Cidade com todos os municípios do IBGE
   (assets/data/municipios-br.json). O valor continua gravado como "Cidade/UF",
   formato de que dependem os endereços /fisioterapeuta-{cidade}/{username}.
   Uso: const loc = ligarLocalidade({ uf: selectEstado, cidade: selectCidade });
        loc.definir('Caruaru/PE'); loc.valor(); // → 'Caruaru/PE' ou null */
(function () {
  const ESTADOS = {
    AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
    ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MG: 'Minas Gerais', MS: 'Mato Grosso do Sul',
    MT: 'Mato Grosso', PA: 'Pará', PB: 'Paraíba', PE: 'Pernambuco', PI: 'Piauí', PR: 'Paraná',
    RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RO: 'Rondônia', RR: 'Roraima', RS: 'Rio Grande do Sul',
    SC: 'Santa Catarina', SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins',
  };
  // faixa de acentos combinantes montada por código (evita escapes que viram caractere literal)
  const ACENTOS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
  const chave = s => String(s || '').normalize('NFD').replace(ACENTOS, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  let dados = null;
  const script = document.currentScript && document.currentScript.src;
  const urlDados = script ? new URL('../data/municipios-br.json', script).href : '/assets/data/municipios-br.json';
  const carregar = () => dados || (dados = fetch(urlDados).then(r => {
    if (!r.ok) throw new Error('Falha ao carregar a lista de cidades');
    return r.json();
  }).catch(e => { dados = null; throw e; }));

  // "Caruaru/PE", "Caruaru - PE", "caruaru, pe" ou só "Caruaru" → { uf, cidade } da lista oficial
  function interpretar(bruto, lista) {
    const txt = String(bruto || '').trim();
    if (!txt) return null;
    const m = txt.match(/^(.*?)\s*[\/,\-–]\s*([A-Za-z]{2})$/);
    const nome = chave(m ? m[1] : txt);
    const uf = m ? m[2].toUpperCase() : null;
    if (uf && lista[uf]) {
      const c = lista[uf].find(x => chave(x) === nome);
      return c ? { uf, cidade: c } : { uf, cidade: null };
    }
    const achadas = [];
    for (const u in lista) { const c = lista[u].find(x => chave(x) === nome); if (c) achadas.push({ uf: u, cidade: c }); }
    return achadas.length === 1 ? achadas[0] : null;
  }

  window.ligarLocalidade = function ({ uf, cidade, aoMudar }) {
    let antigo = null; // valor gravado que não bate com a lista: preservado até alguém escolher outro
    let pendente = null, pronto = false;

    uf.innerHTML = '<option value="">Estado…</option>' +
      Object.keys(ESTADOS).map(k => `<option value="${k}">${k} — ${esc(ESTADOS[k])}</option>`).join('');
    cidade.innerHTML = '<option value="">Carregando cidades…</option>';
    cidade.disabled = true;

    function preencherCidades(sel) {
      const lista = (dados && pronto && uf.value) ? window.__municipiosBR[uf.value] || [] : [];
      let html = uf.value ? '<option value="">Cidade…</option>' : '<option value="">Escolha o estado primeiro</option>';
      if (antigo) html += `<option value="__antigo">${esc(antigo)} (fora da lista do IBGE)</option>`;
      html += lista.map(c => `<option>${esc(c)}</option>`).join('');
      cidade.innerHTML = html;
      cidade.disabled = !uf.value && !antigo;
      cidade.value = sel || '';
    }

    function aplicar(v) {
      const r = interpretar(v, window.__municipiosBR);
      antigo = v && !(r && r.cidade) ? String(v).trim() : null;
      uf.value = r ? r.uf : '';
      preencherCidades(r && r.cidade ? r.cidade : (antigo ? '__antigo' : ''));
    }

    uf.addEventListener('change', () => { antigo = null; preencherCidades(''); if (aoMudar) aoMudar(); });
    cidade.addEventListener('change', () => { if (cidade.value !== '__antigo') antigo = null; if (aoMudar) aoMudar(); });

    carregar().then(j => {
      window.__municipiosBR = j; pronto = true;
      aplicar(pendente);
    }).catch(e => {
      cidade.innerHTML = `<option value="">${esc(e.message)}</option>`;
      if (window.App) App.toast(e.message, 'error');
    });

    return {
      definir(v) { pendente = v || null; if (pronto) aplicar(pendente); else { antigo = null; uf.value = ''; } },
      valor() {
        if (!pronto) return pendente; // lista ainda não chegou: não apaga o que já estava gravado
        if (cidade.value === '__antigo') return antigo;
        return uf.value && cidade.value ? `${cidade.value}/${uf.value}` : null;
      },
    };
  };
})();
