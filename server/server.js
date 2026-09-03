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
CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  titulo text NOT NULL,
  resumo text,
  conteudo text NOT NULL,
  categoria text NOT NULL DEFAULT 'Gestão',
  emoji text DEFAULT '📄',
  autor text DEFAULT 'Equipe PerFisio',
  publicado boolean NOT NULL DEFAULT true,
  publicado_em date NOT NULL DEFAULT CURRENT_DATE,
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
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS plano_social boolean NOT NULL DEFAULT false;
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS assinatura_status text NOT NULL DEFAULT 'gratuito';
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS licencas int NOT NULL DEFAULT 0;
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS assinatura_fim timestamptz;
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS dominio text;
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS dominio_status text NOT NULL DEFAULT 'nenhum';
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS dominio_verificado_em timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS clinicas_dominio_uk ON clinicas (lower(dominio)) WHERE dominio IS NOT NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email_verificado boolean NOT NULL DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS token_verificacao text;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS token_expira timestamptz;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS verificado_em timestamptz;
CREATE INDEX IF NOT EXISTS usuarios_token_idx ON usuarios (token_verificacao) WHERE token_verificacao IS NOT NULL;
-- contas de PACIENTE (globais, não pertencem a uma clínica)
CREATE TABLE IF NOT EXISTS contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text NOT NULL UNIQUE,
  senha_hash text NOT NULL,
  telefone text,
  ultimo_acesso timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS conta_id uuid REFERENCES contas(id) ON DELETE SET NULL;
-- conta criada pelo Google não tem senha
ALTER TABLE contas ALTER COLUMN senha_hash DROP NOT NULL;
ALTER TABLE contas ADD COLUMN IF NOT EXISTS google_id text;
ALTER TABLE contas ADD COLUMN IF NOT EXISTS foto_url text;
CREATE UNIQUE INDEX IF NOT EXISTS contas_google_uk ON contas (google_id) WHERE google_id IS NOT NULL;

-- avaliações dos pacientes sobre o profissional
CREATE TABLE IF NOT EXISTS avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fisio_id uuid NOT NULL REFERENCES fisios(id) ON DELETE CASCADE,
  conta_id uuid NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  nota int NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS avaliacoes_fisio_conta_uk ON avaliacoes (fisio_id, conta_id);
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE fisios ADD COLUMN IF NOT EXISTS slug text;
CREATE UNIQUE INDEX IF NOT EXISTS clinicas_slug_uk ON clinicas (slug) WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fisios_slug_uk ON fisios (slug) WHERE slug IS NOT NULL;
ALTER TABLE evolucoes ADD COLUMN IF NOT EXISTS tratamento_id uuid REFERENCES tratamentos(id) ON DELETE SET NULL;
ALTER TABLE prescricoes ADD COLUMN IF NOT EXISTS tratamento_id uuid REFERENCES tratamentos(id) ON DELETE SET NULL;
ALTER TABLE sessoes ADD COLUMN IF NOT EXISTS tratamento_id uuid REFERENCES tratamentos(id) ON DELETE SET NULL;
ALTER TABLE tratamentos ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE anexos ADD COLUMN IF NOT EXISTS tratamento_id uuid REFERENCES tratamentos(id) ON DELETE SET NULL;
ALTER TABLE evolucoes ADD COLUMN IF NOT EXISTS sessao_id uuid REFERENCES sessoes(id) ON DELETE SET NULL;
-- perfil público do profissional (diretório)
ALTER TABLE fisios ADD COLUMN IF NOT EXISTS publico boolean NOT NULL DEFAULT false;
ALTER TABLE fisios ADD COLUMN IF NOT EXISTS especialidades text;
ALTER TABLE fisios ADD COLUMN IF NOT EXISTS domiciliar boolean NOT NULL DEFAULT false;
ALTER TABLE fisios ADD COLUMN IF NOT EXISTS bairro text;
ALTER TABLE fisios ADD COLUMN IF NOT EXISTS cidade text;
ALTER TABLE fisios ADD COLUMN IF NOT EXISTS lat numeric;
ALTER TABLE fisios ADD COLUMN IF NOT EXISTS lng numeric;
ALTER TABLE fisios ADD COLUMN IF NOT EXISTS preco text;
ALTER TABLE fisios ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE fisios ADD COLUMN IF NOT EXISTS whatsapp text;
ALTER TABLE fisios ADD COLUMN IF NOT EXISTS tratamentos text;
ALTER TABLE fisios ADD COLUMN IF NOT EXISTS regioes text;
ALTER TABLE fisios ADD COLUMN IF NOT EXISTS instagram text;
ALTER TABLE sessoes ADD COLUMN IF NOT EXISTS reserva text;
ALTER TABLE fisios ADD COLUMN IF NOT EXISTS foto bytea;
ALTER TABLE fisios ADD COLUMN IF NOT EXISTS foto_mime text;
CREATE TABLE IF NOT EXISTS posts_sociais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  titulo text,
  legenda text NOT NULL,
  plataforma text NOT NULL DEFAULT 'instagram',
  data_prevista date,
  imagem bytea, imagem_mime text,
  cor text NOT NULL DEFAULT '#0DA189',
  status text NOT NULL DEFAULT 'pendente',
  comentario text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fisio_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
  fisio_id uuid NOT NULL REFERENCES fisios(id) ON DELETE CASCADE,
  nome text, mime text NOT NULL, dados bytea NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
