/* PERFISIO — camada de acesso à API (JWT em localStorage) */
window.PF = (function () {
  const TOKEN_KEY = 'pf_token';
  const USER_KEY = 'pf_user';
  // profissional em mais de uma clínica: em qual delas está agora (vazio = a de origem)
  const CLINICA_KEY = 'pf_clinica';

  const token = () => localStorage.getItem(TOKEN_KEY);
  const user = () => { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } };
  const clinica = () => localStorage.getItem(CLINICA_KEY);
  const setClinica = id => id ? localStorage.setItem(CLINICA_KEY, id) : localStorage.removeItem(CLINICA_KEY);

  // link com ?c= (ex.: prontuário de um paciente de outra clínica, vindo da agenda) troca a clínica em uso
  try {
    const c = new URLSearchParams(location.search).get('c');
    if (c && location.pathname.includes('/app/')) setClinica(c);
  } catch (e) {}

  function setSession(tok, usuario) {
    localStorage.setItem(TOKEN_KEY, tok);
    localStorage.setItem(USER_KEY, JSON.stringify(usuario));
  }
  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(CLINICA_KEY);
    location.href = '../login.html';
  }

  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token()) headers.Authorization = 'Bearer ' + token();
    // opts.clinica fala com uma clínica específica (agenda somada); senão vale a clínica em uso
    const daSessao = !('clinica' in opts);
    const cid = daSessao ? clinica() : opts.clinica;
    if (cid) headers['X-Clinica'] = cid;
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401 && !path.startsWith('/api/auth') && !path.startsWith('/api/public')) {
      localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); localStorage.removeItem(CLINICA_KEY);
      location.href = location.pathname.includes('/app/') ? '../login.html' : 'login.html';
      throw new Error('Não autenticado');
    }
    const data = await res.json().catch(() => ({}));
    // saiu da equipe daquela clínica: volta para a de origem
    if (res.status === 403 && data.codigo === 'sem_vinculo' && daSessao && clinica()) {
      setClinica(null);
      location.reload();
    }
    if (!res.ok) throw new Error(data.erro || 'Erro na requisição');
    return data;
  }

  const get = (t, q) => api('/api/' + t + (q ? '?' + new URLSearchParams(q) : ''));
  const post = (t, body) => api('/api/' + t, { method: 'POST', body });
  const put = (t, id, body) => api(`/api/${t}/${id}`, { method: 'PUT', body });
  const del = (t, id) => api(`/api/${t}/${id}`, { method: 'DELETE' });

  /* datas */
  const hojeISO = () => new Date().toISOString().slice(0, 10);
  const fmtData = iso => iso ? new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '—';
  const idade = nasc => nasc ? Math.floor((Date.now() - new Date(nasc)) / 31557600000) : null;

  return { token, user, setSession, logout, api, get, post, put, del, hojeISO, fmtData, idade, clinica, setClinica };
})();
