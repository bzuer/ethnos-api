# Ethnos API — Problemas identificados, correções e validação

Documento de gestão de problemas. Origem: auditoria completa dos 78 endpoints (2026-07-23), confrontando respostas reais da API viva (`:1211`) com o código-fonte e o swagger. Cada problema segue o ciclo **Problema → Causa raiz → Solução → Validação**.

Convenção de validação: toda correção foi aplicada em `src/` e validada numa **instância temporária em `PORT=1210`** (a `:1211` viva nunca foi tocada; deploy é do operador). Fixes de código são read-only no banco (consumer-only preservado). Todos os arquivos editados passam `node --check`.

Estado da auditoria: 92 endpoints `ok`, 9 `ok_empty` (válidos, dados ausentes por base vazia — cursos/bibliografias), 8 `degraded`, 4 `broken` → **após correção: 0 broken, 0 degraded por defeito de código**. As 212 divergências doc-vs-realidade (44 alta / 78 média / 90 baixa) de **documentação** são resolvidas na fase de swagger; este arquivo trata os defeitos de **comportamento** (15 corrigidos + 2 operador-side).

Legenda: 🟢 corrigido+validado · 📋 operador (fora do alcance da API).

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

### P3 · 🟢 `GET /subjects/{id}/works` → era 500 INTERNAL_ERROR (subjects grandes)
- **Causa raiz:** `getSubjectWorks` usava `withTimeout` mas **não capturava** `isStatementTimeout` → timeout virava 500. Ordenava por `ws.relevance_score` (sem índice composto com `subject_id`, e é placeholder uniforme) e contava via `COUNT(DISTINCT w.id)` caro.
- **Solução** (`src/services/subjects.service.js` `getSubjectWorks`): paginate-then-hydrate — id-selection `SELECT ws.work_id … WHERE ws.subject_id=? ORDER BY ws.work_id DESC LIMIT/OFFSET` (usa `idx_work_subjects_subject_work`, 0,01s), hidrata os ≤limit work_ids; `total` de `subjects.total_works`; `catch isStatementTimeout` → degradação. Filtros `year/type/language` aplicados na hidratação (under-fill possível), `min_relevance` na id-selection.
- **Validação (1210):** `GET /subjects/341907/works?limit=3` (2,8M works) → **HTTP 200 em ~4ms**, 3 rows, `total 2819809`.

### P4 · 🟢 `GET /publications?has_files=true` (isolado) → era 503 REQUEST_TIMEOUT
- **Causa raiz:** (1) count (budget 2s) e id-selection (budget 4,5s) rodavam **sequenciais** → soma >5s → 503 antes do budget de statement disparar. (2) `EXISTS(files)` correlacionado + `ORDER BY p.id DESC` gerava varredura de `publications` (>8s).
- **Solução** (`src/services/publications.service.js`): count e id-selection agora **concorrentes** (`Promise.all`) → wall-clock ≈ max(budgets) < 5s, degradando a `page_degraded` em vez de 503. Fast-path para `has_files===true` (sem full-text/venue e sort default): id-selection dirigida pela tabela `files` (`SELECT DISTINCT f.publication_id … ORDER BY … LIMIT/OFFSET`, 0,01s) → dados reais. Flag `meta.has_files_source: "files_index"`.
- **Validação (1210):** `has_files=true&limit=2` → **HTTP 200 em ~4ms**, 2 rows, todas com arquivos, `meta.has_files_source=files_index`. Combinado `has_files=true&type=ARTICLE` → **200 em 2s** com `meta.has_files_note` de under-fill.

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

---

_As divergências puramente de documentação (schemas swagger obsoletos, params não-documentados, enums faltantes, descrições estale) são tratadas na fase de reconstrução do swagger; inventário completo em `scratchpad/reports/verification.json`._
