# AGENTS.md — Guia Definitivo para Agentes neste Repositorio

Este documento orienta agentes e colaboradores automatizados sobre como analisar, implementar e documentar funcionalidades na Ethnos_API. Siga-o para manter consistencia tecnica, seguranca e padronizacao.

## Visao Geral do Projeto
- Runtime: Node.js (>= 18)
- Framework: Express
- Entrada da aplicacao: `src/app.js`
- Organizacao:
  - Rotas: `src/routes/`
  - Controladores: `src/controllers/`
  - Servicos: `src/services/`
  - DTOs: `src/dto/`
  - Middleware: `src/middleware/`
  - Utils: `src/utils/`
  - OpenAPI: `config/swagger.config.js`
  - Documentacao gerada: `docs/`

Diretiva operacional: mantenha limpeza absoluta, clareza tecnica, hierarquia e padronizacao. Nao versionar artefatos gerados, logs, backups ou dumps. Remover conteudos fora do escopo.

## Convencoes de Resposta
- Responder via `responseFormatter` (global em `src/app.js`).
- Envelopes (ver `src/utils/responseBuilder.js`):
  - SuccessEnvelope: `{ status: 'success', data, pagination?, meta? }`
  - ErrorEnvelope: `{ status: 'error', message, code, timestamp, meta? }`
- Paginacao obrigatoria em listagens: `createPagination/normalizePagination` de `src/utils/pagination.js`.
  - Suporte a `page/limit` e `offset/limit` simultaneamente.

## Seguranca e Acesso Interno
- Endpoints protegidos exigem header `X-Access-Key` (case-insensitive: `x-access-key`, `x-internal-key`, `x-api-key`).
- Middleware: `src/middleware/accessKey.js`.
  - `requireInternalAccessKey` tenta, nesta ordem: `API_KEY`, `INTERNAL_ACCESS_KEY`, `SECURITY_ACCESS_KEY`, `API_ACCESS_KEY`, `ETHNOS_API_KEY`, `ETHNOS_API_ACCESS_KEY`, `API_SECRET_KEY`.
  - `createAccessKeyGuard` para contextos especificos.
- OpenAPI define `securitySchemes.XAccessKey`.

## Padroes de Desenvolvimento
- Validacao: `express-validator`.
- DTOs por dominio (ex.: `work.dto.js`, `person.dto.js`, `organization.dto.js`, `venue.dto.js`).
- Erros: `res.fail(...)` e `res.error(err, ...)` com `ERROR_CODES`.
- SQL direto via `sequelize.query`.
- Schema: `database/schema_data_updated.sql` como fonte.

## Documentacao (OpenAPI)
- UI: `/docs` (Swagger UI) — fonte em `/docs.json`.
- JSON: `GET /docs.json`.
- YAML: `GET /docs.yaml` (aliases: `/openapi.yaml`, `/openapi.yml`).
- Geracao via scripts:
  - `npm run docs:generate`
  - `npm run docs:generate:yaml`
- Atualize JSDoc nas rotas quando criar/alterar endpoints.
- Documente `page`, `limit`, `offset` e use `$ref` para envelopes e paginacao.

## Execucao e Ambientes
- Runtime: `/etc/node-backend.env` (fonte unica).
- Testes: `.env.test`.
- Desenvolvimento: `npm run dev`.
- Producao: `./server.sh start`.

## Scripts Importantes
- `scripts/manage.sh` — deploy, testes, Sphinx, Swagger.
  - Deploy: stop API e Sphinx, limpa caches, instala deps (inclui dev), gera docs, inicia Sphinx, indexa, repara indices quebrados, roda testes, reinicia API.
  - Indexacao: `scripts/manage.sh index` e `scripts/manage.sh index:fast`.
  - Sphinx: `scripts/manage.sh sphinx start|stop|status`.
- `scripts/generate-swagger.js` — gera `docs/swagger.json` e `docs/swagger.yaml`.
- `rsync.sh` — sincroniza o repositorio para `server@192.168.18.50:/home/server/api` e envia os indices Sphinx de `/var/lib/ethnos-api/sphinx`.

## Sphinx
- Template: `config/sphinx-unified.conf` (sem segredos).
- Config runtime: `/var/run/ethnos-api/sphinx.conf` (gerado pelo `manage.sh` a partir do `/etc/node-backend.env`).
- Runtime: `/var/lib/ethnos-api/sphinx`, logs: `/var/log/ethnos-api`, PID: `/var/run/ethnos-api/sphinx.pid`.

## Higiene do Repositorio
- Ignorar/limpar: `logs/`, `coverage/`, `venv/`, `backup/`, `database/*.sql`, `node_modules/`.
- Pastas validas: `src/`, `config/`, `tests/`, `docs/`, `scripts/`, `models/`, `ssl/`.
- Remover conteudos defasados ou fora do escopo.
- Logs do repositorio devem ser limpos no inicio de `deploy` e `restart`.
- `runtime/` nao deve conter indices do Sphinx (usar apenas `/var/lib/ethnos-api/sphinx`).
- `config/` deve conter apenas `swagger.config.js` e `sphinx-unified.conf`.

## Estilo de Codigo e Comentarios
- Comentarios proibidos em codigo, exceto Swagger JSDoc e anotacoes estritamente necessarias.
- Proibidos: TODO, FIXME, HACK, NOTE, BUG, XXX, codigo comentado.
- Logs objetivos; evite ruido.

## Estado Atual dos Endpoints
- Total documentado: 57 operacoes em `docs/swagger.json`.
- Endpoints desativados: `/signatures`, `/subjects` (raiz).
- Endpoints aninhados permanecem ativos.

## Testes
- Framework: Jest + Supertest.
- Comandos: `npm test`, `npm run test:watch`, `npm run test:coverage`.

## Referencias Rapidas
- Envelopes: `src/utils/responseBuilder.js`
- Paginacao: `src/utils/pagination.js`
- Acesso interno: `src/middleware/accessKey.js`
- Monitoramento: `src/middleware/monitoring.js`
