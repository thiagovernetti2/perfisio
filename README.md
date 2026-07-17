# PerFisio

Diretório de fisioterapeutas e clínicas + CRM e sistema de gestão completo.

**Protótipo em HTML/CSS/JS puro** — sem frameworks, sem build.

## Estrutura

- `index.html` — landing pública: busca de profissionais/clínicas por especialidade e cidade, perfis verificados (CREFITO), seção "Para clínicas".
- `app/` — sistema de gestão:
  - `dashboard.html` — visão geral, agenda do dia com check-in, pendências, ocupação da equipe
  - `agenda.html` — calendário mensal com filtro por fisioterapeuta
  - `pacientes.html` — cadastro, filtros por status, progresso de pacotes
  - `crm.html` — funil de captação de leads (kanban drag & drop)
  - `prontuarios.html` — prontuário eletrônico com evoluções SOAP, avaliação, exercícios e anexos
  - `exercicios.html` — biblioteca de exercícios e prescrição
  - `financeiro.html` — pagamentos, pacotes/planos, convênios
  - `equipe.html` — profissionais, ocupação, produção e comissões
  - `relatorios.html` — indicadores da clínica (gráficos em CSS)
  - `configuracoes.html` — clínica, perfil público, notificações, usuários

## Rodar localmente

```bash
npm install
npm start
# abre em http://localhost:3000
```

## Deploy

Qualquer host estático ou Node (Railway, Vercel, Netlify). O `npm start` sobe o site com [serve](https://github.com/vercel/serve) na porta definida em `$PORT`.
