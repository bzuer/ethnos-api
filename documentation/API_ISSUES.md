# Ethnos API — Problemas identificados, correções e validação

Documento de gestão de problemas. Origem: auditoria completa dos 78 endpoints (2026-07-23), confrontando respostas reais da API viva (`:1211`) com o código-fonte e o swagger. Cada problema segue o ciclo **Problema → Causa raiz → Solução → Validação**.

Convenção de validação: toda correção foi aplicada em `src/` e validada numa **instância temporária em `PORT=1210`** (a `:1211` viva nunca foi tocada; deploy é do operador). Fixes de código são read-only no banco (consumer-only preservado). Todos os arquivos editados passam `node --check`.

Estado da auditoria: 92 endpoints `ok`, 9 `ok_empty` (válidos, dados ausentes por base vazia — cursos/bibliografias), 8 `degraded`, 4 `broken` → **após correção: 0 broken, 0 degraded por defeito de código**. As 212 divergências doc-vs-realidade (44 alta / 78 média / 90 baixa) de **documentação** são resolvidas na fase de swagger; este arquivo trata os defeitos de **comportamento** (15 corrigidos + 2 operador-side).

Legenda: 🟢 corrigido+validado · 📋 operador (fora do alcance da API).

Revisão integral de 2026-10-14 (código, scripts e documentação): ver **Bloco H**. Ela substitui as soluções de P2 (fonte do `/search/popular`) e P4 (fast path de `has_files`). Tolerância a erros de digitação na busca (2026-10-18): ver **Bloco I**.

Arquivos alterados nesta fase: `src/services/{metrics,autocomplete,subjects,publications,collaborations,instructors}.service.js`, `src/controllers/{metrics,persons,works}.controller.js`, `src/dto/{course,dashboard}.dto.js`, `src/routes/{dashboard,persons}.js`, `src/services/citations.service.js`, `src/app.js`, `database/required_objects.sql`.

---

## Bloco A — Endpoints quebrados (retornavam erro em vez de dados)

### P1 · 🟢 `GET /metrics/annual` → era 503 REQUEST_TIMEOUT
- **Problema:** `?limit=10` retornava 503 em ~5s, sempre. Só `limit=1` respondia.
- **Causa raiz:** `getAnnualStats` rodava `GROUP BY p.year` sobre `publications INNER JOIN works` (7,2M linhas) **sem `withTimeout`**; o join a `works` (para `avg_citations`/`total_downloads`) era o gargalo. Medições: histórico completo e só-publications >8s.
- **Solução** (`src/services/metrics.service.js` `getAnnualStats`): eliminado o join a `works`; `avg_citations = ROUND(AVG(p.citation_count),2)` (coluna denormalizada, idêntica, sem join); `total_downloads = 0` (`works.download_count` é universalmente 0/nulo); agrega **apenas os anos da página** (`SELECT DISTINCT year … LIMIT/OFFSET` → `WHERE p.year IN (…)`); `total = COUNT(DISTINCT year)`; tudo em `withTimeout` + `catch isStatementTimeout` → degradação graciosa (`summary.degraded`). Cache key `v3→v4`.
- **Validação (1210):** `GET /metrics/annual?limit=10` → **HTTP 200 em 2.86s**, 10 anos. Ano 2020: `total_publications 321204, avg_citations 1.19, open_access_percentage 71.22, total_downloads 0, unique_organizations 0`. avg_citations bate com a versão antiga com join.
- **Nota:** esta agregação ao vivo foi depois **substituída** pela leitura direta da tabela pré-computada `metrics_annual_summary` (sub-segundo, `unique_organizations` real) e `total_downloads` foi removido — ver P17. A agregação ao vivo permanece como fallback.

### P2 · 🟢 `GET /search/popular` → era 503 REQUEST_TIMEOUT
- **Causa raiz:** `getPopularTerms` fazia cross-join `works × publications × números(1..10)` com `SUBSTRING_INDEX` sobre cada palavra de título, **sem `withTimeout`**; Redis só cacheava não-vazio, nunca aquecia.
- **Solução** (`src/services/autocomplete.service.js` `getPopularTerms`): substituída a fonte pesada por agregação sobre o analytics já gravado no Redis (`search_analytics:YYYY-MM-DD`, últimos 7 dias, `lrange` limitado a 2000/dia), tally de frequência de query, top-N, filtrando `stopWords` e termos <2 chars. Nunca executa SQL; cacheia inclusive vazio (TTL 600s); fallback `[]`.
- **Validação (1210):** `GET /search/popular` → **HTTP 200 em ~1ms**, retornando os termos realmente buscados (`silva`, `kins`). Semanticamente correto ("popular" = mais buscado).
- **Nota (2026-10-14):** a única entrada gravada era o autocomplete (cada tecla); agora gravam `/search/works` e `/search/global`, e a contagem lê as até 5 000 entradas retidas por dia — ver P35.

### P3 · 🟢 `GET /subjects/{id}/works` → era 500 INTERNAL_ERROR (subjects grandes)
- **Causa raiz:** `getSubjectWorks` usava `withTimeout` mas **não capturava** `isStatementTimeout` → timeout virava 500. Ordenava por `ws.relevance_score` (sem índice composto com `subject_id`, e é placeholder uniforme) e contava via `COUNT(DISTINCT w.id)` caro.
- **Solução** (`src/services/subjects.service.js` `getSubjectWorks`): paginate-then-hydrate — id-selection `SELECT ws.work_id … WHERE ws.subject_id=? ORDER BY ws.work_id DESC LIMIT/OFFSET` (usa `idx_work_subjects_subject_work`, 0,01s), hidrata os ≤limit work_ids; `total` de `subjects.total_works`; `catch isStatementTimeout` → degradação. Filtros `year/type/language` aplicados na hidratação (under-fill possível), `min_relevance` na id-selection.
- **Validação (1210):** `GET /subjects/341907/works?limit=3` (2,8M works) → **HTTP 200 em ~4ms**, 3 rows, `total 2819809`.

### P4 · 🟢 `GET /publications?has_files=true` (isolado) → era 503 REQUEST_TIMEOUT
- **Causa raiz:** (1) count (budget 2s) e id-selection (budget 4,5s) rodavam **sequenciais** → soma >5s → 503 antes do budget de statement disparar. (2) `EXISTS(files)` correlacionado + `ORDER BY p.id DESC` gerava varredura de `publications` (>8s).
- **Solução** (`src/services/publications.service.js`): count e id-selection agora **concorrentes** (`Promise.all`) → wall-clock ≈ max(budgets) < 5s, degradando a `page_degraded` em vez de 503. Fast-path para `has_files===true` (sem full-text/venue e sort default): id-selection dirigida pela tabela `files` (`SELECT DISTINCT f.publication_id … ORDER BY … LIMIT/OFFSET`, 0,01s) → dados reais. Flag `meta.has_files_source: "files_index"`.
- **Validação (1210):** `has_files=true&limit=2` → **HTTP 200 em ~4ms**, 2 rows, todas com arquivos, `meta.has_files_source=files_index`. Combinado `has_files=true&type=ARTICLE` → **200 em 2s** com `meta.has_files_note` de under-fill.
- **Nota (2026-10-14):** o fast path passou a valer só para `has_files` sozinho na ordem padrão; com outros filtros ele devolvia páginas vazias sob um total errado — ver P37.

---

## Bloco B — Cálculos/valores incorretos

### P5 · 🟢 `GET /collaborations/top` → `ranking` era sempre `null`
- **Causa/Solução** (`src/services/collaborations.service.js` `getTopCollaborations`): o `.map` passou a `(pair, i) => formatTopCollaboration({…}, offset + i + 1)`; o DTO já emitia `ranking` do 2º parâmetro.
- **Validação (1210):** `GET /collaborations/top?limit=3` → `data[].ranking = [1, 2, 3]` (era `[null, null, null]` na 1211).

