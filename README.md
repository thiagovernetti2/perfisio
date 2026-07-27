# PerFisio

Diretório de fisioterapeutas e clínicas + CRM e sistema de gestão completo — **full-stack**.

- **Frontend:** HTML/CSS/JS puro (sem frameworks, sem build)
- **Backend:** Node.js + Express + PostgreSQL (`server/server.js`)
- **Auth:** JWT (bcrypt para senhas) · multi-tenant por clínica
- **Deploy:** Railway (app + Postgres) · produção: https://perfisio-production.up.railway.app

## Como funciona

1. **Cadastro** (`login.html#registro`): cria a clínica + usuário gestor + fisioterapeuta, já com biblioteca de 18 exercícios e 5 pacotes padrão (seed).
2. **Perfil público** (Configurações): com o perfil visível, a clínica aparece no diretório da landing (`/api/public/perfis`).
3. **Captação**: visitante pede avaliação na landing → vira lead no CRM (`/api/public/leads`) → arrastado até "Convertido" vira paciente automaticamente.
4. **Operação**: agenda com recorrência e check-in (incrementa sessões do pacote), prontuário SOAP, prescrição de exercícios, financeiro (pagamentos/pacotes/convênios), equipe com comissões, relatórios calculados dos dados reais.

## Estrutura

```
server/server.js      Express: API REST /api/* + serve o site estático + migrations no boot
login.html            Login / criar conta
index.html            Landing pública (diretório dinâmico)
app/*.html            Sistema (10 páginas, todas ligadas à API)
assets/js/api.js      Camada de acesso à API (fetch + JWT em localStorage)
assets/js/sidebar.js  Shell do app + guarda de autenticação
```

## API (resumo)

- `POST /api/auth/register` · `POST /api/auth/login` · `GET /api/me`
- `GET|PUT /api/clinica` — dados + perfil público (jsonb)
- `GET|POST /api/usuarios`
- CRUD genérico escopado por clínica: `fisios, pacientes, leads, sessoes, evolucoes, exercicios, prescricoes, pacotes, pagamentos, convenios`
- `PATCH /api/sessoes/:id/status` — realizada/falta (atualiza contador do paciente)
- `POST /api/leads/:id/converter` — lead → paciente
- Públicas: `GET /api/public/perfis` · `POST /api/public/leads`

## Rodar localmente

```bash
npm install
DATABASE_URL=postgres://... JWT_SECRET=qualquer node server/server.js
# http://localhost:3000
```

O schema é criado/verificado automaticamente no boot (`CREATE TABLE IF NOT EXISTS`).

## Variáveis (Railway)

- `DATABASE_URL` → referência `${{Postgres-2Cvg.DATABASE_URL}}`
- `JWT_SECRET` → segredo forte (já configurado)

## E-mail (módulo Marketing)

O envio real de campanhas usa SMTP via nodemailer. Configure no serviço do Railway:

- `SMTP_HOST`, `SMTP_PORT` (587 ou 465), `SMTP_USER`, `SMTP_PASS`
- `SMTP_FROM` (opcional, ex.: `"Clínica Movimente" <contato@movimente.com.br>`)

Sem essas variáveis, as campanhas são registradas como **simuladas** (nada é enviado).
Exemplos de provedor: Gmail (senha de app), Brevo, Resend SMTP, Amazon SES.

## Anexos do prontuário

Fotos (JPG/PNG/WebP) e PDFs até 8 MB, armazenados como `bytea` no Postgres — sem
dependência de S3. O arquivo é servido em `/api/anexos/:id/arquivo` com autenticação
por header ou `?t=<jwt>` (para `<img src>`).

## Pendências conhecidas

- Lembretes por WhatsApp são um ponto de integração futuro (ex.: Z-API / Twilio).
