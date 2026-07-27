/* PERFISIO — Mapa corporal interativo (SVG)
   Uso: BodyMap.render(el, { selecionada, marcadores: {joelho:'ativo', lombar:'concluido'}, onSelect, mini })
   Regiões casam com tratamentos.regiao. */
window.BodyMap = (function () {

  const REGIOES = {
    cervical:     { label: 'Cervical / pescoço', ico: '🦴' },
    ombro:        { label: 'Ombro',              ico: '💪' },
    cotovelo:     { label: 'Cotovelo',           ico: '💪' },
    punho:        { label: 'Punho / mão',        ico: '🖐' },
    coluna:       { label: 'Coluna torácica',    ico: '🦴' },
    lombar:       { label: 'Coluna lombar',      ico: '🦴' },
    quadril:      { label: 'Quadril / pelve',    ico: '🦿' },
    joelho:       { label: 'Joelho',             ico: '🦵' },
    tornozelo:    { label: 'Tornozelo / pé',     ico: '🦶' },
    neuro:        { label: 'Neurológico',        ico: '🧠' },
    respiratorio: { label: 'Respiratório',       ico: '🫁' },
    outro:        { label: 'Outro',              ico: '🩺' },
  };

  /* Condições fisioterapêuticas comuns por região */
  const CONDICOES = {
    cervical: [
      ['Cervicalgia mecânica', 'Dor no pescoço, rigidez, piora com postura prolongada'],
      ['Hérnia de disco cervical', 'Dor irradiada para braço, formigamento, perda de força'],
      ['Cefaleia tensional / cervicogênica', 'Dor de cabeça com origem na musculatura cervical'],
      ['Torcicolo', 'Contratura aguda com bloqueio de rotação'],
      ['Whiplash (chicote)', 'Trauma em aceleração/desaceleração, comum pós-acidente'],
    ],
    ombro: [
      ['Síndrome do impacto', 'Dor ao elevar o braço, arco doloroso 60–120°'],
      ['Lesão do manguito rotador', 'Dor e fraqueza, dor noturna ao deitar sobre o ombro'],
      ['Capsulite adesiva (ombro congelado)', 'Rigidez progressiva com grande perda de amplitude'],
      ['Tendinopatia bicipital', 'Dor anterior no ombro, piora ao levantar objetos'],
      ['Instabilidade / luxação recidivante', 'Sensação de "sair do lugar", apreensão'],
      ['Bursite subacromial', 'Dor difusa lateral, piora com atividades acima da cabeça'],
    ],
    cotovelo: [
      ['Epicondilite lateral (tenista)', 'Dor na face lateral, piora ao estender punho/agarrar'],
      ['Epicondilite medial (golfista)', 'Dor na face medial, piora à flexão resistida do punho'],
      ['Bursite olecraniana', 'Inchaço na ponta do cotovelo'],
    ],
    punho: [
      ['Síndrome do túnel do carpo', 'Formigamento noturno em polegar/indicador/médio'],
      ['Tenossinovite de De Quervain', 'Dor no polegar/punho ao pinçar e torcer'],
      ['Lesão de TFCC', 'Dor ulnar do punho ao apoiar e girar'],
      ['Rizartrose', 'Artrose da base do polegar, dor à pinça'],
    ],
    coluna: [
      ['Dorsalgia mecânica', 'Dor interescapular ligada à postura'],
      ['Escoliose', 'Desvio lateral da coluna, assimetria de tronco'],
      ['Hipercifose torácica', 'Aumento da curvatura, "corcunda", dor postural'],
    ],
    lombar: [
      ['Lombalgia mecânica', 'Dor lombar que piora com esforço e postura prolongada'],
      ['Hérnia de disco lombar (L4-L5 / L5-S1)', 'Dor irradiada para a perna, formigamento'],
      ['Ciatalgia', 'Dor no trajeto do nervo ciático, glúteo à perna'],
      ['Espondilolistese', 'Escorregamento vertebral, dor com extensão'],
      ['Estenose do canal lombar', 'Dor/peso nas pernas ao caminhar, melhora sentado'],
    ],
    quadril: [
      ['Osteoartrose de quadril', 'Dor na virilha, rigidez matinal, limitação de rotação'],
      ['Bursite trocantérica', 'Dor lateral, piora ao deitar sobre o lado afetado'],
      ['Impacto femoroacetabular (IFA)', 'Dor na virilha em flexão profunda, comum em esportistas'],
      ['Pubalgia', 'Dor no púbis/adutores, comum em futebolistas'],
      ['Síndrome do piriforme', 'Dor glútea profunda com irradiação'],
    ],
    joelho: [
      ['Lesão de LCA', 'Entorse com "estalo", instabilidade, comum em esportes'],
      ['Lesão meniscal', 'Dor na interlinha, travamento, dor ao agachar'],
      ['Condropatia patelar', 'Dor anterior ao subir/descer escadas e agachar'],
      ['Síndrome patelofemoral', 'Dor anterior difusa, piora ao ficar muito tempo sentado'],
      ['Tendinopatia patelar (joelho de saltador)', 'Dor no tendão patelar em saltos'],
      ['Osteoartrose de joelho', 'Dor com carga, crepitação, rigidez'],
    ],
    tornozelo: [
      ['Entorse de tornozelo', 'Trauma em inversão, edema lateral'],
      ['Tendinopatia de Aquiles', 'Dor no tendão ao correr/saltar, rigidez matinal'],
      ['Fascite plantar', 'Dor no calcanhar nos primeiros passos do dia'],
      ['Esporão de calcâneo', 'Dor plantar no apoio do calcanhar'],
      ['Canelite (síndrome do estresse tibial)', 'Dor na canela em corredores'],
    ],
    neuro: [
      ['AVC — reabilitação motora', 'Hemiparesia, reeducação de marcha e equilíbrio'],
      ['Doença de Parkinson', 'Rigidez, bradicinesia, treino de equilíbrio e marcha'],
      ['Paralisia facial', 'Reabilitação da mímica facial'],
      ['Neuropatia periférica', 'Formigamento, fraqueza distal, treino sensório-motor'],
    ],
    respiratorio: [
      ['Fisioterapia respiratória pós-COVID/pneumonia', 'Reexpansão pulmonar, condicionamento'],
      ['DPOC — reabilitação pulmonar', 'Dispneia, treino de endurance'],
      ['Asma — condicionamento', 'Educação respiratória e exercício'],
    ],
    outro: [],
  };

  /* pontos clicáveis sobre a silhueta (viewBox 0 0 200 430) */
  const SPOTS = [
    { r: 'cervical',  x: 100, y: 57,  rr: 12 },
    { r: 'ombro',     x: 59,  y: 78,  rr: 12 }, { r: 'ombro',     x: 141, y: 78,  rr: 12 },
    { r: 'coluna',    x: 100, y: 104, rr: 14 },
    { r: 'cotovelo',  x: 40,  y: 146, rr: 10 }, { r: 'cotovelo',  x: 160, y: 146, rr: 10 },
    { r: 'lombar',    x: 100, y: 150, rr: 14 },
    { r: 'punho',     x: 30,  y: 204, rr: 10 }, { r: 'punho',     x: 170, y: 204, rr: 10 },
    { r: 'quadril',   x: 74,  y: 186, rr: 12 }, { r: 'quadril',   x: 126, y: 186, rr: 12 },
    { r: 'joelho',    x: 79,  y: 290, rr: 12 }, { r: 'joelho',    x: 121, y: 290, rr: 12 },
    { r: 'tornozelo', x: 76,  y: 372, rr: 11 }, { r: 'tornozelo', x: 124, y: 372, rr: 11 },
  ];

  const FIG = `
    <g stroke="#AFC2BD" stroke-width="1.5" fill="#DCE7E4">
      <circle cx="100" cy="30" r="21"/>
      <rect x="91" y="48" width="18" height="15" rx="6"/>
      <path d="M64 66 Q100 57 136 66 Q146 70 147 84 L143 130 Q141 156 133 172 L67 172 Q59 156 57 130 L53 84 Q54 70 64 66 Z"/>
      <rect x="63" y="170" width="74" height="36" rx="15"/>
    </g>
    <g stroke="#DCE7E4" stroke-width="16" stroke-linecap="round" fill="none">
      <path d="M56 82 L42 144 L31 200"/>
      <path d="M144 82 L158 144 L169 200"/>
      <path d="M80 208 L78 288 L75 366"/>
      <path d="M120 208 L122 288 L125 366"/>
    </g>
    <g fill="#DCE7E4" stroke="#AFC2BD" stroke-width="1.2">
      <ellipse cx="29" cy="212" rx="8" ry="11"/>
      <ellipse cx="171" cy="212" rx="8" ry="11"/>
      <ellipse cx="72" cy="380" rx="11" ry="8"/>
      <ellipse cx="128" cy="380" rx="11" ry="8"/>
    </g>`;

  function render(el, opts = {}) {
    const { selecionada = null, marcadores = {}, onSelect = null, mini = false } = opts;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 200 430');
    svg.style.width = '100%';
    svg.style.display = 'block';
    svg.innerHTML = FIG + SPOTS.map((s, i) => {
      const marc = marcadores[s.r];
      const sel = s.r === selecionada;
      const cor = marc === 'ativo' ? '#0DA189' : marc === 'concluido' ? '#9AABA7' : null;
      return `
        <g class="bm-spot" data-r="${s.r}" style="cursor:${onSelect ? 'pointer' : 'default'};">
          <circle cx="${s.x}" cy="${s.y}" r="${s.rr}"
            fill="${sel ? 'rgba(13,161,137,.22)' : cor ? cor + '33' : 'transparent'}"
            stroke="${sel ? '#0DA189' : cor || (mini ? 'transparent' : '#8FA6A3')}"
            stroke-width="${sel ? 2.5 : 1.4}" ${sel || cor ? '' : 'stroke-dasharray="3 3"'}/>
          ${cor ? `<circle cx="${s.x}" cy="${s.y}" r="4.5" fill="${cor}"/>` : ''}
          <title>${REGIOES[s.r].label}${marc ? ' · ' + (marc === 'ativo' ? 'em tratamento' : 'concluído') : ''}</title>
        </g>`;
    }).join('');
    el.innerHTML = '';
    el.appendChild(svg);
    if (onSelect) {
      svg.querySelectorAll('.bm-spot').forEach(g => {
        g.addEventListener('click', () => onSelect(g.dataset.r));
        g.addEventListener('mouseenter', () => {
          const c = g.querySelector('circle');
          if (g.dataset.r !== selecionada) c.setAttribute('fill', 'rgba(13,161,137,.14)');
        });
        g.addEventListener('mouseleave', () => {
          const c = g.querySelector('circle');
          const marc = marcadores[g.dataset.r];
          if (g.dataset.r !== selecionada)
            c.setAttribute('fill', marc ? (marc === 'ativo' ? '#0DA18933' : '#9AABA733') : 'transparent');
        });
      });
    }
  }

  return { REGIOES, CONDICOES, render };
})();