### P6 · 🟢 `/dashboard/alerts` + `/dashboard/overview` → alerta de erro falso ("208%")
- **Causa/Solução** (`src/routes/dashboard.js` `checkSystemAlerts`; alinhado em `src/dto/dashboard.dto.js`): `error_rate` já é percentual; trocado `> 0.05` por `> 5` e removido o `*100` da mensagem/`current_value`. Confirmado em `src/middleware/monitoring.js` que `error_rate = errors/requests*100`.
- **Validação (1210):** `GET /dashboard/alerts` → nenhum alerta de erro falso (>100%); `overview.error_rate` sã.

### P9 · 🟢 `GET /persons/{id}/collaborators` → `avg_shared_citations`/`timespan` sempre 0/null; `sort_by` ignorado
- **Causa/Solução** (`src/services/collaborations.service.js` `getPersonCollaborators`): espelhado o enriquecimento de `/collaborations/top` (`LEFT JOIN works`+`publications`, `AVG(citation_count)`, `MIN/MAX(pub.year)`); `sort_by` mapeado por allowlist fixa (sem interpolação crua).
- **Validação (1210):** `GET /persons/3589585/collaborators` → `avg_shared_citations 1.31`, `timespan 1975-2017`; `sort_by=avg_citations_together` → `[111, 100.5, 50, 41, 28]`.

### P11 · 🟢 `GET /instructors/{id}` → `program_ids` sempre `[]`
- **Causa/Solução** (`src/services/instructors.service.js` `getInstructorById`): adicionado `GROUP_CONCAT(DISTINCT c.program_id)` (espelhando a query de lista) + parse.
- **Validação (1210):** `GET /instructors/11111` → `program_ids [1]` (== `GET /instructors`).

### P14 · 🟢 (com ressalva) `GET /works/{id}/metrics` → anos temporais lixo
- **Causa/Solução** (`src/services/citations.service.js` `getWorkMetrics`): adicionado `AND p.year BETWEEN 1000 AND YEAR(CURDATE())+1` nas subqueries de MIN/MAX do ano de citação.
- **Validação (1210):** clamp aplicado; remove anos impossíveis (fora de 1000..ano+1). **Ressalva:** outliers *dentro* do range persistem (ex. `1970`, tipicamente epoch-default, e `2027 = ano+1`), pois são válidos pelo intervalo escolhido. Saneamento fino é dado-de-origem (ver P16).

---

## Bloco C — Parâmetros no-op / inconsistências menores

### P7 · 🟢 `GET /persons` → filtros `affiliation` e `country` eram no-op
- **Solução:** removidos de `src/routes/persons.js` (validação + `@swagger`) e de `src/controllers/persons.controller.js` (coleta). Nunca funcionaram; implementação correta exigiria joins caros (candidato operador-side).
- **Validação (1210):** `affiliation=USP` sem efeito (lista completa 4.727.444); os params não são mais aceitos/documentados.

### P8 · 🟢 `GET /persons` → `q` silenciosamente ignorado (só `search` funcionava)
- **Solução** (`src/controllers/persons.controller.js`): `q` tratado como alias de `search` (usado quando `search` ausente/vazio, após normalização de string vazia).
- **Validação (1210):** `search=silva` → total 27.846; `q=silva` → **total 27.846** (idêntico).

### P10 · 🟢 `GET /works` → `has_files` aceito mas ignorado
- **Solução** (`src/controllers/works.controller.js`): removida a coleta morta de `has_files` (nunca aplicada na vitrine). O filtro por arquivos permanece em `/publications?has_files=true`.
- **Validação (1210):** `GET /works?has_files=true&limit=2` → 200 normal; param não mais aceito.

### P12 · 🟢 `GET /courses` → `subject_count` da lista sempre 0
- **Solução** (`src/dto/course.dto.js` `formatCourseListItem`): `subject_count` emitido condicionalmente (só quando presente) → omitido na lista, mantido no detalhe.
- **Validação (1210):** `GET /courses?limit=2` → itens sem `subject_count`; detalhe inalterado.

### P13 · 🟢 `GET /metrics/collaborations` → `min_collaborations` ecoava como string
- **Solução** (`src/controllers/metrics.controller.js`): `parseInt(req.query.min_collaborations, 10) || 2`.
- **Validação (1210):** `?min_collaborations=5` → `meta.filters.min_collaborations = 5` (int).

### P15 · 🟢 `GET /` → auto-descrição desatualizada + exemplos 404
- **Solução** (`src/app.js`): reescritas `system_status.search_engine`, a descrição de busca, `technical_features.search_performance` e o log de boot para: **Manticore (SphinxQL) para works/persons; MariaDB FULLTEXT para venues (`ft_venues_search`), subjects (`ft_subjects_term`), organizations (`ft_organizations_name`); filtro de venue via `ft_venues_search`**. `quick_examples` corrigidos para rotas válidas.
- **Validação (1210):** `GET /` mostra Manticore; os 5 `quick_examples` retornam **HTTP 200**. (Efetiva-se na 1211 apenas após deploy do operador — sem impacto no serviço vivo.)

---

## Bloco D — Operador (fora do alcance da API)

### P16 · 📋 Anos futuros/epoch lixo em `publications.year`
- Dados de origem ruins (ex. `2028`, `1970` epoch). A API expõe/clampa ao intervalo válido, mas outliers dentro do range são legítimos pelo critério. Saneamento é operador-side (limpeza de `publications.year`). Registrado, não "corrigível" pela API sem heurística arriscada.

### P17 · 🟢 Pré-cálculo de agregados anuais (sub-segundo) — RESOLVIDO 2026-07-23
- **Contexto:** P1 respondia ~3s com degradação graciosa e servia `unique_organizations = 0` (COUNT(DISTINCT affiliation) por ano é caro demais) e `total_downloads = 0`.
- **Solução (operador + API):** o operador criou e populou a tabela `metrics_annual_summary` (PK `year`; `total_publications`, `unique_works`, `open_access_count`, `articles`, `books`, `avg_citations`, `unique_organizations`, `refreshed_at`) — 273 anos, com `unique_organizations` e `avg_citations` reais. A API (`getAnnualStats`) passou a **ler direto dessa tabela** (leitura indexada única por `year`, sub-segundo), derivando `open_access_percentage` e mantendo o clamp `1000..YEAR(CURDATE())+1` na leitura, com **fallback transparente** para a agregação ao vivo sobre `publications` se a tabela sumir (`isMissingTable`). Cache key `v4→v5`.
- **`total_downloads` removido:** `works.download_count` é universalmente nulo/zero e não é computado no banco; em vez de servir um `0` enganoso, o campo foi **removido** da resposta (query + DTO). Não é mais objeto da API.
- **Validação (1210):** `GET /metrics/annual?limit=10` → **HTTP 200 em ~4ms**. Ano 2026: `total_publications 205986, unique_organizations 53449, avg_citations 0.02, open_access_percentage 80.1`; nenhum `total_downloads` no payload. 36/36 testes unitários verdes. Snapshot: `backups/data.schema.2026-07-23.sql` (29 tabelas base).

---

## Bloco E — Papéis de autoria (`authorships`) — RESOLVIDO 2026-08-06

Origem: reporte do frontend sobre duas anomalias em `/works/{id}`. A investigação confirmou ambas e revelou defeitos da mesma família em 12 outros pontos do read path.

