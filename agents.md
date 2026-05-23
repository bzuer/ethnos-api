# Search Architecture — Historical Notes

This file used to document Sphinx-based filter fixes. Sphinx has been removed from
the project: all full-text search now runs entirely against MariaDB FULLTEXT indexes
on `summary_publications` (`ft_summary_pubs_content`, `ft_summary_pubs_metadata`)
and on `persons`/`signatures` tables. There is no longer a Sphinx daemon, RT index,
or `publications_poc` / `publications_rt` / `persons_poc` / `venues_poc` runtime.

## Search filters surfaced on the works/publications path

- `q` — free-text search over `title_search` + `abstract_search` (BOOLEAN MODE).
- `author`, `venue`, `subject` — AND-scoped tokens against the `authors_search`,
  `venue_search`, `subjects_search` fields via `ft_summary_pubs_metadata`. Every
  token of every filter is required (`+token1 +token2 …`) so multi-word values
  don't bloat into the OR-mode false positives that used to plague the Sphinx
  path on the operator side.
- Filter-only listings (no `q` / `author` / `venue` / `subject`) bypass FULLTEXT
  and rely on B-tree indexes on `summary_publications`.

## Engine surface in responses

- `meta.engine` is always `MariaDB` on listings backed by `summary_publications`.
- The legacy `meta.engine = "Sphinx+MariaDB"` / `"MariaDB-fallback"` distinction
  has been removed; the field is kept for callers that already key off it.