`;

/* migração de dados: pacientes com histórico ganham um tratamento inicial */
/* ============ SLUGS (URLs amigáveis) ============ */
const slugificar = t => String(t || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/&/g, ' e ')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);

const TABELAS_SLUG = { clinicas: 1, fisios: 1 };

async function slugUnico(tabela, nome, id) {
  if (!TABELAS_SLUG[tabela]) throw new Error('tabela inválida');
  const base = slugificar(nome) || tabela;
  let slug = base, n = 1;
  // acrescenta -2, -3... até achar um livre
  while ((await pool.query(`SELECT 1 FROM ${tabela} WHERE slug=$1 AND id<>$2`, [slug, id])).rowCount)
    slug = `${base}-${++n}`;
  return slug;
}

// gera slug para quem ainda não tem (roda no boot e depois de cada cadastro)
async function preencherSlugs() {
  for (const tabela of Object.keys(TABELAS_SLUG)) {
    const faltam = await pool.query(`SELECT id, nome FROM ${tabela} WHERE coalesce(slug,'') = ''`);
    for (const r of faltam.rows)
      await pool.query(`UPDATE ${tabela} SET slug=$2 WHERE id=$1`, [r.id, await slugUnico(tabela, r.nome, r.id)]);
  }
}

// contas anteriores à verificação entram como já verificadas (nunca receberam token)
const CORTE_VERIFICACAO = '2026-08-27'; // data em que a verificação entrou no ar
async function grandfatherVerificacao() {
  await pool.query(`UPDATE usuarios SET email_verificado = true, verificado_em = coalesce(verificado_em, criado_em)
    WHERE NOT email_verificado AND token_verificacao IS NULL AND criado_em < $1`, [CORTE_VERIFICACAO]);
}

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
  // quem já recebe posts hoje é porque contratou o plano de redes sociais
  await pool.query(`
    UPDATE clinicas c SET plano_social = true
    WHERE NOT c.plano_social AND EXISTS (SELECT 1 FROM posts_sociais p WHERE p.clinica_id = c.id)`);
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

/* ============ DOMÍNIO PRÓPRIO DA CLÍNICA ============ */
const dns = require('node:dns').promises;
// host onde o PerFisio roda — é para cá que o CNAME da clínica deve apontar
const HOST_APP = (process.env.APP_HOST || process.env.RAILWAY_PUBLIC_DOMAIN || 'app.perfisio.com.br').toLowerCase();
// site público (marketing + diretório) e sistema (login/app) em hosts separados.
// A separação só entra em ação com SITE_HOST definido — antes disso tudo roda no mesmo host.
const HOST_SITE = (process.env.SITE_HOST || '').toLowerCase();
const HOST_APEX = HOST_SITE.startsWith('www.') ? HOST_SITE.slice(4) : '';
// domínio curto do perfil do profissional (perfis.io/nome-do-fisio)
const HOST_CURTO = (process.env.SHORT_HOST || 'perfis.io').toLowerCase();
const HOSTS_SISTEMA = new Set(
  [HOST_APP, HOST_SITE, HOST_APEX, HOST_CURTO, `www.${HOST_CURTO}`,
   'localhost', '127.0.0.1', 'perfisio.com.br', 'www.perfisio.com.br'].filter(Boolean));
const ehHostCurto = h => soHost(h) === HOST_CURTO || soHost(h) === `www.${HOST_CURTO}`;
// para onde o CNAME das clínicas aponta: a página delas é conteúdo do site público
const ALVO_CNAME = HOST_SITE || HOST_APP;

const soHost = h => String(h || '').split(':')[0].toLowerCase().replace(/\.$/, '');
const hostDoSistema = h => HOSTS_SISTEMA.has(soHost(h)) || soHost(h).endsWith('.up.railway.app');

const RE_DOMINIO = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/;
function normalizarDominio(d) {
  const limpo = String(d || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/\/.*$/, '').split(':')[0].replace(/\.$/, '');
  return RE_DOMINIO.test(limpo) && !hostDoSistema(limpo) ? limpo : null;
}

// cache host → clínica (evita ir ao banco a cada request)
const cacheHost = new Map();
const TTL_HOST = 60_000;
const limparCacheHost = () => cacheHost.clear();

async function clinicaDoHost(host) {
  const h = soHost(host);
  if (!h || hostDoSistema(h)) return null;
  const guardado = cacheHost.get(h);
  if (guardado && Date.now() - guardado.ts < TTL_HOST) return guardado.id;
  const r = await pool.query(
    "SELECT id FROM clinicas WHERE lower(dominio) = $1 AND ativa AND dominio_status = 'ativo'", [h]);
  const id = r.rowCount ? r.rows[0].id : null;
  cacheHost.set(h, { id, ts: Date.now() });
  return id;
}

// confere se o DNS do domínio já aponta para o PerFisio
async function dnsAponta(dominio) {
  try {
    const cnames = await dns.resolveCname(dominio);
    const achou = cnames.map(c => soHost(c));
    if (achou.includes(ALVO_CNAME)) return { ok: true, via: 'CNAME', valor: achou.join(', ') };
    if (achou.length) return { ok: false, via: 'CNAME', valor: achou.join(', ') };
  } catch { /* sem CNAME: tenta registro A */ }
  try {
    const [ips, nossos] = await Promise.all([dns.resolve4(dominio), dns.resolve4(ALVO_CNAME)]);
    if (ips.some(i => nossos.includes(i))) return { ok: true, via: 'A', valor: ips.join(', ') };
    return { ok: false, via: 'A', valor: ips.join(', ') };
  } catch {
    return { ok: false, via: null, valor: null, erro: 'O DNS ainda não responde para esse domínio' };
  }
}

// registra o domínio no Railway (emissão do certificado TLS) quando há token de API
async function registrarNoRailway(dominio) {
  const token = process.env.RAILWAY_API_TOKEN;
  const { RAILWAY_ENVIRONMENT_ID: amb, RAILWAY_PROJECT_ID: proj, RAILWAY_SERVICE_ID: svc } = process.env;
  if (!token || !amb || !proj || !svc) return { automatico: false, motivo: 'sem RAILWAY_API_TOKEN' };
  try {
    const r = await fetch('https://backboard.railway.com/graphql/v2', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        query: `mutation($input: CustomDomainCreateInput!) {
          customDomainCreate(input: $input) { id domain status { dnsRecords { hostlabel recordType requiredValue zone } } } }`,
        variables: { input: { domain: dominio, environmentId: amb, projectId: proj, serviceId: svc } },
      }),
    });
    const j = await r.json();
    if (j.errors?.length) {
      const msg = j.errors[0].message || '';
      // já cadastrado antes não é erro para o nosso fluxo
      if (/already exists|already in use/i.test(msg)) return { automatico: true, jaExistia: true };
      return { automatico: false, motivo: msg };
    }
    return { automatico: true, registros: j.data?.customDomainCreate?.status?.dnsRecords || [] };
  } catch (e) {
    return { automatico: false, motivo: e.message };
  }
}

/* ============ PLANOS / STRIPE ============ */
const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

// catálogo — a fonte da verdade do preço; os Price da Stripe são criados sob demanda
const PLANOS = {
  fisio: {
    lookup: 'perfisio_fisio_mensal', nome: 'PerFisio · por profissional',
    descricao: 'Agenda, prontuário eletrônico, CRM, financeiro e perfil no diretório.',
    centavos: 4000, unidade: 'por fisioterapeuta/mês', tipo: 'licenca',
  },
  social: {
    lookup: 'perfisio_social_mensal', nome: 'Redes sociais',
    descricao: 'Posts prontos todo mês para o Instagram da clínica, com aprovação pelo sistema.',
    centavos: 14900, unidade: 'por clínica/mês', tipo: 'clinica',
  },
};
const LIMITE_GRATIS = 10; // consultas/mês do plano "fisioterapeuta local"

// cria (uma vez) o Product + Price recorrente na Stripe e reaproveita pelo lookup_key
const cachePrecos = {};
async function precoStripe(chave) {
  if (cachePrecos[chave]) return cachePrecos[chave];
  const p = PLANOS[chave];
  const achados = await stripe.prices.list({ lookup_keys: [p.lookup], active: true, limit: 1 });
  let price = achados.data[0];
  if (!price) {
    const produto = await stripe.products.create({ name: `PerFisio — ${p.nome}`, description: p.descricao });
    price = await stripe.prices.create({
      product: produto.id, currency: 'brl', unit_amount: p.centavos,
      recurring: { interval: 'month' }, lookup_key: p.lookup,
    });
  }
  cachePrecos[chave] = price.id;
  return price.id;
}

// espelha uma assinatura da Stripe nas colunas da clínica
async function sincronizarAssinatura(sub) {
  const cid = sub.metadata?.clinica_id;
  if (!cid) return;
  const itens = sub.items?.data || [];
  const lookupDe = it => it.price?.lookup_key || '';
  const itemFisio = itens.find(it => lookupDe(it) === PLANOS.fisio.lookup);
  const temSocial = itens.some(it => lookupDe(it) === PLANOS.social.lookup);
  const ativa = ['active', 'trialing', 'past_due'].includes(sub.status);
  const fim = sub.items?.data?.[0]?.current_period_end || sub.current_period_end;
  await pool.query(`UPDATE clinicas SET stripe_customer_id=$2, stripe_subscription_id=$3, assinatura_status=$4,
      licencas=$5, plano_social=$6, assinatura_fim=$7 WHERE id=$1`,
    [cid, typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
     ativa ? sub.id : null, ativa ? sub.status : 'cancelado',
     ativa && itemFisio ? (itemFisio.quantity || 0) : 0,
     ativa && temSocial, fim ? new Date(fim * 1000) : null]);
}

/* ============ APP ============ */
const app = express();

/* O Express 4 não captura erro de handler async: sem isso, uma consulta que
   falha (ex.: data inválida) deixa a requisição pendurada para sempre — a tela
   fica "Carregando...". Aqui todo handler async é envolvido para responder. */
function envolver(fn) {
  if (typeof fn !== 'function' || fn.length >= 4) return fn; // middleware de erro passa direto
  return function (req, res, next) {
    try {
      const r = fn.call(this, req, res, next);
      if (r && typeof r.catch === 'function') r.catch(next);
      return r;
    } catch (e) { next(e); }
  };
}
for (const metodo of ['get', 'post', 'put', 'patch', 'delete', 'use']) {
  const original = app[metodo].bind(app);
  app[metodo] = (...args) => original(...args.map(envolver));
}

// webhook ANTES do express.json: a assinatura da Stripe exige o corpo cru
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(503).send('Stripe não configurado');
  const segredo = process.env.STRIPE_WEBHOOK_SECRET;
  let evento;
  try {
    evento = segredo
      ? stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], segredo)
      : JSON.parse(req.body.toString());
  } catch (e) {
    console.error('webhook inválido:', e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }
  try {
    const o = evento.data.object;
    if (evento.type === 'checkout.session.completed' && o.subscription) {
      const sub = await stripe.subscriptions.retrieve(o.subscription);
      if (!sub.metadata?.clinica_id && o.metadata?.clinica_id) {
        await stripe.subscriptions.update(sub.id, { metadata: { clinica_id: o.metadata.clinica_id } });
        sub.metadata = { clinica_id: o.metadata.clinica_id };
      }
      await sincronizarAssinatura(sub);
    } else if (evento.type.startsWith('customer.subscription.')) {
      await sincronizarAssinatura(o);
    }
  } catch (e) { console.error('erro processando webhook', evento.type, e); }
  res.json({ recebido: true });
});

app.use(express.json({ limit: '12mb' })); // fotos de prontuário sobem em base64

const sign = u => jwt.sign({ uid: u.id, cid: u.clinica_id, sa: !!u.superadmin }, JWT_SECRET, { expiresIn: '30d' });

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ erro: 'Não autenticado' });
  try {
    const p = jwt.verify(token, JWT_SECRET);
    // conta de paciente não acessa o sistema da clínica
    if (p.tipo === 'conta') return res.status(403).json({ erro: 'Esta conta é de paciente' });
    req.auth = p; next();
  } catch { return res.status(401).json({ erro: 'Sessão expirada' }); }
}

/* ---------- CONTA DO PACIENTE (agendamento online) ---------- */
const assinarConta = c => jwt.sign({ conta: c.id, tipo: 'conta' }, JWT_SECRET, { expiresIn: '90d' });

function authConta(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ erro: 'Entre na sua conta para agendar' });
  try {
    const p = jwt.verify(token, JWT_SECRET);
    if (p.tipo !== 'conta') return res.status(403).json({ erro: 'Token inválido para esta ação' });
    req.conta = p.conta; next();
  } catch { return res.status(401).json({ erro: 'Sessão expirada — entre de novo' }); }
}

const respostaConta = (c, token) => ({ token, conta: { id: c.id, nome: c.nome, email: c.email, telefone: c.telefone } });

app.post('/api/conta/registrar', async (req, res) => {
  const { nome, email, telefone, senha } = req.body || {};
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Preencha nome, e-mail e senha' });
  if (String(senha).length < 6) return res.status(400).json({ erro: 'A senha precisa de ao menos 6 caracteres' });
  const mail = String(email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return res.status(400).json({ erro: 'E-mail inválido' });
  try {
    const r = await pool.query(
      'INSERT INTO contas (nome, email, telefone, senha_hash) VALUES ($1,$2,$3,$4) RETURNING id, nome, email, telefone',
      [String(nome).trim(), mail, telefone || null, bcrypt.hashSync(senha, 10)]);
    const c = r.rows[0];
    res.json(respostaConta(c, assinarConta(c)));
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erro: 'Já existe uma conta com este e-mail — faça login' });
    console.error(e); res.status(500).json({ erro: 'Erro ao criar conta' });
  }
});

app.post('/api/conta/login', async (req, res) => {
  const { email, senha } = req.body || {};
  const r = await pool.query('SELECT * FROM contas WHERE email=$1', [String(email || '').trim().toLowerCase()]);
  const c = r.rows[0];
  if (c && !c.senha_hash)
    return res.status(400).json({ erro: 'Esta conta entra com o Google — use o botão "Entrar com Google"' });
  if (!c || !bcrypt.compareSync(senha || '', c.senha_hash))
    return res.status(401).json({ erro: 'E-mail ou senha inválidos' });
  pool.query('UPDATE contas SET ultimo_acesso=now() WHERE id=$1', [c.id]).catch(() => {});
  res.json(respostaConta(c, assinarConta(c)));
});

app.get('/api/conta/me', authConta, async (req, res) => {
  const r = await pool.query('SELECT id, nome, email, telefone FROM contas WHERE id=$1', [req.conta]);
  if (!r.rowCount) return res.status(404).json({ erro: 'Conta não encontrada' });
  res.json({ conta: r.rows[0] });
});

/* login com Google: o navegador manda o ID token e o servidor confere com o Google */
app.post('/api/conta/google', async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(503).json({ erro: 'Login com Google não está configurado no servidor' });
  const credential = req.body?.credential;
  if (!credential) return res.status(400).json({ erro: 'Token do Google ausente' });
  try {
    const resp = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
    const g = await resp.json();
    if (!resp.ok || !g.email) return res.status(401).json({ erro: 'Não foi possível validar sua conta Google' });
    if (g.aud !== clientId) return res.status(401).json({ erro: 'Token do Google não pertence a este site' });
    if (g.email_verified === 'false' || g.email_verified === false)
      return res.status(401).json({ erro: 'Seu e-mail do Google não está verificado' });

    const email = String(g.email).toLowerCase();
    // acha pelo google_id ou pelo e-mail (quem já tinha conta com senha)
    const achou = await pool.query('SELECT * FROM contas WHERE google_id=$1 OR email=$2 LIMIT 1', [g.sub, email]);
    let conta;
    if (achou.rowCount) {
      conta = (await pool.query(
        `UPDATE contas SET google_id=$2, foto_url=COALESCE($3, foto_url), ultimo_acesso=now() WHERE id=$1
         RETURNING id, nome, email, telefone`, [achou.rows[0].id, g.sub, g.picture || null])).rows[0];
    } else {
      conta = (await pool.query(
        `INSERT INTO contas (nome, email, google_id, foto_url, ultimo_acesso)
         VALUES ($1,$2,$3,$4,now()) RETURNING id, nome, email, telefone`,
        [g.name || email.split('@')[0], email, g.sub, g.picture || null])).rows[0];
    }
    res.json({ token: assinarConta(conta), conta });
  } catch (e) { console.error('google login', e); res.status(500).json({ erro: 'Erro ao entrar com o Google' }); }
});

/* ---------- AVALIAÇÕES DO PROFISSIONAL ---------- */
// públicas: média, distribuição e comentários
app.get('/api/public/avaliacoes/:fisio', async (req, res) => {
  const f = await acharFisioPublico(req.params.fisio);
  if (!f) return res.status(404).json({ erro: 'Profissional não encontrado' });
  const lista = await pool.query(`
    SELECT a.id, a.nota, a.comentario, a.criado_em, c.nome, c.foto_url,
           EXISTS (SELECT 1 FROM sessoes s JOIN pacientes p ON p.id = s.paciente_id
                   WHERE p.conta_id = a.conta_id AND s.fisio_id = a.fisio_id AND s.data <= CURRENT_DATE) AS paciente
    FROM avaliacoes a JOIN contas c ON c.id = a.conta_id
    WHERE a.fisio_id = $1 ORDER BY a.criado_em DESC LIMIT 50`, [f.id]);
  const notas = lista.rows.map(a => a.nota);
  const media = notas.length ? notas.reduce((s, n) => s + n, 0) / notas.length : null;
  const dist = [5, 4, 3, 2, 1].map(n => ({ nota: n, total: notas.filter(x => x === n).length }));
  res.json({
    total: notas.length,
    media: media === null ? null : Math.round(media * 10) / 10,
    distribuicao: dist,
    avaliacoes: lista.rows.map(a => ({
      ...a, nome: a.nome, primeiro_nome: String(a.nome).split(' ')[0],
    })),
  });
});

// minha avaliação para este profissional
app.get('/api/avaliacoes/:fisio/minha', authConta, async (req, res) => {
  const f = await acharFisioPublico(req.params.fisio);
  if (!f) return res.status(404).json({ erro: 'Profissional não encontrado' });
  const r = await pool.query('SELECT id, nota, comentario FROM avaliacoes WHERE fisio_id=$1 AND conta_id=$2',
    [f.id, req.conta]);
  res.json(r.rows[0] || null);
});

// cria ou atualiza a avaliação (uma por profissional, por conta)
app.post('/api/avaliacoes', authConta, async (req, res) => {
  const { fisio, nota, comentario } = req.body || {};
  const n = Number(nota);
  if (!(n >= 1 && n <= 5)) return res.status(400).json({ erro: 'Escolha de 1 a 5 estrelas' });
  const f = await acharFisioPublico(fisio);
  if (!f) return res.status(404).json({ erro: 'Profissional não encontrado' });
  const r = await pool.query(`
    INSERT INTO avaliacoes (fisio_id, conta_id, nota, comentario) VALUES ($1,$2,$3,$4)
    ON CONFLICT (fisio_id, conta_id) DO UPDATE
      SET nota = EXCLUDED.nota, comentario = EXCLUDED.comentario, atualizado_em = now()
    RETURNING id, nota, comentario`,
    [f.id, req.conta, n, (comentario || '').trim().slice(0, 600) || null]);
  res.json(r.rows[0]);
});

app.delete('/api/avaliacoes/:fisio', authConta, async (req, res) => {
  const f = await acharFisioPublico(req.params.fisio);
  if (!f) return res.status(404).json({ erro: 'Profissional não encontrado' });
  await pool.query('DELETE FROM avaliacoes WHERE fisio_id=$1 AND conta_id=$2', [f.id, req.conta]);
  res.json({ ok: true });
});

// agendamentos da conta, em todas as clínicas
app.get('/api/conta/agendamentos', authConta, async (req, res) => {
  const r = await pool.query(`
    SELECT to_char(s.data, 'YYYY-MM-DD') AS data, s.hora, s.tipo, s.status, s.reserva,
           f.nome AS fisio_nome, f.slug AS fisio_slug, c.nome AS clinica_nome
    FROM sessoes s
    JOIN pacientes p ON p.id = s.paciente_id
    JOIN fisios f ON f.id = s.fisio_id
    JOIN clinicas c ON c.id = s.clinica_id
    WHERE p.conta_id = $1 AND s.data >= CURRENT_DATE - 30
    ORDER BY s.data DESC, s.hora`, [req.conta]);
  res.json(r.rows);
});

/* ---------- VERIFICAÇÃO DE E-MAIL ---------- */
const crypto = require('node:crypto');
const HORAS_TOKEN = 48;

function htmlVerificacao(nome, link) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0F2A2E;">
    <p style="font-size:15px;">Olá, ${esc(String(nome).split(' ')[0])}!</p>
    <p style="font-size:15px;line-height:1.6;">Sua conta no <b>PerFisio</b> foi criada. Confirme seu e-mail para
      garantir o acesso e receber os avisos da sua agenda:</p>
    <p style="margin:26px 0;">
      <a href="${link}" style="background:#0DA189;color:#fff;text-decoration:none;font-weight:bold;
        padding:13px 26px;border-radius:8px;display:inline-block;font-size:15px;">Confirmar meu e-mail</a>
    </p>
    <p style="font-size:13px;color:#64737A;line-height:1.6;">Ou copie e cole este endereço no navegador:<br>
      <span style="color:#0A8270;">${link}</span></p>
    <p style="font-size:13px;color:#64737A;line-height:1.6;">O link vale por ${HORAS_TOKEN} horas.
      Se não foi você quem criou a conta, pode ignorar esta mensagem.</p>
    <p style="font-size:12px;color:#93A5A3;margin-top:26px;">PerFisio · gestão e captação para fisioterapeutas</p>
  </div>`;
}