### P18 · 🟢 `position` é 1-based **por papel** → ordenação intercalava papéis
- **Problema (reportado):** no work 23816563, autor e tradutor apareciam com `position` sobreposto; a ordenação da lista de autoria não era determinística.
- **Causa raiz:** `authorships` tem PK `(work_id, person_id, role)` e `position` é numerado **dentro do papel**, não dentro do work. **162.546 works** têm colisão de `position` entre papéis. Todo o read path ordenava por `ORDER BY a.position` (ou `.sort((a,b) => a.position - b.position)`), então os papéis se intercalavam de forma arbitrária. Exemplo real, work 2052052: `AUTHOR 1 Rokne, AUTHOR 2 Alhajj, EDITOR 1 Alhajj, EDITOR 2 Rokne` era servido como `AUTHOR 1, EDITOR 1, EDITOR 2, AUTHOR 2`.
- **Solução:** novo primitivo puro `authorshipRoleOrderSql(alias)` em `src/dto/helpers.js` (`COALESCE(NULLIF(FIELD(role,'AUTHOR','EDITOR','TRANSLATOR','REVIEWER'),0),5)` — papéis desconhecidos vão para o fim) aplicado a **todas as 10 leituras de autoria**: `src/utils/hydration.js`, `works.service.js` (detalhe), `venues.service.js` (×2), `persons.service.js`, `organizations.service.js`, `courses.service.js`, `bibliography.service.js`, `instructors.service.js`. No lado JS, `compareContributors`/`sortContributors` aplicam a mesma ordem (papel → position → person_id), tornando o desempate determinístico.
- **Validação (1210):** work 2052052 → `AUTHOR 1, AUTHOR 2, EDITOR 1, EDITOR 2` (blocos por papel, position ascendente dentro do papel). 24 works com repetição entre papéis verificados contra o banco: 0 defeitos.

### P19 · 🟢 Mesma pessoa em papéis distintos inflava contagens e repetia nomes
- **Problema (reportado):** o work 19894551 devolvia **6 entradas para 3 pessoas** (o mesmo trio como `AUTHOR` e como `EDITOR`).
- **Causa raiz:** o dado é legítimo (**111.760 works** creditam alguém em mais de um papel — tipicamente quem escreveu *e* organizou o volume) e a API é consumer-only, então não cabe reescrevê-lo. O defeito era a API **tratar linha de autoria como pessoa**: `COUNT(*) FROM authorships` (8 pontos), `authors.length` (5 pontos) e listas de nomes sem deduplicação.
- **Impacto medido antes da correção:** `/publications?work_id=19894551` → `author_count: 6` (eram 3 pessoas). `/persons/182363/works` → **63 linhas para 58 works** (o work repetia uma vez por papel) e `author_string` = `"Gyan Prakash; Gyan Prakash; Michael Laffan; Michael Laffan; …"`.
- **Solução — fidelidade preservada, redundância explicitada:** `authors[]` no detalhe continua **linha-por-autoria** (suprimir esconderia o caso legítimo de autor-e-organizador). O que mudou:
  - contagens passam a contar **pessoas distintas**: `COUNT(DISTINCT a.person_id)` no SQL (8 pontos) e `countDistinctContributors()` no JS (5 pontos);
  - nomes deduplicam por `person_id` — nunca por nome, para não fundir homônimos que são pessoas distintas (`contributorNames()`);
  - o papel duplo é **exposto**, não escondido: o detalhe ganha `contributors[]` (uma entrada por pessoa, com `roles[]`), `authors_count` e `contributor_roles`;
  - `/persons/{id}/works` passa a `GROUP BY w.id` (+ `COUNT(DISTINCT w.id)` no total), com `authorship.role` = papel de maior precedência e `authorship.roles[]` listando todos. Cache key `v2→v3`.
- **Validação (1210):** work 19894551 → `authors[]` com 6 linhas (fiel), `authors_count: 3`, `contributor_roles {AUTHOR:3, EDITOR:3}`, `contributors[]` com 3 entradas cada uma com `roles: ["AUTHOR","EDITOR"]`. `/persons/182363/works` → **58 linhas / 58 distintas**, `author_string` sem repetição.

### P20 · 🟢 `first_author` podia ser o **tradutor**
- **Problema:** derivado como "primeiro da lista", que sob ordenação por `position` podia ser qualquer papel.
- **Impacto medido:** work 2096820 (`AUTHOR 1 Giora Sternberg` + `TRANSLATOR 1 Lise Garond`) → `/publications` servia `first_author: {"name": "Lise Garond"}` — o tradutor apresentado como autor.
- **Solução:** `pickPrimaryAuthor()` resolve sempre para um contribuidor de papel `AUTHOR`, caindo para o papel de maior precedência só quando o work não credita nenhum autor (volume só-organizadores). Aplicado em `work.dto.js` e `publication.dto.js`.
- **Validação (1210):** work 2096820 → `first_author: {"person_id": 291446, "name": "Giora Sternberg"}`.

### P21 · 🟢 Listagens não distinguiam tradutor de autor (limitação reportada pelo frontend)
- **Problema:** `/works`, `/works/showcase`, `/search/works` e `/search/advanced` devolviam `authors_preview[]` como strings puras, sem papel — nos resultados de busca o tradutor era indistinguível do autor, e o frontend não tinha como corrigir isso.
- **Solução:** as listagens passam a expor `contributors_preview[]` (`{person_id, name, role, roles[], position}`) ao lado de `authors_preview[]`, que permanece string[] (agora deduplicado e com autores primeiro) para não quebrar consumidores. Schemas OpenAPI novos: `ContributorPreview` e `WorkContributor` (101 → 103 schemas; 78 operações/78 paths inalterados).
- **Validação (1210):** `/search/works` sobre o work 2096820 → `contributors_preview: [{… "role":"AUTHOR" …}, {… "role":"TRANSLATOR" …}]`.

### P22 · 🟢 `author_count` das listagens era truncado pelo cap de preview
- **Problema (achado durante a varredura, não reportado):** `/works` e `/search/works` hidratam no máximo 5 pessoas por work para montar o preview e derivavam `author_count` desse array truncado — um work de 11 ou 15 autores reportava `5`.
- **Solução:** novo `hydrateAuthorCountsByWork()` em `src/utils/hydration.js` — um `COUNT(DISTINCT person_id) … GROUP BY work_id` index-only (coberto por `idx_authorships_work_person`) por página, em paralelo com a hidratação existente. O preview segue capado; a contagem passa a ser verdadeira.
- **Validação (1210):** works 23815630 e 9288167 → `author_count` 11 e 15 (antes 5 e 5), com o preview ainda em 3 nomes.

**Cobertura de testes:** 11 testes unitários novos em `tests/api.endpoints.test.js` (ordem por papel, tradutor nunca à frente do autor, volume só-organizadores, contagem distinta, homônimos não fundidos, papéis desconhecidos por último) — **47/47 verdes**; 3 asserções de contrato SQL novas em `tests/integration.smoke.test.js` (agrupamento por papel no detalhe, papel presente nas listagens, uma linha por work em `/persons/{id}/works`) — **35/35 verdes** contra MariaDB real.

**Nota de dados (operador):** parte da repetição entre papéis parece ruído de ingestão do Crossref (trio idêntico como `AUTHOR` e `EDITOR` do mesmo volume). A API é consumer-only e não reescreve `authorships`; o saneamento, se desejado, é operador-side. Enquanto isso a resposta é fiel **e** não-redundante, via `contributors[]`.

---

## Bloco F — Funcionamento real do Manticore — RESOLVIDO 2026-10-02

Origem: verificação do estado e do funcionamento efetivo do Manticore em produção (`192.168.18.175`) e continuação no servidor de desenvolvimento (`192.168.18.80`, que hoje também roda `searchd` 29.9.0). Toda medição de engine foi feita por SphinxQL direto no `searchd` do dev; toda correção foi validada numa instância temporária em `:1210` contra o mesmo `searchd` e o MariaDB do dev.

