/* PERFISIO — helpers + dados compartilhados (mock) */
window.App = (function () {

  /* ---------- Fisioterapeutas (compartilhado entre páginas) ---------- */
  const FISIOS = [
    { id: 'camila', nome: 'Camila Rocha',  cor: '#0DA189', crefito: 'CREFITO-3 45.678-F', esp: 'Ortopedia e Traumato' },
    { id: 'rafael', nome: 'Rafael Nunes',  cor: '#2D7DD2', crefito: 'CREFITO-3 51.230-F', esp: 'Fisioterapia Esportiva' },
    { id: 'marina', nome: 'Marina Alves',  cor: '#7C5CBF', crefito: 'CREFITO-3 48.902-F', esp: 'Pilates Clínico · RPG' },
    { id: 'pedro',  nome: 'Pedro Sampaio', cor: '#D9820B', crefito: 'CREFITO-3 55.114-F', esp: 'Neurofuncional' },
  ];
  const fisio = id => FISIOS.find(f => f.id === id);
  const iniciais = nome => nome.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

  /* ---------- Toast ---------- */
  let toastWrap;
  function toast(msg, type = 'success') {
    if (!toastWrap) {
      toastWrap = document.createElement('div');
      toastWrap.className = 'toast-wrap';
      document.body.appendChild(toastWrap);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const ico = { success: '✅', error: '⚠️', info: 'ℹ️' }[type] || '';
    el.innerHTML = `${ico} <span>${msg}</span>`;
    toastWrap.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3200);
    setTimeout(() => el.remove(), 3600);
  }

  /* ---------- Modal ---------- */
  function openModal(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.add('open'); }
  }
  function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('open');
  }
  document.addEventListener('click', e => {
    if (e.target.classList && e.target.classList.contains('modal-overlay')) {
      e.target.classList.remove('open');
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  });

  /* ---------- Formatação ---------- */
  const money = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const moneyShort = v => v >= 1e6 ? `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
    : `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;

  /* ---------- Tabs ---------- */
  function initTabs(container) {
    const tabs = container.querySelectorAll('.tab');
    tabs.forEach(t => t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const target = t.dataset.tab;
      container.parentElement.querySelectorAll('[data-tab-panel]').forEach(p => {
        p.style.display = p.dataset.tabPanel === target ? '' : 'none';
      });
    }));
  }
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tabs[data-auto]').forEach(initTabs);
  });

  return { FISIOS, fisio, iniciais, toast, openModal, closeModal, money, moneyShort, initTabs };
})();