async function criarEnvioVerificacao(uid, email, nome, base) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `UPDATE usuarios SET token_verificacao=$2, token_expira = now() + interval '${HORAS_TOKEN} hours' WHERE id=$1`,
    [uid, token]);
  const link = `${base}/verificar-email?t=${token}`;
  const r = await enviarEmail({
    para: email, assunto: 'Confirme seu e-mail no PerFisio', html: htmlVerificacao(nome, link),
  });
  if (!r.enviado) console.log('[verificação] link para', email, '→', link);
  return { ...r, link };
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
    await preencherSlugs();
    // manda o e-mail de confirmação (a conta já entra, mas fica pendente de verificação)
    const envio = await criarEnvioVerificacao(u.id, u.email, u.nome, urlBase(req)).catch(e => {
      console.error('falha ao enviar verificação', e); return { enviado: false };
    });
    res.json({
      token: sign(u),
      usuario: { ...u, clinica_nome: clinica, email_verificado: false },
      verificacao: { enviado: envio.enviado, para: u.email },
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ erro: 'Erro ao criar conta' });
  } finally { client.release(); }
});

// confirma o e-mail pelo link recebido
app.get('/verificar-email', async (req, res, next) => {
  const token = String(req.query.t || '');
  let estado = 'invalido';
  if (token) {
    const r = await pool.query(
      `UPDATE usuarios SET email_verificado = true, verificado_em = now(), token_verificacao = NULL, token_expira = NULL
       WHERE token_verificacao = $1 AND token_expira > now() RETURNING nome, email`, [token]);
    if (r.rowCount) estado = 'ok';
    else {
      const expirado = await pool.query('SELECT 1 FROM usuarios WHERE token_verificacao = $1', [token]);
      estado = expirado.rowCount ? 'expirado' : 'invalido';
      // já verificado antes: o token some, então tratamos como sucesso silencioso
    }
  }
  try {
    await servirSeo(res, 'verificar-email.html', {
      titulo: estado === 'ok' ? 'E-mail confirmado — PerFisio' : 'Confirmação de e-mail — PerFisio',
      descricao: 'Confirmação de e-mail da sua conta PerFisio.',
      url: urlPublica(req, '/verificar-email'),
      dados: { estado },
    });
  } catch (e) { next(e); }
});

// estado da verificação + reenvio do link
app.get('/api/auth/verificacao', auth, async (req, res) => {
  const r = await pool.query('SELECT email, email_verificado, verificado_em FROM usuarios WHERE id=$1', [req.auth.uid]);
  res.json({ ...r.rows[0], smtp: smtpConfigurado() });
});

const reenvios = new Map(); // uid → timestamp do último envio
app.post('/api/auth/reenviar-verificacao', auth, async (req, res) => {
  const r = await pool.query('SELECT nome, email, email_verificado FROM usuarios WHERE id=$1', [req.auth.uid]);
  const u = r.rows[0];
  if (!u) return res.status(404).json({ erro: 'Usuário não encontrado' });
  if (u.email_verificado) return res.json({ ok: true, jaVerificado: true });
  const ultimo = reenvios.get(req.auth.uid) || 0;
  if (Date.now() - ultimo < 60_000)
    return res.status(429).json({ erro: 'Aguarde um minuto para pedir outro e-mail' });
  reenvios.set(req.auth.uid, Date.now());
  const envio = await criarEnvioVerificacao(req.auth.uid, u.email, u.nome, urlBase(req));
  res.json({ ok: true, enviado: envio.enviado, para: u.email });
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
  res.json({ token: sign(u), usuario: { id: u.id, clinica_id: u.clinica_id, nome: u.nome, email: u.email, perfil: u.perfil, clinica_nome: u.clinica_nome, superadmin: u.superadmin, email_verificado: u.email_verificado } });
});

