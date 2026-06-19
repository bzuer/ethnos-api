# Manticore works index — enable morphology and full reindex

**Filed:** 2026-06-19
**Status:** PENDING (operator) — config change + full rebuild of `works_main`/`works_delta`. Additive and reversible. No MariaDB schema change.

## Why
Free-text search over `works` matches only exact word forms: `movimento` does not find
`movimentos`, `ethnography` does not find `ethnographic`, `kinship` does not find `kinships`.
For a bibliographic corpus this collapses recall and is the main reason searches "do not
find correlated / associated works". The API-side fixes shipped alongside this request
(broaden the free-text `q` to every text field, blended relevance ranker) raise precision and
ranking but cannot add morphological recall — that lives in the index and is operator-owned.

## Current state
- `config/manticore.conf` `works_main` was built with `dict = keywords`, `min_word_len = 2`,
  `min_prefix_len = 3`, `charset_table = non_cjk`, no `morphology`. Tokens are indexed verbatim.
- `searchd` (Manticore 25.0.0) is built with `-DWITH_STEMMER=1` (libstemmer static), so the
  Snowball Portuguese and English stemmers are available.
- `persons_main` is intentionally left unstemmed — stemming proper names would corrupt
  author/person matching.

## Proposed change (operator steps, in order)

1. **Pull the updated config into the repo copy** (already committed): `works_main` now declares
   ```
   morphology             = libstemmer_pt, libstemmer_en
   morphology_skip_fields = authors, venue
   ```
   `morphology_skip_fields` keeps the `authors` and `venue` fields verbatim (names are never
   stemmed); only `title` / `subtitle` / `abstract` / `subjects` are stemmed. `works_delta`
   inherits both directives from `works_main`. `persons_*` is unchanged.

2. **Re-render and install the production config** (injects the DB password from
   `/etc/node-backend.env`):
   ```
   sudo ENV_FILE=/etc/node-backend.env scripts/manticore/render-config.sh
   ```

3. **Full rebuild of the works tables** (live rotate; persons untouched). This is a complete
   reindex of ~6.78M works (~7 min at the measured ~14.6k docs/sec) because morphology is
   applied at index time:
   ```
   sudo -u manticore indexer --config /etc/manticoresearch/manticore.conf --rotate works_main works_delta
   ```
   (`sudo -u manticore manticore-ethnos-reindex main` then `... delta` is the convenience form.)

## Verification
After the rotate, the stemmed forms should converge (run from any host that can reach
`127.0.0.1:9306`):
```
mysql --skip-ssl -h127.0.0.1 -P9306 -e \
  "SELECT COUNT(*) FROM works WHERE MATCH('@subjects movimento');"   # now includes 'movimentos'
mysql --skip-ssl -h127.0.0.1 -P9306 -e \
  "SELECT COUNT(*) FROM works WHERE MATCH('@title ethnography');"     # now includes 'ethnographic'
mysql --skip-ssl -h127.0.0.1 -P9306 -e \
  "SELECT authors FROM works_main LIMIT 1;"                           # author names still verbatim
```
The first two counts should rise versus the pre-rebuild numbers; author/venue matching must
stay unchanged.

## Rollback
Remove the two `morphology*` lines from `works_main` in `config/manticore.conf`, re-render,
and rotate `works_main works_delta` again. The index returns to verbatim tokenisation; no
data is lost and the API needs no change.

## Note on the bilingual stemmer order
`libstemmer_pt` runs before `libstemmer_en`, so a token is stemmed by the first algorithm
that alters it. For a mixed PT/EN corpus this is the pragmatic choice and was validated as a
net recall gain. If precision regressions surface on English-only terms, the operator can
drop to `morphology = libstemmer_en` (or add `index_exact_words = 1` and switch the API to
`=term` exact queries) and rotate again — both are reversible with another rebuild.
