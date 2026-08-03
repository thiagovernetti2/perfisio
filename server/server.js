/* PERFISIO — Backend (Express + PostgreSQL)
   Multi-tenant por clínica · Auth JWT · API REST em /api · serve o frontend estático */
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'perfisio-dev-secret';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false } : false,
});

/* ============ MIGRATIONS ============ */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS clinicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cnpj text, telefone text, email text, endereco text, horario text, resp_tecnico text,
  perfil jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL, email text NOT NULL UNIQUE, senha_hash text NOT NULL,
  perfil text NOT NULL DEFAULT 'gestor',
  fisio_id uuid,
  ultimo_acesso timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fisios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL, crefito text, esp text, cor text NOT NULL DEFAULT '#0DA189',
  comissao numeric NOT NULL DEFAULT 40, ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pacientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL, nascimento date, cpf text, telefone text, email text,
  convenio text DEFAULT 'Particular', queixa text, obs text,
  fisio_id uuid REFERENCES fisios(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'avaliacao',
  pacote_nome text, sessoes_total int NOT NULL DEFAULT 0, sessoes_feitas int NOT NULL DEFAULT 0,
  avaliacao jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL, telefone text, origem text, interesse text, obs text,
  valor numeric NOT NULL DEFAULT 0,
  fisio_id uuid REFERENCES fisios(id) ON DELETE SET NULL,
  col text NOT NULL DEFAULT 'novo',
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  paciente_id uuid REFERENCES pacientes(id) ON DELETE CASCADE,
  fisio_id uuid REFERENCES fisios(id) ON DELETE SET NULL,
  titulo text, tipo text NOT NULL DEFAULT 'Sessão de tratamento',
  data date NOT NULL, hora text NOT NULL, duracao text DEFAULT '50 min', obs text,
  status text NOT NULL DEFAULT 'agendada',
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS evolucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  paciente_id uuid NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  fisio_id uuid REFERENCES fisios(id) ON DELETE SET NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  s text, o text, a text, p text, eva int,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS exercicios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL, cat text NOT NULL DEFAULT 'coluna', nivel text NOT NULL DEFAULT 'Iniciante',
  reps text, emoji text DEFAULT '💪', instrucoes text, video text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS prescricoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  paciente_id uuid NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  freq text, duracao text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pacotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL, descricao text, valor numeric NOT NULL DEFAULT 0,
  sessoes int NOT NULL DEFAULT 1, tipo text DEFAULT 'pacote',
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  paciente_id uuid REFERENCES pacientes(id) ON DELETE SET NULL,
  descricao text, forma text, vencimento date, valor numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'aberto',
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS convenios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL, valor_sessao numeric NOT NULL DEFAULT 0, ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  paciente_id uuid NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  nome text NOT NULL, mime text NOT NULL, tamanho int NOT NULL DEFAULT 0,
  dados bytea NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS campanhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  assunto text NOT NULL, corpo text NOT NULL, filtro text DEFAULT 'todos',
  total int NOT NULL DEFAULT 0, enviados int NOT NULL DEFAULT 0, falhas int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'simulada',
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS despesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  categoria text NOT NULL DEFAULT 'operacional',
  fisio_id uuid REFERENCES fisios(id) ON DELETE SET NULL,
  competencia text,
  valor numeric NOT NULL DEFAULT 0,
  vencimento date,
  status text NOT NULL DEFAULT 'aberto',
  obs text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tratamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  paciente_id uuid NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  regiao text,
  fisio_id uuid REFERENCES fisios(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ativo',
  inicio date NOT NULL DEFAULT CURRENT_DATE,
  alta date,
  avaliacao jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
-- evoluções de schema (idempotentes)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS superadmin boolean NOT NULL DEFAULT false;
ALTER TABLE usuarios ALTER COLUMN clinica_id DROP NOT NULL;
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS ativa boolean NOT NULL DEFAULT true;
ALTER TABLE evolucoes ADD COLUMN IF NOT EXISTS tratamento_id uuid REFERENCES tratamentos(id) ON DELETE SET NULL;
ALTER TABLE prescricoes ADD COLUMN IF NOT EXISTS tratamento_id uuid REFERENCES tratamentos(id) ON DELETE SET NULL;
ALTER TABLE sessoes ADD COLUMN IF NOT EXISTS tratamento_id uuid REFERENCES tratamentos(id) ON DELETE SET NULL;
ALTER TABLE tratamentos ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE anexos ADD COLUMN IF NOT EXISTS tratamento_id uuid REFERENCES tratamentos(id) ON DELETE SET NULL;
ALTER TABLE evolucoes ADD COLUMN IF NOT EXISTS sessao_id uuid REFERENCES sessoes(id) ON DELETE SET NULL;
`;

/* migração de dados: pacientes com histórico ganham um tratamento inicial */
async function migrarTratamentos() {
  await pool.query(`
    INSERT INTO tratamentos (clinica_id, paciente_id, titulo, fisio_id, avaliacao)
    SELECT p.clinica_id, p.id, COALESCE(NULLIF(p.queixa, ''), 'Tratamento inicial'), p.fisio_id, p.avaliacao
    FROM pacientes p
    WHERE NOT EXISTS (SELECT 1 FROM tratamentos t WHERE t.paciente_id = p.id)
      AND (p.avaliacao <> '{}'::jsonb
        OR EXISTS (SELECT 1 FROM evolucoes e WHERE e.paciente_id = p.id)
        OR EXISTS (SELECT 1 FROM prescricoes pr WHERE pr.paciente_id = p.id))`);
  await pool.query(`
    UPDATE evolucoes e SET tratamento_id = t.id FROM tratamentos t
    WHERE e.tratamento_id IS NULL AND t.paciente_id = e.paciente_id`);
  await pool.query(`
    UPDATE prescricoes pr SET tratamento_id = t.id FROM tratamentos t
    WHERE pr.tratamento_id IS NULL AND t.paciente_id = pr.paciente_id`);
  // sessões antigas: vincula apenas quando o paciente tem UMA ocorrência (sem ambiguidade)
  await pool.query(`
    UPDATE sessoes s SET tratamento_id = t.id FROM tratamentos t
    WHERE s.tratamento_id IS NULL AND s.paciente_id IS NOT NULL AND t.paciente_id = s.paciente_id
      AND (SELECT count(*) FROM tratamentos x WHERE x.paciente_id = s.paciente_id) = 1`);
}

/* ============ SEED (por clínica nova) ============ */
const SEED_EXERCICIOS = [
  ['Ponte de glúteos','coluna','Iniciante','3 × 12','🧘'],['Bird-dog','coluna','Iniciante','3 × 10/lado','🐦'],
  ['Prancha frontal','coluna','Intermediário','3 × 30s','🪵'],['Gato-camelo','coluna','Iniciante','2 × 15','🐈'],
  ['Agachamento na parede','joelho','Iniciante','3 × 45s','🦵'],['Cadeira extensora elástica','joelho','Intermediário','3 × 12','🪑'],
  ['Step-up com controle','joelho','Avançado','3 × 10/perna','🪜'],['Rotação externa c/ elástico','ombro','Iniciante','3 × 15','💪'],
  ['Deslizamento na parede','ombro','Iniciante','3 × 12','🧗'],['Y-T-W no solo','ombro','Intermediário','2 × 10 cada','🔤'],
  ['Concha (clam shell)','quadril','Iniciante','3 × 15/lado','🦪'],['Abdução em pé c/ elástico','quadril','Intermediário','3 × 12/lado','🩰'],
  ['Marcha estacionária','neuro','Iniciante','3 × 1 min','🚶'],['Treino de equilíbrio unipodal','neuro','Intermediário','3 × 30s/lado','⚖️'],
  ['Alcance funcional sentado','neuro','Iniciante','3 × 10','🫳'],['The Hundred','pilates','Intermediário','1 × 100','💯'],
  ['Roll-up','pilates','Intermediário','2 × 8','🌀'],['Swan (extensão torácica)','pilates','Avançado','2 × 8','🦢'],
];
const SEED_PACOTES = [
  ['Sessão avulsa','Fisioterapia ortopédica / esportiva',160,1,'avulsa'],
  ['Pacote 10 sessões','R$ 140/sessão · validade 3 meses',1400,10,'pacote'],
  ['Pacote 20 sessões','R$ 130/sessão · validade 5 meses',2600,20,'pacote'],
  ['Mensal Pilates · 2x/semana','Turmas de até 5 alunos',680,8,'mensal'],
  ['Atendimento domiciliar','Por sessão · deslocamento incluso',240,1,'avulsa'],
];

async function seedClinica(client, cid) {
  for (const [nome, cat, nivel, reps, emoji] of SEED_EXERCICIOS)
    await client.query('INSERT INTO exercicios (clinica_id,nome,cat,nivel,reps,emoji) VALUES ($1,$2,$3,$4,$5,$6)', [cid, nome, cat, nivel, reps, emoji]);
  for (const [nome, descricao, valor, sessoes, tipo] of SEED_PACOTES)
    await client.query('INSERT INTO pacotes (clinica_id,nome,descricao,valor,sessoes,tipo) VALUES ($1,$2,$3,$4,$5,$6)', [cid, nome, descricao, valor, sessoes, tipo]);
}

/* ============ APP ============ */
const app = express();
app.use(express.json({ limit: '12mb' })); // fotos de prontuário sobem em base64

const sign = u => jwt.sign({ uid: u.id, cid: u.clinica_id, sa: !!u.superadmin }, JWT_SECRET, { expiresIn: '30d' });

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ erro: 'Não autenticado' });
  try { req.auth = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ erro: 'Sessão expirada' }); }
}

/* ---------- AUTH ---------- */
app.post('/api/auth/register', async (req, res) => {
  const { clinica, nome, email, senha } = req.body || {};
  if (!clinica || !nome || !email || !senha) return res.status(400).json({ erro: 'Preencha todos os campos' });
  if (senha.length < 6) return res.status(400).json({ erro: 'A senha precisa de ao menos 6 caracteres' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const dup = await client.query('SELECT 1 FROM usuarios WHERE email=$1', [email.toLowerCase()]);
    if (dup.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ erro: 'E-mail já cadastrado' }); }
    const c = (await client.query('INSERT INTO clinicas (nome,email) VALUES ($1,$2) RETURNING id', [clinica, email.toLowerCase()])).rows[0];
    const f = (await client.query('INSERT INTO fisios (clinica_id,nome,cor) VALUES ($1,$2,$3) RETURNING id', [c.id, nome, '#0DA189'])).rows[0];
    const hash = bcrypt.hashSync(senha, 10);
    const u = (await client.query(
      'INSERT INTO usuarios (clinica_id,nome,email,senha_hash,perfil,fisio_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, clinica_id, nome, email, perfil',
      [c.id, nome, email.toLowerCase(), hash, 'gestor', f.id])).rows[0];
    await seedClinica(client, c.id);
    await client.query('COMMIT');
    res.json({ token: sign(u), usuario: { ...u, clinica_nome: clinica } });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ erro: 'Erro ao criar conta' });
  } finally { client.release(); }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, senha } = req.body || {};
  const r = await pool.query(
    `SELECT u.*, c.nome AS clinica_nome, c.ativa AS clinica_ativa FROM usuarios u LEFT JOIN clinicas c ON c.id = u.clinica_id WHERE u.email=$1`,
    [(email || '').toLowerCase()]);
  const u = r.rows[0];
  if (!u || !bcrypt.compareSync(senha || '', u.senha_hash)) return res.status(401).json({ erro: 'E-mail ou senha inválidos' });
  if (!u.superadmin && u.clinica_ativa === false) return res.status(403).json({ erro: 'Clínica desativada. Fale com o suporte do PerFisio.' });
  pool.query('UPDATE usuarios SET ultimo_acesso=now() WHERE id=$1', [u.id]).catch(() => {});
  res.json({ token: sign(u), usuario: { id: u.id, clinica_id: u.clinica_id, nome: u.nome, email: u.email, perfil: u.perfil, clinica_nome: u.clinica_nome, superadmin: u.superadmin } });
});

app.get('/api/me', auth, async (req, res) => {
  const r = await pool.query(
    `SELECT u.id, u.clinica_id, u.nome, u.email, u.perfil, u.superadmin, c.nome AS clinica_nome FROM usuarios u LEFT JOIN clinicas c ON c.id=u.clinica_id WHERE u.id=$1`,
    [req.auth.uid]);
  if (!r.rowCount) return res.status(401).json({ erro: 'Usuário não encontrado' });
  res.json(r.rows[0]);
});

/* ---------- CLÍNICA (config + perfil público) ---------- */
app.get('/api/clinica', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM clinicas WHERE id=$1', [req.auth.cid]);
  res.json(r.rows[0]);
});
app.put('/api/clinica', auth, async (req, res) => {
  const { nome, cnpj, telefone, email, endereco, horario, resp_tecnico, perfil } = req.body || {};
  const r = await pool.query(
    `UPDATE clinicas SET nome=COALESCE($2,nome), cnpj=COALESCE($3,cnpj), telefone=COALESCE($4,telefone),
     email=COALESCE($5,email), endereco=COALESCE($6,endereco), horario=COALESCE($7,horario),
     resp_tecnico=COALESCE($8,resp_tecnico), perfil=COALESCE($9,perfil) WHERE id=$1 RETURNING *`,
    [req.auth.cid, nome, cnpj, telefone, email, endereco, horario, resp_tecnico, perfil ? JSON.stringify(perfil) : null]);
  res.json(r.rows[0]);
});

/* ---------- USUÁRIOS ---------- */
app.get('/api/usuarios', auth, async (req, res) => {
  const r = await pool.query('SELECT id, nome, email, perfil, ultimo_acesso, criado_em FROM usuarios WHERE clinica_id=$1 ORDER BY criado_em', [req.auth.cid]);
  res.json(r.rows);
});
app.post('/api/usuarios', auth, async (req, res) => {
  const { nome, email, senha, perfil } = req.body || {};
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Preencha nome, e-mail e senha' });
  try {
    const r = await pool.query(
      'INSERT INTO usuarios (clinica_id,nome,email,senha_hash,perfil) VALUES ($1,$2,$3,$4,$5) RETURNING id, nome, email, perfil',
      [req.auth.cid, nome, email.toLowerCase(), bcrypt.hashSync(senha, 10), perfil || 'fisio']);
    res.json(r.rows[0]);
  } catch { res.status(409).json({ erro: 'E-mail já cadastrado' }); }
});

/* ---------- ANEXOS (fotos/arquivos do prontuário, bytea no Postgres) ---------- */
const MAX_ANEXO = 8 * 1024 * 1024; // 8 MB
const MIMES_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

app.get('/api/anexos', auth, async (req, res) => {
  if (!req.query.paciente_id) return res.status(400).json({ erro: 'Informe paciente_id' });
  const r = await pool.query(
    'SELECT id, paciente_id, tratamento_id, nome, mime, tamanho, criado_em FROM anexos WHERE clinica_id=$1 AND paciente_id=$2 ORDER BY criado_em DESC',
    [req.auth.cid, req.query.paciente_id]);
  res.json(r.rows);
});

app.post('/api/anexos', auth, async (req, res) => {
  const { paciente_id, tratamento_id, nome, mime, dados } = req.body || {};
  if (!paciente_id || !nome || !mime || !dados) return res.status(400).json({ erro: 'Dados incompletos' });
  if (!MIMES_OK.includes(mime)) return res.status(400).json({ erro: 'Formato não suportado (use JPG, PNG, WebP ou PDF)' });
  const buf = Buffer.from(dados, 'base64');
  if (!buf.length || buf.length > MAX_ANEXO) return res.status(400).json({ erro: 'Arquivo vazio ou maior que 8 MB' });
  const pac = await pool.query('SELECT 1 FROM pacientes WHERE id=$1 AND clinica_id=$2', [paciente_id, req.auth.cid]);
  if (!pac.rowCount) return res.status(404).json({ erro: 'Paciente não encontrado' });
  const r = await pool.query(
    'INSERT INTO anexos (clinica_id, paciente_id, tratamento_id, nome, mime, tamanho, dados) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, nome, mime, tamanho, criado_em',
    [req.auth.cid, paciente_id, tratamento_id || null, nome, mime, buf.length, buf]);
  res.json(r.rows[0]);
});

// arquivo em si — aceita token no header OU em ?t= (para <img src>)
app.get('/api/anexos/:id/arquivo', async (req, res) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : req.query.t;
  let payload;
  try { payload = jwt.verify(token || '', JWT_SECRET); }
  catch { return res.status(401).json({ erro: 'Não autenticado' }); }
  const r = await pool.query('SELECT nome, mime, dados FROM anexos WHERE id=$1 AND clinica_id=$2', [req.params.id, payload.cid]);
  if (!r.rowCount) return res.status(404).json({ erro: 'Anexo não encontrado' });
  const a = r.rows[0];
  res.set('Content-Type', a.mime);
  res.set('Content-Disposition', `inline; filename="${encodeURIComponent(a.nome)}"`);
  res.set('Cache-Control', 'private, max-age=3600');
  res.send(a.dados);
});

app.delete('/api/anexos/:id', auth, async (req, res) => {
  const r = await pool.query('DELETE FROM anexos WHERE id=$1 AND clinica_id=$2', [req.params.id, req.auth.cid]);
  res.json({ ok: r.rowCount > 0 });
});

/* ---------- FINANCEIRO: comissões dos fisioterapeutas ---------- */
// base de cálculo = sessões realizadas no mês × valor da sessão (do pacote do paciente, ou avulsa)
app.get('/api/financeiro/comissoes', auth, async (req, res) => {
  const mes = (req.query.mes || new Date().toISOString().slice(0, 7)).slice(0, 7);
  const r = await pool.query(`
    SELECT f.id, f.nome, f.cor, f.comissao,
      count(s.id)::int AS sessoes,
      COALESCE(SUM(
        CASE WHEN s.id IS NULL THEN 0 WHEN pac.sessoes > 0 THEN pac.valor / pac.sessoes ELSE COALESCE(av.valor, 0) END
      ), 0)::numeric AS base,
      (SELECT d.id FROM despesas d
        WHERE d.clinica_id = f.clinica_id AND d.categoria = 'comissao'
          AND d.fisio_id = f.id AND d.competencia = $2 LIMIT 1) AS despesa_id
    FROM fisios f
    LEFT JOIN sessoes s ON s.fisio_id = f.id AND s.clinica_id = f.clinica_id
      AND s.status = 'realizada' AND to_char(s.data, 'YYYY-MM') = $2
    LEFT JOIN pacientes p ON p.id = s.paciente_id
    LEFT JOIN pacotes pac ON pac.clinica_id = f.clinica_id AND pac.nome = p.pacote_nome
    LEFT JOIN LATERAL (
      SELECT valor FROM pacotes WHERE clinica_id = f.clinica_id AND tipo = 'avulsa' ORDER BY criado_em LIMIT 1
    ) av ON true
    WHERE f.clinica_id = $1 AND f.ativo
    GROUP BY f.id, f.nome, f.cor, f.comissao, f.clinica_id
    ORDER BY f.nome`, [req.auth.cid, mes]);
  const linhas = r.rows.map(x => ({
    ...x, base: Number(x.base), comissao: Number(x.comissao),
    valor: Number((Number(x.base) * Number(x.comissao) / 100).toFixed(2)),
  }));
  res.json({ mes, linhas, total: Number(linhas.reduce((a, l) => a + l.valor, 0).toFixed(2)) });
});

// gera contas a pagar (categoria comissao) para o mês, sem duplicar
app.post('/api/financeiro/comissoes/gerar', auth, async (req, res) => {
  const { mes, vencimento } = req.body || {};
  if (!mes) return res.status(400).json({ erro: 'Informe a competência (YYYY-MM)' });
  const base = await pool.query(`
    SELECT f.id, f.nome, f.comissao,
      COALESCE(SUM(CASE WHEN s.id IS NULL THEN 0 WHEN pac.sessoes > 0 THEN pac.valor / pac.sessoes ELSE COALESCE(av.valor, 0) END), 0)::numeric AS base,
      count(s.id)::int AS sessoes
    FROM fisios f
    LEFT JOIN sessoes s ON s.fisio_id = f.id AND s.clinica_id = f.clinica_id
      AND s.status = 'realizada' AND to_char(s.data, 'YYYY-MM') = $2
    LEFT JOIN pacientes p ON p.id = s.paciente_id
    LEFT JOIN pacotes pac ON pac.clinica_id = f.clinica_id AND pac.nome = p.pacote_nome
    LEFT JOIN LATERAL (
      SELECT valor FROM pacotes WHERE clinica_id = f.clinica_id AND tipo = 'avulsa' ORDER BY criado_em LIMIT 1
    ) av ON true
    WHERE f.clinica_id = $1 AND f.ativo
    GROUP BY f.id, f.nome, f.comissao, f.clinica_id`, [req.auth.cid, mes]);

  let criadas = 0;
  for (const f of base.rows) {
    const valor = Number(f.base) * Number(f.comissao) / 100;
    if (valor <= 0) continue;
    const existe = await pool.query(
      `SELECT 1 FROM despesas WHERE clinica_id=$1 AND categoria='comissao' AND fisio_id=$2 AND competencia=$3`,
      [req.auth.cid, f.id, mes]);
    if (existe.rowCount) continue;
    await pool.query(
      `INSERT INTO despesas (clinica_id, descricao, categoria, fisio_id, competencia, valor, vencimento, status)
       VALUES ($1,$2,'comissao',$3,$4,$5,$6,'aberto')`,
      [req.auth.cid, `Comissão ${f.nome} · ${mes} (${f.sessoes} sessões · ${Number(f.comissao)}%)`,
       f.id, mes, valor.toFixed(2), vencimento || null]);
    criadas++;
  }
  res.json({ ok: true, criadas });
});

/* ---------- MARKETING (campanhas de e-mail) ---------- */
const smtpConfigurado = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

app.get('/api/marketing/status', auth, (req, res) => {
  res.json({ smtp: smtpConfigurado(), from: process.env.SMTP_FROM || process.env.SMTP_USER || null });
});

app.get('/api/campanhas', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM campanhas WHERE clinica_id=$1 ORDER BY criado_em DESC', [req.auth.cid]);
  res.json(r.rows);
});

app.post('/api/campanhas/enviar', auth, async (req, res) => {
  const { assunto, corpo, filtro } = req.body || {};
  if (!assunto || !corpo) return res.status(400).json({ erro: 'Preencha assunto e mensagem' });
  const where = ['clinica_id=$1', "email IS NOT NULL", "email <> ''"];
  const vals = [req.auth.cid];
  if (filtro && filtro !== 'todos') { vals.push(filtro); where.push(`status=$${vals.length}`); }
  const pacs = (await pool.query(`SELECT nome, email FROM pacientes WHERE ${where.join(' AND ')}`, vals)).rows;
  if (!pacs.length) return res.status(400).json({ erro: 'Nenhum paciente com e-mail cadastrado nesse filtro' });

  const clinica = (await pool.query('SELECT nome FROM clinicas WHERE id=$1', [req.auth.cid])).rows[0];
  const render = (txt, p) => txt
    .replace(/{{\s*nome\s*}}/gi, p.nome.split(' ')[0])
    .replace(/{{\s*clinica\s*}}/gi, clinica.nome);

  let enviados = 0, falhas = 0, status = 'simulada';
  if (smtpConfigurado()) {
    const nodemailer = require('nodemailer');
    const porta = Number(process.env.SMTP_PORT || 587);
    const transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: porta, secure: porta === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    for (const p of pacs) {
      try {
        await transporte.sendMail({
          from: process.env.SMTP_FROM || `"${clinica.nome}" <${process.env.SMTP_USER}>`,
          to: p.email,
          subject: render(assunto, p),
          html: render(corpo, p).replace(/\n/g, '<br>'),
        });
        enviados++;
      } catch (e) { console.error('e-mail falhou:', p.email, e.message); falhas++; }
    }
    status = 'enviada';
  }

  const camp = await pool.query(
    'INSERT INTO campanhas (clinica_id, assunto, corpo, filtro, total, enviados, falhas, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [req.auth.cid, assunto, corpo, filtro || 'todos', pacs.length, enviados, falhas, status]);
  res.json(camp.rows[0]);
});

/* ---------- CRUD GENÉRICO (escopado por clínica) ---------- */
const TABLES = {
  fisios: ['nome', 'crefito', 'esp', 'cor', 'comissao', 'ativo'],
  pacientes: ['nome', 'nascimento', 'cpf', 'telefone', 'email', 'convenio', 'queixa', 'obs', 'fisio_id', 'status', 'pacote_nome', 'sessoes_total', 'sessoes_feitas', 'avaliacao'],
  leads: ['nome', 'telefone', 'origem', 'interesse', 'obs', 'valor', 'fisio_id', 'col'],
  sessoes: ['paciente_id', 'tratamento_id', 'fisio_id', 'titulo', 'tipo', 'data', 'hora', 'duracao', 'obs', 'status'],
  tratamentos: ['paciente_id', 'titulo', 'regiao', 'descricao', 'fisio_id', 'status', 'inicio', 'alta', 'avaliacao'],
  evolucoes: ['paciente_id', 'tratamento_id', 'sessao_id', 'fisio_id', 'data', 's', 'o', 'a', 'p', 'eva'],
  exercicios: ['nome', 'cat', 'nivel', 'reps', 'emoji', 'instrucoes', 'video'],
  prescricoes: ['paciente_id', 'tratamento_id', 'itens', 'freq', 'duracao'],
  pacotes: ['nome', 'descricao', 'valor', 'sessoes', 'tipo'],
  pagamentos: ['paciente_id', 'descricao', 'forma', 'vencimento', 'valor', 'status'],
  convenios: ['nome', 'valor_sessao', 'ativo'],
  despesas: ['descricao', 'categoria', 'fisio_id', 'competencia', 'valor', 'vencimento', 'status', 'obs'],
};
const JSONB_COLS = new Set(['avaliacao', 'itens']);
const ORDER = {
  sessoes: 'data, hora', evolucoes: 'data DESC, criado_em DESC', pagamentos: 'vencimento NULLS LAST, criado_em DESC',
  leads: 'criado_em DESC', prescricoes: 'criado_em DESC',
};

function tableGuard(req, res, next) {
  if (!TABLES[req.params.table]) return res.status(404).json({ erro: 'Recurso inexistente' });
  next();
}

app.get('/api/:table', auth, tableGuard, async (req, res) => {
  const t = req.params.table;
  const cols = TABLES[t];
  const where = ['clinica_id=$1']; const vals = [req.auth.cid];
  for (const [k, v] of Object.entries(req.query)) {
    if (cols.includes(k)) { vals.push(v); where.push(`${k}=$${vals.length}`); }
  }
  if (t === 'sessoes') {
    if (req.query.from) { vals.push(req.query.from); where.push(`data >= $${vals.length}`); }
    if (req.query.to) { vals.push(req.query.to); where.push(`data <= $${vals.length}`); }
  }
  const r = await pool.query(`SELECT * FROM ${t} WHERE ${where.join(' AND ')} ORDER BY ${ORDER[t] || 'criado_em'}`, vals);
  res.json(r.rows);
});

app.post('/api/:table', auth, tableGuard, async (req, res) => {
  const t = req.params.table;
  const cols = TABLES[t].filter(c => req.body[c] !== undefined);
  if (!cols.length) return res.status(400).json({ erro: 'Nenhum campo válido' });
  const vals = cols.map(c => JSONB_COLS.has(c) ? JSON.stringify(req.body[c]) : (req.body[c] === '' ? null : req.body[c]));
  try {
    const r = await pool.query(
      `INSERT INTO ${t} (clinica_id, ${cols.join(',')}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(',')}) RETURNING *`,
      [req.auth.cid, ...vals]);
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(400).json({ erro: 'Dados inválidos' }); }
});

app.put('/api/:table/:id', auth, tableGuard, async (req, res) => {
  const t = req.params.table;
  const cols = TABLES[t].filter(c => req.body[c] !== undefined);
  if (!cols.length) return res.status(400).json({ erro: 'Nenhum campo válido' });
  const vals = cols.map(c => JSONB_COLS.has(c) ? JSON.stringify(req.body[c]) : (req.body[c] === '' ? null : req.body[c]));
  const sets = cols.map((c, i) => `${c}=$${i + 3}`).join(',');
  const extra = t === 'leads' ? ', atualizado_em=now()' : '';
  try {
    const r = await pool.query(`UPDATE ${t} SET ${sets}${extra} WHERE id=$1 AND clinica_id=$2 RETURNING *`, [req.params.id, req.auth.cid, ...vals]);
    if (!r.rowCount) return res.status(404).json({ erro: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(400).json({ erro: 'Dados inválidos' }); }
});

app.delete('/api/:table/:id', auth, tableGuard, async (req, res) => {
  const r = await pool.query(`DELETE FROM ${req.params.table} WHERE id=$1 AND clinica_id=$2`, [req.params.id, req.auth.cid]);
  res.json({ ok: r.rowCount > 0 });
});

/* ---------- AÇÕES ESPECIAIS ---------- */
// marcar sessão realizada/falta — incrementa contagem do paciente
app.patch('/api/sessoes/:id/status', auth, async (req, res) => {
  const { status } = req.body || {};
  if (!['agendada', 'realizada', 'falta', 'cancelada'].includes(status)) return res.status(400).json({ erro: 'Status inválido' });
  const cur = await pool.query('SELECT * FROM sessoes WHERE id=$1 AND clinica_id=$2', [req.params.id, req.auth.cid]);
  if (!cur.rowCount) return res.status(404).json({ erro: 'Sessão não encontrada' });
  const s = cur.rows[0];
  const r = await pool.query('UPDATE sessoes SET status=$3 WHERE id=$1 AND clinica_id=$2 RETURNING *', [req.params.id, req.auth.cid, status]);
  if (s.paciente_id && status === 'realizada' && s.status !== 'realizada')
    await pool.query('UPDATE pacientes SET sessoes_feitas = sessoes_feitas + 1 WHERE id=$1', [s.paciente_id]);
  if (s.paciente_id && s.status === 'realizada' && status !== 'realizada')
    await pool.query('UPDATE pacientes SET sessoes_feitas = GREATEST(sessoes_feitas - 1, 0) WHERE id=$1', [s.paciente_id]);
  // devolve o saldo de créditos do pacote (agenda ↔ financeiro)
  let creditos = null;
  if (s.paciente_id) {
    const p = (await pool.query('SELECT nome, pacote_nome, sessoes_total, sessoes_feitas FROM pacientes WHERE id=$1', [s.paciente_id])).rows[0];
    if (p) creditos = { pacote: p.pacote_nome, total: p.sessoes_total, usadas: p.sessoes_feitas, saldo: p.sessoes_total - p.sessoes_feitas };
  }
  res.json({ ...r.rows[0], creditos });
});

// converter lead em paciente
app.post('/api/leads/:id/converter', auth, async (req, res) => {
  const cur = await pool.query('SELECT * FROM leads WHERE id=$1 AND clinica_id=$2', [req.params.id, req.auth.cid]);
  if (!cur.rowCount) return res.status(404).json({ erro: 'Lead não encontrado' });
  const l = cur.rows[0];
  const p = await pool.query(
    'INSERT INTO pacientes (clinica_id,nome,telefone,queixa,fisio_id,status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.auth.cid, l.nome, l.telefone, l.interesse, l.fisio_id, 'avaliacao']);
  await pool.query(`UPDATE leads SET col='convertido', atualizado_em=now() WHERE id=$1`, [l.id]);
  res.json({ paciente: p.rows[0] });
});

/* ---------- SUPERADMIN ---------- */
function superauth(req, res, next) {
  auth(req, res, () => {
    if (!req.auth.sa) return res.status(403).json({ erro: 'Acesso restrito ao superadmin' });
    next();
  });
}

app.get('/api/admin/clinicas', superauth, async (req, res) => {
  const r = await pool.query(`
    SELECT c.id, c.nome, c.email, c.endereco, c.ativa, c.criado_em,
      (c.perfil->>'visivel')::boolean AS visivel,
      (SELECT count(*)::int FROM usuarios u WHERE u.clinica_id = c.id) AS usuarios,
      (SELECT count(*)::int FROM pacientes p WHERE p.clinica_id = c.id) AS pacientes,
      (SELECT count(*)::int FROM leads l WHERE l.clinica_id = c.id) AS leads,
      (SELECT count(*)::int FROM sessoes s WHERE s.clinica_id = c.id AND s.data >= CURRENT_DATE - 30) AS sessoes_30d,
      (SELECT coalesce(sum(pg.valor), 0)::numeric FROM pagamentos pg WHERE pg.clinica_id = c.id AND pg.status = 'pago') AS receita,
      GREATEST(
        (SELECT max(s.criado_em) FROM sessoes s WHERE s.clinica_id = c.id),
        (SELECT max(u.ultimo_acesso) FROM usuarios u WHERE u.clinica_id = c.id)
      ) AS ult_atividade
    FROM clinicas c ORDER BY c.criado_em DESC`);
  res.json(r.rows);
});

app.get('/api/admin/metricas', superauth, async (req, res) => {
  const tot = (await pool.query(`SELECT
    (SELECT count(*)::int FROM clinicas) AS clinicas,
    (SELECT count(*)::int FROM clinicas WHERE ativa) AS clinicas_ativas,
    (SELECT count(*)::int FROM clinicas WHERE (perfil->>'visivel')::boolean IS TRUE) AS no_diretorio,
    (SELECT count(*)::int FROM pacientes) AS pacientes,
    (SELECT count(*)::int FROM sessoes WHERE data >= CURRENT_DATE - 30) AS sessoes_30d,
    (SELECT count(*)::int FROM leads WHERE origem = 'Site PerFisio') AS leads_site,
    (SELECT coalesce(sum(valor), 0)::numeric FROM pagamentos WHERE status = 'pago') AS receita_total`)).rows[0];
  const porMes = (await pool.query(`
    SELECT to_char(date_trunc('month', criado_em), 'YYYY-MM') AS mes, count(*)::int AS novas
    FROM clinicas WHERE criado_em >= date_trunc('month', now()) - interval '5 months'
    GROUP BY 1 ORDER BY 1`)).rows;
  res.json({ ...tot, clinicas_por_mes: porMes });
});

app.patch('/api/admin/clinicas/:id', superauth, async (req, res) => {
  const { ativa } = req.body || {};
  if (typeof ativa !== 'boolean') return res.status(400).json({ erro: 'Informe ativa: true/false' });
  const r = await pool.query('UPDATE clinicas SET ativa=$2 WHERE id=$1 RETURNING id, nome, ativa', [req.params.id, ativa]);
  if (!r.rowCount) return res.status(404).json({ erro: 'Clínica não encontrada' });
  res.json(r.rows[0]);
});

/* ---------- ROTAS PÚBLICAS (diretório) ---------- */
app.get('/api/public/perfis', async (req, res) => {
  const r = await pool.query(
    `SELECT id, nome, endereco, perfil FROM clinicas WHERE (perfil->>'visivel')::boolean IS TRUE AND ativa ORDER BY criado_em DESC LIMIT 24`);
  res.json(r.rows);
});
app.post('/api/public/leads', async (req, res) => {
  const { clinica_id, nome, telefone, interesse, obs } = req.body || {};
  if (!clinica_id || !nome) return res.status(400).json({ erro: 'Informe seu nome' });
  const ok = await pool.query('SELECT 1 FROM clinicas WHERE id=$1', [clinica_id]);
  if (!ok.rowCount) return res.status(404).json({ erro: 'Clínica não encontrada' });
  await pool.query(
    'INSERT INTO leads (clinica_id,nome,telefone,origem,interesse,obs) VALUES ($1,$2,$3,$4,$5,$6)',
    [clinica_id, nome, telefone, 'Site PerFisio', interesse, obs]);
  res.json({ ok: true });
});

/* ---------- ESTÁTICO ---------- */
const ROOT = path.join(__dirname, '..');
app.use(express.static(ROOT, { extensions: ['html'] }));
app.use((req, res) => res.status(404).sendFile(path.join(ROOT, 'index.html')));

/* ---------- BOOT ---------- */
async function seedSuperadmin() {
  const email = (process.env.SUPERADMIN_EMAIL || '').toLowerCase();
  const senha = process.env.SUPERADMIN_PASSWORD;
  if (!email || !senha) return;
  const existe = await pool.query('SELECT id FROM usuarios WHERE email=$1', [email]);
  if (existe.rowCount) {
    // garante flag + senha sincronizada com a env (permite trocar a senha via variável)
    await pool.query('UPDATE usuarios SET superadmin=true, senha_hash=$2 WHERE id=$1', [existe.rows[0].id, bcrypt.hashSync(senha, 10)]);
  } else {
    await pool.query(
      'INSERT INTO usuarios (clinica_id, nome, email, senha_hash, perfil, superadmin) VALUES (NULL, $1, $2, $3, $4, true)',
      ['Superadmin', email, bcrypt.hashSync(senha, 10), 'superadmin']);
    console.log('✅ Superadmin criado:', email);
  }
}

(async () => {
  if (!process.env.DATABASE_URL) console.warn('⚠️  DATABASE_URL não definida — a API vai falhar; o site estático continua servido.');
  else {
    await pool.query(SCHEMA);
    await migrarTratamentos();
    await seedSuperadmin();
    console.log('✅ Schema verificado/migrado');
  }
  app.listen(PORT, () => console.log(`PerFisio rodando na porta ${PORT}`));
})().catch(e => { console.error('Falha ao iniciar:', e); process.exit(1); });