app.get('/api/me', auth, async (req, res) => {
  const r = await pool.query(
    `SELECT u.id, u.clinica_id, u.nome, u.email, u.perfil, u.superadmin, u.email_verificado, c.nome AS clinica_nome FROM usuarios u LEFT JOIN clinicas c ON c.id=u.clinica_id WHERE u.id=$1`,
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

/* ---------- FOTOS DO PROFISSIONAL ---------- */
const MIMES_IMG = ['image/jpeg', 'image/png', 'image/webp'];

app.post('/api/fisios/:id/foto', auth, async (req, res) => {
  const { dados, mime } = req.body || {};
  if (!dados || !MIMES_IMG.includes(mime)) return res.status(400).json({ erro: 'Envie uma imagem JPG, PNG ou WebP' });
  const buf = Buffer.from(dados, 'base64');
  if (!buf.length || buf.length > 4 * 1024 * 1024) return res.status(400).json({ erro: 'Imagem vazia ou maior que 4 MB' });
  const r = await pool.query('UPDATE fisios SET foto=$3, foto_mime=$4 WHERE id=$1 AND clinica_id=$2 RETURNING id',
    [req.params.id, req.auth.cid, buf, mime]);
  if (!r.rowCount) return res.status(404).json({ erro: 'Profissional não encontrado' });
  res.json({ ok: true });
});

app.delete('/api/fisios/:id/foto', auth, async (req, res) => {
  await pool.query('UPDATE fisios SET foto=NULL, foto_mime=NULL WHERE id=$1 AND clinica_id=$2', [req.params.id, req.auth.cid]);
  res.json({ ok: true });
});

app.get('/api/fisios/:id/galeria', auth, async (req, res) => {
  const r = await pool.query(
    'SELECT id, nome, criado_em FROM fisio_fotos WHERE fisio_id=$1 AND clinica_id=$2 ORDER BY criado_em',
    [req.params.id, req.auth.cid]);
  res.json(r.rows);
});

app.post('/api/fisios/:id/galeria', auth, async (req, res) => {
  const { nome, mime, dados } = req.body || {};
  if (!dados || !MIMES_IMG.includes(mime)) return res.status(400).json({ erro: 'Envie uma imagem JPG, PNG ou WebP' });
  const buf = Buffer.from(dados, 'base64');
  if (!buf.length || buf.length > 4 * 1024 * 1024) return res.status(400).json({ erro: 'Imagem vazia ou maior que 4 MB' });
  const total = await pool.query('SELECT count(*)::int AS n FROM fisio_fotos WHERE fisio_id=$1', [req.params.id]);
  if (total.rows[0].n >= 12) return res.status(400).json({ erro: 'Limite de 12 fotos na galeria' });
  const dono = await pool.query('SELECT 1 FROM fisios WHERE id=$1 AND clinica_id=$2', [req.params.id, req.auth.cid]);
  if (!dono.rowCount) return res.status(404).json({ erro: 'Profissional não encontrado' });
  const r = await pool.query(
    'INSERT INTO fisio_fotos (clinica_id, fisio_id, nome, mime, dados) VALUES ($1,$2,$3,$4,$5) RETURNING id, nome',
    [req.auth.cid, req.params.id, nome || null, mime, buf]);
  res.json(r.rows[0]);
});

app.delete('/api/fisio-galeria/:id', auth, async (req, res) => {
  const r = await pool.query('DELETE FROM fisio_fotos WHERE id=$1 AND clinica_id=$2', [req.params.id, req.auth.cid]);
  res.json({ ok: r.rowCount > 0 });
});

// públicas: foto de perfil e galeria (somente de perfis públicos)
app.get('/api/public/fisio-foto/:id', async (req, res) => {
  const r = await pool.query('SELECT foto, foto_mime FROM fisios WHERE id=$1 AND publico AND foto IS NOT NULL', [req.params.id]);
  if (!r.rowCount) return res.status(404).end();
  res.set('Content-Type', r.rows[0].foto_mime);
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(r.rows[0].foto);
});

app.get('/api/public/galeria/:fisioId', async (req, res) => {
  const r = await pool.query(`
    SELECT g.id, g.nome FROM fisio_fotos g JOIN fisios f ON f.id = g.fisio_id
    WHERE g.fisio_id=$1 AND f.publico ORDER BY g.criado_em`, [req.params.fisioId]);
  res.json(r.rows);
});

app.get('/api/public/galeria-foto/:id', async (req, res) => {
  const r = await pool.query(`
    SELECT g.dados, g.mime FROM fisio_fotos g JOIN fisios f ON f.id = g.fisio_id
    WHERE g.id=$1 AND f.publico`, [req.params.id]);
  if (!r.rowCount) return res.status(404).end();
  res.set('Content-Type', r.rows[0].mime);
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(r.rows[0].dados);
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

// envio avulso do próprio PerFisio (verificação de conta, avisos)
async function enviarEmail({ para, assunto, html }) {
  if (!smtpConfigurado()) {
    console.log(`[e-mail simulado] para=${para} assunto="${assunto}"`);
    return { enviado: false, motivo: 'SMTP não configurado' };
  }
  const nodemailer = require('nodemailer');
  const porta = Number(process.env.SMTP_PORT || 587);
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: porta, secure: porta === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporte.sendMail({
    from: process.env.SMTP_FROM || `"PerFisio" <${process.env.SMTP_USER}>`,
    to: para, subject: assunto, html,
  });
  return { enviado: true };
}

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

/* ---------- APROVAÇÕES (posts de redes sociais) ---------- */
// clínica: lista os próprios posts
app.get('/api/social', auth, async (req, res) => {
  const r = await pool.query(`
    SELECT id, titulo, legenda, plataforma, data_prevista, cor, status, comentario, criado_em,
           (imagem IS NOT NULL) AS tem_imagem
    FROM posts_sociais WHERE clinica_id=$1 ORDER BY criado_em DESC`, [req.auth.cid]);
  res.json(r.rows);
});

app.get('/api/social/:id/imagem', async (req, res) => {
  // aceita token no header OU em ?t= (para <img src>)
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : req.query.t;
  let payload;
  try { payload = jwt.verify(token || '', JWT_SECRET); }
  catch { return res.status(401).end(); }
  const r = await pool.query('SELECT imagem, imagem_mime FROM posts_sociais WHERE id=$1 AND clinica_id=$2 AND imagem IS NOT NULL',
    [req.params.id, payload.cid]);
  if (!r.rowCount) return res.status(404).end();
  res.set('Content-Type', r.rows[0].imagem_mime);
  res.set('Cache-Control', 'private, max-age=3600');
  res.send(r.rows[0].imagem);
});

app.post('/api/social/:id/aprovar', auth, async (req, res) => {
  const r = await pool.query(
    `UPDATE posts_sociais SET status='aprovado', comentario=NULL WHERE id=$1 AND clinica_id=$2 RETURNING id`,
    [req.params.id, req.auth.cid]);
  if (!r.rowCount) return res.status(404).json({ erro: 'Post não encontrado' });
  res.json({ ok: true });
});

app.post('/api/social/:id/ajustes', auth, async (req, res) => {
  const { comentario } = req.body || {};
  if (!comentario || !comentario.trim()) return res.status(400).json({ erro: 'Descreva o ajuste desejado' });
  const r = await pool.query(
    `UPDATE posts_sociais SET status='ajustes', comentario=$3 WHERE id=$1 AND clinica_id=$2 RETURNING id`,
    [req.params.id, req.auth.cid, comentario.trim()]);
  if (!r.rowCount) return res.status(404).json({ erro: 'Post não encontrado' });
  res.json({ ok: true });
});

// superadmin: cria e gerencia os posts das clínicas
app.get('/api/admin/social', superauth, async (req, res) => {
  const r = await pool.query(`
    SELECT p.id, p.clinica_id, p.titulo, p.legenda, p.plataforma, p.data_prevista, p.cor,
           p.status, p.comentario, p.criado_em, (p.imagem IS NOT NULL) AS tem_imagem, c.nome AS clinica_nome
    FROM posts_sociais p JOIN clinicas c ON c.id = p.clinica_id ORDER BY p.criado_em DESC`);
  res.json(r.rows);
});

app.post('/api/admin/social', superauth, async (req, res) => {
  const { clinica_id, titulo, legenda, plataforma, data_prevista, cor, imagem, imagem_mime } = req.body || {};
  if (!clinica_id || !legenda) return res.status(400).json({ erro: 'Informe a clínica e a legenda' });
  // só clínicas com o plano de redes sociais contratado recebem posts
  const cl = await pool.query('SELECT nome, plano_social, ativa FROM clinicas WHERE id=$1', [clinica_id]);
  if (!cl.rowCount) return res.status(404).json({ erro: 'Clínica não encontrada' });
  if (!cl.rows[0].plano_social)
    return res.status(400).json({ erro: `${cl.rows[0].nome} não tem o plano de redes sociais contratado` });
  if (!cl.rows[0].ativa) return res.status(400).json({ erro: `${cl.rows[0].nome} está desativada` });
  let buf = null;
  if (imagem) {
    buf = Buffer.from(imagem, 'base64');
    if (buf.length > 4 * 1024 * 1024) return res.status(400).json({ erro: 'Imagem maior que 4 MB' });
  }
  const r = await pool.query(`
    INSERT INTO posts_sociais (clinica_id, titulo, legenda, plataforma, data_prevista, cor, imagem, imagem_mime)
    VALUES ($1,$2,$3,COALESCE($4,'instagram'),$5,COALESCE($6,'#0DA189'),$7,$8)
    RETURNING id, titulo, status`,
    [clinica_id, titulo || null, legenda, plataforma, data_prevista || null, cor, buf, buf ? imagem_mime : null]);
  res.json(r.rows[0]);
});

app.put('/api/admin/social/:id', superauth, async (req, res) => {
  const cols = ['titulo', 'legenda', 'plataforma', 'data_prevista', 'cor', 'status', 'comentario']
    .filter(c => req.body[c] !== undefined);
  if (!cols.length) return res.status(400).json({ erro: 'Nada a atualizar' });
  const sets = cols.map((c, i) => `${c}=$${i + 2}`).join(',');
  const r = await pool.query(`UPDATE posts_sociais SET ${sets} WHERE id=$1 RETURNING id`,
    [req.params.id, ...cols.map(c => req.body[c])]);
  if (!r.rowCount) return res.status(404).json({ erro: 'Post não encontrado' });
  res.json({ ok: true });
});

app.delete('/api/admin/social/:id', superauth, async (req, res) => {
  const r = await pool.query('DELETE FROM posts_sociais WHERE id=$1', [req.params.id]);
  res.json({ ok: r.rowCount > 0 });
});

/* ---------- DOMÍNIO PRÓPRIO ---------- */
app.get('/api/dominio', auth, async (req, res) => {
  const c = (await pool.query(
    'SELECT nome, dominio, dominio_status, dominio_verificado_em FROM clinicas WHERE id=$1', [req.auth.cid])).rows[0];
  res.json({ ...c, alvo: ALVO_CNAME, automatico: !!process.env.RAILWAY_API_TOKEN });
});

app.put('/api/dominio', auth, async (req, res) => {
  const u = await gestor(req, res); if (!u) return;
  const dominio = normalizarDominio(req.body?.dominio);
  if (!dominio) return res.status(400).json({ erro: 'Domínio inválido. Use algo como clinicamovimente.com.br' });
  const dup = await pool.query('SELECT 1 FROM clinicas WHERE lower(dominio)=$1 AND id<>$2', [dominio, req.auth.cid]);
  if (dup.rowCount) return res.status(409).json({ erro: 'Este domínio já está em uso por outra clínica' });

  const railway = await registrarNoRailway(dominio);
  await pool.query("UPDATE clinicas SET dominio=$2, dominio_status='pendente', dominio_verificado_em=NULL WHERE id=$1",
    [req.auth.cid, dominio]);
  limparCacheHost();
  res.json({ ok: true, dominio, alvo: ALVO_CNAME, status: 'pendente', railway });
});

app.delete('/api/dominio', auth, async (req, res) => {
  const u = await gestor(req, res); if (!u) return;
  await pool.query("UPDATE clinicas SET dominio=NULL, dominio_status='nenhum', dominio_verificado_em=NULL WHERE id=$1",
    [req.auth.cid]);
  limparCacheHost();
  res.json({ ok: true });
});

// checa o DNS e, se já apontar para o PerFisio, ativa o domínio
app.post('/api/dominio/verificar', auth, async (req, res) => {
  const c = (await pool.query('SELECT dominio FROM clinicas WHERE id=$1', [req.auth.cid])).rows[0];
  if (!c?.dominio) return res.status(400).json({ erro: 'Nenhum domínio configurado' });
  const dnsOk = await dnsAponta(c.dominio);
  if (dnsOk.ok) {
    await pool.query("UPDATE clinicas SET dominio_status='ativo', dominio_verificado_em=now() WHERE id=$1", [req.auth.cid]);
    limparCacheHost();
  }
  res.json({ ...dnsOk, dominio: c.dominio, alvo: ALVO_CNAME, status: dnsOk.ok ? 'ativo' : 'pendente' });
});

// a página da clínica descobre quem ela é pelo próprio host acessado
app.get('/api/public/clinica-do-host', async (req, res) => {
  const id = await clinicaDoHost(req.headers.host);
  if (!id) return res.status(404).json({ erro: 'Domínio não vinculado a nenhuma clínica' });
  res.json({ id });
});

/* ---------- ASSINATURA (Stripe) ---------- */
const urlBase = req => process.env.APP_URL
  || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;

const catalogo = () => Object.entries(PLANOS).map(([chave, p]) =>
  ({ chave, nome: p.nome, descricao: p.descricao, centavos: p.centavos, unidade: p.unidade, tipo: p.tipo }));

// catálogo público — alimenta a página de planos sem exigir login
app.get('/api/public/planos', (req, res) => {
  res.json({ pagamento: !!stripe, limite_gratis: LIMITE_GRATIS, planos: catalogo() });
});

async function contexto(cid) {
  const c = (await pool.query(`SELECT nome, email, assinatura_status, licencas, plano_social, assinatura_fim,
      stripe_customer_id, stripe_subscription_id FROM clinicas WHERE id=$1`, [cid])).rows[0];
  const fisios = (await pool.query('SELECT count(*)::int n FROM fisios WHERE clinica_id=$1 AND ativo', [cid])).rows[0].n;
  const consultas = (await pool.query(`SELECT count(*)::int n FROM sessoes WHERE clinica_id=$1
      AND date_trunc('month', data) = date_trunc('month', CURRENT_DATE) AND status <> 'cancelada'`, [cid])).rows[0].n;
  return { ...c, fisios_ativos: fisios, consultas_mes: consultas };
}

app.get('/api/billing', auth, async (req, res) => {
  const c = await contexto(req.auth.cid);
  res.json({
    pagamento: !!stripe, limite_gratis: LIMITE_GRATIS, planos: catalogo(),
    nome: c.nome, status: c.assinatura_status, licencas: c.licencas, plano_social: c.plano_social,
    assinatura_fim: c.assinatura_fim, assinante: !!c.stripe_subscription_id,
    fisios_ativos: c.fisios_ativos, consultas_mes: c.consultas_mes,
    mensal: c.stripe_subscription_id
      ? (c.licencas * PLANOS.fisio.centavos + (c.plano_social ? PLANOS.social.centavos : 0)) / 100 : 0,
  });
});

async function gestor(req, res) {
  const u = (await pool.query('SELECT perfil, nome, email FROM usuarios WHERE id=$1', [req.auth.uid])).rows[0];
  if (!u || u.perfil !== 'gestor') { res.status(403).json({ erro: 'Só o gestor da clínica pode mexer na assinatura' }); return null; }
  return u;
}

async function clienteStripe(cid, email) {
  const c = (await pool.query('SELECT nome, email, stripe_customer_id FROM clinicas WHERE id=$1', [cid])).rows[0];
  if (c.stripe_customer_id) return c.stripe_customer_id;
  const cliente = await stripe.customers.create({
    name: c.nome, email: c.email || email || undefined, metadata: { clinica_id: cid },
  });
  await pool.query('UPDATE clinicas SET stripe_customer_id=$2 WHERE id=$1', [cid, cliente.id]);
  return cliente.id;
}

// inicia o checkout: 1 licença por fisioterapeuta ativo (+ add-on de redes sociais, se pedido)
app.post('/api/billing/checkout', auth, async (req, res) => {
  if (!stripe) return res.status(503).json({ erro: 'Pagamento ainda não está configurado no servidor' });
  const u = await gestor(req, res); if (!u) return;
  try {
    const c = await contexto(req.auth.cid);
    if (c.stripe_subscription_id)
      return res.status(400).json({ erro: 'Esta clínica já tem assinatura — use "Gerenciar assinatura"' });
    const itens = [{ price: await precoStripe('fisio'), quantity: Math.max(c.fisios_ativos, 1) }];
    if (req.body?.social) itens.push({ price: await precoStripe('social'), quantity: 1 });
    const base = urlBase(req);
    const sessao = await stripe.checkout.sessions.create({
      mode: 'subscription', locale: 'pt-BR', allow_promotion_codes: true,
      customer: await clienteStripe(req.auth.cid, u.email),
      line_items: itens,
      metadata: { clinica_id: req.auth.cid },
      subscription_data: { metadata: { clinica_id: req.auth.cid } },
      success_url: `${base}/app/assinatura.html?ok=1`,
      cancel_url: `${base}/app/assinatura.html?cancelado=1`,
    });
    res.json({ url: sessao.url });
  } catch (e) { console.error(e); res.status(500).json({ erro: e.message || 'Erro ao abrir o checkout' }); }
});

// portal da Stripe: trocar cartão, ver faturas, cancelar
app.post('/api/billing/portal', auth, async (req, res) => {
  if (!stripe) return res.status(503).json({ erro: 'Pagamento ainda não está configurado no servidor' });
  const u = await gestor(req, res); if (!u) return;
  try {
    const sessao = await stripe.billingPortal.sessions.create({
      customer: await clienteStripe(req.auth.cid, u.email),
      return_url: `${urlBase(req)}/app/assinatura.html`,
    });
    res.json({ url: sessao.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: /configuration/i.test(e.message || '')
      ? 'Ative o Customer Portal no painel da Stripe (Settings → Billing → Customer portal)' : e.message });
  }
});

// ajusta as licenças ao número de fisioterapeutas ativos (cobrança proporcional)
app.post('/api/billing/licencas', auth, async (req, res) => {
  if (!stripe) return res.status(503).json({ erro: 'Pagamento ainda não está configurado no servidor' });
  const u = await gestor(req, res); if (!u) return;
  try {
    const c = await contexto(req.auth.cid);
    if (!c.stripe_subscription_id) return res.status(400).json({ erro: 'Esta clínica ainda não tem assinatura' });
    const sub = await stripe.subscriptions.retrieve(c.stripe_subscription_id);
    const item = sub.items.data.find(i => i.price.lookup_key === PLANOS.fisio.lookup);
    if (!item) return res.status(400).json({ erro: 'Assinatura sem item de licenças' });
    const qtd = Math.max(c.fisios_ativos, 1);
    if (item.quantity === qtd) return res.json({ ok: true, licencas: qtd, mudou: false });
    const novo = await stripe.subscriptions.update(sub.id, {
      items: [{ id: item.id, quantity: qtd }], proration_behavior: 'create_prorations',
    });
    await sincronizarAssinatura(novo);
    res.json({ ok: true, licencas: qtd, mudou: true });
  } catch (e) { console.error(e); res.status(500).json({ erro: e.message }); }
});

// contrata/cancela o add-on de redes sociais dentro da assinatura existente
app.post('/api/billing/social', auth, async (req, res) => {
  if (!stripe) return res.status(503).json({ erro: 'Pagamento ainda não está configurado no servidor' });
  const u = await gestor(req, res); if (!u) return;
  try {
    const ligar = req.body?.ativo !== false;
    const c = await contexto(req.auth.cid);
    if (!c.stripe_subscription_id) return res.status(400).json({ erro: 'Assine o PerFisio antes de contratar o add-on' });
    const sub = await stripe.subscriptions.retrieve(c.stripe_subscription_id);
    const item = sub.items.data.find(i => i.price.lookup_key === PLANOS.social.lookup);
    if (ligar && item) return res.json({ ok: true, plano_social: true });
    if (!ligar && !item) return res.json({ ok: true, plano_social: false });
    const novo = await stripe.subscriptions.update(sub.id, {
      items: ligar
        ? [{ price: await precoStripe('social'), quantity: 1 }]
        : [{ id: item.id, deleted: true }],
      proration_behavior: 'create_prorations',
    });
    await sincronizarAssinatura(novo);
    res.json({ ok: true, plano_social: ligar });
  } catch (e) { console.error(e); res.status(500).json({ erro: e.message }); }
});

// relê a assinatura na Stripe (usado ao voltar do checkout e quando não há webhook)
app.post('/api/billing/sincronizar', auth, async (req, res) => {
  if (!stripe) return res.status(503).json({ erro: 'Pagamento ainda não está configurado no servidor' });
  try {
    const c = (await pool.query('SELECT stripe_customer_id FROM clinicas WHERE id=$1', [req.auth.cid])).rows[0];
    if (!c.stripe_customer_id) return res.json({ ok: true, encontrada: false });
    const subs = await stripe.subscriptions.list({ customer: c.stripe_customer_id, status: 'all', limit: 5 });
    const viva = subs.data.find(s => ['active', 'trialing', 'past_due'].includes(s.status)) || subs.data[0];
    if (!viva) return res.json({ ok: true, encontrada: false });
    if (!viva.metadata?.clinica_id) {
      await stripe.subscriptions.update(viva.id, { metadata: { clinica_id: req.auth.cid } });
      viva.metadata = { clinica_id: req.auth.cid };
    }
    await sincronizarAssinatura(viva);
    res.json({ ok: true, encontrada: true, status: viva.status });
  } catch (e) { console.error(e); res.status(500).json({ erro: e.message }); }
});

/* ---------- CRUD GENÉRICO (escopado por clínica) ---------- */
const TABLES = {
  fisios: ['nome', 'crefito', 'esp', 'cor', 'comissao', 'ativo',
    'publico', 'especialidades', 'domiciliar', 'bairro', 'cidade', 'lat', 'lng', 'preco', 'bio',
    'whatsapp', 'tratamentos', 'regioes', 'instagram'],
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

const SELECT_COLS = {
  fisios: `id, clinica_id, slug, nome, crefito, esp, cor, comissao, ativo, publico, especialidades,
    domiciliar, bairro, cidade, lat, lng, preco, bio, whatsapp, tratamentos, regioes, instagram,
    (foto IS NOT NULL) AS tem_foto, foto_mime, criado_em`,
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
  const r = await pool.query(`SELECT ${SELECT_COLS[t] || '*'} FROM ${t} WHERE ${where.join(' AND ')} ORDER BY ${ORDER[t] || 'criado_em'}`, vals);
  res.json(r.rows);
});

app.post('/api/:table', auth, tableGuard, async (req, res) => {
  const t = req.params.table;
  const cols = TABLES[t].filter(c => req.body[c] !== undefined);
  if (!cols.length) return res.status(400).json({ erro: 'Nenhum campo válido' });
  const vals = cols.map(c => JSONB_COLS.has(c) ? JSON.stringify(req.body[c]) : (req.body[c] === '' ? null : req.body[c]));
  try {
    const r = await pool.query(
      `INSERT INTO ${t} (clinica_id, ${cols.join(',')}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(',')}) RETURNING ${SELECT_COLS[t] || '*'}`,
      [req.auth.cid, ...vals]);
    if (t === 'fisios') await preencherSlugs();
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
    const r = await pool.query(`UPDATE ${t} SET ${sets}${extra} WHERE id=$1 AND clinica_id=$2 RETURNING ${SELECT_COLS[t] || '*'}`, [req.params.id, req.auth.cid, ...vals]);
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
    SELECT c.id, c.nome, c.email, c.endereco, c.ativa, c.plano_social, c.criado_em,
      c.assinatura_status, c.licencas, (c.stripe_subscription_id IS NOT NULL) AS assinante,
      c.dominio, c.dominio_status,
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

// cria clínica completa (gestor + fisio + seed) — onboarding pelo superadmin
app.post('/api/admin/clinicas', superauth, async (req, res) => {
  const { nome, gestor_nome, email, senha, telefone, endereco, plano_social } = req.body || {};
  if (!nome || !gestor_nome || !email || !senha) return res.status(400).json({ erro: 'Preencha clínica, gestor, e-mail e senha' });
  if (senha.length < 6) return res.status(400).json({ erro: 'Senha com ao menos 6 caracteres' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const dup = await client.query('SELECT 1 FROM usuarios WHERE email=$1', [email.toLowerCase()]);
    if (dup.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ erro: 'E-mail já cadastrado' }); }
    const c = (await client.query(
      'INSERT INTO clinicas (nome, email, telefone, endereco, plano_social) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [nome, email.toLowerCase(), telefone || null, endereco || null, !!plano_social])).rows[0];
    const f = (await client.query(
      'INSERT INTO fisios (clinica_id, nome, cor) VALUES ($1,$2,$3) RETURNING id', [c.id, gestor_nome, '#0DA189'])).rows[0];
    await client.query(
      'INSERT INTO usuarios (clinica_id, nome, email, senha_hash, perfil, fisio_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [c.id, gestor_nome, email.toLowerCase(), bcrypt.hashSync(senha, 10), 'gestor', f.id]);
    await seedClinica(client, c.id);
    await client.query('COMMIT');
    await preencherSlugs();
    res.json({ id: c.id, nome, email: email.toLowerCase() });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ erro: 'Erro ao criar clínica' });
  } finally { client.release(); }
});

// detalhe da clínica: dados + equipe + usuários
app.get('/api/admin/clinicas/:id', superauth, async (req, res) => {
  const c = await pool.query(`SELECT id, nome, cnpj, email, telefone, endereco, horario, ativa, plano_social, perfil,
    assinatura_status, licencas, assinatura_fim, (stripe_subscription_id IS NOT NULL) AS assinante,
    dominio, dominio_status, criado_em
    FROM clinicas WHERE id=$1`, [req.params.id]);
  if (!c.rowCount) return res.status(404).json({ erro: 'Clínica não encontrada' });
  const fisios = await pool.query(`
    SELECT id, nome, crefito, esp, cor, comissao, ativo, publico, especialidades, domiciliar,
           bairro, cidade, preco, whatsapp, (foto IS NOT NULL) AS tem_foto
    FROM fisios WHERE clinica_id=$1 ORDER BY nome`, [req.params.id]);
  const usuarios = await pool.query(
    'SELECT id, nome, email, perfil, ultimo_acesso FROM usuarios WHERE clinica_id=$1 ORDER BY criado_em', [req.params.id]);
  res.json({ ...c.rows[0], fisios: fisios.rows, usuarios: usuarios.rows });
});

// edita dados da clínica
app.put('/api/admin/clinicas/:id', superauth, async (req, res) => {
  const cols = ['nome', 'cnpj', 'email', 'telefone', 'endereco', 'horario', 'plano_social'].filter(c => req.body[c] !== undefined);
  if (!cols.length) return res.status(400).json({ erro: 'Nada a atualizar' });
  const sets = cols.map((c, i) => `${c}=$${i + 2}`).join(',');
  const r = await pool.query(`UPDATE clinicas SET ${sets} WHERE id=$1 RETURNING id`, [req.params.id, ...cols.map(c => req.body[c])]);
  if (!r.rowCount) return res.status(404).json({ erro: 'Clínica não encontrada' });
  res.json({ ok: true });
});

// fisioterapeutas de todas as clínicas
const ADMIN_FISIO_COLS = ['nome', 'crefito', 'esp', 'cor', 'comissao', 'ativo', 'publico', 'especialidades',
  'domiciliar', 'bairro', 'cidade', 'lat', 'lng', 'preco', 'bio', 'whatsapp', 'tratamentos', 'regioes', 'instagram'];

app.get('/api/admin/fisios', superauth, async (req, res) => {
  const r = await pool.query(`
    SELECT f.id, f.clinica_id, f.nome, f.crefito, f.esp, f.cor, f.comissao, f.ativo, f.publico,
           f.especialidades, f.domiciliar, f.bairro, f.cidade, f.preco, f.whatsapp, f.bio,
           f.tratamentos, f.regioes, f.instagram, f.lat, f.lng,
           (f.foto IS NOT NULL) AS tem_foto, c.nome AS clinica_nome
    FROM fisios f JOIN clinicas c ON c.id = f.clinica_id ORDER BY c.nome, f.nome`);
  res.json(r.rows);
});

app.post('/api/admin/fisios', superauth, async (req, res) => {
  const { clinica_id } = req.body || {};
  if (!clinica_id || !req.body.nome) return res.status(400).json({ erro: 'Informe a clínica e o nome' });
  const cols = ADMIN_FISIO_COLS.filter(c => req.body[c] !== undefined);
  const vals = cols.map(c => req.body[c] === '' ? null : req.body[c]);
  const r = await pool.query(
    `INSERT INTO fisios (clinica_id, ${cols.join(',')}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(',')}) RETURNING id, nome`,
    [clinica_id, ...vals]);
  await preencherSlugs();
  res.json(r.rows[0]);
});

app.put('/api/admin/fisios/:id', superauth, async (req, res) => {
  const cols = ADMIN_FISIO_COLS.filter(c => req.body[c] !== undefined);
  if (!cols.length) return res.status(400).json({ erro: 'Nada a atualizar' });
  const sets = cols.map((c, i) => `${c}=$${i + 2}`).join(',');
  const r = await pool.query(`UPDATE fisios SET ${sets} WHERE id=$1 RETURNING id`,
    [req.params.id, ...cols.map(c => req.body[c] === '' ? null : req.body[c])]);
  if (!r.rowCount) return res.status(404).json({ erro: 'Profissional não encontrado' });
  res.json({ ok: true });
});

// usuários de qualquer clínica + reset de senha
app.post('/api/admin/usuarios', superauth, async (req, res) => {
  const { clinica_id, nome, email, senha, perfil } = req.body || {};
  if (!clinica_id || !nome || !email || !senha) return res.status(400).json({ erro: 'Preencha todos os campos' });
  try {
    const r = await pool.query(
      'INSERT INTO usuarios (clinica_id, nome, email, senha_hash, perfil) VALUES ($1,$2,$3,$4,$5) RETURNING id, nome, email',
      [clinica_id, nome, email.toLowerCase(), bcrypt.hashSync(senha, 10), perfil || 'fisio']);
    res.json(r.rows[0]);
  } catch { res.status(409).json({ erro: 'E-mail já cadastrado' }); }
});

app.put('/api/admin/usuarios/:id/senha', superauth, async (req, res) => {
  const { senha } = req.body || {};
  if (!senha || senha.length < 6) return res.status(400).json({ erro: 'Senha com ao menos 6 caracteres' });
  const r = await pool.query('UPDATE usuarios SET senha_hash=$2 WHERE id=$1 AND superadmin IS NOT TRUE RETURNING id',
    [req.params.id, bcrypt.hashSync(senha, 10)]);
  if (!r.rowCount) return res.status(404).json({ erro: 'Usuário não encontrado' });
  res.json({ ok: true });
});

// entrar como a clínica (impersonation): gera sessão do gestor
app.post('/api/admin/clinicas/:id/impersonar', superauth, async (req, res) => {
  const r = await pool.query(`
    SELECT u.*, c.nome AS clinica_nome, c.ativa FROM usuarios u JOIN clinicas c ON c.id = u.clinica_id
    WHERE u.clinica_id = $1 ORDER BY (u.perfil = 'gestor') DESC, u.criado_em LIMIT 1`, [req.params.id]);
  if (!r.rowCount) return res.status(404).json({ erro: 'Esta clínica não tem usuários' });
  const u = r.rows[0];
  if (!u.ativa) return res.status(400).json({ erro: 'Clínica desativada — reative antes de entrar' });
  res.json({
    token: sign(u),
    usuario: { id: u.id, clinica_id: u.clinica_id, nome: u.nome, email: u.email, perfil: u.perfil, clinica_nome: u.clinica_nome },
  });
});

app.patch('/api/admin/clinicas/:id', superauth, async (req, res) => {
  const { ativa } = req.body || {};
  if (typeof ativa !== 'boolean') return res.status(400).json({ erro: 'Informe ativa: true/false' });
  const r = await pool.query('UPDATE clinicas SET ativa=$2 WHERE id=$1 RETURNING id, nome, ativa', [req.params.id, ativa]);
  if (!r.rowCount) return res.status(404).json({ erro: 'Clínica não encontrada' });
  res.json(r.rows[0]);
});

/* ---------- BLOG ---------- */
const slugify = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

app.get('/api/public/posts', async (req, res) => {
  const lim = Math.min(Number(req.query.limit) || 20, 50);
  const r = await pool.query(
    `SELECT slug, titulo, resumo, categoria, emoji, autor, publicado_em FROM posts
     WHERE publicado ORDER BY publicado_em DESC, criado_em DESC LIMIT $1`, [lim]);
  res.json(r.rows);
});

app.get('/api/public/posts/:slug', async (req, res) => {
  const r = await pool.query('SELECT * FROM posts WHERE slug=$1 AND publicado', [req.params.slug]);
  if (!r.rowCount) return res.status(404).json({ erro: 'Artigo não encontrado' });
  const outros = await pool.query(
    `SELECT slug, titulo, categoria, emoji FROM posts WHERE publicado AND slug <> $1
     ORDER BY publicado_em DESC LIMIT 3`, [req.params.slug]);
  res.json({ ...r.rows[0], outros: outros.rows });
});

// gestão do blog: só superadmin
app.get('/api/admin/posts', superauth, async (req, res) => {
  const r = await pool.query('SELECT * FROM posts ORDER BY publicado_em DESC, criado_em DESC');
  res.json(r.rows);
});
app.post('/api/admin/posts', superauth, async (req, res) => {
  const { titulo, resumo, conteudo, categoria, emoji, autor, publicado, publicado_em } = req.body || {};
  if (!titulo || !conteudo) return res.status(400).json({ erro: 'Informe título e conteúdo' });
  let slug = slugify(titulo);
  const dup = await pool.query('SELECT 1 FROM posts WHERE slug=$1', [slug]);
  if (dup.rowCount) slug += '-' + Date.now().toString(36).slice(-4);
  const r = await pool.query(
    `INSERT INTO posts (slug,titulo,resumo,conteudo,categoria,emoji,autor,publicado,publicado_em)
     VALUES ($1,$2,$3,$4,COALESCE($5,'Gestão'),COALESCE($6,'📄'),COALESCE($7,'Equipe PerFisio'),COALESCE($8,true),COALESCE($9,CURRENT_DATE)) RETURNING *`,
    [slug, titulo, resumo || null, conteudo, categoria, emoji, autor, publicado, publicado_em || null]);
  res.json(r.rows[0]);
});
app.put('/api/admin/posts/:id', superauth, async (req, res) => {
  const cols = ['titulo', 'resumo', 'conteudo', 'categoria', 'emoji', 'autor', 'publicado', 'publicado_em']
    .filter(c => req.body[c] !== undefined);
  if (!cols.length) return res.status(400).json({ erro: 'Nada a atualizar' });
  const sets = cols.map((c, i) => `${c}=$${i + 2}`).join(',');
  const r = await pool.query(`UPDATE posts SET ${sets} WHERE id=$1 RETURNING *`,
    [req.params.id, ...cols.map(c => req.body[c])]);
  if (!r.rowCount) return res.status(404).json({ erro: 'Artigo não encontrado' });
  res.json(r.rows[0]);
});
app.delete('/api/admin/posts/:id', superauth, async (req, res) => {
  const r = await pool.query('DELETE FROM posts WHERE id=$1', [req.params.id]);
  res.json({ ok: r.rowCount > 0 });
});

/* ---------- ROTAS PÚBLICAS (diretório) ---------- */
// config pública (token do mapa)
app.get('/api/public/config', (req, res) => {
  res.json({ mapbox: process.env.MAPBOX_TOKEN || null, google: process.env.GOOGLE_CLIENT_ID || null });
});

// diretório de PROFISSIONAIS (vinculados ou não a uma clínica)
// cidades com profissionais públicos — alimenta as páginas /fisioterapeutas-em-...
app.get('/api/public/cidades', async (req, res) => {
  res.json(await cidadesPublicas());
});

app.get('/api/public/profissionais', async (req, res) => {
  const lat = req.query.lat ? Number(req.query.lat) : null;
  const lng = req.query.lng ? Number(req.query.lng) : null;
  const temGeo = Number.isFinite(lat) && Number.isFinite(lng);
  // ?cidade=slug filtra pela cidade da URL amigável
  let cidade = null;
  if (req.query.cidade) {
    const achada = (await cidadesPublicas()).find(c => c.slug === slugificar(req.query.cidade));
    if (!achada) return res.json([]);
    cidade = achada.cidade;
  }
  const r = await pool.query(`
    SELECT f.id, f.slug, f.nome, f.crefito, f.esp, f.cor, f.especialidades, f.domiciliar,
           f.bairro, f.cidade, f.preco, f.bio, f.lat, f.lng,
           (f.foto IS NOT NULL) AS tem_foto,
           c.id AS clinica_id, c.slug AS clinica_slug, c.nome AS clinica_nome, c.endereco AS clinica_endereco,
           (c.perfil->>'agenda_online') AS agenda_online,
           CASE WHEN $1::boolean AND f.lat IS NOT NULL AND f.lng IS NOT NULL THEN
             6371000 * acos(LEAST(1, GREATEST(-1,
               cos(radians($2::numeric)) * cos(radians(f.lat)) * cos(radians(f.lng) - radians($3::numeric))
               + sin(radians($2::numeric)) * sin(radians(f.lat)))))
           END AS distancia
    FROM fisios f
    JOIN clinicas c ON c.id = f.clinica_id
    WHERE f.publico AND f.ativo AND c.ativa AND ($4::text IS NULL OR f.cidade = $4)
    ORDER BY distancia NULLS LAST, f.nome
    LIMIT 60`, [temGeo, temGeo ? lat : 0, temGeo ? lng : 0, cidade]);
  res.json(r.rows.map(p => ({
    ...p,
    lat: p.lat === null ? null : Number(p.lat),
    lng: p.lng === null ? null : Number(p.lng),
    distancia: p.distancia === null ? null : Math.round(Number(p.distancia)),
    especialidades: (p.especialidades || '').split(',').map(s => s.trim()).filter(Boolean),
  })));
});

// página interna do profissional
app.get('/api/public/profissionais/:id', async (req, res) => {
  const r = await pool.query(`
    SELECT f.id, f.slug, f.nome, f.crefito, f.esp, f.cor, f.especialidades, f.domiciliar,
           f.bairro, f.cidade, f.preco, f.bio, f.lat, f.lng,
           f.whatsapp, f.tratamentos, f.regioes, f.instagram,
           (f.foto IS NOT NULL) AS tem_foto,
           c.id AS clinica_id, c.slug AS clinica_slug, c.nome AS clinica_nome, c.endereco AS clinica_endereco,
           c.telefone AS clinica_telefone, c.horario AS clinica_horario
    FROM fisios f JOIN clinicas c ON c.id = f.clinica_id
    WHERE (f.slug = $1 OR ($2::boolean AND f.id::text = $1)) AND f.publico AND f.ativo AND c.ativa`,
    [req.params.id, UUID.test(req.params.id)]);
  if (!r.rowCount) return res.status(404).json({ erro: 'Profissional não encontrado' });
  const p = r.rows[0];
  const colegas = await pool.query(`
    SELECT id, slug, nome, esp, cor, especialidades, bairro, preco, domiciliar, (foto IS NOT NULL) AS tem_foto
    FROM fisios WHERE clinica_id = $1 AND id <> $2 AND publico AND ativo ORDER BY nome LIMIT 6`,
    [p.clinica_id, p.id]);
  const pacotes = await pool.query(
    'SELECT nome, descricao, valor, sessoes, tipo FROM pacotes WHERE clinica_id = $1 ORDER BY valor LIMIT 4',
    [p.clinica_id]);
  const galeria = await pool.query(
    'SELECT id, nome FROM fisio_fotos WHERE fisio_id = $1 ORDER BY criado_em', [p.id]);
  res.json({
    ...p,
    lat: p.lat === null ? null : Number(p.lat), lng: p.lng === null ? null : Number(p.lng),
    especialidades: (p.especialidades || '').split(',').map(s => s.trim()).filter(Boolean),
    tratamentos: (p.tratamentos || '').split(',').map(s => s.trim()).filter(Boolean),
    colegas: colegas.rows.map(c => ({ ...c, especialidades: (c.especialidades || '').split(',').map(s => s.trim()).filter(Boolean) })),
    pacotes: pacotes.rows.map(x => ({ ...x, valor: Number(x.valor) })),
    galeria: galeria.rows,
  });
});

// página interna da clínica
app.get('/api/public/clinicas/:id', async (req, res) => {
  const c = await pool.query(
    `SELECT id, slug, nome, endereco, telefone, horario, perfil FROM clinicas
     WHERE (slug = $1 OR ($2::boolean AND id::text = $1)) AND ativa`,
    [req.params.id, UUID.test(req.params.id)]);
  if (!c.rowCount) return res.status(404).json({ erro: 'Clínica não encontrada' });
  const equipe = await pool.query(`
    SELECT id, slug, nome, crefito, esp, cor, especialidades, domiciliar, bairro, cidade, preco, bio, lat, lng, (foto IS NOT NULL) AS tem_foto
    FROM fisios WHERE clinica_id = $1 AND publico AND ativo ORDER BY nome`, [c.rows[0].id]);
  res.json({
    ...c.rows[0],
    equipe: equipe.rows.map(f => ({
      ...f, lat: f.lat === null ? null : Number(f.lat), lng: f.lng === null ? null : Number(f.lng),
      especialidades: (f.especialidades || '').split(',').map(s => s.trim()).filter(Boolean),
    })),
  });
});

/* ---------- AGENDAMENTO ONLINE (público) ---------- */
// horários ocupados do profissional (sem nenhum dado de paciente)
// as URLs amigáveis passam o slug; as antigas passam o uuid — as rotas públicas aceitam os dois
async function acharFisioPublico(valor) {
  if (!valor) return null;
  const r = await pool.query(
    `SELECT f.id, f.nome, f.clinica_id FROM fisios f JOIN clinicas c ON c.id = f.clinica_id
     WHERE (f.slug = $1 OR ($2::boolean AND f.id::text = $1)) AND f.publico AND f.ativo AND c.ativa`,
    [String(valor), UUID.test(String(valor))]);
  return r.rowCount ? r.rows[0] : null;
}

app.get('/api/public/agenda/:fisioId', async (req, res) => {
  const f = await acharFisioPublico(req.params.fisioId);
  if (!f) return res.status(404).json({ erro: 'Profissional não encontrado' });
  const r = await pool.query(
    `SELECT to_char(data, 'YYYY-MM-DD') AS data, hora FROM sessoes
     WHERE fisio_id=$1 AND status <> 'cancelada' AND data >= $2::date AND data <= $3::date`,
    [f.id, req.query.from, req.query.to]);
  res.json(r.rows.map(s => ({ data: s.data, hora: s.hora.slice(0, 5) })));
});

const gerarCodigo = () => 'PF-' + Math.random().toString(36).slice(2, 8).toUpperCase();

// cria o agendamento (único ou recorrente semanal)
app.post('/api/public/agendar', authConta, async (req, res) => {
  const { fisio_id, data, hora, semanas, obs } = req.body || {};
  if (!fisio_id || !data || !hora) return res.status(400).json({ erro: 'Escolha data e horário' });
  if (data < new Date().toISOString().slice(0, 10)) return res.status(400).json({ erro: 'Escolha uma data futura' });
  // nome e telefone vêm da conta, não do formulário
  const cq = await pool.query('SELECT id, nome, telefone FROM contas WHERE id=$1', [req.conta]);
  if (!cq.rowCount) return res.status(401).json({ erro: 'Conta não encontrada' });
  const conta = cq.rows[0];
  const nome = conta.nome, telefone = req.body?.telefone || conta.telefone;
  const fisio = await acharFisioPublico(fisio_id);
  if (!fisio) return res.status(404).json({ erro: 'Profissional não encontrado' });

  // acha o paciente desta clínica pela conta; senão pelo telefone; senão cria
  let pacienteId = null;
  const jaVinculado = await pool.query(
    'SELECT id FROM pacientes WHERE clinica_id=$1 AND conta_id=$2 LIMIT 1', [fisio.clinica_id, conta.id]);
  if (jaVinculado.rowCount) pacienteId = jaVinculado.rows[0].id;
  const telLimpo = (telefone || '').replace(/\D/g, '');
  if (!pacienteId && telLimpo) {
    const ex = await pool.query(
      `SELECT id FROM pacientes WHERE clinica_id=$1 AND regexp_replace(COALESCE(telefone,''), '\\D', '', 'g') = $2 LIMIT 1`,
      [fisio.clinica_id, telLimpo]);
    if (ex.rowCount) pacienteId = ex.rows[0].id;
  }
  if (pacienteId) {
    await pool.query('UPDATE pacientes SET conta_id=$2 WHERE id=$1 AND conta_id IS NULL', [pacienteId, conta.id]);
  } else {
    const novo = await pool.query(
      `INSERT INTO pacientes (clinica_id, nome, telefone, fisio_id, status, queixa, conta_id)
       VALUES ($1,$2,$3,$4,'avaliacao',$5,$6) RETURNING id`,
      [fisio.clinica_id, nome, telefone || null, fisio.id, obs || null, conta.id]);
    pacienteId = novo.rows[0].id;
  }

  const n = Math.min(Math.max(Number(semanas) || 1, 1), 12);
  const datas = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(data + 'T12:00:00');
    d.setDate(d.getDate() + i * 7);
    datas.push(d.toISOString().slice(0, 10));
  }

  const codigo = gerarCodigo();
  const criadas = [], conflitos = [];
  for (let i = 0; i < datas.length; i++) {
    const dt = datas[i];
    const ocupado = await pool.query(
      `SELECT 1 FROM sessoes WHERE fisio_id=$1 AND data=$2::date AND hora=$3 AND status <> 'cancelada'`,
      [fisio.id, dt, hora]);
    if (ocupado.rowCount) { conflitos.push(dt); continue; }
    await pool.query(
      `INSERT INTO sessoes (clinica_id, paciente_id, fisio_id, tipo, data, hora, status, obs, reserva)
       VALUES ($1,$2,$3,$4,$5::date,$6,'agendada',$7,$8)`,
      [fisio.clinica_id, pacienteId, fisio.id,
       i === 0 ? 'Avaliação inicial' : 'Sessão de tratamento', dt, hora,
       'Agendado pelo site' + (obs ? ' · ' + obs.slice(0, 140) : ''), codigo]);
    criadas.push(dt);
  }
  if (!criadas.length) return res.status(409).json({ erro: 'Os horários escolhidos acabaram de ser ocupados. Escolha outro.' });
  res.json({ codigo, hora, criadas, conflitos, fisio_nome: fisio.nome });
});

// consulta reserva pelo código (para remarcar/cancelar)
app.get('/api/public/reserva/:codigo', async (req, res) => {
  const r = await pool.query(`
    SELECT s.id, to_char(s.data, 'YYYY-MM-DD') AS data, s.hora, s.tipo, f.nome AS fisio_nome, f.id AS fisio_id
    FROM sessoes s JOIN fisios f ON f.id = s.fisio_id
    WHERE s.reserva = $1 AND s.status = 'agendada' AND s.data >= CURRENT_DATE
    ORDER BY s.data, s.hora`, [req.params.codigo.toUpperCase()]);
  if (!r.rowCount) return res.status(404).json({ erro: 'Nenhum agendamento futuro com este código' });
  res.json(r.rows.map(s => ({ ...s, hora: s.hora.slice(0, 5) })));
});

// remarca uma sessão da reserva
app.post('/api/public/reserva/:codigo/remarcar', async (req, res) => {
  const { sessao_id, data, hora } = req.body || {};
  if (!sessao_id || !data || !hora) return res.status(400).json({ erro: 'Informe a sessão e o novo horário' });
  if (data < new Date().toISOString().slice(0, 10)) return res.status(400).json({ erro: 'Escolha uma data futura' });
  const s = await pool.query(
    `SELECT id, fisio_id FROM sessoes WHERE id=$1 AND reserva=$2 AND status='agendada'`,
    [sessao_id, req.params.codigo.toUpperCase()]);
  if (!s.rowCount) return res.status(404).json({ erro: 'Sessão não encontrada para este código' });
  const ocupado = await pool.query(
    `SELECT 1 FROM sessoes WHERE fisio_id=$1 AND data=$2::date AND hora=$3 AND status <> 'cancelada' AND id <> $4`,
    [s.rows[0].fisio_id, data, hora, sessao_id]);
  if (ocupado.rowCount) return res.status(409).json({ erro: 'Este horário acabou de ser ocupado. Escolha outro.' });
  await pool.query(`UPDATE sessoes SET data=$2::date, hora=$3 WHERE id=$1`, [sessao_id, data, hora]);
  res.json({ ok: true, data, hora });
});

// cancela uma sessão da reserva
app.post('/api/public/reserva/:codigo/cancelar', async (req, res) => {
  const { sessao_id } = req.body || {};
  const r = await pool.query(
    `UPDATE sessoes SET status='cancelada' WHERE id=$1 AND reserva=$2 AND status='agendada' RETURNING id`,
    [sessao_id, req.params.codigo.toUpperCase()]);
  if (!r.rowCount) return res.status(404).json({ erro: 'Sessão não encontrada para este código' });
  res.json({ ok: true });
});

// lead direto para um profissional
app.post('/api/public/leads-profissional', async (req, res) => {
  const { fisio_id, nome, telefone, obs } = req.body || {};
  if (!fisio_id || !nome) return res.status(400).json({ erro: 'Informe seu nome' });
  const f = await acharFisioPublico(fisio_id);
  if (!f) return res.status(404).json({ erro: 'Profissional não encontrado' });
  await pool.query(
    `INSERT INTO leads (clinica_id, nome, telefone, origem, interesse, obs, fisio_id)
     VALUES ($1,$2,$3,'Site PerFisio',$4,$5,$6)`,
    [f.clinica_id, nome, telefone || null, 'Avaliação fisioterapêutica', obs || null, f.id]);
  res.json({ ok: true });
});

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

/* ---- SITE (www) x SISTEMA (app) ----
   www.perfisio.com.br  → páginas públicas (home, planos, perfis, clínicas)
   app.perfisio.com.br  → login, painel da clínica e superadmin
   Como os links entre as páginas continuam relativos, é aqui que cada host manda
   o visitante para o lugar certo. Sem SITE_HOST definido nada disso roda. */
const ehDoSistema = p => p === '/login.html' || p.startsWith('/app/') || p.startsWith('/admin');
const passaDireto = p => p.startsWith('/api/') || p.startsWith('/assets/') || p.startsWith('/.well-known');

if (HOST_SITE) {
  app.use((req, res, next) => {
    const h = soHost(req.headers.host);
    if (passaDireto(req.path)) return next();
    const destino = alvo => res.redirect(301, `https://${alvo}${req.originalUrl}`);

    if (h === HOST_APEX) return destino(HOST_SITE);            // perfisio.com.br → www
    if (h === HOST_SITE) return ehDoSistema(req.path) ? destino(HOST_APP) : next();
    if (h === HOST_APP) {
      if (req.path === '/') return res.redirect(302, '/login.html');  // o app abre no login
      return ehDoSistema(req.path) ? next() : destino(HOST_SITE);
    }
    // domínio próprio de clínica: login e painel ficam sempre no app
    if (ehDoSistema(req.path) && !hostDoSistema(h)) return destino(HOST_APP);
    next();
  });
}

/* No domínio próprio de uma clínica, a raiz é a página dela — não o diretório do PerFisio.
   Os demais caminhos (assets, fisio.html, login, app/) continuam funcionando normalmente. */
app.use(async (req, res, next) => {
  if (req.path !== '/' || hostDoSistema(req.headers.host)) return next();
  try {
    const id = await clinicaDoHost(req.headers.host);
    if (id) return res.sendFile(path.join(ROOT, 'clinica.html'));
  } catch (e) { console.error('erro no roteamento por domínio', e); }
  next();
});

/* ---- URLs amigáveis + SEO ----
   /fisioterapeutas-em-{cidade}  · listagem da cidade
   /fisioterapeuta/{slug}        · perfil do profissional
   /clinica/{slug}               · página da clínica
   As páginas continuam sendo renderizadas no navegador; aqui injetamos title,
   description, canonical, Open Graph e JSON-LD no HTML antes de servir. */
const fsp = require('node:fs/promises');
const HOST_CANONICO = HOST_SITE || HOST_APP;
const paginasCache = new Map();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// cacheia o HTML, mas relê quando o arquivo muda (evita reiniciar em dev)
async function lerPagina(arq) {
  const caminho = path.join(ROOT, arq);
  const { mtimeMs } = await fsp.stat(caminho);
  const guardado = paginasCache.get(arq);
  if (guardado && guardado.mtimeMs === mtimeMs) return guardado.html;
  const html = await fsp.readFile(caminho, 'utf8');
  paginasCache.set(arq, { mtimeMs, html });
  return html;
}
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const resumir = (t, n = 155) => {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  return s.length <= n ? s : s.slice(0, n - 1).replace(/\s\S*$/, '') + '…';
};

async function servirSeo(res, arq, seo) {
  const html = await lerPagina(arq);
  const jsonld = seo.jsonld
    ? `<script type="application/ld+json">${JSON.stringify(seo.jsonld).replace(/</g, '\\u003c')}</script>` : '';
  const dados = seo.dados
    ? `<script>window.__PF = ${JSON.stringify(seo.dados).replace(/</g, '\\u003c')};</script>` : '';
  const tags = `
  <meta name="description" content="${esc(seo.descricao)}">
  <link rel="canonical" href="${esc(seo.url)}">
  <meta property="og:type" content="${seo.tipo || 'website'}">
  <meta property="og:site_name" content="PerFisio">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:title" content="${esc(seo.titulo)}">
  <meta property="og:description" content="${esc(seo.descricao)}">
  <meta property="og:url" content="${esc(seo.url)}">
  ${seo.imagem ? `<meta property="og:image" content="${esc(seo.imagem)}">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  ${jsonld}${dados}
`;
  res.type('html').send(html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(seo.titulo)}</title>`)
    .replace('</head>', tags + '</head>'));
}

const urlPublica = (req, caminho) => `https://${HOST_CANONICO}${caminho}`;

async function cidadesPublicas() {
  const r = await pool.query(`
    SELECT f.cidade, count(*)::int AS n FROM fisios f JOIN clinicas c ON c.id = f.clinica_id
    WHERE f.publico AND f.ativo AND c.ativa AND coalesce(f.cidade, '') <> ''
    GROUP BY f.cidade ORDER BY n DESC, f.cidade`);
  return r.rows.map(x => ({ cidade: x.cidade, slug: slugificar(x.cidade), total: x.n }));
}

/* ---- perfis.io: link curto do profissional ----
   perfis.io/{slug} abre o perfil resumido com a agenda compacta.
   O canonical aponta para o perfil completo, para não competir no Google. */
app.use(async (req, res, next) => {
  if (!ehHostCurto(req.headers.host)) return next();
  if (passaDireto(req.path)) return next();
  const destinoSite = `https://${HOST_CANONICO}`;
  if (req.path === '/') return res.redirect(302, destinoSite);
  const slug = decodeURIComponent(req.path.slice(1).replace(/\/$/, ''));
  if (!/^[a-z0-9-]{2,70}$/.test(slug)) return res.redirect(302, destinoSite);
  try {
    const r = await pool.query(`
      SELECT f.id, f.slug, f.nome, f.esp, f.bio, f.cidade, f.bairro, f.preco, (f.foto IS NOT NULL) AS tem_foto
      FROM fisios f JOIN clinicas c ON c.id = f.clinica_id
      WHERE f.slug = $1 AND f.publico AND f.ativo AND c.ativa`, [slug]);
    if (!r.rowCount) return res.redirect(302, destinoSite);
    const f = r.rows[0];
    const onde = [f.bairro, f.cidade].filter(Boolean).join(', ');
    return await servirSeo(res, 'perfil-curto.html', {
      titulo: `${f.nome} — agende sua sessão | PerFisio`,
      descricao: resumir(f.bio || `Agende online com ${f.nome}${onde ? ', ' + onde : ''}. ${f.preco || ''}`),
      url: `https://${HOST_CANONICO}/fisioterapeuta/${f.slug}`, // canonical = perfil completo
      tipo: 'profile',
      imagem: f.tem_foto ? `https://${HOST_CANONICO}/api/public/fisio-foto/${f.id}` : null,
      dados: { slug: f.slug, curto: true },
    });
  } catch (e) { next(e); }
});

// home e planos também ganham title/description/canonical de verdade
app.get('/', async (req, res, next) => {
  try {
    await servirSeo(res, 'index.html', {
      titulo: 'PerFisio — encontre fisioterapeutas perto de você e agende online',
      descricao: 'Diretório de fisioterapeutas com CREFITO verificado: veja especialidade, preço, distância e agende online. Para clínicas, um CRM completo por R$ 40 por profissional/mês.',
      url: urlPublica(req, '/'),
      jsonld: {
        '@context': 'https://schema.org', '@type': 'WebSite', name: 'PerFisio',
        url: urlPublica(req, '/'), inLanguage: 'pt-BR',
      },
    });
  } catch (e) { next(e); }
});

app.get('/planos.html', async (req, res, next) => {
  try {
    await servirSeo(res, 'planos.html', {
      titulo: 'Planos e preços — R$ 40 por profissional/mês | PerFisio',
      descricao: 'Comece grátis até 10 consultas por mês. Depois, R$ 40 por fisioterapeuta: agenda, prontuário eletrônico, CRM, financeiro e perfil no diretório. Sem fidelidade.',
      url: urlPublica(req, '/planos.html'),
    });
  } catch (e) { next(e); }
});

// listagem por cidade — a página que queremos ranqueando no Google
app.get('/fisioterapeutas-em-:cidade', async (req, res, next) => {
  try {
    const alvo = slugificar(req.params.cidade);
    const cidade = (await cidadesPublicas()).find(c => c.slug === alvo);
    if (!cidade) return next();
    const nome = cidade.cidade;
    await servirSeo(res, 'cidade.html', {
      titulo: `Fisioterapeutas em ${nome} — agende online | PerFisio`,
      descricao: `${cidade.total} fisioterapeuta(s) em ${nome} com CREFITO verificado: especialidade, preço, região de atendimento e agendamento online direto pelo PerFisio.`,
      url: urlPublica(req, `/fisioterapeutas-em-${alvo}`),
      jsonld: {
        '@context': 'https://schema.org', '@type': 'CollectionPage',
        name: `Fisioterapeutas em ${nome}`, url: urlPublica(req, `/fisioterapeutas-em-${alvo}`),
        about: { '@type': 'Place', name: nome },
      },
    });
  } catch (e) { next(e); }
});

// perfil do profissional
app.get('/fisioterapeuta/:slug', async (req, res, next) => {
  try {
    const r = await pool.query(`
      SELECT f.nome, f.esp, f.bio, f.cidade, f.bairro, f.preco, f.especialidades, f.slug, f.id,
             (f.foto IS NOT NULL) AS tem_foto, c.nome AS clinica_nome
      FROM fisios f JOIN clinicas c ON c.id = f.clinica_id
      WHERE f.slug = $1 AND f.publico AND f.ativo AND c.ativa`, [req.params.slug]);
    if (!r.rowCount) return next();
    const f = r.rows[0];
    const onde = [f.bairro, f.cidade].filter(Boolean).join(', ');
    await servirSeo(res, 'fisio.html', {
      titulo: `${f.nome} — ${f.esp || 'Fisioterapeuta'}${onde ? ' em ' + onde : ''} | PerFisio`,
      descricao: resumir(f.bio || `${f.nome}, ${f.esp || 'fisioterapeuta'}${onde ? ' em ' + onde : ''}. ${f.preco || ''} Agende sua sessão online pelo PerFisio.`),
      url: urlPublica(req, `/fisioterapeuta/${f.slug}`),
      tipo: 'profile',
      imagem: f.tem_foto ? urlPublica(req, `/api/public/fisio-foto/${f.id}`) : null,
      jsonld: {
        '@context': 'https://schema.org', '@type': 'Physician',
        name: f.nome, medicalSpecialty: 'Physiotherapy',
        url: urlPublica(req, `/fisioterapeuta/${f.slug}`),
        ...(f.clinica_nome ? { worksFor: { '@type': 'Organization', name: f.clinica_nome } } : {}),
        ...(onde ? { address: { '@type': 'PostalAddress', addressLocality: f.cidade || onde } } : {}),
      },
    });
  } catch (e) { next(e); }
});

// página da clínica
app.get('/clinica/:slug', async (req, res, next) => {
  try {
    const r = await pool.query(`
      SELECT c.id, c.nome, c.slug, c.endereco, c.telefone, c.horario, c.perfil,
             (SELECT count(*)::int FROM fisios f WHERE f.clinica_id = c.id AND f.publico AND f.ativo) AS equipe
      FROM clinicas c WHERE c.slug = $1 AND c.ativa`, [req.params.slug]);
    if (!r.rowCount) return next();
    const c = r.rows[0], perfil = c.perfil || {};
    await servirSeo(res, 'clinica.html', {
      titulo: `${c.nome} — Fisioterapia${c.endereco ? ' · ' + String(c.endereco).split('·').pop().trim() : ''} | PerFisio`,
      descricao: resumir(perfil.bio || `${c.nome}: ${c.equipe} fisioterapeuta(s), agendamento online e prontuário digital. ${c.endereco || ''}`),
      url: urlPublica(req, `/clinica/${c.slug}`),
      jsonld: {
        '@context': 'https://schema.org', '@type': 'MedicalClinic',
        name: c.nome, url: urlPublica(req, `/clinica/${c.slug}`),
        ...(c.telefone ? { telephone: c.telefone } : {}),
        ...(c.endereco ? { address: { '@type': 'PostalAddress', streetAddress: c.endereco } } : {}),
        ...(c.horario ? { openingHours: c.horario } : {}),
      },
    });
  } catch (e) { next(e); }
});

// URLs antigas com ?id= continuam funcionando, mas mandam 301 para a nova
const redirLegado = (tabela, prefixo) => async (req, res, next) => {
  const id = req.query.id;
  if (!id || !UUID.test(id)) return next();
  const r = await pool.query(`SELECT slug FROM ${tabela} WHERE id = $1`, [id]);
  if (!r.rowCount || !r.rows[0].slug) return next();
  res.redirect(301, `${prefixo}/${r.rows[0].slug}`);
};
app.get('/fisio.html', redirLegado('fisios', '/fisioterapeuta'));
app.get('/clinica.html', redirLegado('clinicas', '/clinica'));

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: https://${HOST_CANONICO}/sitemap.xml\n`);
});

app.get('/sitemap.xml', async (req, res) => {
  try {
    const [cidades, fisios, clinicas] = await Promise.all([
      cidadesPublicas(),
      pool.query(`SELECT f.slug FROM fisios f JOIN clinicas c ON c.id = f.clinica_id
                  WHERE f.publico AND f.ativo AND c.ativa AND coalesce(f.slug,'') <> ''`),
      pool.query(`SELECT slug FROM clinicas WHERE ativa AND coalesce(slug,'') <> ''
                  AND (perfil->>'visivel')::boolean IS TRUE`),
    ]);
    const urls = [
      { loc: '/', prio: '1.0' },
      { loc: '/planos.html', prio: '0.8' },
      ...cidades.map(c => ({ loc: `/fisioterapeutas-em-${c.slug}`, prio: '0.9' })),
      ...fisios.rows.map(f => ({ loc: `/fisioterapeuta/${f.slug}`, prio: '0.8' })),
      ...clinicas.rows.map(c => ({ loc: `/clinica/${c.slug}`, prio: '0.7' })),
    ];
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map(u => `  <url><loc>https://${HOST_CANONICO}${u.loc}</loc><priority>${u.prio}</priority></url>`).join('\n') +
      `\n</urlset>\n`);
  } catch (e) { res.status(500).type('text/plain').send('erro ao gerar sitemap'); }
});

app.use(express.static(ROOT, { extensions: ['html'] }));

app.use(async (req, res) => {
  if (!hostDoSistema(req.headers.host)) {
    try {
      const id = await clinicaDoHost(req.headers.host);
      if (id) return res.status(404).sendFile(path.join(ROOT, 'clinica.html'));
    } catch (e) { /* cai no fallback padrão */ }
  }
  res.status(404).sendFile(path.join(ROOT, 'index.html'));
});

/* último recurso: erro em qualquer rota vira resposta, nunca silêncio */
app.use((err, req, res, next) => {
  console.error('erro em', req.method, req.originalUrl, '·', err.message);
  if (res.headersSent) return;
  const dadoRuim = err.code === '22P02' || err.code === '22007' || err.code === '22008';
  res.status(dadoRuim ? 400 : 500)
    .json({ erro: dadoRuim ? 'Dados inválidos na requisição' : 'Erro interno do servidor' });
});

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
    await preencherSlugs();
    await grandfatherVerificacao();
    await seedSuperadmin();
    console.log('✅ Schema verificado/migrado');
  }
  app.listen(PORT, () => console.log(`PerFisio rodando na porta ${PORT}`));
})().catch(e => { console.error('Falha ao iniciar:', e); process.exit(1); });

/* Uma requisição malformada não pode derrubar o servidor de todo mundo:
   loga e segue. (Já aconteceu: slug onde a query esperava uuid.) */
process.on('unhandledRejection', e => console.error('⚠️  promessa não tratada:', e));
process.on('uncaughtException', e => console.error('⚠️  exceção não tratada:', e));