### P23 · 🟢 Relevância: título exato não chegava ao topo
- **Problema:** `q=Cultural Nationalism in Contemporary Japan` devolvia "Gender, Culture, and Disaster in Post–3.11 Japan" em #1 e nenhum dos 9 works com esse título no top 10 (produção e dev, mesmo comportamento).
- **Causa raiz:** a correção de morfologia de 2026-09-01 passou a pedir cada termo em par — `((@(title,subtitle,abstract,subjects) t) | (@(authors,venue) t))`. Cada termo ocupa então **duas posições de consulta**, e o fator `lcs` do ranker (que exige posições de consulta consecutivas) caiu para 1 em todo campo: `packedfactors()` mostra o título exato com `lcs=1` no par contra `lcs=5` na consulta simples. A expressão `sum(lcs*user_weight)*1000 + …` perdeu o sinal de proximidade.
- **Solução** (`src/services/searchEngine.service.js`): o ranker de works passa a `sum((word_count + if(min_gaps == 0, word_count, 0))*user_weight)*500 + bm25 + min(citation_count,1000)*50` — palavras distintas casadas por campo, em dobro quando contíguas. Ambos os fatores usam posições no **documento**, não na consulta, então o par de regimes não os afeta; uma frase exata pontua exatamente o que `lcs` pontuava (mesmo equilíbrio com o bônus de citações) e consultas de uma palavra ficam idênticas. O conjunto de resultados não muda (mesma expressão `MATCH`).
- **Validação:** benchmark de 25 títulos conhecidos — título exato em #1 em **19/25** (ranker anterior: 14/25; referência com `lcs` íntegro: 17/25); 6 consultas que estavam fora do top 50 voltam ao top 4, exceto "Writing Culture" (#15, preso por um work muito citado). Custo idêntico (±5 %). Via API (`:1210`): "Cultural Nationalism in Contemporary Japan", "The Religious Orders in England" e "A invenção da cultura" → #1 (antes fora do top 10).

### P24 · 🟢 Palavras-operador em maiúsculas derrubavam a busca (HTTP 500)
- **Problema:** `q=MAYBE`, `SENTENCE`, `ritual PARAGRAPH myth`, `ZONE:h1 ritual`, `ZONESPAN:…` → `500 INTERNAL_ERROR` em `/search/works` (e em todo caminho que usa `buildWorksMatch`/persons).
- **Causa raiz:** os operadores do Manticore são palavras em maiúsculas; `sanitizeMatchValue` removia os caracteres de sintaxe mas preservava a caixa.
- **Solução:** `sanitizeMatchValue` passa a minusculizar (o índice já dobra caixa via `charset_table`, então nenhum match muda).
- **Validação (1210):** as seis consultas → 200 (`MAYBE` → 4 342 works). Teste unitário + asserção de smoke novos.

### P25 · 🟢 Autocomplete não completava prefixos
- **Problema:** `/search/autocomplete?q=antropol` devolvia títulos sem relação ("A produção simultânea de masculinidades…", "Nota dos editores"); `q=malinow` sugeria "Primates" e "Blood lipids in the free-ranging howler…".
- **Causa raiz:** o termo digitado ia ao Manticore como palavra inteira (sem `*`), em todos os campos; os títulos/venues dos works casados eram agregados sem relação com o texto digitado.
- **Solução** (`fetchWorkIdsForPrefix` + `autocomplete.service.js`): cada tipo busca no seu campo (`@title`, `@authors`, `@venue`), o último termo vira prefixo (`termo*`, a partir de 3 caracteres — `min_prefix_len`), `ranker=none` com ordem por `citation_count`, `expansion_limit=128`. Sugestões de autor e venue precisam conter todos os termos digitados (sem acento/caixa). Cache `autocomplete:` → `autocomplete:v2:`.
- **Validação (1210):** `malinow` → "Bronislaw Malinowski", "Tenting with Malinowski"; `revista de antrop` → "Revista de Antropologia"; 6–80 ms.

### P26 · 🟢 Ordenações por atributo pagavam o ranking inteiro (503 em produção)
- **Problema:** em produção, `/search/works?q=the&sort_by=id&sort_order=desc&limit=1` (a checagem de frescor documentada) → **503** após 5 s; o `ORDER BY id DESC` sobre 5,25 M matches levou 2,16 s no `searchd`.
- **Causa raiz:** ordenações por atributo e todos os `COUNT(*)` usavam o ranker padrão, calculando proximidade/BM25 para milhões de documentos cujo peso é descartado.
- **Solução:** `ranker=none` nas ordenações `cited_by_count|references_count|publication_year|id` e em todo `COUNT(*)` (works e persons). Contagens idênticas com e sem ranker (verificado).
- **Validação (dev):** `q=the` — `COUNT(*)` 0,167 → 0,054 s; `id DESC` 0,299 → 0,182 s; `cited DESC` 0,183 → 0,071 s. API `:1210`: 0,26 s.

### P27 · 🟢 `works_delta` relia o corpus inteiro (~14 min para 16 mil works)
- **Problema:** em produção, o `init` de 2026-10-01 gastou ~14 min só em `works_delta` (16 295 docs).
- **Causa raiz:** os ids atualizados na janela de 48 h se espalham por quase todo o intervalo (2,16 M … 24,21 M = 441 passos de 50 000); as queries de MVA e `sql_joined_field` filtravam só por `work_id BETWEEN $start AND $end`, logo liam autorias, assuntos e publicações de todos os works de cada passo.
- **Solução** (`config/manticore.conf`): cada query de MVA/campo unido do delta faz `JOIN works … AND updated_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR)`. A janela fica inline: uma tentativa com variável de sessão (`SET @delta_since` em `sql_query_pre`) foi **rejeitada** porque o indexer roda essas queries em conexões que não executam `sql_query_pre` — a variável lê `NULL` e esvazia em silêncio autores, assuntos, venue e MVAs (o build "funciona" e reporta o mesmo número de docs).
- **Validação (dev, build em scratch, sem tocar o `searchd`):** antigo **193,9 s** → novo **20,8 s**; mesmos 16 295 docs e 14 555 530 bytes; dicionário idêntico (230 426 entradas: keyword, docs, hits), atributos e MVAs idênticos para todos os docs, kill-list idêntica (16 295 ids).

### P28 · 📋 Bug do Manticore 29.9.0: corrupção de heap no ranker de expressão
- **Achado:** `searchd` aborta (`free(): invalid size` em `~RankerState_Expr_fn<false,true>`) quando, sob `ranker=expr(…)`, **duas palavras-chave da consulta acertam a mesma posição do documento** com ≥ 2 átomos na consulta. Reproduzido 4 vezes no dev: `(social) | (<par>)`, `(social | =social)` e `<par> soc*` — nos campos com stem cada posição guarda o stem **e** a forma exata (`index_exact_words=1`). O formato em produção (par com máscaras disjuntas) nunca coloca dois átomos na mesma posição e passou em todos os testes, inclusive palavras repetidas; nenhum crash em produção.
- **Consequência para a API:** nunca combinar sob o ranker de expressão um ramo sem máscara ou um curinga sobre os campos com stem com outro átomo do mesmo termo (`t | =t`, ramo de frase, `MAYBE`, união com a consulta simples). O autocomplete usa curingas apenas com `ranker=none`.
- **Operador:** reportar upstream (o dump fica no journal de `manticore.service` do dev, 2026-10-02 15:08–15:24).

