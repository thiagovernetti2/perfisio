/* PERFISIO — Sidebar + Topbar injetadas + guarda de autenticação
   Uso: <body data-page="pacientes" data-title="Pacientes" data-subtitle="...">
   Requer app.js e api.js carregados antes. */
(function () {
  // Guarda: páginas do app exigem login
  if (!PF.token()) { location.href = '../login.html'; return; }
  const usuario = PF.user() || { nome: 'Usuário', clinica_nome: 'Minha clínica', perfil: 'gestor' };

  const body = document.body;
  const page = body.dataset.page || '';
  const title = body.dataset.title || 'PerFisio';
  const subtitle = body.dataset.subtitle || '';

  const NAV = [
    { label: 'Principal' },
    { id: 'dashboard',     href: 'dashboard.html',     ico: '📊', text: 'Dashboard' },
    { id: 'agenda',        href: 'agenda.html',        ico: '📅', text: 'Agenda' },
    { id: 'pacientes',     href: 'pacientes.html',     ico: '👥', text: 'Pacientes' },
    { id: 'crm',           href: 'crm.html',           ico: '🎯', text: 'CRM · Captação' },
    { label: 'Clínica' },
    { id: 'prontuarios',   href: 'prontuarios.html',   ico: '📋', text: 'Prontuários' },
    { id: 'exercicios',    href: 'exercicios.html',    ico: '💪', text: 'Exercícios' },
    { id: 'financeiro',    href: 'financeiro.html',    ico: '💳', text: 'Financeiro' },
    { id: 'marketing',     href: 'marketing.html',     ico: '📣', text: 'Marketing' },
    { id: 'aprovacoes',    href: 'aprovacoes.html',    ico: '📱', text: 'Aprovações' },
    { id: 'equipe',        href: 'equipe.html',        ico: '🧑‍⚕️', text: 'Equipe' },
    { id: 'relatorios',    href: 'relatorios.html',    ico: '📈', text: 'Relatórios' },
    { id: 'configuracoes', href: 'configuracoes.html', ico: '⚙️', text: 'Configurações' },
  ];

  const navHtml = NAV.map(n => n.label
    ? `<div class="nav-label">${n.label}</div>`
    : `<a class="nav-item${n.id === page ? ' active' : ''}" href="${n.href}">
         <span class="ico">${n.ico}</span>${n.text}</a>`
  ).join('');

  const PERFIS = { gestor: 'Gestor(a)', fisio: 'Fisioterapeuta', recepcao: 'Recepção' };

  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar';
  sidebar.innerHTML = `
    <div class="brand">
      <div class="logo-mark">P</div>
      <div>
        <div class="logo-name">PerFisio</div>
        <div class="logo-sub">Gestão & CRM</div>
      </div>
    </div>
    <nav>${navHtml}</nav>
    <div class="user-box">
      <div class="avatar">${App.iniciais(usuario.nome)}</div>
      <div style="min-width:0;">
        <div class="u-name">${usuario.nome}</div>
        <div class="u-role">${PERFIS[usuario.perfil] || usuario.perfil} · ${usuario.clinica_nome || ''}</div>
      </div>
      <button class="logout" title="Sair" id="pfLogout">⎋</button>
    </div>`;

  const topbar = document.createElement('header');
  topbar.className = 'topbar';
  topbar.innerHTML = `
    <div>
      <h1>${title}</h1>
      ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
    </div>
    <div class="spacer"></div>
    <div class="search">🔍 <input type="text" placeholder="Buscar paciente..." id="pfGlobalSearch"></div>`;

  const shell = document.createElement('div');
  shell.className = 'app-shell';
  const main = document.createElement('div');
  main.className = 'main';

  // move o conteúdo existente do body para dentro de .main > .content
  const content = document.createElement('div');
  content.className = 'content';
  while (body.firstChild) content.appendChild(body.firstChild);

  main.appendChild(topbar);
  main.appendChild(content);
  shell.appendChild(sidebar);
  shell.appendChild(main);
  body.appendChild(shell);

  sidebar.querySelector('#pfLogout').addEventListener('click', PF.logout);
  topbar.querySelector('#pfGlobalSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.value.trim())
      location.href = 'pacientes.html?q=' + encodeURIComponent(e.target.value.trim());
  });
})();