**Cobertura de testes:** 8 testes unitários novos (minúsculas/operadores, construtor de prefixo, ranker por caminho, `ranker=none` em contagens e ordenações, autocomplete sem ranker de expressão) — **64/64 verdes**; 3 asserções de smoke novas (título exato em #1, palavras-operador, prefixo no autocomplete) — **41/41 verdes** em `:1210`; as 3 falham contra o código anterior em `:1201`. Caches com ordem alterada: `search:works v3→v4`, `search:global →v2`, `works:list v6→v7`, `publications:list v3→v4`.

**Notas de operação (📋):**
- O índice do dev está defasado: último `init` em 2026-09-27 23:13; tem 36 159 works a mais que o MariaDB e não tem os ids > 24 203 721. As atualizações de 2026-09-28 já saíram da janela de 48 h, e as de 2026-09-30 saem por volta de 22:45–23:20 de 2026-10-02. Precisa de `reindex.sh all` (sudo).
- Nenhum host tem os timers de reindexação instalados (decisão do operador); sem eles, o prazo de 48 h é inteiramente manual.
- Dados: há pessoas cujo `preferred_name` é nome de organização/periódico ("Centro de Investigaciones y Estudios S…", "Antípoda Revista de Antropología…") e nomes com mojibake (`Comit� Antropol�tica`); aparecem como sugestões de autor.

### P29 · 🟢 `/works/{id}` não expunha a relação resenha ↔ obra resenhada
- **Problema (pedido):** `publications.reviewed_id` (FK → `works.id`) liga cada publicação-resenha à obra que ela resenha — 25 248 publicações, quase todas `REVIEW`, cobrindo 19 713 obras resenhadas (máx. 10 resenhas por obra) — mas a API não lia a coluna: a página de um livro não mostrava suas resenhas e a de uma resenha não dizia o que ela resenha.
- **Solução** (`works.service.js` `_fetchReviewRelations` + `formatReviewRelations` em `work.dto.js`): novo bloco `review_relations` em `/works/{id}`, nos dois sentidos — `reviews_of[]` (obras que esta resenha, com autores e `via_publication_ids`) e `reviewed_by[]` (publicações que resenham esta obra: periódico com `name`/`abbreviated_name`, ano, DOI, resenhistas), com `reviewed_by_total`/`reviewed_by_has_more` (cap 50). Cada entrada de `publications[]` ganha `reviewed_work_id`. As 138 autorreferências (resenha colapsada dentro do work do próprio livro) aparecem só em `reviewed_by`, com `same_work: true`. Duas queries indexadas (`work_id`, `idx_pub_reviewed_id`) em paralelo com o resto do detalhe; em erro, degrada para o bloco vazio. Cache `work:v5 → v6`; schemas OpenAPI `WorkReviewRelations`/`ReviewedWorkRef`/`WorkReviewEntry` (103 → 106).
- **Validação (1210):** 23384268 (resenha) → `reviews_of` = 23400326 (*Environmental Magnetism*, Thompson & Oldfield); 23400326 → `reviewed_by` = a resenha em *Quaternary Science Reviews* (1987); 23257897 (*Europe and the People without History*) → 10 resenhas; 2515627 (*Ritual*) → resenha colapsada com `same_work: true`; 2578145 → resenha de duas obras. 4 testes unitários (68/68) e 1 asserção de smoke bidirecional (42/42).

### P30 · 🟢 `/publications/{id}` também passa a expor resenha ↔ obra resenhada
- **Pedido:** estender P29 ao detalhe da publicação.
- **Solução:** as duas leituras saem de `works.service.js` para o helper compartilhado `src/utils/reviewRelations.js` (`fetchReviewRelations({ workId, publicationId? })`), usado pelos dois detalhes. `/publications/{id}` (e o resolvedor `/{doi}`, que passa pelo mesmo serviço) ganha `reviewed_work_id` e o mesmo bloco `review_relations`, com escopo de publicação: `reviews_of` = a obra que **esta** publicação resenha (0 ou 1 entrada; a resenha colapsada no work do próprio livro lista esse work com `same_work: true`) e `reviewed_by` = as resenhas do work-pai (todas as manifestações de um livro resenhado as mostram). `formatPublicationDetails` emite os dois campos; `formatPublicationEntry` (entradas de `publications[]` em `/works/{id}`) mantém `reviewed_work_id` e descarta o bloco. `ReviewedWorkRef` ganha `same_work`. Cache `publication:v3 → v4`.
- **Validação (1210):** 1128473948 (resenha) → `reviews_of` = 23400326; 1128490006 (o livro) → `reviewed_by` = a resenha de 1987; 1022378 (resenha colapsada) → `reviews_of` = o próprio work-pai com `same_work: true`; 4258735 (livro do mesmo work) → as 2 resenhas; `/10.1016/0277-3791(87)90024-2` → mesmo payload de 1128473948; `/works/{id}` inalterado. 4 testes unitários novos (72/72); a asserção de smoke bidirecional cobre os dois detalhes (42/42).

## Bloco G — Auditoria de índices e desempenho de `/venues` — RESOLVIDO 2026-10-14

### P31 · 🟢 Detalhe de venue chegava a 4,9 s e perdia `recent_works` em silêncio
- **Pergunta:** `/venues` exige algum índice inexistente? **Não.** Todo caminho de acesso já tem índice (`publications.venue_id` via `idx_publications_venue_year_oa`, PK de `venue_subjects`, `venues.publisher_id` via `idx_venues_publisher`, buscas por PK). A lentidão vinha da forma das queries.
- **Problemas medidos (dev, 1ª requisição sem cache):** `/venues/1074172` 4,91 s (teto da requisição: 5 s); `/venues/1012326` 4,51 s com `recent_works: []` — o log registra `Recent works failed for venue 1012326: … max_statement_time exceeded`, porque o otimizador lia 588 mil entradas de `idx_publications_year` (ordem `year, id`) atrás de 10 linhas da venue; `top_authors` resolvia o nome de **toda** linha de autoria da venue (3,1 s) e contava linhas de autoria, não obras (958655: 176 → 175; 3580908: 53 → 48); a listagem ordenava 360 mil linhas largas (resumo + justificativa LLM) por filesort (0,7–1,0 s em qualquer ordenação, inclusive `sortBy=id`); a busca juntava as 1,08 M organizações para casar o nome da editora; 50 346 venues empatam em (`total_score`, `name`), então páginas vizinhas podiam repetir ou pular linhas.
- **Solução** (`venues.service.js`): listagem em duas fases (seleção só de `v.id`, depois hidratação por PK); desempate final `v.id ASC` e `sortBy=id` sem desempates; nome da editora por semi-join sobre as ~17 mil organizações referenciadas por venues; `top_authors` agrega por pessoa com `COUNT(DISTINCT work_id)` e `LIMIT` antes de juntar `persons`; `recent_works` e o padrão de `/venues/{id}/works` ordenam por `p.year DESC, p.work_id DESC` (o mesmo índice da venue serve a ordem; `recent_works` passa a ser exatamente a página 1 da listagem); `top_publications`, `yearly_stats`, filtros e ordenações de citação de `/venues/{id}/works` usam o espelho `publications.citation_count`/`reference_count` (0 divergências contra `works` em 2026-10-14) e a contagem dispensa o JOIN com `works` (FK `NOT NULL`). Também passa a expor `identifiers.mohrsiebeck_category_id` (183 `BOOK_SERIES`), coluna que o contrato de exposição integral deixava de fora. Caches: `venues:list v9→v10`, `venue v8→v9`, `venues:search v7→v8`.
- **Validação (1210, antes → depois):** `/venues` 0,97 → 0,20 s; `sortBy=id` 0,70 → 0,04 s; `search=anthropology` 0,75 → 0,36 s; `/venues/1074172` 4,91 → 0,30 s; `/venues/1012326` 4,51 → 0,07 s (com `recent_works`); `/venues/1074172/works?sort_by=cited_by_count` 0,54 → 0,06 s. Payloads idênticos ao código anterior, exceto o novo identificador, os empates agora resolvidos por id e as contagens de `top_authors` corrigidas. 72/72 unitários; 3 asserções de smoke novas (ordem e `recent_works` = página 1, busca pelo nome da editora, páginas disjuntas) — 44/44 verdes.
- **Operador (📋, opcional):** `idx_eissn` duplica a `UNIQUE KEY eissn`; o `DROP` está proposto em `database/required_objects.sql`.

## Bloco H — Revisão integral (código, scripts, documentação) — RESOLVIDO 2026-10-14

Validação comum a todo o bloco: instância temporária em `PORT=1210` com o código novo (a `:1201`/`:1211` viva não foi tocada); 81/81 testes unitários, 53/53 de smoke contra o banco real, varredura de 109 casos (todas as 78 operações + bordas) com 0 falhas e nenhuma resposta fria acima de 1,9 s; ESLint (`no-undef`, `no-unused-vars`) limpo em `src/`, `scripts/` e `config/`; precheck estrutural 34/34.

### P32 · 🟢 O cache Redis nunca gravava nada
- **Problema:** produção rodava, na prática, sem cache.
- **Causa raiz:** `cache.service.js` chamava `setex` num cliente node-redis v6 (o método é `setEx`); toda escrita lançava exceção e era engolida. TTLs numéricos passados pelos serviços eram ignorados.
- **Solução:** `cache.service.js` reescrito sobre o cliente compartilhado (`getActiveRedisClient`, `setEx`, `resolveTtl`); fallback em memória limitado a 5 000 entradas; conexão com tentativa limitada (1 s, 3 retries) e 10 s de espera, para que uma queda do Redis nunca trave requisições.
- **Validação:** teste unitário de `resolveTtl`; com Redis ativo, a segunda chamada idêntica é servida do cache.

### P33 · 🟢 Todos os clientes da internet dividiam um único balde de rate limit
- **Causa raiz:** o túnel cloudflared conecta-se ao nginx por loopback; com `trust proxy = 1`, o salto do cloudflared virava `req.ip`, e todo o tráfego externo contava como um só cliente (120/min para todos).
- **Solução:** `trust proxy = 'loopback'` (todo salto loopback é descartado). Limitadores por classe (inertes, mas sobrescreviam os cabeçalhos `RateLimit-*`) e quatro reaplicações do limitador geral (contagem dupla) removidos; um balde por IP. `/security/stats` lista os clientes realmente limitados (`{ip, limited_since, resets_at}`) e `POST /security/unblock/{ip}` zera os contadores (antes era sempre um no-op).
- **Validação:** `X-Forwarded-For` com cadeia loopback resolve o IP real; `/security/stats` e `/security/unblock` com os payloads documentados em `domains/security.md`.

### P34 · 🟢 Consultas sem orçamento seguiam rodando no master depois do 503
- **Causa raiz:** ~105 pontos de consulta sem `withTimeout`; uma requisição encerrada em 503 deixava a consulta rodando por até 32 s no master.
- **Solução:** as duas pools (Sequelize e mysql2) iniciam toda conexão com `SET SESSION max_statement_time` abaixo do teto da requisição; `withTimeout` continua reduzindo o orçamento onde preciso (contagens: 2 s). `res.error` e o handler global mapeiam estouro de orçamento para **503 `REQUEST_TIMEOUT`**.
- **Validação:** nenhuma consulta da API sobrevive à sua requisição; o componente OpenAPI `RequestTimeout` documenta o 503.

### P35 · 🟢 Busca: palavras SQL rejeitadas, curingas vivos, resultados truncados em silêncio
- **Problemas:** `q=european union` dava 400 (lista negra de palavras SQL); o sanitizador do `MATCH` mantinha `?` e `%`, curingas reais (`q=culture?` casava 6% de `culture`) e o formato que derruba o `searchd` 29.9.0 sob o ranker de expressão; páginas além da janela de 100 000 resultados davam 500; o `/search/popular` só recebia as teclas do autocomplete.
- **Causa raiz adicional (encontrada nesta revisão):** com `max_query_time` estourado, o Manticore **não falha**: devolve o que achou até ali (um `COUNT(*)` pode voltar `0`) com apenas um `warning` em `SHOW META`, e a API reportava esse resultado parcial como exato.
- **Solução:** sanitizador por lista branca (letras, marcas, dígitos, `_`, espaço); lista negra SQL removida; janela de 100 000 → 400; `max_query_time=4000` em toda consulta e leitura de `SHOW META` (`queryWithMeta`): página truncada → 503 `REQUEST_TIMEOUT`, contagem truncada → `pagination_total_exact: false` com limite inferior, e esses resultados não entram no cache. `/search/works` e `/search/global` gravam o analytics; o autocomplete não.
- **Validação:** reproduzido no `searchd` (`COUNT(*) … max_query_time=1` → `0` + warning); dois testes unitários novos cobrem página e contagem truncadas; `q=european union` → 200.

### P36 · 🟢 `/works`: filtros com ordenação davam 503 e filtros raros esvaziavam páginas
- **Problemas:** `type=ARTICLE&sort_by=cited_by_count` → 503; `sort_by=references_count&sort_order=asc` → 500; `venue_id` ignorado; `peer_reviewed=false` colidia com `true` na chave de cache. A primeira correção (varrer o índice de `works` testando cada obra) resolveu os filtros comuns, mas regrediu os raros: `type=PREPRINT&limit=100&page=2` levava 4,5 s e devolvia página vazia degradada.
- **Solução:** três planos de seleção de ids — (1) ordem por id com filtro de publicação: página lida do índice de `publications` (`GROUP BY p.work_id ORDER BY p.work_id`); (2) ordenação por citações/referências/ano com filtro de publicação: conjunto exato ≤ 250 000 obras ordenado via `IN`, conjunto maior varrido pelo índice de `works` com verificação correlata; (3) sem filtro de publicação: índice de `works`. Chave de cache construída dos filtros normalizados; `venue_id` aplicado (400 se combinado com texto livre).
- **Validação (frio, 1210):** `type=PREPRINT&page=2/15` 4,5 s vazia → 0,02–0,03 s com 100 linhas; `type=THESIS&page=50` 0,03 s; `venue_id=1012159&page=2` 0,02 s; `type=ARTICLE&limit=100&page=1000` 0,32 s; `type=BOOK&sort_by=cited_by_count&page=3` 0,46 s; `type=ARTICLE&sort_by=cited_by_count` página em 0,02 s. Asserções de smoke novas para os filtros raros.

### P37 · 🟢 `/publications`: `has_files` com outros filtros, contagem lenta, validação frouxa
- **Problemas:** o fast path de `has_files` rodava também com outros filtros e devolvia páginas vazias sob um total "exato" errado; `has_files=false` materializava o índice inteiro de `files`; a contagem juntava `works` sempre (`type=ARTICLE` > 20 s); `type=foo` e `q=a` respondiam 200 vazio; as linhas de citação usavam `year` (a convenção é `publication_year`) e listavam todos os contribuidores (até 34 kB por linha).
- **Solução:** fast path só com `has_files` sozinho e ordem padrão (total exato de `files`, 6 239 322); demais casos com verificação correlata por linha; contagem junta `works` só quando o filtro exige; `q`/`search` 2..200, `type` no enum de 12 valores, `venue`/`venue_name` 2..255; linhas de citação com `publication_year`, 3 nomes e `authors_count` exato.
- **Validação:** `type=ARTICLE` conta exatamente 7 055 450 em 0,8 s; `type=foo` e `q=a` → 400.

### P38 · 🟢 Colaborações vazias, 503 e totais falsos
- **Problemas:** quatro instruções seriais de até 4,5 s cada: `/collaborations/top` devolvia "sucesso" vazio ou 503 com filtro de ano; escalas de força diferentes por endpoint; páginas além do fim reportavam `total = offset` (`page=1000&limit=5` → 4 995, real 1 126); falhas viravam 500 mesmo em estouro de orçamento.
- **Solução:** uma única instrução (`rankCollaborationPairs`: CTE sobre as 2 000 pessoas mais produtivas, papel AUTHOR, deduplicação por obra, total por `COUNT(*) OVER ()`) compartilhada com `/metrics/collaborations`; uma escala de força; página além do fim recalcula o total; o controller passa por `res.error` (503 em estouro).
- **Validação:** `/collaborations/top` ~1,1 s com total exato; asserção de smoke de página além do fim.

### P39 · 🟢 Instituições, métricas, citações e painel
- **Problemas:** busca de instituições em modo natural (qualquer termo; `Toronto Rehabilitation Institute` em ~657º, atrás do MIT); siglas com caixa mista não casavam; `funded_works_count` contava linhas de financiamento; `/metrics/*` com página profunda → 500 e resumo anual só da página; citações mascaravam falhas como zeros; o painel exibia constantes (`rollback_active`, `index_size_mb`, conexões) e `error_rate` contava 4xx.
- **Solução:** busca booleana com todos os termos (`+term*`) ou sigla exata sem caixa, ordenada por sigla, nome exato, porte e relevância; `COUNT(DISTINCT work_id)` e `grant_numbers[]`; rankings com `offset + índice + 1`; resumo anual sobre todos os anos com `refreshed_at`; citações propagam o erro; painel com telemetria real, sondas de dependência e `error_rate` = 5xx.
- **Validação:** `/institutions?q=Toronto Rehabilitation Institute` no topo; `/institutions?q=USP` 0,83 s frio; capítulos `institutions.md`, `metrics.md`, `dashboard.md` com payloads ao vivo.

### P40 · 🟢 Assinaturas, assuntos, pessoas, cursos e bibliografias
- **Problemas:** `/signatures/search?q=a` dava 503 e a consulta seguia 32 s no master; `/subjects/{id}/works` aplicava filtros **depois** da paginação (páginas vazias antes dos resultados); `/persons` tinha um fallback `LIKE` sem índice e `recent_works` repetia obras; leituras de bibliografia agregavam o corpus inteiro por `work_id`; `/bibliographies/statistics` calculava a média de obras por curso como Σn²/Σn; listagens aninhadas de cursos, assinaturas e `/works/{id}/bibliographies` aceitavam qualquer valor (e esta última nunca dava 404).
- **Solução:** busca de assinaturas por substring percorrida na ordem do índice (para na página), contagem com orçamento de 2 s; filtros de assuntos na seleção de ids; busca de pessoas só pelo Manticore, uma linha por obra com `roles[]`; junção da última publicação compartilhada; média simples por curso; validadores (`page`, `limit`, `offset`, `role`, `reading_type`, `week_number`, `vocabulary`) e 404 para obra inexistente.
- **Validação:** `q=silva` 0,68 s frio; asserções de smoke de 400/404.

### P41 · 🟢 Plataforma: horários, erros, paginação
- **Problemas:** carimbos de tempo +3 h (o conector lia `TIMESTAMP` como hora local de Node); origem CORS não permitida → 500; JSON malformado → 500; `offset` era arredondado para a fronteira de página; `/docs.json` vinha dentro do envelope.
- **Solução:** `keepDefaultTimezone` + `timezone: 'local'`; erros de cliente → 4xx (corpo > 16 kB → 413), envelope sempre `status: "error"`; `offset` servido como enviado e ecoado em `meta.pagination_extras.offset`; OpenAPI cru.
- **Validação:** obra 24224223 → `2026-10-08T20:23:23Z`, o mesmo instante que o `17:23:23` (UTC−3) gravado no banco (antes saía `23:23:23Z`); asserções de smoke de CORS, JSON malformado, offset e `/docs.json`.

### P42 · 🟢 Documentação, scripts e repositório
- **Problemas:** o payload raiz e o CLAUDE.md afirmavam uma busca FULLTEXT de assuntos que não existe; `README.md` citava `server.sh`, um `.env` de exemplo inexistente e `GRANT ALL`; `CITATION.cff` falava em Sphinx, 86 endpoints e 1,16 milhão de obras; `manage.sh` limpava o cache com `FLUSHALL` (apagando o analytics), não abortava o deploy com testes falhando e reportava sucesso com verificações falhas; `process.sh dev` apagava os logs do serviço em execução.
- **Solução:** textos corrigidos; `README.md`, `CITATION.cff` e `RUN_ORDER.md` reescritos; os 17 capítulos de `domains/` revisados contra o código e payloads ao vivo; componente OpenAPI `RequestTimeout`; `manage.sh` remove só os prefixos de cache da API, aborta o deploy em falha e sai com código ≠ 0; código morto, fixtures Jest e dependências sem uso removidos.

### P43 · 📋 Pendências do operador
- A conta `dev` tem `ALL PRIVILEGES … WITH GRANT OPTION`; a proposta de conta só-`SELECT` está em `database/required_objects.sql`.
- 🟢 `/etc/node-backend.env` estava com modo 0655 (legível por qualquer conta local) com senha e chaves; **aplicado 2026-10-14:** `0600`, dono `ubuntu`. Ele ainda define variáveis que o código não lê mais (`RATE_LIMIT_SEARCH`, `RATE_LIMIT_METRICS`, `RATE_LIMIT_RELATIONAL`, `ENABLE_HTTPS`, `HTTPS_PORT`, `SPHINX_ENABLED`, `COLLAB_QUERY_TIMEOUT_MS`, `COLLAB_FORCE_FALLBACK`, `DISABLE_ORG_RESEARCHER_SORT`, `DEFAULT_LIMIT`, `MAX_LIMIT`, `UPLOAD_PATH`, `MAX_FILE_SIZE`, `LOG_FILE`, `API_VERSION`).
- `CORS_ORIGINS` no servidor de desenvolvimento permite apenas `localhost:3000/3001`.
- O índice Manticore do servidor de desenvolvimento está defasado (7 673 100 obras indexadas contra 7 657 142 no MariaDB; ~137 mil pessoas fora da busca): `sudo scripts/manticore/render-config.sh && sudo scripts/manticore/reindex.sh all`.
- `metrics_annual_summary` não é atualizada desde 2026-07-23.
- 🟢 Índices redundantes (`venues.idx_eissn`, `persons.idx_persons_preferred_name`, `persons.idx_family_name`, `signatures.idx_signatures_signature`, `signatures.idx_signature_search`) e `work_subjects.idx_subject` (provoca `index_merge` ruim): **aplicado 2026-10-14**; snapshot `backups/data.schema.2026-10-14_14-31.sql` difere do anterior exatamente nesses seis índices. Efeito medido: `/signatures/search` com termo sem ocorrência 3,2 s → 0,52 s (a contagem passou a varrer `uq_signature` só pelo índice); demais endpoints afetados inalterados ou mais rápidos.

### P44 · 🟢 Pendências de código que haviam ficado em aberto
- **Escape HTML da entrada corrompia buscas e DOIs.** Um passe `xss()` reescrevia todo valor de query e body (`<` → `&lt;`). Efeitos medidos: `/publications?doi=` não encontrava nenhum dos 10 155 DOIs SICI que contêm `<`/`>` (o resolvedor por caminho funcionava, porque parâmetros de caminho não passavam pelo filtro); `q=p<0.05` virava `p&lt;0.05` e o Manticore exigia o token `lt` (21 resultados em vez de 27 658), e `meta.query` ecoava o texto escapado. A proteção não protegia nada: o SQL é parametrizado, a entrada do Manticore passa por lista branca e as respostas são JSON com `nosniff` e CSP. **Solução:** o passe e a dependência `xss` foram removidos (`sanitization.js` mantém só o `express-mongo-sanitize`, que age sobre chaves); o texto é devolvido cru e o escape fica para a renderização no cliente. **Validação:** o DOI SICI devolve 1 publicação; `q=p<0.05` → 27 658, eco `p<0.05`.
- **Filtros densos esperavam o orçamento da contagem em toda página.** `/works?type=ARTICLE` (e `open_access`, assuntos multimilionários com filtro) levava 2 s em cada página e em cada troca de ordenação, porque a contagem estourava os 2 s sempre. **Solução:** `cacheService.rememberCount` guarda o resultado da contagem por conjunto de filtros (exata 1 h, estimativa 10 min) em `/works`, `/publications` e `/subjects/{id}/works`. **Validação:** primeira requisição 2,0 s; demais páginas, ordenações, `/works/showcase` e `/search/works` com os mesmos filtros ~0,005 s; teste unitário novo.
- **Campos redundantes em `/instructors/{id}/statistics`** (`name_variations` sempre `[]`, `confirmed_authorships` cópia de `works_authored`, `author_string`/`first_author_name`/`authors_array` cópias de `author_name`, `signature_consistency_score` sem sentido com uma assinatura por pessoa): removidos do serviço, do DTO, do schema OpenAPI e da documentação; cache `v2 → v3`.
- **`init.sh` local obsoleto** (criava `/var/run/ethnos-api` e copiava `config/sphinx-unified.conf`, ambos inexistentes, antes de `manage.sh restart`): removido junto com sua entrada no `.gitignore`.

## Bloco I — Tolerância a erros de digitação na busca — RESOLVIDO 2026-10-18

### P45 · 🟢 Uma palavra errada ou um erro de digitação zerava a busca
- **Problema:** `lkuiz fernando dias duarte` não devolvia nada em `/works`, `/search/*`, `/persons` e `/publications`, e o autocomplete também não sugeria nada. `luiz fernando dias duarte` devolve 56 obras e a pessoa Luiz Fernando Dias Duarte. O mesmo acontecia com uma palavra válida que não aparece junto das demais: `durkheim suicide nervosa` → 0.
- **Causa raiz:** toda busca exige todos os termos (AND). Um termo ausente do índice (`lkuiz`: 0 documentos no dicionário do Manticore) ou incompatível com os outros esvazia o resultado inteiro, e não havia nenhum mecanismo de correção. A correção nativa do Manticore (`CALL SUGGEST`, `OPTION fuzzy=1`) exige dicionário com infixos (`min_infix_len`), ausente nas tabelas (só `min_prefix_len = 3`). Ativá-lo pediria reconstruir a tabela `works` (8 GB, ~64 min em produção) e multiplicaria seu tamanho. Além disso, o `fuzzy` do Buddy reescreve o `MATCH` com alternativas `OR` fora do nosso controle, justamente o formato que derruba o `searchd` 29.9.0 sob o ranker de expressão.
- **Solução** (no lado da API, sem reconstruir o índice, com leituras somente no Manticore; `src/utils/spelling.js` puro e orquestração em `src/services/searchEngine.service.js`):
  - **Quando a consulta literal não tem resultado**, cada termo é consultado no dicionário da própria tabela com `CALL KEYWORDS(..., 1 AS stats)`. Os candidatos são a vizinhança completa de distância 1 (remoção, inserção, troca e transposição adjacente; ~300–650 palavras exatas por termo, numa só chamada, 2–15 ms) e, para palavras ausentes de 6 letras ou mais, a distância 2, por expansão de prefixos de 4 letras (`mali*` para `malinowksy`, 3–40 ms).
  - Um termo ausente do dicionário pode ir a 2 edições. Um termo existente só a 1, e só para uma palavra muito mais frequente (×20), ou como candidato "de contexto".
  - Cada reescrita é julgada pela consulta inteira: `COUNT(*)` + `SUM(citation_count)` em obras, ou `SUM(total_works)` em pessoas, sempre com `ranker=none` e 500 ms. Cada edição custa ×20, e reescritas que mudam menos termos são avaliadas primeiro (parando no primeiro nível com resultado).
  - Se nenhuma correção dá resultado, descarta-se o termo de `q` que conflita com os demais. A escolha maximiza ln(resultados ponderados) + ln(frequência do termo descartado), ou seja, prefere manter o consenso e largar a palavra comum. Termos inexistentes e sem correção também são descartados.
  - `author`/`subject`/`venue_name` são corrigidos, nunca descartados. Não há revisão quando o zero se explica pelos filtros estruturados: o texto sozinho é contado e, se casar, a revisão é abortada.
  - A resposta serve a consulta revisada e a descreve em `query_revision` (`status: corrected|relaxed`, `applied: true`).
  - **Quando a consulta literal tem resultado** (só na primeira página), um termo raro (≤ 1 000 documentos) a 1 edição de uma palavra cuja consulta casa ≥ 20× mais gera apenas sugestão (`status: suggested`, `applied: false`).
  - `autocorrect=false` transforma toda revisão em sugestão (para o link "buscar por …"). Vale em `/works`, `/search/{works,advanced,global,persons}`, `/persons` e `/publications`. Em `/search/global` cada bloco traz o seu `query_revision`.
  - O autocomplete, quando não acha sugestão, corrige as palavras completas e devolve as sugestões do texto corrigido com `data.query_revision`. A última palavra é tratada como prefixo em digitação e só é corrigida se nenhuma palavra do dicionário começa com ela ou se o prefixo não casa ao lado das demais.
  - **Segurança do `searchd`:** nenhuma forma nova de `MATCH`. A consulta revisada usa exatamente os pares por termo já existentes, só que com outras palavras. As contagens usam `ranker=none`, os curingas só aparecem em `CALL KEYWORDS` e em contagens `ranker=none`, e as palavras de substituição são restritas a `[a-z]+`.
  - Limites: revisão pulada se a busca literal levou mais de 1 s; no máximo 4 contagens simultâneas (o pool do Manticore tem 5 conexões); a página revisada herda o tempo restante do orçamento de 4 s. Qualquer falha devolve o resultado literal.
  - Chaves de cache: `works:list:v9`, `search:works:v6`, `search:persons:v3`, `search:global:v4`, `persons:search:v4`, `publications:list:v6`, `autocomplete:v3` (que agora também inclui o `limit`, antes ausente da chave).
- **Validação:**
  - Instância temporária em `PORT=1210`, índice de desenvolvimento.
  - `lkuiz fernando dias duarte` → 56 obras (`luiz`), a pessoa correta em `/search/persons` e `/search/global`, 54 publicações em `/publications`, sugestões no autocomplete (`lkuiz fernando d`).
  - Correções: `eduardo viveiros de castor` → `castro` (368), `claude levi strass` → `strauss` (1 546), `malinowksy argonauts` → `malinowski` (75, 2 edições), `antorpolgia da religiao` → `antropologia` (491), `marcel maus dadiva` → `mauss` (61), `clifford gertz` → `geertz` (1 044), `roberto damata carnavais` → `damatta` (11), pessoas `marcel maus` → `mauss`, `lilia schwarz` → `schwarcz`, `darcy ribero` → `ribeiro`.
  - Relaxamentos: `durkheim suicide nervosa` → `durkheim suicide` (508), `levi strauss tristes trópicos kula` → sem `kula` (38), `luiz fernando silva duarte` (pessoas) → sem `silva`.
  - Sugestões não aplicadas: `bourdeiu distinction` (2 → 1 181), `pierre bordieu` (38 → 6 000), `antropolgia urbana` (8 → 6 667).
  - Consultas corretas intactas: `etnografia urbana`, `kula ring`, `movimentos sociais`, `gilberto freire casa grande senzala`.
  - Custo extra: 15–130 ms numa consulta com zero resultados, 1–3 ms numa consulta com resultado.
  - `searchd` sem reinício (`NRestarts=0`) durante todos os testes.
  - 104/104 testes unitários (22 novos, incluindo um Manticore falso que confere que nenhum `MATCH` sob o ranker de expressão contém `*` ou `=`) e 59/59 de smoke (5 novos).
  - No índice defasado do servidor de desenvolvimento faltam algumas pessoas atualizadas recentemente (Clifford Geertz, Bronislaw Malinowski, Roberto Damatta). Nesses casos a busca de pessoas cai no relaxamento; o reindex pendente em P43 resolve.

---

_As divergências puramente de documentação (schemas OpenAPI, parâmetros, enums, descrições) são corrigidas diretamente em `config/openapi.schemas.js`, nos blocos `@swagger` das rotas e nos capítulos de `documentation/domains/`._
