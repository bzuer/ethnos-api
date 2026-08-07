/* eslint-disable */
module.exports = {
  "WorkListItem": {
    "type": "object",
    "description": "A work as returned by GET /works and GET /works/showcase. Same shape across MariaDB and Manticore paths.",
    "properties": {
      "id": {
        "type": "integer",
        "description": "Work id."
      },
      "publication_id": {
        "type": "integer",
        "nullable": true,
        "description": "Id of the displayed (latest matching) publication; navigate to /publications/{publication_id}."
      },
      "publications_count": {
        "type": "integer",
        "description": "Total publications of this work."
      },
      "title": {
        "type": "string",
        "nullable": true
      },
      "subtitle": {
        "type": "string",
        "nullable": true
      },
      "abstract": {
        "type": "string",
        "nullable": true,
        "description": "Full abstract text; may be long or null."
      },
      "type": {
        "type": "string",
        "nullable": true,
        "enum": [
          "ARTICLE",
          "BOOK",
          "CHAPTER",
          "THESIS",
          "CONFERENCE",
          "CONFERENCE_PAPER",
          "REPORT",
          "DATASET",
          "PREPRINT",
          "REVIEW",
          "EDITORIAL",
          "OTHER"
        ],
        "description": "Displayed work type from the latest publication."
      },
      "language": {
        "type": "string",
        "nullable": true,
        "description": "ISO 639-1 language code."
      },
      "publication_year": {
        "type": "integer",
        "nullable": true,
        "description": "Year of the displayed publication; source data may contain out-of-range future years."
      },
      "doi": {
        "type": "string",
        "nullable": true
      },
      "open_access": {
        "type": "boolean",
        "nullable": true
      },
      "peer_reviewed": {
        "type": "boolean",
        "nullable": true
      },
      "venue": {
        "$ref": "#/components/schemas/WorkVenueRef"
      },
      "authors_preview": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Up to 3 contributor names, deduplicated by person and ordered AUTHOR first. Carries no role - use contributors_preview to tell an author from an editor or translator."
      },
      "contributors_preview": {
        "type": "array",
        "items": {
          "$ref": "#/components/schemas/ContributorPreview"
        },
        "description": "The same people as authors_preview, each carrying its authorship role."
      },
      "author_count": {
        "type": "integer",
        "description": "Distinct people credited on the work across every role. A person credited as both AUTHOR and EDITOR counts once."
      },
      "first_author": {
        "type": "object",
        "nullable": true,
        "description": "Always an AUTHOR-role contributor; falls back to the highest-ranked role only when the work credits no author.",
        "properties": {
          "person_id": {
            "type": "integer"
          },
          "name": {
            "type": "string"
          }
        }
      },
      "first_author_id": {
        "type": "integer",
        "nullable": true,
        "description": "Duplicate of first_author.person_id."
      },
      "first_author_identifiers": {
        "type": "object",
        "nullable": true,
        "description": "Always null on list rows."
      },
      "cited_by_count": {
        "type": "integer",
        "description": "Incoming citations (works.citation_count)."
      },
      "references_count": {
        "type": "integer",
        "description": "Outgoing references (works.reference_count)."
      },
      "added_to_database": {
        "type": "string",
        "nullable": true,
        "format": "date-time",
        "description": "works.created_at."
      },
      "data_source": {
        "type": "string",
        "description": "'full_api' (MariaDB) or 'search' (Manticore)."
      },
      "search_engine": {
        "type": "string",
        "enum": [
          "MariaDB",
          "Manticore"
        ],
        "description": "Engine that served this row."
      },
      "_links": {
        "type": "object",
        "properties": {
          "self": {
            "type": "string",
            "example": "/works/22519667"
          }
        }
      },
      "relevance": {
        "type": "number",
        "nullable": true,
        "description": "Relevance score; present only on /search/works and /search/advanced responses (currently always null even when sort_by=relevance)."
      }
    }
  },
  "WorkDetail": {
    "type": "object",
    "description": "Full work detail returned by GET /works/{id}.",
    "properties": {
      "id": {
        "type": "integer"
      },
      "_links": {
        "type": "object",
        "properties": {
          "self": {
            "type": "string",
            "example": "/works/7539537"
          }
        }
      },
      "title": {
        "type": "string",
        "nullable": true
      },
      "subtitle": {
        "type": "string",
        "nullable": true
      },
      "abstract": {
        "type": "string",
        "nullable": true
      },
      "type": {
        "type": "string",
        "nullable": true,
        "enum": [
          "ARTICLE",
          "BOOK",
          "CHAPTER",
          "THESIS",
          "CONFERENCE",
          "CONFERENCE_PAPER",
          "REPORT",
          "DATASET",
          "PREPRINT",
          "REVIEW",
          "EDITORIAL",
          "OTHER"
        ],
        "description": "Displayed type from the primary publication."
      },
      "language": {
        "type": "string",
        "nullable": true
      },
      "publication_year": {
        "type": "integer",
        "nullable": true,
        "description": "Primary publication year."
      },
      "doi": {
        "type": "string",
        "nullable": true,
        "description": "Primary publication DOI."
      },
      "open_access": {
        "type": "boolean",
        "description": "True if any publication is open access."
      },
      "peer_reviewed": {
        "type": "boolean",
        "description": "True if any publication is peer-reviewed."
      },
      "has_files": {
        "type": "boolean",
        "description": "True if any publication has files."
      },
      "venue": {
        "$ref": "#/components/schemas/WorkVenueRef"
      },
      "year_range": {
        "type": "object",
        "properties": {
          "earliest": {
            "type": "integer",
            "nullable": true
          },
          "latest": {
            "type": "integer",
            "nullable": true
          }
        }
      },
      "languages": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Distinct languages across publications."
      },
      "summary_updated_at": {
        "type": "string",
        "nullable": true,
        "format": "date-time",
        "description": "ISO of works.metrics_last_updated."
      },
      "primary_publication_id": {
        "type": "integer",
        "nullable": true
      },
      "primary_publication": {
        "type": "object",
        "nullable": true,
        "description": "Compact summary of the work's primary publication.",
        "properties": {
          "id": {
            "type": "integer"
          },
          "doi": {
            "type": "string",
            "nullable": true
          },
          "publication_year": {
            "type": "integer",
            "nullable": true
          },
          "publication_date": {
            "type": "string",
            "nullable": true,
            "format": "date-time"
          },
          "volume": {
            "type": "string",
            "nullable": true
          },
          "issue": {
            "type": "string",
            "nullable": true
          },
          "pages": {
            "type": "string",
            "nullable": true
          },
          "open_access": {
            "type": "boolean"
          },
          "peer_reviewed": {
            "type": "boolean"
          },
          "has_files": {
            "type": "boolean"
          },
          "venue": {
            "$ref": "#/components/schemas/WorkVenueRef"
          },
          "publisher": {
            "$ref": "#/components/schemas/WorkPublisherRef"
          },
          "source": {
            "type": "string",
            "nullable": true
          },
          "license_url": {
            "type": "string",
            "nullable": true
          },
          "license_version": {
            "type": "string",
            "nullable": true
          },
          "_links": {
            "type": "object",
            "properties": {
              "self": {
                "type": "string",
                "example": "/publications/1127609346"
              }
            }
          }
        }
      },
      "files": {
        "type": "array",
        "items": {
          "$ref": "#/components/schemas/WorkFile"
        },
        "description": "Flat work-level file aggregation, capped at 50."
      },
      "file_summary": {
        "type": "object",
        "properties": {
          "files_returned": {
            "type": "integer"
          },
          "files_total": {
            "type": "integer"
          },
          "files_truncated": {
            "type": "boolean"
          },
          "publications_with_files": {
            "type": "integer"
          },
          "total_download_count": {
            "type": "integer"
          },
          "best_oa_url": {
            "type": "string",
            "nullable": true
          },
          "by_format": {
            "type": "object",
            "description": "Map of format -> count.",
            "additionalProperties": {
              "type": "integer"
            }
          },
          "by_role": {
            "type": "object",
            "description": "Map of role -> count.",
            "additionalProperties": {
              "type": "integer"
            }
          },
          "has_scimag": {
            "type": "boolean"
          },
          "has_libgen": {
            "type": "boolean"
          },
          "has_open_access": {
            "type": "boolean"
          }
        }
      },
      "venues": {
        "type": "array",
        "items": {
          "allOf": [
            {
              "$ref": "#/components/schemas/WorkVenueRef"
            },
            {
              "type": "object",
              "properties": {
                "publication_count": {
                  "type": "integer"
                },
                "latest_year": {
                  "type": "integer",
                  "nullable": true
                }
              }
            }
          ]
        },
        "description": "Distinct-venue roll-up ordered by publication_count DESC, latest_year DESC."
      },
      "publications": {
        "type": "array",
        "items": {
          "$ref": "#/components/schemas/WorkPublicationEntry"
        },
        "description": "Full per-publication entries, capped at 50."
      },
      "publications_total": {
        "type": "integer"
      },
      "publications_has_more": {
        "type": "boolean"
      },
      "identifiers": {
        "type": "object",
        "description": "Aggregated union of every publication's identifier set; each present key maps to an array of string values.",
        "additionalProperties": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "authors": {
        "type": "array",
        "description": "One entry per authorship row, so a person credited under two roles appears twice. Ordered by role (AUTHOR, EDITOR, TRANSLATOR, REVIEWER) then position.",
        "items": {
          "$ref": "#/components/schemas/WorkAuthor"
        }
      },
      "authors_count": {
        "type": "integer",
        "description": "Distinct people in authors[], counting a person credited under several roles once."
      },
      "contributors": {
        "type": "array",
        "description": "authors[] collapsed to one entry per person, each declaring every role it holds.",
        "items": {
          "$ref": "#/components/schemas/WorkContributor"
        }
      },
      "contributor_roles": {
        "type": "object",
        "description": "Authorship-row tallies per role, e.g. {\"AUTHOR\": 3, \"EDITOR\": 3}.",
        "additionalProperties": {
          "type": "integer"
        }
      },
      "subjects": {
        "type": "array",
        "items": {
          "$ref": "#/components/schemas/WorkSubject"
        }
      },
      "citations": {
        "type": "object",
        "properties": {
          "cited_by": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "work_id": {
                  "type": "integer"
                },
                "title": {
                  "type": "string",
                  "nullable": true
                },
                "authors": {
                  "type": "string",
                  "nullable": true,
                  "description": "Semicolon-joined author names."
                },
                "publication_year": {
                  "type": "integer",
                  "nullable": true
                },
                "venue_name": {
                  "type": "string",
                  "nullable": true
                },
                "venue_abbreviated_name": {
                  "type": "string",
                  "nullable": true
                },
                "open_access": {
                  "type": "boolean",
                  "nullable": true
                },
                "citation_type": {
                  "type": "string",
                  "description": "Default NEUTRAL."
                },
                "citation_status": {
                  "type": "string",
                  "enum": [
                    "RESOLVED",
                    "PENDING",
                    "FAILED"
                  ]
                },
                "citation_context": {
                  "type": "string",
                  "nullable": true
                }
              }
            },
            "description": "Works citing this one (<=100)."
          },
          "references": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "work_id": {
                  "type": "integer"
                },
                "title": {
                  "type": "string",
                  "nullable": true
                },
                "authors": {
                  "type": "string",
                  "nullable": true
                },
                "publication_year": {
                  "type": "integer",
                  "nullable": true
                },
                "venue_name": {
                  "type": "string",
                  "nullable": true
                },
                "venue_abbreviated_name": {
                  "type": "string",
                  "nullable": true
                },
                "doi": {
                  "type": "string",
                  "nullable": true
                },
                "open_access": {
                  "type": "boolean",
                  "nullable": true
                },
                "citation_type": {
                  "type": "string"
                },
                "citation_context": {
                  "type": "string",
                  "nullable": true
                }
              }
            },
            "description": "Resolved outgoing references (<=100)."
          },
          "unresolved_references": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "cited_doi": {
                  "type": "string",
                  "nullable": true
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "PENDING",
                    "FAILED"
                  ]
                },
                "citation_type": {
                  "type": "string"
                },
                "created_at": {
                  "type": "string",
                  "nullable": true,
                  "format": "date-time"
                },
                "resolved_at": {
                  "type": "string",
                  "nullable": true,
                  "format": "date-time"
                }
              }
            }
          },
          "unsolved": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "cited_doi": {
                  "type": "string",
                  "nullable": true
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "PENDING",
                    "FAILED"
                  ]
                },
                "citation_type": {
                  "type": "string"
                },
                "created_at": {
                  "type": "string",
                  "nullable": true,
                  "format": "date-time"
                },
                "resolved_at": {
                  "type": "string",
                  "nullable": true,
                  "format": "date-time"
                }
              }
            },
            "description": "Alias of unresolved_references."
          }
        }
      },
      "metrics": {
        "$ref": "#/components/schemas/WorkMetrics"
      },
      "funding": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "funder_id": {
              "type": "integer"
            },
            "funder_name": {
              "type": "string",
              "nullable": true
            },
            "grant_number": {
              "type": "string",
              "nullable": true
            }
          }
        }
      },
      "created_at": {
        "type": "string",
        "nullable": true,
        "format": "date-time"
      },
      "updated_at": {
        "type": "string",
        "nullable": true,
        "format": "date-time"
      }
    }
  },
  "WorkBibliographyItem": {
    "type": "object",
    "description": "A course whose reading list includes the work.",
    "properties": {
      "course_id": {
        "type": "integer"
      },
      "course_name": {
        "type": "string",
        "nullable": true
      },
      "course_year": {
        "type": "integer",
        "nullable": true
      },
      "program_id": {
        "type": "integer",
        "nullable": true
      },
      "reading_type": {
        "type": "string",
        "nullable": true,
        "enum": [
          "REQUIRED",
          "RECOMMENDED",
          "SUPPLEMENTARY",
          "OPTIONAL"
        ]
      },
      "instructor_count": {
        "type": "integer"
      },
      "instructors": {
        "type": "string",
        "nullable": true,
        "description": "Semicolon-joined instructor names."
      }
    }
  },
  "WorkVenueRef": {
    "type": "object",
    "nullable": true,
    "description": "Compact venue reference embedded in work rows and publications.",
    "properties": {
      "id": {
        "type": "integer"
      },
      "name": {
        "type": "string",
        "nullable": true
      },
      "abbreviated_name": {
        "type": "string",
        "nullable": true
      },
      "type": {
        "type": "string",
        "nullable": true,
        "enum": [
          "JOURNAL",
          "CONFERENCE",
          "REPOSITORY",
          "BOOK_SERIES",
          "SOURCE_BOOK",
          "OTHER"
        ]
      },
      "issn": {
        "type": "string",
        "nullable": true
      },
      "eissn": {
        "type": "string",
        "nullable": true
      },
      "scopus_id": {
        "type": "string",
        "nullable": true
      },
      "wikidata_id": {
        "type": "string",
        "nullable": true
      },
      "openalex_id": {
        "type": "string",
        "nullable": true
      }
    }
  },
  "WorkPublisherRef": {
    "type": "object",
    "nullable": true,
    "description": "Compact publisher (organization) reference.",
    "properties": {
      "id": {
        "type": "integer"
      },
      "name": {
        "type": "string",
        "nullable": true
      },
      "type": {
        "type": "string",
        "nullable": true,
        "description": "Organization type, typically PUBLISHER."
      },
      "country": {
        "type": "string",
        "nullable": true,
        "description": "ISO-2 country code."
      },
      "ror_id": {
        "type": "string",
        "nullable": true
      },
      "wikidata_id": {
        "type": "string",
        "nullable": true
      },
      "openalex_id": {
        "type": "string",
        "nullable": true
      },
      "url": {
        "type": "string",
        "nullable": true
      }
    }
  },
  "WorkFile": {
    "type": "object",
    "description": "A file attached to one of the work's publications.",
    "properties": {
      "file_id": {
        "type": "integer",
        "nullable": true
      },
      "publication_id": {
        "type": "integer",
        "nullable": true,
        "description": "Parent publication id."
      },
      "md5": {
        "type": "string",
        "nullable": true
      },
      "format": {
        "type": "string",
        "nullable": true,
        "description": "File format, e.g. PDF."
      },
      "size": {
        "type": "integer",
        "nullable": true,
        "description": "File size in bytes."
      },
      "pages": {
        "type": "integer",
        "nullable": true
      },
      "language": {
        "type": "string",
        "nullable": true
      },
      "version": {
        "type": "string",
        "nullable": true
      },
      "role": {
        "type": "string",
        "nullable": true,
        "description": "File role: MAIN, SUPPLEMENT, COVER, PREVIEW."
      },
      "libgen_id": {
        "type": "integer",
        "nullable": true
      },
      "scimag_id": {
        "type": "integer",
        "nullable": true
      },
      "openacess_id": {
        "type": "string",
        "nullable": true
      },
      "best_oa_url": {
        "type": "string",
        "nullable": true
      },
      "verification": {
        "type": "string",
        "nullable": true,
        "description": "Verification status, e.g. VERIFIED, PENDING."
      },
      "download_count": {
        "type": "integer"
      }
    }
  },
  "WorkPublicationEntry": {
    "type": "object",
    "description": "A full per-publication entry embedded in a work's `publications[]`.",
    "properties": {
      "id": {
        "type": "integer"
      },
      "identifiers": {
        "type": "object",
        "description": "Per-publication identifier set (keys always present, values nullable).",
        "properties": {
          "doi": {
            "type": "string",
            "nullable": true
          },
          "pmid": {
            "type": "string",
            "nullable": true
          },
          "pmcid": {
            "type": "string",
            "nullable": true
          },
          "arxiv": {
            "type": "string",
            "nullable": true
          },
          "wos_id": {
            "type": "string",
            "nullable": true
          },
          "handle": {
            "type": "string",
            "nullable": true
          },
          "wikidata_id": {
            "type": "string",
            "nullable": true
          },
          "openalex_id": {
            "type": "string",
            "nullable": true
          },
          "isbn": {
            "type": "string",
            "nullable": true
          },
          "openlibrary_id": {
            "type": "string",
            "nullable": true
          },
          "scielo_pid": {
            "type": "string",
            "nullable": true
          },
          "google_book_id": {
            "type": "string",
            "nullable": true
          }
        }
      },
      "publication_date": {
        "type": "string",
        "nullable": true,
        "format": "date-time"
      },
      "publication_year": {
        "type": "integer",
        "nullable": true
      },
      "volume": {
        "type": "string",
        "nullable": true
      },
      "issue": {
        "type": "string",
        "nullable": true
      },
      "pages": {
        "type": "string",
        "nullable": true
      },
      "language": {
        "type": "string",
        "nullable": true
      },
      "open_access": {
        "type": "boolean"
      },
      "peer_reviewed": {
        "type": "boolean"
      },
      "has_files": {
        "type": "boolean"
      },
      "has_scimag_file": {
        "type": "boolean"
      },
      "has_libgen_file": {
        "type": "boolean"
      },
      "download_count": {
        "type": "integer"
      },
      "license_url": {
        "type": "string",
        "nullable": true
      },
      "license_version": {
        "type": "string",
        "nullable": true
      },
      "source": {
        "type": "string",
        "nullable": true,
        "description": "Provenance source, e.g. crossref."
      },
      "source_indexed_at": {
        "type": "string",
        "nullable": true,
        "format": "date-time"
      },
      "venue": {
        "$ref": "#/components/schemas/WorkVenueRef"
      },
      "publisher": {
        "$ref": "#/components/schemas/WorkPublisherRef"
      },
      "files": {
        "type": "array",
        "items": {
          "$ref": "#/components/schemas/WorkFile"
        }
      },
      "created_at": {
        "type": "string",
        "nullable": true,
        "format": "date-time"
      },
      "updated_at": {
        "type": "string",
        "nullable": true,
        "format": "date-time"
      },
      "_links": {
        "type": "object",
        "properties": {
          "self": {
            "type": "string",
            "example": "/publications/1127609346"
          }
        }
      },
      "is_primary": {
        "type": "boolean",
        "description": "True for the work's primary publication."
      }
    }
  },
  "WorkAuthor": {
    "type": "object",
    "description": "An author of the work with role, position, and affiliation.",
    "properties": {
      "person_id": {
        "type": "integer"
      },
      "preferred_name": {
        "type": "string",
        "nullable": true
      },
      "given_names": {
        "type": "string",
        "nullable": true
      },
      "family_name": {
        "type": "string",
        "nullable": true
      },
      "identifiers": {
        "type": "object",
        "properties": {
          "orcid": {
            "type": "string",
            "nullable": true
          },
          "scopus_id": {
            "type": "string",
            "nullable": true
          },
          "lattes_id": {
            "type": "string",
            "nullable": true
          }
        }
      },
      "role": {
        "type": "string",
        "enum": ["AUTHOR", "EDITOR", "TRANSLATOR", "REVIEWER"],
        "description": "Authorship role, default AUTHOR."
      },
      "position": {
        "type": "integer",
        "description": "1-based position within this role, not within the work. An AUTHOR at position 1 and a TRANSLATOR at position 1 can coexist, so order by role before position."
      },
      "is_corresponding": {
        "type": "boolean"
      },
      "affiliation": {
        "type": "object",
        "nullable": true,
        "properties": {
          "id": {
            "type": "integer"
          },
          "name": {
            "type": "string",
            "nullable": true
          },
          "type": {
            "type": "string",
            "nullable": true
          },
          "country": {
            "type": "string",
            "nullable": true
          },
          "_links": {
            "type": "object",
            "properties": {
              "self": {
                "type": "string",
                "example": "/institutions/4379367"
              }
            }
          }
        }
      }
    }
  },
  "ContributorPreview": {
    "type": "object",
    "description": "A credited person on a work listing row, carrying its authorship role.",
    "properties": {
      "person_id": {
        "type": "integer",
        "nullable": true
      },
      "name": {
        "type": "string",
        "nullable": true
      },
      "role": {
        "type": "string",
        "enum": ["AUTHOR", "EDITOR", "TRANSLATOR", "REVIEWER"],
        "description": "Highest-ranked role this person holds on the work."
      },
      "roles": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["AUTHOR", "EDITOR", "TRANSLATOR", "REVIEWER"]
        },
        "description": "Every role this person holds on the work."
      },
      "position": {
        "type": "integer",
        "nullable": true,
        "description": "1-based position within the primary role."
      }
    }
  },
  "WorkContributor": {
    "type": "object",
    "description": "A person credited on the work, deduplicated across roles.",
    "properties": {
      "person_id": {
        "type": "integer",
        "nullable": true
      },
      "preferred_name": {
        "type": "string",
        "nullable": true
      },
      "given_names": {
        "type": "string",
        "nullable": true
      },
      "family_name": {
        "type": "string",
        "nullable": true
      },
      "identifiers": {
        "type": "object",
        "nullable": true
      },
      "roles": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["AUTHOR", "EDITOR", "TRANSLATOR", "REVIEWER"]
        },
        "description": "Every role this person holds on the work, e.g. [\"AUTHOR\", \"EDITOR\"] for someone who both wrote in and edited the volume."
      },
      "position": {
        "type": "integer",
        "nullable": true,
        "description": "1-based position within the primary role."
      },
      "is_corresponding": {
        "type": "boolean",
        "nullable": true
      },
      "affiliation": {
        "type": "object",
        "nullable": true
      }
    }
  },
  "WorkSubject": {
    "type": "object",
    "description": "A subject/keyword linked to the work.",
    "properties": {
      "subject_id": {
        "type": "integer"
      },
      "term": {
        "type": "string"
      },
      "vocabulary": {
        "type": "string",
        "description": "Controlled vocabulary, default Keyword."
      },
      "lang": {
        "type": "string",
        "nullable": true
      },
      "relevance_score": {
        "type": "number",
        "description": "Uniform placeholder relevance, typically 1."
      },
      "assigned_by": {
        "type": "string",
        "description": "Assignment provenance, e.g. AUTHOR, SYSTEM."
      }
    }
  },
  "WorkMetrics": {
    "type": "object",
    "description": "Work-level metric rollups.",
    "properties": {
      "citation_count": {
        "type": "integer"
      },
      "reference_count": {
        "type": "integer"
      },
      "download_count": {
        "type": "integer"
      },
      "view_count": {
        "type": "integer"
      },
      "altmetric_score": {
        "type": "number",
        "nullable": true
      },
      "social_media_mentions": {
        "type": "integer"
      },
      "news_mentions": {
        "type": "integer"
      },
      "publications_count": {
        "type": "integer"
      },
      "publications_with_files_count": {
        "type": "integer"
      },
      "publications_open_access_count": {
        "type": "integer"
      },
      "publications_peer_reviewed_count": {
        "type": "integer"
      },
      "distinct_venues_count": {
        "type": "integer"
      },
      "total_files_count": {
        "type": "integer"
      },
      "total_files_download_count": {
        "type": "integer"
      },
      "metrics_last_updated": {
        "type": "string",
        "nullable": true,
        "format": "date-time"
      }
    }
  },
  "CitationRow": {
    "type": "object",
    "description": "A single work that cites the target work (one entry of /works/{id}/citations data.citing_works).",
    "properties": {
      "citing_work_id": {
        "type": "integer",
        "description": "Id of the work that cites the target."
      },
      "cited_work_id": {
        "type": "integer",
        "nullable": true,
        "description": "Always null on this endpoint (the shared DTO emits both keys; only citing_work_id is populated here)."
      },
      "title": {
        "type": "string",
        "nullable": true,
        "description": "Title of the citing work."
      },
      "type": {
        "type": "string",
        "nullable": true,
        "enum": [
          "ARTICLE",
          "BOOK",
          "CHAPTER",
          "THESIS",
          "CONFERENCE",
          "CONFERENCE_PAPER",
          "REPORT",
          "DATASET",
          "PREPRINT",
          "REVIEW",
          "EDITORIAL",
          "OTHER"
        ],
        "description": "Publication type of the citing work's latest publication."
      },
      "publication_year": {
        "type": "integer",
        "nullable": true,
        "description": "Publication year of the citing work."
      },
      "venue_name": {
        "type": "string",
        "nullable": true,
        "description": "Venue name (falls back to the abbreviated name when the full name is null)."
      },
      "venue_abbreviated_name": {
        "type": "string",
        "nullable": true,
        "description": "Abbreviated venue name."
      },
      "doi": {
        "type": "string",
        "nullable": true,
        "description": "DOI of the citing work."
      },
      "authors_count": {
        "type": "integer",
        "description": "Number of authorship rows on the citing work; 0 when none."
      },
      "citation": {
        "type": "object",
        "description": "Edge metadata aggregated over the work_references edges from this citing work.",
        "properties": {
          "type": {
            "type": "string",
            "nullable": true,
            "enum": [
              "POSITIVE",
              "NEUTRAL",
              "NEGATIVE",
              "SELF"
            ],
            "description": "Aggregated citation type (MIN over edges)."
          },
          "status": {
            "type": "string",
            "nullable": true,
            "enum": [
              "RESOLVED",
              "PENDING",
              "FAILED"
            ],
            "description": "RESOLVED if any edge resolved, else PENDING, else FAILED."
          },
          "context": {
            "type": "string",
            "nullable": true,
            "description": "Always null (no citation context is stored)."
          }
        }
      }
    }
  },
  "ReferenceRow": {
    "type": "object",
    "description": "Full data object of /works/{id}/references. referenced_works and unresolved_references are page-scoped; counts is corpus-wide; unsolved is an exact alias of unresolved_references.",
    "properties": {
      "work_id": {
        "type": "integer",
        "description": "Echoes the path id."
      },
      "referenced_works": {
        "type": "array",
        "description": "RESOLVED references present on the current page, de-duplicated by cited_work_id (page-scoped).",
        "items": {
          "type": "object",
          "properties": {
            "citing_work_id": {
              "type": "integer",
              "nullable": true,
              "description": "Always null on this endpoint (shared DTO)."
            },
            "cited_work_id": {
              "type": "integer",
              "description": "Id of the referenced work."
            },
            "title": {
              "type": "string",
              "nullable": true
            },
            "type": {
              "type": "string",
              "nullable": true,
              "enum": [
                "ARTICLE",
                "BOOK",
                "CHAPTER",
                "THESIS",
                "CONFERENCE",
                "CONFERENCE_PAPER",
                "REPORT",
                "DATASET",
                "PREPRINT",
                "REVIEW",
                "EDITORIAL",
                "OTHER"
              ],
              "description": "Publication type of the referenced work."
            },
            "publication_year": {
              "type": "integer",
              "nullable": true
            },
            "venue_name": {
              "type": "string",
              "nullable": true
            },
            "venue_abbreviated_name": {
              "type": "string",
              "nullable": true
            },
            "doi": {
              "type": "string",
              "nullable": true,
              "description": "Falls back to cited_doi when the summary DOI is null."
            },
            "authors_count": {
              "type": "integer"
            },
            "citation": {
              "type": "object",
              "description": "Edge metadata. Note: no status key here (unlike /citations).",
              "properties": {
                "type": {
                  "type": "string",
                  "nullable": true,
                  "enum": [
                    "POSITIVE",
                    "NEUTRAL",
                    "NEGATIVE",
                    "SELF"
                  ]
                },
                "context": {
                  "type": "string",
                  "nullable": true,
                  "description": "Always null."
                }
              }
            }
          }
        }
      },
      "unresolved_references": {
        "type": "array",
        "description": "PENDING/FAILED reference rows present on the current page (page-scoped).",
        "items": {
          "type": "object",
          "properties": {
            "cited_doi": {
              "type": "string",
              "nullable": true,
              "description": "DOI that could not be resolved to a local work."
            },
            "status": {
              "type": "string",
              "enum": [
                "PENDING",
                "FAILED"
              ],
              "description": "Resolution status (default PENDING)."
            },
            "citation_type": {
              "type": "string",
              "enum": [
                "POSITIVE",
                "NEUTRAL",
                "NEGATIVE",
                "SELF"
              ],
              "description": "Citation type (default NEUTRAL)."
            },
            "created_at": {
              "type": "string",
              "format": "date-time",
              "nullable": true
            },
            "resolved_at": {
              "type": "string",
              "format": "date-time",
              "nullable": true,
              "description": "Null while unresolved."
            }
          }
        }
      },
      "unsolved": {
        "type": "array",
        "description": "Exact alias of unresolved_references (identical content; kept for back-compat).",
        "items": {
          "type": "object",
          "properties": {
            "cited_doi": {
              "type": "string",
              "nullable": true
            },
            "status": {
              "type": "string",
              "enum": [
                "PENDING",
                "FAILED"
              ]
            },
            "citation_type": {
              "type": "string",
              "enum": [
                "POSITIVE",
                "NEUTRAL",
                "NEGATIVE",
                "SELF"
              ]
            },
            "created_at": {
              "type": "string",
              "format": "date-time",
              "nullable": true
            },
            "resolved_at": {
              "type": "string",
              "format": "date-time",
              "nullable": true
            }
          }
        }
      },
      "counts": {
        "type": "object",
        "description": "Corpus-wide reference counts (not page-scoped).",
        "properties": {
          "total": {
            "type": "integer",
            "description": "All work_references rows for this work (equals pagination.total)."
          },
          "resolved": {
            "type": "integer",
            "description": "RESOLVED references with a non-null cited_work_id."
          },
          "unresolved": {
            "type": "integer",
            "description": "PENDING + FAILED references."
          }
        }
      }
    }
  },
  "WorkMetricsReport": {
    "type": "object",
    "description": "Bibliometric summary for a work (/works/{id}/metrics data).",
    "properties": {
      "work_id": {
        "type": "integer"
      },
      "title": {
        "type": "string",
        "nullable": true
      },
      "type": {
        "type": "string",
        "nullable": true,
        "enum": [
          "ARTICLE",
          "BOOK",
          "CHAPTER",
          "THESIS",
          "CONFERENCE",
          "CONFERENCE_PAPER",
          "REPORT",
          "DATASET",
          "PREPRINT",
          "REVIEW",
          "EDITORIAL",
          "OTHER"
        ],
        "description": "Latest publication type of the work."
      },
      "publication_year": {
        "type": "integer",
        "nullable": true,
        "description": "Earliest (MIN) publication year of the work."
      },
      "citation_metrics": {
        "type": "object",
        "properties": {
          "total_citations_received": {
            "type": "integer",
            "description": "COUNT of RESOLVED work_references citing this work. May differ from works.citation_count (cited_by_count on /works)."
          },
          "total_references_made": {
            "type": "integer",
            "description": "COUNT of all work_references from this work (including unresolved)."
          },
          "unique_citing_works": {
            "type": "integer",
            "description": "COUNT(DISTINCT citing_work_id)."
          },
          "citations_per_year": {
            "type": "number",
            "format": "float",
            "description": "total_citations_received / max(1, currentYear - first_citation_year), 2 decimals."
          },
          "citation_types": {
            "type": "object",
            "description": "Breakdown of citing edges by citation type.",
            "properties": {
              "positive": {
                "type": "integer"
              },
              "neutral": {
                "type": "integer"
              },
              "negative": {
                "type": "integer"
              },
              "self": {
                "type": "integer"
              }
            }
          }
        }
      },
      "temporal_metrics": {
        "type": "object",
        "description": "Citation year span. Years are clamped to a valid range (1000..current year+1); null when there are no citations.",
        "properties": {
          "first_citation_year": {
            "type": "integer",
            "nullable": true,
            "description": "Earliest publication year across citing works (clamped)."
          },
          "latest_citation_year": {
            "type": "integer",
            "nullable": true,
            "description": "Latest publication year across citing works (clamped)."
          },
          "citation_span_years": {
            "type": "integer",
            "nullable": true,
            "description": "latest - first + 1; null when either bound is null."
          }
        }
      },
      "impact_indicators": {
        "type": "object",
        "properties": {
          "highly_cited": {
            "type": "boolean",
            "description": "True when total_citations_received > 100."
          },
          "citation_velocity": {
            "type": "string",
            "enum": [
              "current",
              "recent",
              "historical",
              "unknown"
            ],
            "description": "current = latest citation is this year; recent = within last 2 years; historical = older; unknown = fallback path."
          }
        }
      }
    }
  },
  "WorkCitationNetwork": {
    "type": "object",
    "description": "Citation-network graph around a central work (/works/{id}/network data). Bounded sample (~120 nodes, 100 edges cap).",
    "properties": {
      "central_work_id": {
        "type": "integer",
        "description": "Path id of the central work."
      },
      "network_depth": {
        "type": "integer",
        "description": "Requested BFS depth (traversal internally clamps to 1..3)."
      },
      "nodes": {
        "type": "object",
        "description": "Map keyed by work-id string to a node object (NOT an array).",
        "additionalProperties": {
          "type": "object",
          "properties": {
            "id": {
              "type": "integer"
            },
            "title": {
              "type": "string",
              "nullable": true
            },
            "year": {
              "type": "integer",
              "nullable": true,
              "description": "Earliest (MIN) publication year."
            },
            "is_central": {
              "type": "boolean",
              "description": "True only for the central work."
            }
          }
        }
      },
      "edges": {
        "type": "array",
        "description": "Directed edges (source cites target).",
        "items": {
          "type": "object",
          "properties": {
            "source": {
              "type": "integer",
              "description": "Citing work id."
            },
            "target": {
              "type": "integer",
              "description": "Cited work id."
            },
            "depth": {
              "type": "integer",
              "description": "BFS level (1..max_depth) at which the edge was discovered."
            },
            "citation_type": {
              "type": "string",
              "nullable": true,
              "enum": [
                "POSITIVE",
                "NEUTRAL",
                "NEGATIVE",
                "SELF"
              ]
            },
            "source_year": {
              "type": "integer",
              "nullable": true
            },
            "target_year": {
              "type": "integer",
              "nullable": true
            }
          }
        }
      },
      "network_stats": {
        "type": "object",
        "properties": {
          "total_nodes": {
            "type": "integer",
            "description": "Distinct node count (capped ~120)."
          },
          "total_edges": {
            "type": "integer",
            "description": "Edge count (capped 100)."
          },
          "max_depth": {
            "type": "integer",
            "description": "Deepest edge depth present (0 when empty)."
          }
        }
      }
    }
  },
  "PublicationIdentifiers": {
    "type": "object",
    "description": "Identifier surface (all values string or null).",
    "properties": {
      "doi": {
        "type": "string",
        "nullable": true
      },
      "pmid": {
        "type": "string",
        "nullable": true
      },
      "pmcid": {
        "type": "string",
        "nullable": true
      },
      "arxiv": {
        "type": "string",
        "nullable": true
      },
      "wos_id": {
        "type": "string",
        "nullable": true
      },
      "handle": {
        "type": "string",
        "nullable": true
      },
      "wikidata_id": {
        "type": "string",
        "nullable": true
      },
      "openalex_id": {
        "type": "string",
        "nullable": true
      },
      "isbn": {
        "type": "string",
        "nullable": true
      },
      "openlibrary_id": {
        "type": "string",
        "nullable": true
      },
      "scielo_pid": {
        "type": "string",
        "nullable": true
      },
      "google_book_id": {
        "type": "string",
        "nullable": true
      }
    }
  },
  "PublicationVenueRef": {
    "type": "object",
    "nullable": true,
    "description": "Venue reference block.",
    "properties": {
      "id": {
        "type": "integer",
        "nullable": true
      },
      "name": {
        "type": "string",
        "nullable": true
      },
      "abbreviated_name": {
        "type": "string",
        "nullable": true
      },
      "type": {
        "type": "string",
        "nullable": true,
        "enum": [
          "JOURNAL",
          "CONFERENCE",
          "REPOSITORY",
          "BOOK_SERIES",
          "SOURCE_BOOK",
          "OTHER",
          null
        ]
      },
      "issn": {
        "type": "string",
        "nullable": true
      },
      "eissn": {
        "type": "string",
        "nullable": true
      },
      "scopus_id": {
        "type": "string",
        "nullable": true
      },
      "wikidata_id": {
        "type": "string",
        "nullable": true
      },
      "openalex_id": {
        "type": "string",
        "nullable": true
      }
    }
  },
  "PublicationPublisherRef": {
    "type": "object",
    "nullable": true,
    "description": "Publisher organization reference (null when the publication has no publisher). ",
    "properties": {
      "id": {
        "type": "integer",
        "nullable": true
      },
      "name": {
        "type": "string"
      },
      "type": {
        "type": "string",
        "nullable": true,
        "description": "Organization type, typically PUBLISHER."
      },
      "country": {
        "type": "string",
        "nullable": true,
        "description": "ISO-2 country code."
      },
      "ror_id": {
        "type": "string",
        "nullable": true
      },
      "wikidata_id": {
        "type": "string",
        "nullable": true
      },
      "openalex_id": {
        "type": "string",
        "nullable": true
      },
      "url": {
        "type": "string",
        "nullable": true
      }
    }
  },
  "PublicationFirstAuthor": {
    "type": "object",
    "nullable": true,
    "description": "First author of the parent work, or null.",
    "properties": {
      "person_id": {
        "type": "integer"
      },
      "name": {
        "type": "string"
      }
    }
  },
  "PublicationFile": {
    "type": "object",
    "description": "A file attached to the publication (from the files base table).",
    "properties": {
      "file_id": {
        "type": "integer"
      },
      "md5": {
        "type": "string",
        "nullable": true
      },
      "format": {
        "type": "string",
        "nullable": true,
        "description": "File format, uppercased (e.g. PDF)."
      },
      "size": {
        "type": "number",
        "nullable": true,
        "description": "File size in bytes."
      },
      "pages": {
        "type": "integer",
        "nullable": true
      },
      "language": {
        "type": "string",
        "nullable": true
      },
      "version": {
        "type": "string",
        "nullable": true
      },
      "role": {
        "type": "string",
        "description": "File role (e.g. MAIN, SUPPLEMENT, COVER, PREVIEW); default MAIN."
      },
      "libgen_id": {
        "type": "integer",
        "nullable": true
      },
      "scimag_id": {
        "type": "integer",
        "nullable": true
      },
      "openacess_id": {
        "type": "string",
        "nullable": true,
        "description": "External open-access identifier (note the source spelling 'openacess')."
      },
      "best_oa_url": {
        "type": "string",
        "nullable": true
      },
      "verification": {
        "type": "string",
        "nullable": true,
        "description": "Verification status, e.g. PENDING or VERIFIED."
      },
      "download_count": {
        "type": "integer"
      }
    }
  },
  "PublicationListItem": {
    "type": "object",
    "description": "A publication row on GET /publications.",
    "properties": {
      "id": {
        "type": "integer",
        "description": "publications.id (the publication id, not the work id)."
      },
      "work_id": {
        "type": "integer",
        "description": "Parent work id."
      },
      "doi": {
        "type": "string",
        "nullable": true
      },
      "title": {
        "type": "string",
        "nullable": true,
        "description": "Parent work title."
      },
      "abstract": {
        "type": "string",
        "nullable": true,
        "description": "Parent work abstract; often null."
      },
      "type": {
        "type": "string",
        "nullable": true,
        "description": "Publication type (uppercased).",
        "enum": [
          "ARTICLE",
          "BOOK",
          "CHAPTER",
          "THESIS",
          "CONFERENCE",
          "CONFERENCE_PAPER",
          "REPORT",
          "DATASET",
          "PREPRINT",
          "REVIEW",
          "EDITORIAL",
          "OTHER",
          null
        ]
      },
      "language": {
        "type": "string",
        "nullable": true,
        "description": "ISO 639-1 language from works.language."
      },
      "publication_year": {
        "type": "integer",
        "nullable": true,
        "description": "Generated p.year."
      },
      "publication_date": {
        "type": "string",
        "format": "date-time",
        "nullable": true
      },
      "volume": {
        "type": "string",
        "nullable": true
      },
      "issue": {
        "type": "string",
        "nullable": true
      },
      "pages": {
        "type": "string",
        "nullable": true
      },
      "source": {
        "type": "string",
        "nullable": true,
        "description": "Provenance source, e.g. crossref."
      },
      "license_url": {
        "type": "string",
        "nullable": true,
        "description": "License URL or license code (e.g. 'cc-by')."
      },
      "license_version": {
        "type": "string",
        "nullable": true,
        "description": "e.g. 'vor', 'unspecified'."
      },
      "open_access": {
        "type": "boolean",
        "nullable": true
      },
      "peer_reviewed": {
        "type": "boolean",
        "nullable": true
      },
      "has_files": {
        "type": "boolean",
        "description": "Whether any file is attached (derived live from the files table)."
      },
      "has_scimag_file": {
        "type": "boolean"
      },
      "has_libgen_file": {
        "type": "boolean"
      },
      "venue": {
        "$ref": "#/components/schemas/PublicationVenueRef"
      },
      "publisher": {
        "$ref": "#/components/schemas/PublicationPublisherRef"
      },
      "identifiers": {
        "$ref": "#/components/schemas/PublicationIdentifiers"
      },
      "first_author": {
        "$ref": "#/components/schemas/PublicationFirstAuthor"
      },
      "author_count": {
        "type": "integer",
        "description": "Count of hydrated authorships."
      },
      "citation_count": {
        "type": "integer",
        "description": "Parent work citation_count (default 0)."
      },
      "reference_count": {
        "type": "integer",
        "description": "Parent work reference_count (default 0)."
      },
      "download_count": {
        "type": "integer",
        "description": "Publication download_count (default 0)."
      }
    }
  },
  "PublicationWorkBlock": {
    "type": "object",
    "description": "Parent work block embedded in the publication detail.",
    "properties": {
      "id": {
        "type": "integer"
      },
      "title": {
        "type": "string",
        "nullable": true
      },
      "subtitle": {
        "type": "string",
        "nullable": true
      },
      "abstract": {
        "type": "string",
        "nullable": true
      },
      "type": {
        "type": "string",
        "nullable": true
      },
      "language": {
        "type": "string",
        "nullable": true
      },
      "citation_count": {
        "type": "integer"
      },
      "reference_count": {
        "type": "integer"
      },
      "authors": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "person_id": {
              "type": "integer"
            },
            "preferred_name": {
              "type": "string",
              "nullable": true
            },
            "role": {
              "type": "string",
              "description": "Author role; default AUTHOR."
            },
            "position": {
              "type": "integer",
              "nullable": true
            },
            "is_corresponding": {
              "type": "boolean",
              "nullable": true
            }
          }
        }
      },
      "subjects": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "subject_id": {
              "type": "integer"
            },
            "term": {
              "type": "string",
              "nullable": true
            },
            "vocabulary": {
              "type": "string",
              "description": "Default KEYWORD."
            },
            "lang": {
              "type": "string",
              "nullable": true
            }
          }
        }
      }
    }
  },
  "PublicationSibling": {
    "type": "object",
    "description": "Another publication of the same parent work.",
    "properties": {
      "id": {
        "type": "integer"
      },
      "doi": {
        "type": "string",
        "nullable": true
      },
      "publication_year": {
        "type": "integer",
        "nullable": true
      },
      "publication_date": {
        "type": "string",
        "format": "date-time",
        "nullable": true
      },
      "volume": {
        "type": "string",
        "nullable": true
      },
      "issue": {
        "type": "string",
        "nullable": true
      },
      "pages": {
        "type": "string",
        "nullable": true
      },
      "open_access": {
        "type": "boolean",
        "nullable": true
      },
      "peer_reviewed": {
        "type": "boolean",
        "nullable": true
      },
      "has_files": {
        "type": "boolean"
      },
      "venue": {
        "$ref": "#/components/schemas/PublicationVenueRef"
      },
      "_links": {
        "type": "object",
        "properties": {
          "self": {
            "type": "string"
          }
        }
      }
    }
  },
  "PublicationCitationRow": {
    "type": "object",
    "description": "A citing/cited resolved work row.",
    "properties": {
      "work_id": {
        "type": "integer"
      },
      "title": {
        "type": "string",
        "nullable": true
      },
      "type": {
        "type": "string",
        "nullable": true
      },
      "year": {
        "type": "integer",
        "nullable": true
      },
      "venue_name": {
        "type": "string",
        "nullable": true
      },
      "venue_abbreviated_name": {
        "type": "string",
        "nullable": true
      },
      "doi": {
        "type": "string",
        "nullable": true
      },
      "authors": {
        "type": "string",
        "nullable": true,
        "description": "Semicolon-joined author names."
      },
      "authors_count": {
        "type": "integer"
      },
      "open_access": {
        "type": "boolean",
        "nullable": true
      },
      "citation_type": {
        "type": "string",
        "description": "e.g. NEUTRAL."
      },
      "citation_status": {
        "type": "string",
        "nullable": true,
        "description": "RESOLVED | PENDING | FAILED | null."
      },
      "citation_context": {
        "type": "string",
        "nullable": true
      }
    }
  },
  "PublicationUnresolvedReference": {
    "type": "object",
    "description": "An unresolved (cited but not yet in DB) reference.",
    "properties": {
      "cited_doi": {
        "type": "string",
        "nullable": true
      },
      "status": {
        "type": "string",
        "description": "PENDING | FAILED."
      },
      "citation_type": {
        "type": "string"
      },
      "created_at": {
        "type": "string",
        "format": "date-time",
        "nullable": true
      },
      "resolved_at": {
        "type": "string",
        "format": "date-time",
        "nullable": true
      }
    }
  },
  "PublicationDetail": {
    "type": "object",
    "description": "A single publication (GET /publications/{id} and the DOI resolver).",
    "properties": {
      "id": {
        "type": "integer"
      },
      "identifiers": {
        "$ref": "#/components/schemas/PublicationIdentifiers"
      },
      "publication_date": {
        "type": "string",
        "format": "date-time",
        "nullable": true
      },
      "publication_year": {
        "type": "integer",
        "nullable": true
      },
      "volume": {
        "type": "string",
        "nullable": true
      },
      "issue": {
        "type": "string",
        "nullable": true
      },
      "pages": {
        "type": "string",
        "nullable": true
      },
      "language": {
        "type": "string",
        "nullable": true
      },
      "open_access": {
        "type": "boolean",
        "nullable": true
      },
      "peer_reviewed": {
        "type": "boolean",
        "nullable": true
      },
      "has_files": {
        "type": "boolean"
      },
      "has_scimag_file": {
        "type": "boolean"
      },
      "has_libgen_file": {
        "type": "boolean"
      },
      "download_count": {
        "type": "integer"
      },
      "license_url": {
        "type": "string",
        "nullable": true
      },
      "license_version": {
        "type": "string",
        "nullable": true
      },
      "source": {
        "type": "string",
        "nullable": true
      },
      "source_indexed_at": {
        "type": "string",
        "format": "date-time",
        "nullable": true,
        "description": "Detail-only field."
      },
      "venue": {
        "$ref": "#/components/schemas/PublicationVenueRef"
      },
      "publisher": {
        "$ref": "#/components/schemas/PublicationPublisherRef"
      },
      "files": {
        "type": "array",
        "items": {
          "$ref": "#/components/schemas/PublicationFile"
        }
      },
      "work": {
        "$ref": "#/components/schemas/PublicationWorkBlock"
      },
      "siblings": {
        "type": "array",
        "items": {
          "$ref": "#/components/schemas/PublicationSibling"
        }
      },
      "citations": {
        "type": "array",
        "nullable": true,
        "description": "Incoming citations (works citing this), capped at 100. null when include_citations=false.",
        "items": {
          "$ref": "#/components/schemas/PublicationCitationRow"
        }
      },
      "references": {
        "type": "object",
        "nullable": true,
        "description": "Outgoing references, capped at 100 each. null when include_references=false.",
        "properties": {
          "resolved": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/PublicationCitationRow"
            }
          },
          "unresolved": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/PublicationUnresolvedReference"
            }
          }
        }
      },
      "created_at": {
        "type": "string",
        "format": "date-time",
        "nullable": true
      },
      "updated_at": {
        "type": "string",
        "format": "date-time",
        "nullable": true
      }
    }
  },
  "PersonListItem": {
    "type": "object",
    "description": "A person row on GET /persons. Identifiers live only under identifiers{}.",
    "properties": {
      "id": {
        "type": "integer"
      },
      "_links": {
        "type": "object",
        "properties": {
          "self": {
            "type": "string",
            "description": "/persons/{id}"
          }
        }
      },
      "preferred_name": {
        "type": "string",
        "nullable": true
      },
      "given_names": {
        "type": "string",
        "nullable": true
      },
      "family_name": {
        "type": "string",
        "nullable": true
      },
      "name_signature": {
        "type": "string",
        "nullable": true,
        "description": "Normalized signature (e.g. 'DE OLIVEIRA W G'); null when unmapped."
      },
      "identifiers": {
        "type": "object",
        "description": "Person identifiers (the ONLY place identifiers appear; never duplicated at top level). On the list surface only orcid may be populated; wikidata_id/openalex_id/url are always null there.",
        "properties": {
          "orcid": {
            "type": "string",
            "nullable": true
          },
          "lattes_id": {
            "type": "string",
            "nullable": true
          },
          "scopus_id": {
            "type": "string",
            "nullable": true
          },
          "wikidata_id": {
            "type": "string",
            "nullable": true
          },
          "openalex_id": {
            "type": "string",
            "nullable": true
          },
          "url": {
            "type": "string",
            "nullable": true
          }
        }
      },
      "is_verified": {
        "type": "boolean"
      },
      "metrics": {
        "type": "object",
        "properties": {
          "works_count": {
            "type": "integer",
            "description": "From persons.total_works."
          },
          "latest_publication_year": {
            "type": "integer",
            "nullable": true
          }
        }
      }
    }
  },
  "PersonDetail": {
    "type": "object",
    "description": "Full person profile on GET /persons/{id}.",
    "properties": {
      "id": {
        "type": "integer"
      },
      "_links": {
        "type": "object",
        "properties": {
          "self": {
            "type": "string",
            "description": "/persons/{id}"
          }
        }
      },
      "preferred_name": {
        "type": "string",
        "nullable": true
      },
      "given_names": {
        "type": "string",
        "nullable": true
      },
      "family_name": {
        "type": "string",
        "nullable": true
      },
      "name_variations": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Always empty ([]) — not yet populated."
      },
      "name_signature": {
        "type": "string",
        "nullable": true
      },
      "identifiers": {
        "type": "object",
        "description": "Person identifiers (the ONLY place identifiers appear; never duplicated at top level). On the list surface only orcid may be populated; wikidata_id/openalex_id/url are always null there.",
        "properties": {
          "orcid": {
            "type": "string",
            "nullable": true
          },
          "lattes_id": {
            "type": "string",
            "nullable": true
          },
          "scopus_id": {
            "type": "string",
            "nullable": true
          },
          "wikidata_id": {
            "type": "string",
            "nullable": true
          },
          "openalex_id": {
            "type": "string",
            "nullable": true
          },
          "url": {
            "type": "string",
            "nullable": true
          }
        }
      },
      "is_verified": {
        "type": "boolean"
      },
      "metrics": {
        "type": "object",
        "properties": {
          "works_count": {
            "type": "integer",
            "description": "From persons.total_works."
          },
          "latest_publication_year": {
            "type": "integer",
            "nullable": true
          }
        }
      },
      "primary_affiliation": {
        "type": "object",
        "nullable": true,
        "description": "Most-frequent affiliated organization (compact; NOT a full Organization). Null when no affiliation.",
        "properties": {
          "id": {
            "type": "integer"
          },
          "name": {
            "type": "string",
            "nullable": true
          },
          "type": {
            "type": "string",
            "nullable": true
          },
          "country_code": {
            "type": "string",
            "nullable": true
          },
          "_links": {
            "type": "object",
            "properties": {
              "self": {
                "type": "string",
                "description": "/institutions/{id}"
              }
            }
          }
        }
      },
      "authorship_profile": {
        "type": "object",
        "properties": {
          "works_count": {
            "type": "integer"
          },
          "author_count": {
            "type": "integer",
            "description": "Distinct works with role AUTHOR."
          },
          "editor_count": {
            "type": "integer",
            "description": "Distinct works with role EDITOR."
          },
          "total_citations": {
            "type": "integer",
            "nullable": true,
            "description": "From persons.total_citations."
          },
          "open_access_works": {
            "type": "integer",
            "nullable": true,
            "description": "Always null (not yet computed)."
          },
          "first_publication_year": {
            "type": "integer",
            "nullable": true
          },
          "latest_publication_year": {
            "type": "integer",
            "nullable": true
          },
          "h_index": {
            "type": "integer",
            "nullable": true,
            "description": "From persons.h_index."
          }
        }
      },
      "subject_expertise": {
        "type": "array",
        "description": "Top 10 subjects by works_count.",
        "items": {
          "type": "object",
          "properties": {
            "subject_id": {
              "type": "integer"
            },
            "term": {
              "type": "string"
            },
            "vocabulary": {
              "type": "string",
              "nullable": true,
              "description": "e.g. OpenAlex, OpenLibrary, Keyword."
            },
            "works_count": {
              "type": "integer"
            }
          }
        }
      },
      "top_collaborators": {
        "type": "array",
        "description": "Top 10 collaborators by shared works.",
        "items": {
          "type": "object",
          "properties": {
            "person_id": {
              "type": "integer"
            },
            "preferred_name": {
              "type": "string",
              "nullable": true
            },
            "shared_works_count": {
              "type": "integer"
            }
          }
        }
      },
      "recent_works": {
        "type": "array",
        "description": "Up to 10 most recent works.",
        "items": {
          "type": "object",
          "properties": {
            "id": {
              "type": "integer"
            },
            "title": {
              "type": "string",
              "nullable": true
            },
            "subtitle": {
              "type": "string",
              "nullable": true
            },
            "type": {
              "type": "string",
              "nullable": true,
              "description": "Type of the latest publication."
            },
            "language": {
              "type": "string",
              "nullable": true,
              "description": "ISO 639-1."
            },
            "publication_year": {
              "type": "integer",
              "nullable": true
            },
            "doi": {
              "type": "string",
              "nullable": true
            },
            "open_access": {
              "type": "boolean"
            },
            "role": {
              "type": "string",
              "nullable": true,
              "enum": [
                "AUTHOR",
                "EDITOR"
              ]
            },
            "position": {
              "type": "integer",
              "nullable": true,
              "description": "Author position."
            },
            "venue": {
              "type": "object",
              "nullable": true,
              "properties": {
                "id": {
                  "type": "integer"
                },
                "name": {
                  "type": "string",
                  "nullable": true
                },
                "abbreviated_name": {
                  "type": "string",
                  "nullable": true
                },
                "type": {
                  "type": "string",
                  "nullable": true,
                  "enum": [
                    "JOURNAL",
                    "CONFERENCE",
                    "REPOSITORY",
                    "BOOK_SERIES",
                    "SOURCE_BOOK",
                    "OTHER"
                  ]
                }
              }
            }
          }
        }
      },
      "created_at": {
        "type": "string",
        "format": "date-time"
      },
      "updated_at": {
        "type": "string",
        "format": "date-time"
      }
    }
  },
  "PersonSignature": {
    "type": "object",
    "description": "A signature row on GET /persons/{id}/signatures.",
    "properties": {
      "id": {
        "type": "integer",
        "description": "Signature ID."
      },
      "signature": {
        "type": "string",
        "description": "Normalized signature text."
      },
      "created_at": {
        "type": "string",
        "format": "date-time"
      },
      "persons_count": {
        "type": "integer",
        "description": "Count of persons sharing this signature."
      }
    }
  },
  "PersonWork": {
    "type": "object",
    "description": "A work row on GET /persons/{id}/works.",
    "properties": {
      "id": {
        "type": "integer",
        "description": "Work ID."
      },
      "title": {
        "type": "string",
        "nullable": true
      },
      "subtitle": {
        "type": "string",
        "nullable": true
      },
      "abstract": {
        "type": "string",
        "nullable": true
      },
      "type": {
        "type": "string",
        "nullable": true,
        "description": "Type of the latest publication."
      },
      "language": {
        "type": "string",
        "nullable": true,
        "description": "ISO 639-1."
      },
      "doi": {
        "type": "string",
        "nullable": true
      },
      "publication_year": {
        "type": "integer",
        "nullable": true,
        "description": "Top-level publication year."
      },
      "open_access": {
        "type": "boolean",
        "description": "Top-level open-access flag."
      },
      "cited_by_count": {
        "type": "integer",
        "description": "From works.citation_count."
      },
      "references_count": {
        "type": "integer",
        "description": "From works.reference_count."
      },
      "authorship": {
        "type": "object",
        "description": "How this person is credited on the work. One row per work even when the person holds several roles.",
        "properties": {
          "role": {
            "type": "string",
            "enum": [
              "AUTHOR",
              "EDITOR",
              "TRANSLATOR",
              "REVIEWER"
            ],
            "description": "Highest-ranked role this person holds on the work."
          },
          "roles": {
            "type": "array",
            "items": {
              "type": "string",
              "enum": [
                "AUTHOR",
                "EDITOR",
                "TRANSLATOR",
                "REVIEWER"
              ]
            },
            "description": "Every role this person holds on the work."
          },
          "position": {
            "type": "integer",
            "nullable": true,
            "description": "1-based position within the primary role, not within the work."
          },
          "is_corresponding": {
            "type": "boolean"
          }
        }
      },
      "publication": {
        "type": "object",
        "properties": {
          "year": {
            "type": "integer",
            "nullable": true
          },
          "journal": {
            "type": "string",
            "nullable": true,
            "description": "Venue name."
          },
          "volume": {
            "type": "string",
            "nullable": true
          },
          "issue": {
            "type": "string",
            "nullable": true
          },
          "pages": {
            "type": "string",
            "nullable": true
          },
          "open_access": {
            "type": "boolean"
          }
        }
      },
      "authors": {
        "type": "object",
        "properties": {
          "total_count": {
            "type": "integer",
            "description": "Total authorship rows for the work."
          },
          "author_string": {
            "type": "string",
            "nullable": true,
            "description": "'; '-joined author names."
          }
        }
      },
      "created_at": {
        "type": "string",
        "format": "date-time"
      }
    }
  },
  "CollaborationPair": {
    "type": "object",
    "description": "One research partnership on /collaborations/top: a pair of persons who co-authored, with shared-work metrics and timespan.",
    "properties": {
      "ranking": {
        "type": "integer",
        "nullable": true,
        "description": "1-based rank of the pair within the full result set (by shared works descending)."
      },
      "collaborators": {
        "type": "object",
        "properties": {
          "person_1": {
            "type": "object",
            "description": "The lower person id of the pair.",
            "properties": {
              "id": {
                "type": "integer"
              },
              "name": {
                "type": "string",
                "nullable": true,
                "description": "persons.preferred_name."
              }
            }
          },
          "person_2": {
            "type": "object",
            "description": "The higher person id of the pair.",
            "properties": {
              "id": {
                "type": "integer"
              },
              "name": {
                "type": "string",
                "nullable": true,
                "description": "persons.preferred_name."
              }
            }
          }
        }
      },
      "metrics": {
        "type": "object",
        "properties": {
          "shared_works": {
            "type": "integer",
            "description": "Distinct works co-authored by both persons."
          },
          "avg_shared_citations": {
            "type": "number",
            "description": "Average citation_count across the shared works (0 or fractional)."
          },
          "collaboration_strength": {
            "type": "string",
            "enum": [
              "very_strong",
              "strong",
              "moderate",
              "weak"
            ],
            "description": "very_strong >=10, strong >=5, moderate >=2, weak otherwise (by shared_works)."
          }
        }
      },
      "timespan": {
        "type": "object",
        "properties": {
          "first_collaboration_year": {
            "type": "integer",
            "nullable": true,
            "description": "Earliest shared publication year."
          },
          "latest_collaboration_year": {
            "type": "integer",
            "nullable": true,
            "description": "Most recent shared publication year."
          },
          "collaboration_years": {
            "type": "integer",
            "description": "latest - first + 1, or 0 when either year is null."
          }
        }
      }
    }
  },
  "PersonCollaborator": {
    "type": "object",
    "description": "One co-author on /persons/{id}/collaborators, with shared-work metrics and timespan relative to the queried person.",
    "properties": {
      "collaborator": {
        "type": "object",
        "properties": {
          "id": {
            "type": "integer",
            "description": "Co-author person id."
          },
          "name": {
            "type": "string",
            "nullable": true,
            "description": "persons.preferred_name."
          }
        }
      },
      "metrics": {
        "type": "object",
        "properties": {
          "shared_works": {
            "type": "integer",
            "description": "Distinct works co-authored with the queried person."
          },
          "avg_shared_citations": {
            "type": "number",
            "description": "Average citation_count across the shared works (0 or fractional)."
          },
          "collaboration_strength": {
            "type": "string",
            "enum": [
              "very_strong",
              "strong",
              "moderate",
              "weak"
            ],
            "description": "very_strong >=10, strong >=5, moderate >=2, weak otherwise (by shared_works)."
          }
        }
      },
      "timespan": {
        "type": "object",
        "properties": {
          "first_collaboration_year": {
            "type": "integer",
            "nullable": true,
            "description": "Earliest shared publication year."
          },
          "latest_collaboration_year": {
            "type": "integer",
            "nullable": true,
            "description": "Most recent shared publication year."
          },
          "collaboration_years": {
            "type": "integer",
            "description": "latest - first + 1, or 0 when either year is null."
          }
        }
      }
    }
  },
  "PersonNetwork": {
    "type": "object",
    "description": "Co-authorship ego-network for /persons/{id}/network. Nodes are keyed by stringified person-id (map, not array); edges are undirected co-authorship links with shared-work weight >= 2. Capped at 120 nodes with a per-node fan-out of 20 direct collaborators.",
    "properties": {
      "central_person_id": {
        "type": "integer",
        "description": "The queried (central) person id."
      },
      "network_depth": {
        "type": "integer",
        "description": "Effective BFS depth (clamped 1..3)."
      },
      "nodes": {
        "type": "object",
        "description": "Map keyed by stringified person-id.",
        "additionalProperties": {
          "type": "object",
          "properties": {
            "id": {
              "type": "integer"
            },
            "name": {
              "type": "string",
              "nullable": true,
              "description": "persons.preferred_name."
            },
            "type": {
              "type": "string",
              "enum": [
                "central",
                "direct_collaborator",
                "indirect_collaborator"
              ],
              "description": "central at level 0, direct_collaborator at level 1, indirect_collaborator at level >= 2."
            },
            "level": {
              "type": "integer",
              "description": "BFS distance from the central person (0 = central)."
            }
          }
        }
      },
      "edges": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "source": {
              "type": "integer",
              "description": "Person id."
            },
            "target": {
              "type": "integer",
              "description": "Person id."
            },
            "weight": {
              "type": "integer",
              "description": "Shared-work count between source and target (>= 2)."
            },
            "relationship": {
              "type": "string",
              "enum": [
                "collaboration"
              ],
              "description": "Always 'collaboration'."
            }
          }
        }
      },
      "network_stats": {
        "type": "object",
        "properties": {
          "total_nodes": {
            "type": "integer"
          },
          "total_edges": {
            "type": "integer"
          },
          "direct_collaborators": {
            "type": "integer",
            "description": "Count of level-1 nodes (fan-out capped at 20)."
          },
          "network_density": {
            "type": "number",
            "description": "edges / (n*(n-1)/2), rounded to 3 decimals."
          }
        }
      }
    }
  },
  "VenueListItem": {
    "type": "object",
    "description": "A venue row as returned by GET /venues and GET /venues/search.",
    "properties": {
      "id": {
        "type": "integer",
        "description": "Venue id."
      },
      "_links": {
        "type": "object",
        "properties": {
          "self": {
            "type": "string",
            "description": "Canonical path, /venues/{id}."
          }
        }
      },
      "name": {
        "type": "string",
        "nullable": true,
        "description": "Official venue name."
      },
      "abbreviated_name": {
        "type": "string",
        "nullable": true,
        "description": "Short/abbreviated name (always paired with name)."
      },
      "type": {
        "type": "string",
        "nullable": true,
        "enum": [
          "JOURNAL",
          "CONFERENCE",
          "REPOSITORY",
          "BOOK_SERIES",
          "SOURCE_BOOK",
          "OTHER"
        ],
        "description": "Venue type. SOURCE_BOOK is the dominant type (~87% of venues)."
      },
      "aggregation_type": {
        "type": "string",
        "nullable": true,
        "description": "Aggregation type, e.g. journal, bookseries, repository."
      },
      "country_code": {
        "type": "string",
        "nullable": true,
        "description": "ISO-2 country code."
      },
      "language": {
        "type": "string",
        "nullable": true,
        "description": "Primary language, ISO 639-1 (from venues.lang)."
      },
      "homepage_url": {
        "type": "string",
        "nullable": true,
        "description": "Venue homepage URL."
      },
      "open_access": {
        "type": "boolean",
        "nullable": true,
        "description": "Fully open-access policy flag."
      },
      "coverage_start_year": {
        "type": "integer",
        "nullable": true,
        "description": "First year of coverage."
      },
      "coverage_end_year": {
        "type": "integer",
        "nullable": true,
        "description": "Last year of coverage; may hold a future/garbage year from source data."
      },
      "works_count": {
        "type": "integer",
        "description": "Number of works in the venue (defaults 0)."
      },
      "cited_by_count": {
        "type": "integer",
        "description": "Total incoming citations (defaults 0)."
      },
      "publisher": {
        "type": "object",
        "nullable": true,
        "description": "Publishing organization, or null when absent.",
        "properties": {
          "id": {
            "type": "integer"
          },
          "name": {
            "type": "string",
            "nullable": true
          },
          "type": {
            "type": "string",
            "nullable": true
          },
          "country_code": {
            "type": "string",
            "nullable": true
          }
        }
      },
      "identifiers": {
        "type": "object",
        "description": "External identifiers (mag_id is never exposed).",
        "properties": {
          "issn": {
            "type": "string",
            "nullable": true
          },
          "eissn": {
            "type": "string",
            "nullable": true
          },
          "scopus_id": {
            "type": "string",
            "nullable": true
          },
          "wikidata_id": {
            "type": "string",
            "nullable": true
          },
          "openalex_id": {
            "type": "string",
            "nullable": true
          },
          "scielo_id": {
            "type": "string",
            "nullable": true
          }
        }
      },
      "indexing": {
        "type": "object",
        "properties": {
          "is_in_doaj": {
            "type": "boolean",
            "nullable": true
          },
          "is_in_scielo": {
            "type": "boolean",
            "nullable": true
          },
          "is_indexed_in_scopus": {
            "type": "boolean",
            "nullable": true
          },
          "validation_status": {
            "type": "string",
            "nullable": true,
            "enum": [
              "PENDING",
              "VALIDATED",
              "NOT_FOUND",
              "FAILED"
            ],
            "description": "Validation audit status."
          }
        }
      },
      "metrics": {
        "type": "object",
        "description": "Bibliometric metrics.",
        "properties": {
          "impact_factor": {
            "type": "number",
            "nullable": true
          },
          "citescore": {
            "type": "number",
            "nullable": true
          },
          "sjr": {
            "type": "number",
            "nullable": true
          },
          "snip": {
            "type": "number",
            "nullable": true
          },
          "h_index": {
            "type": "integer",
            "nullable": true
          },
          "i10_index": {
            "type": "integer",
            "nullable": true
          },
          "two_yr_mean_citedness": {
            "type": "number",
            "nullable": true
          }
        }
      },
      "ranking": {
        "type": "object",
        "description": "Global ranking. score = subject + oa + impact + llm (components sum exactly to score).",
        "properties": {
          "score": {
            "type": "number",
            "nullable": true,
            "description": "Total ranking score (venues.total_score)."
          },
          "components": {
            "type": "object",
            "properties": {
              "subject": {
                "type": "number",
                "nullable": true
              },
              "oa": {
                "type": "number",
                "nullable": true
              },
              "impact": {
                "type": "number",
                "nullable": true,
                "description": "Blended bibliometric impact component (venues.impact_score)."
              },
              "llm": {
                "type": "number",
                "nullable": true
              }
            }
          },
          "llm": {
            "type": "object",
            "properties": {
              "relevance": {
                "type": "integer",
                "nullable": true,
                "description": "LLM relevance rating, 0-5."
              },
              "justification": {
                "type": "string",
                "nullable": true,
                "description": "LLM free-text justification."
              }
            }
          }
        }
      },
      "subjects": {
        "type": "array",
        "description": "Top subjects (capped at 5 on list rows, 10 on detail).",
        "items": {
          "type": "object",
          "properties": {
            "subject_id": {
              "type": "integer",
              "nullable": true
            },
            "term": {
              "type": "string",
              "nullable": true
            },
            "score": {
              "type": "number",
              "nullable": true
            },
            "vocabulary": {
              "type": "string",
              "nullable": true
            },
            "lang": {
              "type": "string",
              "nullable": true
            }
          }
        }
      }
    }
  },
  "VenueDetail": {
    "allOf": [
      {
        "$ref": "#/components/schemas/VenueListItem"
      },
      {
        "type": "object",
        "description": "Detail-only fields added by GET /venues/{id}.",
        "properties": {
          "created_at": {
            "type": "string",
            "format": "date-time",
            "nullable": true
          },
          "updated_at": {
            "type": "string",
            "format": "date-time",
            "nullable": true
          },
          "last_validated_at": {
            "type": "string",
            "format": "date-time",
            "nullable": true
          },
          "summary_updated_at": {
            "type": "string",
            "format": "date-time",
            "nullable": true
          },
          "publication_summary": {
            "type": "object",
            "properties": {
              "first_publication_year": {
                "type": "integer",
                "nullable": true,
                "description": "Falls back to coverage range."
              },
              "latest_publication_year": {
                "type": "integer",
                "nullable": true
              },
              "total_works_count": {
                "type": "integer",
                "description": "Derived from the per-year aggregation."
              },
              "open_access_works_count": {
                "type": "integer"
              },
              "open_access_percentage": {
                "type": "number",
                "nullable": true,
                "description": "0-100, one decimal; null when no yearly data."
              },
              "publication_trend": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "year": {
                      "type": "integer",
                      "nullable": true
                    },
                    "works_count": {
                      "type": "integer"
                    },
                    "oa_works_count": {
                      "type": "integer"
                    }
                  }
                }
              }
            }
          },
          "yearly_stats": {
            "type": "array",
            "description": "Per-year statistics (gated by include_yearly).",
            "items": {
              "type": "object",
              "properties": {
                "year": {
                  "type": "integer",
                  "nullable": true
                },
                "works_count": {
                  "type": "integer"
                },
                "oa_works_count": {
                  "type": "integer"
                },
                "cited_by_count": {
                  "type": "integer"
                }
              }
            }
          },
          "top_authors": {
            "type": "array",
            "description": "Top authors in the venue (gated by include_top_authors; up to 10).",
            "items": {
              "type": "object",
              "properties": {
                "person_id": {
                  "type": "integer"
                },
                "name": {
                  "type": "string",
                  "nullable": true
                },
                "works_count": {
                  "type": "integer"
                },
                "best_position": {
                  "type": "integer",
                  "nullable": true
                },
                "is_corresponding": {
                  "type": "boolean",
                  "nullable": true
                }
              }
            }
          },
          "top_publications": {
            "type": "array",
            "description": "Most cited publications in the venue (always present when non-empty; no include flag; up to 10).",
            "items": {
              "type": "object",
              "properties": {
                "publication_id": {
                  "type": "integer"
                },
                "work_id": {
                  "type": "integer"
                },
                "title": {
                  "type": "string",
                  "nullable": true
                },
                "publication_year": {
                  "type": "integer",
                  "nullable": true
                },
                "doi": {
                  "type": "string",
                  "nullable": true
                },
                "open_access": {
                  "type": "boolean",
                  "nullable": true
                },
                "citation_count": {
                  "type": "integer"
                }
              }
            }
          },
          "recent_works": {
            "type": "array",
            "description": "Most recent works in the venue (gated by include_recent_works).",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "integer"
                },
                "title": {
                  "type": "string",
                  "nullable": true
                },
                "subtitle": {
                  "type": "string",
                  "nullable": true
                },
                "abstract": {
                  "type": "string",
                  "nullable": true
                },
                "type": {
                  "type": "string",
                  "nullable": true
                },
                "language": {
                  "type": "string",
                  "nullable": true
                },
                "publication_year": {
                  "type": "integer",
                  "nullable": true
                },
                "volume": {
                  "type": "string",
                  "nullable": true
                },
                "issue": {
                  "type": "string",
                  "nullable": true
                },
                "pages": {
                  "type": "string",
                  "nullable": true
                },
                "doi": {
                  "type": "string",
                  "nullable": true
                },
                "open_access": {
                  "type": "boolean",
                  "nullable": true
                },
                "peer_reviewed": {
                  "type": "boolean",
                  "nullable": true
                },
                "publication_date": {
                  "type": "string",
                  "format": "date-time",
                  "nullable": true
                },
                "author_count": {
                  "type": "integer"
                },
                "authors": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "person_id": {
                        "type": "integer"
                      },
                      "name": {
                        "type": "string",
                        "nullable": true
                      },
                      "position": {
                        "type": "integer"
                      },
                      "is_corresponding": {
                        "type": "boolean",
                        "nullable": true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    ]
  },
  "VenueWork": {
    "type": "object",
    "description": "A work published in a venue, as returned by GET /venues/{id}/works. Note the publication year is keyed `year` (not publication_year).",
    "properties": {
      "id": {
        "type": "integer",
        "description": "Work id."
      },
      "title": {
        "type": "string",
        "nullable": true
      },
      "subtitle": {
        "type": "string",
        "nullable": true
      },
      "abstract": {
        "type": "string",
        "nullable": true
      },
      "type": {
        "type": "string",
        "nullable": true,
        "description": "Publication type."
      },
      "language": {
        "type": "string",
        "nullable": true
      },
      "year": {
        "type": "integer",
        "nullable": true,
        "description": "Publication year (keyed `year`)."
      },
      "volume": {
        "type": "string",
        "nullable": true
      },
      "issue": {
        "type": "string",
        "nullable": true
      },
      "pages": {
        "type": "string",
        "nullable": true
      },
      "doi": {
        "type": "string",
        "nullable": true
      },
      "open_access": {
        "type": "boolean",
        "nullable": true
      },
      "peer_reviewed": {
        "type": "boolean",
        "nullable": true
      },
      "publication_date": {
        "type": "string",
        "format": "date-time",
        "nullable": true
      },
      "cited_by_count": {
        "type": "integer",
        "description": "Incoming citations (works.citation_count)."
      },
      "references_count": {
        "type": "integer",
        "description": "Outgoing references."
      },
      "author_count": {
        "type": "integer"
      },
      "authors": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "person_id": {
              "type": "integer"
            },
            "name": {
              "type": "string",
              "nullable": true
            },
            "position": {
              "type": "integer"
            },
            "is_corresponding": {
              "type": "boolean",
              "nullable": true
            }
          }
        }
      }
    }
  },
  "VenueStatistics": {
    "type": "object",
    "description": "Flat aggregate venue statistics from GET /venues/statistics.",
    "properties": {
      "total_venues": {
        "type": "integer"
      },
      "journals": {
        "type": "integer",
        "description": "Count of JOURNAL venues."
      },
      "conferences": {
        "type": "integer",
        "description": "Count of CONFERENCE venues."
      },
      "repositories": {
        "type": "integer",
        "description": "Count of REPOSITORY venues."
      },
      "book_series": {
        "type": "integer",
        "description": "Count of BOOK_SERIES venues."
      },
      "source_books": {
        "type": "integer",
        "description": "Count of SOURCE_BOOK venues (dominant type)."
      },
      "other": {
        "type": "integer",
        "description": "Count of OTHER venues."
      },
      "with_impact_factor": {
        "type": "integer",
        "description": "Venues that have an impact factor."
      },
      "avg_impact_factor": {
        "type": "number"
      },
      "max_impact_factor": {
        "type": "number"
      },
      "min_impact_factor": {
        "type": "number"
      },
      "indexed_in_doaj": {
        "type": "integer"
      },
      "indexed_in_scielo": {
        "type": "integer"
      },
      "indexed_in_scopus": {
        "type": "integer"
      },
      "avg_global_ranking_score": {
        "type": "number",
        "description": "Average of venues.total_score."
      }
    }
  },
  "OrganizationListItem": {
    "type": "object",
    "description": "One organization in the /institutions listing. Browse is activity-gated (publication_count>0) so in practice type is always INSTITUTE here. Metric columns are operator-maintained and presented verbatim.",
    "properties": {
      "id": {
        "type": "integer",
        "description": "Organization id."
      },
      "name": {
        "type": "string",
        "description": "Canonical organization name."
      },
      "type": {
        "type": "string",
        "enum": [
          "UNIVERSITY",
          "INSTITUTE",
          "PUBLISHER",
          "FUNDER",
          "COMPANY",
          "OTHER"
        ],
        "description": "Organization type. Only INSTITUTE appears on browse."
      },
      "openalex_type": {
        "type": "string",
        "nullable": true,
        "description": "Finer OpenAlex institution type, e.g. education, government, healthcare, nonprofit, funder, company, archive."
      },
      "status": {
        "type": "string",
        "enum": [
          "active",
          "inactive",
          "withdrawn"
        ],
        "nullable": true,
        "description": "Lifecycle status."
      },
      "acronyms": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Known acronyms; may be empty."
      },
      "location": {
        "type": "object",
        "nullable": true,
        "description": "Null when both fields are null.",
        "properties": {
          "country_code": {
            "type": "string",
            "nullable": true,
            "description": "ISO 3166-1 alpha-2."
          },
          "city": {
            "type": "string",
            "nullable": true
          }
        }
      },
      "identifiers": {
        "type": "object",
        "properties": {
          "ror_id": {
            "type": "string",
            "nullable": true,
            "description": "ROR id (no URL prefix)."
          },
          "grid_id": {
            "type": "string",
            "nullable": true,
            "description": "GRID id."
          },
          "wikidata_id": {
            "type": "string",
            "nullable": true,
            "description": "Wikidata Q-id."
          },
          "openalex_id": {
            "type": "string",
            "nullable": true,
            "description": "OpenAlex I-id."
          },
          "url": {
            "type": "string",
            "nullable": true,
            "description": "Homepage URL."
          }
        }
      },
      "metrics": {
        "type": "object",
        "description": "Operator-maintained metric columns, presented verbatim.",
        "properties": {
          "works_count": {
            "type": "integer",
            "description": "Local works count (stored publication_count)."
          },
          "researchers_count": {
            "type": "integer",
            "description": "Distinct affiliated authors (stored researcher_count)."
          },
          "total_citations": {
            "type": "integer",
            "description": "Total incoming citations."
          },
          "h_index": {
            "type": "integer",
            "nullable": true
          },
          "i10_index": {
            "type": "integer",
            "nullable": true
          },
          "two_yr_mean_citedness": {
            "type": "number",
            "nullable": true,
            "description": "2-year mean citedness."
          }
        }
      },
      "created_at": {
        "type": "string",
        "format": "date-time",
        "nullable": true
      },
      "updated_at": {
        "type": "string",
        "format": "date-time",
        "nullable": true
      },
      "_links": {
        "type": "object",
        "properties": {
          "self": {
            "type": "string",
            "description": "/institutions/{id}"
          }
        }
      },
      "relevance": {
        "type": "number",
        "description": "Search-only. Present as a top-level field only when a search term (q/search) is supplied; full-text relevance score (0 for acronym-only matches). Absent on plain browse."
      }
    }
  },
  "OrganizationDetail": {
    "type": "object",
    "description": "Full institution profile from GET /institutions/{id}. Extends the list-item core (acronyms is nested under names here, and there is no top-level relevance). Include flags emit their block EMPTY when set false.",
    "properties": {
      "id": {
        "type": "integer"
      },
      "name": {
        "type": "string"
      },
      "type": {
        "type": "string",
        "enum": [
          "UNIVERSITY",
          "INSTITUTE",
          "PUBLISHER",
          "FUNDER",
          "COMPANY",
          "OTHER"
        ]
      },
      "openalex_type": {
        "type": "string",
        "nullable": true
      },
      "status": {
        "type": "string",
        "enum": [
          "active",
          "inactive",
          "withdrawn"
        ],
        "nullable": true
      },
      "location": {
        "type": "object",
        "nullable": true,
        "properties": {
          "country_code": {
            "type": "string",
            "nullable": true,
            "description": "ISO 3166-1 alpha-2."
          },
          "city": {
            "type": "string",
            "nullable": true
          }
        }
      },
      "names": {
        "type": "object",
        "properties": {
          "acronyms": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "alternative_names": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Alternative/translated names."
          },
          "aliases_count": {
            "type": "integer",
            "description": "acronyms.length + alternative_names.length."
          }
        }
      },
      "identifiers": {
        "type": "object",
        "properties": {
          "ror_id": {
            "type": "string",
            "nullable": true
          },
          "grid_id": {
            "type": "string",
            "nullable": true
          },
          "wikidata_id": {
            "type": "string",
            "nullable": true
          },
          "openalex_id": {
            "type": "string",
            "nullable": true
          },
          "url": {
            "type": "string",
            "nullable": true
          }
        }
      },
      "metrics": {
        "type": "object",
        "properties": {
          "works_count": {
            "type": "integer"
          },
          "researchers_count": {
            "type": "integer"
          },
          "total_citations": {
            "type": "integer"
          },
          "h_index": {
            "type": "integer",
            "nullable": true
          },
          "i10_index": {
            "type": "integer",
            "nullable": true
          },
          "two_yr_mean_citedness": {
            "type": "number",
            "nullable": true
          },
          "first_publication_year": {
            "type": "integer",
            "nullable": true,
            "description": "Derived from the affiliated-works corpus (bounded query, cached); not stored."
          },
          "latest_publication_year": {
            "type": "integer",
            "nullable": true,
            "description": "Derived from the affiliated-works corpus."
          }
        }
      },
      "funding_role": {
        "type": "object",
        "properties": {
          "funded_works_count": {
            "type": "integer",
            "description": "Works financed by this org as funder."
          },
          "grants_count": {
            "type": "integer",
            "description": "Distinct grant numbers."
          }
        }
      },
      "production_summary": {
        "type": "object",
        "description": "Empty ({by_work_type:[],publication_trend:[]}) when include_production=false.",
        "properties": {
          "by_work_type": {
            "type": "array",
            "description": "Ordered by works_count DESC.",
            "items": {
              "type": "object",
              "properties": {
                "type": {
                  "type": "string",
                  "description": "Work type, e.g. ARTICLE, BOOK, CHAPTER, THESIS, DATASET, OTHER."
                },
                "works_count": {
                  "type": "integer"
                }
              }
            }
          },
          "publication_trend": {
            "type": "array",
            "description": "Most-recent-first, up to 15 years.",
            "items": {
              "type": "object",
              "properties": {
                "year": {
                  "type": "integer"
                },
                "works_count": {
                  "type": "integer"
                }
              }
            }
          }
        }
      },
      "relationships": {
        "type": "object",
        "description": "Organizational hierarchy. Arrays are [] and counts 0 when include_relationships=false.",
        "properties": {
          "parents": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/OrganizationRelationshipRef"
            }
          },
          "children": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/OrganizationRelationshipRef"
            }
          },
          "related": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/OrganizationRelationshipRef"
            }
          },
          "parents_count": {
            "type": "integer"
          },
          "children_count": {
            "type": "integer"
          },
          "related_count": {
            "type": "integer"
          }
        }
      },
      "top_authors": {
        "type": "array",
        "description": "Up to 10 affiliated authors. Empty when include_authors=false.",
        "items": {
          "type": "object",
          "properties": {
            "person_id": {
              "type": "integer"
            },
            "preferred_name": {
              "type": "string"
            },
            "works_count": {
              "type": "integer"
            },
            "latest_publication_year": {
              "type": "integer",
              "nullable": true
            },
            "_links": {
              "type": "object",
              "properties": {
                "self": {
                  "type": "string",
                  "description": "/persons/{id}"
                }
              }
            }
          }
        }
      },
      "recent_works": {
        "type": "array",
        "description": "Up to 10 recent affiliated works (AffiliatedWork shape). Empty when include_works=false.",
        "items": {
          "$ref": "#/components/schemas/AffiliatedWork"
        }
      },
      "created_at": {
        "type": "string",
        "format": "date-time",
        "nullable": true
      },
      "updated_at": {
        "type": "string",
        "format": "date-time",
        "nullable": true
      },
      "_links": {
        "type": "object",
        "properties": {
          "self": {
            "type": "string",
            "description": "/institutions/{id}"
          },
          "works": {
            "type": "string",
            "description": "/institutions/{id}/works"
          },
          "funded_works": {
            "type": "string",
            "description": "/institutions/{id}/funded-works"
          }
        }
      }
    }
  },
  "OrganizationRelationshipRef": {
    "type": "object",
    "description": "Compact reference to a related organization in the relationships block.",
    "properties": {
      "id": {
        "type": "integer"
      },
      "name": {
        "type": "string"
      },
      "type": {
        "type": "string",
        "enum": [
          "UNIVERSITY",
          "INSTITUTE",
          "PUBLISHER",
          "FUNDER",
          "COMPANY",
          "OTHER"
        ]
      },
      "country_code": {
        "type": "string",
        "nullable": true,
        "description": "ISO 3166-1 alpha-2."
      },
      "_links": {
        "type": "object",
        "properties": {
          "self": {
            "type": "string",
            "description": "/institutions/{id}"
          }
        }
      }
    }
  },
  "AffiliatedWork": {
    "type": "object",
    "description": "A work row from /institutions/{id}/works, /institutions/{id}/funded-works, and OrganizationDetail.recent_works. grant_number is always present as a key: null on the affiliation surface, populated (where recorded) on funded-works.",
    "properties": {
      "id": {
        "type": "integer",
        "description": "Work id."
      },
      "title": {
        "type": "string"
      },
      "subtitle": {
        "type": "string",
        "nullable": true
      },
      "type": {
        "type": "string",
        "nullable": true,
        "description": "Work type from the latest publication, e.g. ARTICLE, BOOK, CHAPTER, THESIS, CONFERENCE, PREPRINT, DATASET, OTHER."
      },
      "language": {
        "type": "string",
        "nullable": true,
        "description": "ISO 639-1."
      },
      "doi": {
        "type": "string",
        "nullable": true,
        "description": "DOI of the latest publication."
      },
      "publication_year": {
        "type": "integer",
        "nullable": true,
        "description": "Latest publication year."
      },
      "open_access": {
        "type": "boolean",
        "description": "Open-access flag of the latest publication."
      },
      "peer_reviewed": {
        "type": "boolean"
      },
      "cited_by_count": {
        "type": "integer",
        "description": "works.citation_count."
      },
      "references_count": {
        "type": "integer",
        "description": "works.reference_count."
      },
      "publication": {
        "type": "object",
        "nullable": true,
        "description": "Latest publication.",
        "properties": {
          "id": {
            "type": "integer",
            "nullable": true
          },
          "year": {
            "type": "integer",
            "nullable": true
          },
          "doi": {
            "type": "string",
            "nullable": true
          },
          "volume": {
            "type": "string",
            "nullable": true
          },
          "issue": {
            "type": "string",
            "nullable": true
          },
          "pages": {
            "type": "string",
            "nullable": true
          },
          "open_access": {
            "type": "boolean"
          },
          "peer_reviewed": {
            "type": "boolean"
          }
        }
      },
      "venue": {
        "type": "object",
        "nullable": true,
        "description": "Null when the publication has no venue.",
        "properties": {
          "id": {
            "type": "integer",
            "nullable": true
          },
          "name": {
            "type": "string",
            "nullable": true
          },
          "abbreviated_name": {
            "type": "string",
            "nullable": true
          },
          "type": {
            "type": "string",
            "nullable": true,
            "enum": [
              "JOURNAL",
              "CONFERENCE",
              "REPOSITORY",
              "BOOK_SERIES",
              "SOURCE_BOOK",
              "OTHER"
            ]
          }
        }
      },
      "authors": {
        "type": "object",
        "properties": {
          "total_count": {
            "type": "integer",
            "description": "Total authorships on the work."
          },
          "author_string": {
            "type": "string",
            "nullable": true,
            "description": "'; '-joined preferred names of all hydrated authors."
          },
          "authors_preview": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "First 3 author names."
          }
        }
      },
      "grant_number": {
        "type": "string",
        "nullable": true,
        "description": "Grant number; null on the affiliation surface, populated where recorded on funded-works."
      },
      "_links": {
        "type": "object",
        "properties": {
          "self": {
            "type": "string",
            "description": "/works/{id}"
          }
        }
      }
    }
  },
  "PersonSearchItem": {
    "type": "object",
    "description": "Compact person/researcher shape returned by /search/persons and inside /search/global persons results. Not the full person profile.",
    "properties": {
      "id": {
        "type": "integer",
        "description": "Person id."
      },
      "_links": {
        "type": "object",
        "properties": {
          "self": {
            "type": "string",
            "example": "/persons/1396157"
          }
        }
      },
      "preferred_name": {
        "type": "string"
      },
      "given_names": {
        "type": "string",
        "nullable": true
      },
      "family_name": {
        "type": "string",
        "nullable": true
      },
      "name_signature": {
        "type": "string",
        "nullable": true,
        "description": "Signature label; null in practice."
      },
      "identifiers": {
        "type": "object",
        "properties": {
          "orcid": {
            "type": "string",
            "nullable": true
          },
          "lattes_id": {
            "type": "string",
            "nullable": true
          },
          "scopus_id": {
            "type": "string",
            "nullable": true
          },
          "wikidata_id": {
            "type": "string",
            "nullable": true
          },
          "openalex_id": {
            "type": "string",
            "nullable": true
          },
          "url": {
            "type": "string",
            "nullable": true
          }
        }
      },
      "is_verified": {
        "type": "boolean"
      },
      "metrics": {
        "type": "object",
        "properties": {
          "works_count": {
            "type": "integer",
            "description": "Total works attributed to the person."
          },
          "latest_publication_year": {
            "type": "integer",
            "nullable": true
          }
        }
      },
      "relevance": {
        "type": "number",
        "nullable": true,
        "description": "Always null; Manticore relevance is not surfaced."
      }
    }
  },
  "GlobalSearchResult": {
    "type": "object",
    "description": "data payload of /search/global: parallel works and persons result blocks. The institutions block is permanently empty.",
    "properties": {
      "works": {
        "type": "object",
        "properties": {
          "total": {
            "type": "integer",
            "description": "Total matching works (exact Manticore COUNT)."
          },
          "results": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/WorkListItem"
            },
            "description": "Up to `limit` work rows."
          }
        }
      },
      "persons": {
        "type": "object",
        "properties": {
          "total": {
            "type": "integer",
            "description": "Total matching persons."
          },
          "results": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/PersonSearchItem"
            },
            "description": "Up to `limit` person rows."
          }
        }
      },
      "institutions": {
        "type": "object",
        "description": "Always disabled for performance.",
        "properties": {
          "total": {
            "type": "integer",
            "example": 0
          },
          "results": {
            "type": "array",
            "items": {},
            "example": []
          },
          "note": {
            "type": "string",
            "example": "Institutions search disabled for performance optimization"
          }
        }
      }
    }
  },
  "AutocompleteResult": {
    "type": "object",
    "description": "data payload of /search/autocomplete. For queries shorter than 2 chars only { suggestions:[], message } is returned.",
    "properties": {
      "query": {
        "type": "string",
        "description": "Echoed query. Absent on the short-query branch."
      },
      "suggestions": {
        "type": "array",
        "items": {
          "type": "object",
          "description": "Type-tagged suggestion. Fields present depend on `type`.",
          "properties": {
            "text": {
              "type": "string",
              "description": "Display text (all types)."
            },
            "type": {
              "type": "string",
              "enum": [
                "title",
                "author",
                "venue"
              ]
            },
            "relevance": {
              "type": "integer",
              "description": "title items only: count of works sharing the title."
            },
            "work_count": {
              "type": "integer",
              "description": "author and venue items only: number of works."
            },
            "name": {
              "type": "string",
              "description": "venue items only (equals text)."
            },
            "abbreviated_name": {
              "type": "string",
              "nullable": true,
              "description": "venue items only."
            },
            "preview": {
              "type": "string",
              "description": "Formatted display string (all types)."
            }
          },
          "required": [
            "text",
            "type",
            "preview"
          ]
        }
      },
      "message": {
        "type": "string",
        "description": "Present only on the short-query branch, e.g. \"Query too short\"."
      },
      "type": {
        "type": "string",
        "enum": [
          "all",
          "titles",
          "authors",
          "venues"
        ],
        "description": "Echoes the request type. Absent on the short-query branch."
      },
      "count": {
        "type": "integer",
        "description": "Number of suggestions. Absent on the short-query branch."
      },
      "generated_at": {
        "type": "string",
        "format": "date-time",
        "description": "Absent on the short-query branch."
      }
    }
  },
  "PopularTerms": {
    "type": "object",
    "description": "data payload of /search/popular: analytics-sourced most frequent title terms.",
    "properties": {
      "popular_terms": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "term": {
              "type": "string"
            },
            "frequency": {
              "type": "integer",
              "description": "Corpus occurrence count of the term."
            },
            "type": {
              "type": "string",
              "enum": [
                "popular"
              ],
              "description": "Constant tag."
            }
          },
          "required": [
            "term",
            "frequency",
            "type"
          ]
        }
      },
      "generated_at": {
        "type": "string",
        "format": "date-time"
      }
    }
  },
  "SearchHealthStatus": {
    "type": "object",
    "description": "data payload of /search/health: Manticore backend status and index topology.",
    "properties": {
      "search_engine": {
        "type": "string",
        "example": "Manticore"
      },
      "backend": {
        "type": "string",
        "example": "manticore"
      },
      "reachable": {
        "type": "boolean"
      },
      "error": {
        "type": "string",
        "description": "Present only when the backend is unreachable."
      },
      "tables": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "Table": {
              "type": "string"
            },
            "Type": {
              "type": "string",
              "enum": [
                "distributed",
                "local"
              ]
            }
          }
        }
      },
      "indexes": {
        "type": "object",
        "properties": {
          "works": {
            "type": "string"
          },
          "persons": {
            "type": "string"
          },
          "venues": {
            "type": "string"
          }
        }
      },
      "endpoints": {
        "type": "object",
        "properties": {
          "basic_search": {
            "type": "string"
          },
          "advanced_search": {
            "type": "string"
          },
          "autocomplete": {
            "type": "string"
          },
          "popular_terms": {
            "type": "string"
          }
        }
      }
    }
  },
  "SubjectDetail": {
    "type": "object",
    "description": "Single controlled-vocabulary subject term (GET /subjects/{id}).",
    "properties": {
      "id": {
        "type": "integer",
        "description": "Subject id."
      },
      "_links": {
        "type": "object",
        "properties": {
          "self": {
            "type": "string",
            "description": "Canonical path, /subjects/{id}."
          }
        }
      },
      "term": {
        "type": "string",
        "nullable": true,
        "description": "Primary term label (usually English)."
      },
      "vocabulary": {
        "type": "string",
        "nullable": true,
        "description": "Controlled vocabulary the term belongs to.",
        "enum": [
          "Keyword",
          "OpenAlex",
          "Scopus",
          "SCImago",
          "OpenLibrary"
        ]
      },
      "subject_type": {
        "type": "string",
        "nullable": true,
        "description": "Subject type classifier, e.g. General, ProperNoun, Field, Subfield, SubjectArea, Topic."
      },
      "term_pt": {
        "type": "string",
        "nullable": true,
        "description": "Portuguese label (null for many subjects)."
      },
      "term_es": {
        "type": "string",
        "nullable": true,
        "description": "Spanish label (null for many subjects)."
      },
      "parent_id": {
        "type": "integer",
        "nullable": true,
        "description": "Self-referential parent subject id; null for root subjects."
      },
      "created_at": {
        "type": "string",
        "format": "date-time",
        "nullable": true,
        "description": "Row creation timestamp (ISO 8601)."
      },
      "works_count": {
        "type": "integer",
        "description": "Number of works tagged with this subject, read from the denormalized subjects.total_works column."
      },
      "courses_count": {
        "type": "integer",
        "description": "Always 0 (course linkage is not populated)."
      },
      "children_count": {
        "type": "integer",
        "description": "Number of direct child subjects (parent_id = this id)."
      },
      "parent_term": {
        "type": "string",
        "nullable": true,
        "description": "Parent subject's term; null when this subject is a root."
      },
      "parent_vocabulary": {
        "type": "string",
        "nullable": true,
        "description": "Parent subject's vocabulary; null when this subject is a root. Detail-only field."
      },
      "avg_relevance_score": {
        "type": "number",
        "nullable": true,
        "description": "Always null by design (underlying relevance_score is a uniform placeholder)."
      }
    }
  },
  "SubjectChild": {
    "type": "object",
    "description": "Direct child subject row (GET /subjects/{id}/children).",
    "properties": {
      "id": {
        "type": "integer",
        "description": "Child subject id."
      },
      "term": {
        "type": "string",
        "nullable": true,
        "description": "Term label."
      },
      "vocabulary": {
        "type": "string",
        "nullable": true,
        "description": "Controlled vocabulary.",
        "enum": [
          "Keyword",
          "OpenAlex",
          "Scopus",
          "SCImago",
          "OpenLibrary"
        ]
      },
      "subject_type": {
        "type": "string",
        "nullable": true,
        "description": "Subject type classifier."
      },
      "parent_id": {
        "type": "integer",
        "nullable": true,
        "description": "Parent subject id (equals the requested id)."
      },
      "created_at": {
        "type": "string",
        "format": "date-time",
        "nullable": true,
        "description": "Row creation timestamp (ISO 8601)."
      },
      "works_count": {
        "type": "integer",
        "description": "Child's total_works (denormalized count)."
      },
      "courses_count": {
        "type": "integer",
        "description": "Always 0 on child rows (course linkage not populated)."
      },
      "children_count": {
        "type": "integer",
        "description": "Number of grandchildren (direct children of this child)."
      },
      "parent_term": {
        "type": "string",
        "nullable": true,
        "description": "Always null on child rows."
      },
      "_links": {
        "type": "object",
        "properties": {
          "self": {
            "type": "string",
            "nullable": true,
            "description": "Canonical path, /subjects/{id}."
          }
        }
      }
    }
  },
  "SubjectHierarchyNode": {
    "type": "object",
    "description": "Ancestor-chain node (GET /subjects/{id}/hierarchy). Raw row: no _links, subject_type, created_at, or parent_term.",
    "properties": {
      "id": {
        "type": "integer",
        "description": "Subject id."
      },
      "term": {
        "type": "string",
        "nullable": true,
        "description": "Term label."
      },
      "vocabulary": {
        "type": "string",
        "nullable": true,
        "description": "Controlled vocabulary.",
        "enum": [
          "Keyword",
          "OpenAlex",
          "Scopus",
          "SCImago",
          "OpenLibrary"
        ]
      },
      "parent_id": {
        "type": "integer",
        "nullable": true,
        "description": "Parent subject id; null on the root (first array element)."
      },
      "works_count": {
        "type": "integer",
        "description": "total_works (denormalized count)."
      }
    }
  },
  "SubjectStatistics": {
    "type": "object",
    "description": "Aggregate subject statistics (GET /subjects/statistics).",
    "properties": {
      "total_subjects": {
        "type": "integer",
        "description": "Total number of subject rows."
      },
      "root_subjects": {
        "type": "integer",
        "description": "Subjects with parent_id IS NULL."
      },
      "child_subjects": {
        "type": "integer",
        "description": "Subjects with a non-null parent_id."
      },
      "vocabularies_count": {
        "type": "integer",
        "description": "Distinct vocabulary values."
      },
      "typed_subjects": {
        "type": "integer",
        "description": "Subjects carrying a non-empty subject_type."
      },
      "subjects_with_works": {
        "type": "integer",
        "description": "Subjects with total_works > 0."
      },
      "total_work_subject_relations": {
        "type": "integer",
        "description": "SUM of subjects.total_works across all subjects (a sum of per-subject denormalized counts, NOT a count of distinct work_subjects relations)."
      },
      "vocabulary_distribution": {
        "type": "array",
        "description": "One entry per vocabulary, ordered by subject_count DESC.",
        "items": {
          "type": "object",
          "properties": {
            "vocabulary": {
              "type": "string",
              "description": "Vocabulary name.",
              "enum": [
                "Keyword",
                "OpenAlex",
                "Scopus",
                "SCImago",
                "OpenLibrary"
              ]
            },
            "subject_count": {
              "type": "integer",
              "description": "Subjects in this vocabulary."
            },
            "root_count": {
              "type": "integer",
              "description": "Root subjects in this vocabulary."
            },
            "works_count": {
              "type": "integer",
              "description": "SUM of total_works for this vocabulary."
            }
          }
        }
      },
      "top_subjects": {
        "type": "array",
        "description": "Top 20 subjects by total_works DESC, term ASC.",
        "items": {
          "type": "object",
          "properties": {
            "id": {
              "type": "integer",
              "description": "Subject id."
            },
            "term": {
              "type": "string",
              "nullable": true,
              "description": "Term label."
            },
            "vocabulary": {
              "type": "string",
              "nullable": true,
              "description": "Vocabulary name."
            },
            "subject_type": {
              "type": "string",
              "nullable": true,
              "description": "Subject type classifier."
            },
            "works_count": {
              "type": "integer",
              "description": "total_works."
            }
          }
        }
      },
      "meta": {
        "type": "object",
        "description": "Provenance block nested inside data (distinct from the envelope-level meta).",
        "properties": {
          "work_linkage_available": {
            "type": "boolean",
            "description": "Always true."
          },
          "source": {
            "type": "string",
            "description": "Provenance string for the works_count figures."
          }
        }
      }
    }
  },
  "SubjectWork": {
    "type": "object",
    "description": "Work tagged with a subject (GET /subjects/{id}/works).",
    "properties": {
      "id": {
        "type": "integer",
        "description": "Work id."
      },
      "title": {
        "type": "string",
        "nullable": true,
        "description": "Work title."
      },
      "publication_year": {
        "type": "integer",
        "nullable": true,
        "description": "Latest publication year across the work's publications."
      },
      "language": {
        "type": "string",
        "nullable": true,
        "description": "Work language (ISO 639-1)."
      },
      "document_type": {
        "type": "string",
        "nullable": true,
        "description": "Latest publication type, e.g. ARTICLE, BOOK, CHAPTER."
      },
      "open_access": {
        "type": "boolean",
        "nullable": true,
        "description": "True if any publication is open access."
      },
      "relevance_score": {
        "type": "number",
        "nullable": true,
        "description": "work_subjects.relevance_score (currently a uniform placeholder value)."
      },
      "assigned_by": {
        "type": "string",
        "nullable": true,
        "description": "How the subject was assigned to the work, e.g. AUTHOR."
      },
      "used_in_courses": {
        "type": "integer",
        "description": "Always 0 (course linkage not populated)."
      }
    }
  },
  "SubjectCourse": {
    "type": "object",
    "description": "Course referencing a subject (GET /subjects/{id}/courses). Currently never returned because the course domain is unpopulated; shape documents the populated response.",
    "properties": {
      "id": {
        "type": "integer",
        "description": "Course id."
      },
      "program_id": {
        "type": "integer",
        "nullable": true,
        "description": "Program id the course belongs to."
      },
      "code": {
        "type": "string",
        "nullable": true,
        "description": "Course code."
      },
      "name": {
        "type": "string",
        "nullable": true,
        "description": "Course name."
      },
      "credits": {
        "type": "number",
        "nullable": true,
        "description": "Course credits."
      },
      "semester": {
        "type": "string",
        "nullable": true,
        "description": "Semester label."
      },
      "year": {
        "type": "integer",
        "nullable": true,
        "description": "Course year."
      },
      "reading_type": {
        "type": "string",
        "nullable": true,
        "description": "course_bibliography.reading_type for the referencing entry."
      },
      "works_with_subject": {
        "type": "integer",
        "description": "COUNT(DISTINCT work_id) in this course tagged with the subject."
      },
      "instructor_count": {
        "type": "integer",
        "description": "COUNT(DISTINCT instructor) for the course."
      }
    }
  },
  "CourseListItem": {
    "type": "object",
    "description": "A course row in the /courses listing. metrics carries only instructor_count and bibliography_count (subject_count is computed on the detail endpoint only).",
    "properties": {
      "id": {
        "type": "integer",
        "description": "Course id"
      },
      "_links": {
        "type": "object",
        "properties": {
          "self": {
            "type": "string",
            "description": "Canonical path, /courses/{id}"
          }
        }
      },
      "code": {
        "type": "string",
        "nullable": true,
        "description": "Course code, e.g. B11111C"
      },
      "name": {
        "type": "string",
        "nullable": true,
        "description": "Course name"
      },
      "credits": {
        "type": "integer",
        "nullable": true,
        "description": "Credit count; falsy values are coerced to null"
      },
      "program_id": {
        "type": "integer",
        "nullable": true,
        "description": "FK to programs (table currently empty)"
      },
      "semester": {
        "type": "string",
        "nullable": true,
        "description": "Semester label as a string, e.g. \"1\""
      },
      "year": {
        "type": "integer",
        "nullable": true,
        "description": "Academic year"
      },
      "metrics": {
        "type": "object",
        "properties": {
          "instructor_count": {
            "type": "integer",
            "description": "Distinct instructors on the course"
          },
          "bibliography_count": {
            "type": "integer",
            "description": "Distinct bibliography works on the course"
          }
        }
      },
      "instructors_preview": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Up to 3 instructor preferred names"
      },
      "created_at": {
        "type": "string",
        "format": "date-time",
        "nullable": true,
        "description": "ISO 8601 creation timestamp"
      }
    }
  },
  "CourseDetail": {
    "type": "object",
    "description": "Full course detail: base fields plus embedded bibliography, instructors, derived subjects and per-facet statistics.",
    "properties": {
      "id": {
        "type": "integer",
        "description": "Course id"
      },
      "_links": {
        "type": "object",
        "properties": {
          "self": {
            "type": "string",
            "description": "Canonical path, /courses/{id}"
          }
        }
      },
      "code": {
        "type": "string",
        "nullable": true,
        "description": "Course code"
      },
      "name": {
        "type": "string",
        "nullable": true,
        "description": "Course name"
      },
      "credits": {
        "type": "integer",
        "nullable": true,
        "description": "Credit count"
      },
      "program_id": {
        "type": "integer",
        "nullable": true,
        "description": "FK to programs (table currently empty)"
      },
      "semester": {
        "type": "string",
        "nullable": true,
        "description": "Semester label as a string"
      },
      "year": {
        "type": "integer",
        "nullable": true,
        "description": "Academic year"
      },
      "metrics": {
        "type": "object",
        "properties": {
          "instructor_count": {
            "type": "integer"
          },
          "bibliography_count": {
            "type": "integer"
          },
          "subject_count": {
            "type": "integer",
            "description": "Distinct subjects derived from the course bibliography (detail only)"
          }
        }
      },
      "instructors_preview": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Up to 3 instructor preferred names"
      },
      "created_at": {
        "type": "string",
        "format": "date-time",
        "nullable": true
      },
      "source_file": {
        "type": "string",
        "nullable": true,
        "description": "Provenance filename; null when absent"
      },
      "bibliography": {
        "type": "array",
        "description": "Embedded bibliography entries; present unless include_bibliography=false. May be empty.",
        "items": {
          "$ref": "#/components/schemas/CourseBibliographyItem"
        }
      },
      "instructors": {
        "type": "array",
        "description": "Embedded instructors; present unless include_instructors=false",
        "items": {
          "$ref": "#/components/schemas/CourseInstructor"
        }
      },
      "subjects": {
        "type": "array",
        "description": "Subjects derived from the course bibliography; present unless include_subjects=false. May be empty.",
        "items": {
          "$ref": "#/components/schemas/CourseSubject"
        }
      },
      "bibliography_statistics": {
        "type": "object",
        "description": "Present unless include_bibliography=false",
        "properties": {
          "by_type": {
            "type": "object",
            "description": "Map of reading_type -> { count, first_week, last_week }; empty when no bibliography",
            "additionalProperties": true
          },
          "by_week": {
            "type": "array",
            "description": "Per-week rollup [{ week_number, count, reading_types }] where reading_types is a comma-joined string",
            "items": {
              "type": "object"
            }
          }
        }
      },
      "instructor_statistics": {
        "type": "object",
        "description": "Present unless include_instructors=false",
        "properties": {
          "by_role": {
            "type": "object",
            "description": "Map of role -> instructor count",
            "additionalProperties": {
              "type": "integer"
            }
          }
        }
      },
      "subject_statistics": {
        "type": "object",
        "description": "Present unless include_subjects=false",
        "properties": {
          "by_vocabulary": {
            "type": "object",
            "description": "Map of vocabulary -> { unique_subjects, works_covered }; empty when no subjects",
            "additionalProperties": true
          }
        }
      }
    }
  },
  "CourseInstructor": {
    "type": "object",
    "description": "An instructor associated with a course.",
    "properties": {
      "person_id": {
        "type": "integer",
        "description": "Canonical person id (falls back to the raw person_id)"
      },
      "preferred_name": {
        "type": "string",
        "nullable": true
      },
      "given_names": {
        "type": "string",
        "nullable": true
      },
      "family_name": {
        "type": "string",
        "nullable": true
      },
      "role": {
        "type": "string",
        "nullable": true,
        "description": "Instructor role, e.g. PROFESSOR"
      },
      "identifiers": {
        "type": "object",
        "properties": {
          "orcid": {
            "type": "string",
            "nullable": true,
            "description": "ORCID iD"
          }
        }
      },
      "is_verified": {
        "type": "boolean",
        "description": "Whether the linked person record is verified"
      }
    }
  },
  "CourseSubject": {
    "type": "object",
    "description": "A subject derived from the course's bibliography works.",
    "properties": {
      "id": {
        "type": "integer",
        "description": "Subject id"
      },
      "term": {
        "type": "string",
        "nullable": true,
        "description": "Subject term"
      },
      "vocabulary": {
        "type": "string",
        "nullable": true,
        "description": "Controlled vocabulary the term belongs to"
      },
      "parent_id": {
        "type": "integer",
        "nullable": true,
        "description": "Parent subject id in the term hierarchy"
      },
      "work_count": {
        "type": "integer",
        "description": "Distinct works in the course bibliography carrying this subject"
      }
    }
  },
  "CourseBibliographyItem": {
    "type": "object",
    "description": "A bibliography (reading list) entry for a course.",
    "properties": {
      "work_id": {
        "type": "integer",
        "description": "FK to works"
      },
      "title": {
        "type": "string",
        "nullable": true,
        "description": "Work title"
      },
      "publication_year": {
        "type": "integer",
        "nullable": true,
        "description": "Year of the latest publication of the work"
      },
      "language": {
        "type": "string",
        "nullable": true,
        "description": "ISO 639-1 language from works.language"
      },
      "document_type": {
        "type": "string",
        "nullable": true,
        "description": "publications.type of the latest publication (ARTICLE/BOOK/CHAPTER/...)"
      },
      "open_access": {
        "type": "boolean",
        "description": "True if the latest publication is open access"
      },
      "reading_type": {
        "type": "string",
        "nullable": true,
        "enum": [
          "REQUIRED",
          "RECOMMENDED",
          "SUPPLEMENTARY",
          "OPTIONAL"
        ],
        "description": "Reading classification"
      },
      "week_number": {
        "type": "integer",
        "nullable": true,
        "description": "Week of the course this reading is assigned to"
      },
      "notes": {
        "type": "string",
        "nullable": true
      },
      "authors_preview": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Author preferred names ordered by authorship position"
      },
      "author_count": {
        "type": "integer",
        "description": "Total number of authors on the work"
      },
      "first_author_name": {
        "type": "string",
        "nullable": true,
        "description": "Preferred name of the first author"
      }
    }
  },
  "CourseStatistics": {
    "type": "object",
    "description": "Aggregate course statistics with year and semester distributions.",
    "properties": {
      "total_courses": {
        "type": "integer",
        "description": "COUNT of all courses"
      },
      "programs_count": {
        "type": "integer",
        "description": "Distinct program_id values"
      },
      "earliest_year": {
        "type": "integer",
        "nullable": true,
        "description": "MIN(year)"
      },
      "latest_year": {
        "type": "integer",
        "nullable": true,
        "description": "MAX(year)"
      },
      "semesters_count": {
        "type": "integer",
        "description": "Distinct semester values"
      },
      "avg_credits": {
        "type": "string",
        "nullable": true,
        "description": "AVG(credits) as a DECIMAL string, e.g. \"1.0000\"; null when no credited courses"
      },
      "courses_with_credits": {
        "type": "integer",
        "description": "COUNT of courses with a non-null credits value"
      },
      "year_distribution": {
        "type": "array",
        "description": "Top 10 years descending",
        "items": {
          "type": "object",
          "properties": {
            "year": {
              "type": "integer"
            },
            "course_count": {
              "type": "integer"
            },
            "program_count": {
              "type": "integer",
              "description": "Distinct programs that year"
            }
          }
        }
      },
      "semester_distribution": {
        "type": "array",
        "description": "Per-semester course counts",
        "items": {
          "type": "object",
          "properties": {
            "semester": {
              "type": "string"
            },
            "course_count": {
              "type": "integer"
            }
          }
        }
      }
    }
  },
  "InstructorListItem": {
    "type": "object",
    "description": "One instructor (a persons row appearing in course_instructors) in the /instructors listing.",
    "properties": {
      "id": {
        "type": "integer",
        "description": "persons.id (same value as person_id)."
      },
      "person_id": {
        "type": "integer",
        "description": "persons.id."
      },
      "preferred_name": {
        "type": "string",
        "nullable": true,
        "description": "Display name."
      },
      "given_names": {
        "type": "string",
        "nullable": true
      },
      "family_name": {
        "type": "string",
        "nullable": true
      },
      "identifiers": {
        "type": "object",
        "properties": {
          "orcid": {
            "type": "string",
            "nullable": true,
            "description": "ORCID iD."
          },
          "lattes_id": {
            "type": "string",
            "nullable": true,
            "description": "Lattes CV id."
          },
          "scopus_id": {
            "type": "string",
            "nullable": true,
            "description": "Scopus author id."
          }
        }
      },
      "is_verified": {
        "type": "boolean",
        "description": "persons.is_verified."
      },
      "teaching_metrics": {
        "type": "object",
        "properties": {
          "courses_taught": {
            "type": "integer",
            "description": "COUNT(DISTINCT course)."
          },
          "programs_count": {
            "type": "integer",
            "description": "COUNT(DISTINCT program)."
          },
          "teaching_span": {
            "type": "object",
            "properties": {
              "earliest_year": {
                "type": "integer",
                "nullable": true,
                "description": "MIN(courses.year)."
              },
              "latest_year": {
                "type": "integer",
                "nullable": true,
                "description": "MAX(courses.year)."
              }
            }
          }
        }
      },
      "roles": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Distinct course_instructors.role values (e.g. PROFESSOR)."
      },
      "program_ids": {
        "type": "array",
        "items": {
          "type": "integer"
        },
        "description": "Distinct program ids the instructor teaches in."
      }
    }
  },
  "InstructorDetail": {
    "type": "object",
    "description": "Single instructor detail (/instructors/{id}). Superset of InstructorListItem.",
    "properties": {
      "id": {
        "type": "integer",
        "description": "persons.id (same value as person_id)."
      },
      "person_id": {
        "type": "integer",
        "description": "persons.id."
      },
      "preferred_name": {
        "type": "string",
        "nullable": true
      },
      "given_names": {
        "type": "string",
        "nullable": true
      },
      "family_name": {
        "type": "string",
        "nullable": true
      },
      "identifiers": {
        "type": "object",
        "properties": {
          "orcid": {
            "type": "string",
            "nullable": true
          },
          "lattes_id": {
            "type": "string",
            "nullable": true
          },
          "scopus_id": {
            "type": "string",
            "nullable": true
          }
        }
      },
      "is_verified": {
        "type": "boolean"
      },
      "teaching_metrics": {
        "type": "object",
        "properties": {
          "courses_taught": {
            "type": "integer"
          },
          "programs_count": {
            "type": "integer"
          },
          "teaching_span": {
            "type": "object",
            "properties": {
              "earliest_year": {
                "type": "integer",
                "nullable": true
              },
              "latest_year": {
                "type": "integer",
                "nullable": true
              }
            }
          },
          "bibliography_contributed": {
            "type": "integer",
            "description": "COUNT(DISTINCT course_bibliography.work_id) across taught courses."
          }
        }
      },
      "roles": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "program_ids": {
        "type": "array",
        "items": {
          "type": "integer"
        },
        "description": "Distinct program ids (populated on detail)."
      },
      "created_at": {
        "type": "string",
        "format": "date-time",
        "nullable": true,
        "description": "persons.created_at (ISO 8601)."
      }
    }
  },
  "InstructorCourse": {
    "type": "object",
    "description": "A course taught by the instructor (/instructors/{id}/courses).",
    "properties": {
      "id": {
        "type": "integer",
        "description": "course id."
      },
      "code": {
        "type": "string",
        "nullable": true,
        "description": "Course code (e.g. B11111C)."
      },
      "name": {
        "type": "string",
        "nullable": true,
        "description": "Course title."
      },
      "credits": {
        "type": "integer",
        "nullable": true
      },
      "program_id": {
        "type": "integer",
        "nullable": true
      },
      "semester": {
        "type": "string",
        "nullable": true,
        "description": "e.g. \"1\"."
      },
      "year": {
        "type": "integer",
        "nullable": true
      },
      "role": {
        "type": "string",
        "nullable": true,
        "description": "Instructor's role in this course."
      },
      "metrics": {
        "type": "object",
        "properties": {
          "bibliography_count": {
            "type": "integer",
            "description": "Distinct bibliography works for the course."
          },
          "co_instructors_count": {
            "type": "integer",
            "description": "Other instructors on the course."
          }
        }
      }
    }
  },
  "InstructorSubject": {
    "type": "object",
    "description": "Subject expertise derived from the instructor's course bibliographies (/instructors/{id}/subjects).",
    "properties": {
      "id": {
        "type": "integer",
        "description": "subjects.id."
      },
      "term": {
        "type": "string",
        "nullable": true
      },
      "vocabulary": {
        "type": "string",
        "nullable": true
      },
      "parent_id": {
        "type": "integer",
        "nullable": true
      },
      "expertise_metrics": {
        "type": "object",
        "properties": {
          "courses_count": {
            "type": "integer",
            "description": "Distinct courses using the subject."
          },
          "works_count": {
            "type": "integer",
            "description": "Distinct works."
          },
          "avg_relevance": {
            "type": "string",
            "nullable": true,
            "description": "AVG(work_subjects.relevance_score) formatted to 2 decimals; null when unavailable."
          }
        }
      }
    }
  },
  "InstructorBibliographyItem": {
    "type": "object",
    "description": "A work used as bibliography across the instructor's courses (/instructors/{id}/bibliographies).",
    "properties": {
      "work_id": {
        "type": "integer",
        "description": "works.id."
      },
      "title": {
        "type": "string",
        "nullable": true
      },
      "publication_year": {
        "type": "integer",
        "nullable": true,
        "description": "From the work's latest publication."
      },
      "language": {
        "type": "string",
        "nullable": true,
        "description": "works.language."
      },
      "document_type": {
        "type": "string",
        "nullable": true,
        "description": "publications.type (ARTICLE/BOOK/CHAPTER/...)."
      },
      "open_access": {
        "type": "boolean"
      },
      "reading_type": {
        "type": "string",
        "nullable": true,
        "description": "course_bibliography.reading_type."
      },
      "author_count": {
        "type": "integer",
        "description": "Total authorships for the work."
      },
      "first_author_name": {
        "type": "string",
        "nullable": true,
        "description": "preferred_name of the position-0 author."
      },
      "authors": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Ordered author preferred_names."
      },
      "usage_metrics": {
        "type": "object",
        "properties": {
          "used_in_courses": {
            "type": "integer",
            "description": "Distinct courses using the work."
          }
        }
      }
    }
  },
  "InstructorStatisticsSummary": {
    "type": "object",
    "description": "Aggregate instructor statistics (/instructors/statistics).",
    "properties": {
      "total_instructors": {
        "type": "integer",
        "description": "Distinct instructors."
      },
      "total_courses_taught": {
        "type": "integer",
        "description": "Distinct courses with instructors."
      },
      "programs_with_instructors": {
        "type": "integer",
        "description": "Distinct programs."
      },
      "avg_courses_per_instructor": {
        "type": "string",
        "description": "MySQL AVG as a decimal string, e.g. \"1.0000\"."
      },
      "role_distribution": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "role": {
              "type": "string"
            },
            "instructor_count": {
              "type": "integer",
              "description": "Distinct instructors in that role."
            },
            "assignment_count": {
              "type": "integer",
              "description": "Assignment rows for that role."
            }
          }
        }
      },
      "top_instructors": {
        "type": "array",
        "description": "Top 10 instructors by courses_taught.",
        "items": {
          "type": "object",
          "properties": {
            "preferred_name": {
              "type": "string"
            },
            "courses_taught": {
              "type": "integer"
            },
            "programs_count": {
              "type": "integer"
            },
            "earliest_year": {
              "type": "integer",
              "nullable": true
            },
            "latest_year": {
              "type": "integer",
              "nullable": true
            }
          }
        }
      }
    }
  },
  "InstructorStatistics": {
    "type": "object",
    "description": "Rich teaching + authorship profile for one instructor (/instructors/{id}/statistics).",
    "properties": {
      "person": {
        "type": "object",
        "properties": {
          "id": {
            "type": "integer"
          },
          "preferred_name": {
            "type": "string",
            "nullable": true
          },
          "given_names": {
            "type": "string",
            "nullable": true
          },
          "family_name": {
            "type": "string",
            "nullable": true
          },
          "name_variations": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Always empty (reserved)."
          },
          "identifiers": {
            "type": "object",
            "properties": {
              "orcid": {
                "type": "string",
                "nullable": true
              },
              "lattes_id": {
                "type": "string",
                "nullable": true
              },
              "scopus_id": {
                "type": "string",
                "nullable": true
              }
            }
          },
          "is_verified": {
            "type": "boolean"
          },
          "created_at": {
            "type": "string",
            "format": "date-time",
            "nullable": true
          }
        }
      },
      "teaching_profile": {
        "type": "object",
        "properties": {
          "courses_taught": {
            "type": "integer"
          },
          "programs_count": {
            "type": "integer"
          },
          "bibliography_items_used": {
            "type": "integer",
            "description": "Distinct bibliography works."
          },
          "unique_collaborators": {
            "type": "integer",
            "description": "Distinct co-instructors."
          },
          "teaching_span": {
            "type": "object",
            "properties": {
              "start_year": {
                "type": "integer",
                "nullable": true
              },
              "end_year": {
                "type": "integer",
                "nullable": true
              },
              "span_years": {
                "type": "integer",
                "description": "end_year - start_year + 1."
              }
            }
          },
          "teaching_roles": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        }
      },
      "authorship_profile": {
        "type": "object",
        "properties": {
          "works_authored": {
            "type": "integer",
            "description": "persons.total_works."
          },
          "unique_signatures": {
            "type": "integer",
            "description": "1 if persons.signature_id is set, else 0."
          },
          "confirmed_authorships": {
            "type": "integer",
            "description": "persons.total_works (same source)."
          },
          "publication_span": {
            "type": "object",
            "properties": {
              "first_year": {
                "type": "integer",
                "nullable": true
              },
              "latest_year": {
                "type": "integer",
                "nullable": true
              }
            }
          }
        }
      },
      "signatures": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id": {
              "type": "integer",
              "description": "signatures.id."
            },
            "signature": {
              "type": "string",
              "description": "Signature text, e.g. \"CRUZ B C C\"."
            },
            "works_with_signature": {
              "type": "integer",
              "description": "COUNT(DISTINCT authorships.work_id) for the person."
            }
          }
        }
      },
      "recent_authored_works": {
        "type": "array",
        "description": "Up to 10 most recent authored works.",
        "items": {
          "type": "object",
          "properties": {
            "id": {
              "type": "integer",
              "description": "works.id."
            },
            "title": {
              "type": "string",
              "nullable": true
            },
            "year": {
              "type": "integer",
              "nullable": true,
              "description": "Publication year."
            },
            "work_type": {
              "type": "string",
              "nullable": true,
              "description": "publications.type."
            },
            "language": {
              "type": "string",
              "nullable": true
            },
            "open_access": {
              "type": "boolean"
            },
            "signature_text": {
              "type": "string",
              "nullable": true,
              "description": "Signature used on the work."
            }
          }
        }
      },
      "bibliography_usage_patterns": {
        "type": "array",
        "description": "Bibliography usage grouped by reading_type.",
        "items": {
          "type": "object",
          "properties": {
            "reading_type": {
              "type": "string",
              "nullable": true
            },
            "works_count": {
              "type": "integer"
            },
            "courses_count": {
              "type": "integer"
            }
          }
        }
      },
      "most_used_authors_in_courses": {
        "type": "array",
        "description": "Top 15 authors appearing in the instructor's course bibliographies.",
        "items": {
          "type": "object",
          "properties": {
            "person_id": {
              "type": "integer"
            },
            "author_name": {
              "type": "string",
              "nullable": true
            },
            "usage_count": {
              "type": "integer",
              "description": "Distinct bibliography works by the author."
            },
            "courses_count": {
              "type": "integer"
            },
            "author_string": {
              "type": "string",
              "nullable": true,
              "description": "Mirror of author_name."
            },
            "first_author_name": {
              "type": "string",
              "nullable": true,
              "description": "Mirror of author_name."
            },
            "authors_array": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "description": "author_string split on ';' (present only when author_string is non-empty)."
            }
          }
        }
      },
      "subject_expertise": {
        "type": "array",
        "description": "Subject expertise grouped by vocabulary.",
        "items": {
          "type": "object",
          "properties": {
            "vocabulary": {
              "type": "string",
              "nullable": true
            },
            "subjects_count": {
              "type": "integer"
            },
            "works_count": {
              "type": "integer"
            },
            "courses_count": {
              "type": "integer"
            }
          }
        }
      },
      "teaching_collaborators": {
        "type": "array",
        "description": "Top 10 co-instructors sharing courses.",
        "items": {
          "type": "object",
          "properties": {
            "collaborator_id": {
              "type": "integer"
            },
            "collaborator_name": {
              "type": "string",
              "nullable": true
            },
            "shared_courses": {
              "type": "integer"
            }
          }
        }
      },
      "combined_statistics": {
        "type": "object",
        "properties": {
          "total_academic_span_years": {
            "type": "integer",
            "description": "Max of teaching span vs publication span in years."
          },
          "academic_productivity_ratio": {
            "type": "string",
            "description": "(works_authored / courses_taught) formatted to 2 decimals, e.g. \"0.00\"."
          },
          "bibliography_diversity_score": {
            "type": "integer",
            "description": "Number of distinct reading_type groups."
          },
          "signature_consistency_score": {
            "type": "number",
            "description": "Max works_with_signature divided by signature count; 0 when none."
          }
        }
      }
    }
  },
  "SignatureStatistics": {
    "type": "object",
    "description": "Aggregate statistics over the whole signatures table.",
    "properties": {
      "total_signatures": {
        "type": "integer",
        "description": "COUNT(*) of all signatures."
      },
      "short_signatures": {
        "type": "integer",
        "description": "Signatures with LENGTH(signature) <= 10."
      },
      "medium_signatures": {
        "type": "integer",
        "description": "Signatures with LENGTH(signature) between 11 and 20."
      },
      "long_signatures": {
        "type": "integer",
        "description": "Signatures with LENGTH(signature) > 20."
      },
      "avg_signature_length": {
        "type": "number",
        "format": "float",
        "description": "AVG(LENGTH(signature)) in characters."
      },
      "linked_signatures": {
        "type": "integer",
        "description": "Distinct signatures referenced by at least one persons.signature_id."
      },
      "unlinked_signatures": {
        "type": "integer",
        "description": "total_signatures minus linked_signatures."
      }
    }
  },
  "SignatureSearchItem": {
    "type": "object",
    "description": "Raw signature search row (no _links).",
    "properties": {
      "id": {
        "type": "integer",
        "description": "Signature id."
      },
      "signature": {
        "type": "string",
        "description": "Normalized, uppercased name form (e.g. \"DA SILVA A M\")."
      },
      "created_at": {
        "type": "string",
        "format": "date-time",
        "nullable": true,
        "description": "ISO 8601 creation timestamp."
      },
      "persons_count": {
        "type": "integer",
        "description": "Distinct persons linked to this signature; may be 0."
      }
    }
  },
  "SignatureDetail": {
    "type": "object",
    "description": "Single signature detail with a self link.",
    "properties": {
      "id": {
        "type": "integer",
        "description": "Signature id."
      },
      "signature": {
        "type": "string",
        "description": "Normalized, uppercased name form."
      },
      "created_at": {
        "type": "string",
        "format": "date-time",
        "nullable": true,
        "description": "ISO 8601 creation timestamp."
      },
      "persons_count": {
        "type": "integer",
        "nullable": true,
        "description": "Distinct persons linked to this signature."
      },
      "_links": {
        "type": "object",
        "properties": {
          "self": {
            "type": "string",
            "description": "Canonical path, /signatures/{id}."
          }
        }
      }
    }
  },
  "SignaturePersonItem": {
    "type": "object",
    "description": "Person list-item shared shape for persons sharing a signature (formatPersonListItem).",
    "properties": {
      "id": {
        "type": "integer",
        "description": "Person id."
      },
      "_links": {
        "type": "object",
        "properties": {
          "self": {
            "type": "string",
            "description": "Canonical path, /persons/{id}."
          }
        }
      },
      "preferred_name": {
        "type": "string",
        "nullable": true
      },
      "given_names": {
        "type": "string",
        "nullable": true
      },
      "family_name": {
        "type": "string",
        "nullable": true
      },
      "name_signature": {
        "type": "string",
        "nullable": true,
        "description": "Signature form of the name; often null."
      },
      "identifiers": {
        "type": "object",
        "properties": {
          "orcid": {
            "type": "string",
            "nullable": true
          },
          "lattes_id": {
            "type": "string",
            "nullable": true
          },
          "scopus_id": {
            "type": "string",
            "nullable": true
          },
          "wikidata_id": {
            "type": "string",
            "nullable": true
          },
          "openalex_id": {
            "type": "string",
            "nullable": true
          },
          "url": {
            "type": "string",
            "nullable": true
          }
        }
      },
      "is_verified": {
        "type": "boolean"
      },
      "metrics": {
        "type": "object",
        "properties": {
          "works_count": {
            "type": "integer",
            "description": "From persons.total_works."
          },
          "latest_publication_year": {
            "type": "integer",
            "nullable": true
          }
        }
      }
    }
  },
  "SignatureWork": {
    "type": "object",
    "description": "Work authored by a person carrying the signature (formatSignatureWork).",
    "properties": {
      "id": {
        "type": "integer",
        "description": "Work id."
      },
      "title": {
        "type": "string",
        "nullable": true
      },
      "subtitle": {
        "type": "string",
        "nullable": true
      },
      "type": {
        "type": "string",
        "nullable": true,
        "description": "Publication type of the latest publication (ARTICLE, BOOK, CHAPTER, ...)."
      },
      "language": {
        "type": "string",
        "nullable": true,
        "description": "ISO 639-1 language code."
      },
      "doi": {
        "type": "string",
        "nullable": true
      },
      "open_access": {
        "type": "boolean",
        "nullable": true,
        "description": "Convenience flag from the latest publication."
      },
      "authorship": {
        "type": "object",
        "properties": {
          "role": {
            "type": "string",
            "enum": [
              "AUTHOR",
              "EDITOR"
            ],
            "description": "MIN role over the matching authorships."
          },
          "position": {
            "type": "integer",
            "description": "Position in the author list."
          },
          "is_corresponding": {
            "type": "boolean"
          },
          "person_id": {
            "type": "integer",
            "description": "MIN person id under this signature that authored the work."
          },
          "person_name": {
            "type": "string",
            "nullable": true,
            "description": "That person preferred_name."
          }
        }
      },
      "publication": {
        "type": "object",
        "properties": {
          "year": {
            "type": "integer",
            "nullable": true,
            "description": "From the latest publication."
          },
          "journal": {
            "type": "string",
            "nullable": true,
            "description": "Venue name."
          },
          "volume": {
            "type": "string",
            "nullable": true
          },
          "issue": {
            "type": "string",
            "nullable": true
          },
          "pages": {
            "type": "string",
            "nullable": true
          },
          "open_access": {
            "type": "boolean",
            "description": "Duplicate of the top-level open_access flag."
          }
        }
      },
      "authors": {
        "type": "object",
        "properties": {
          "total_count": {
            "type": "integer",
            "description": "Total authorships on the work."
          },
          "author_string": {
            "type": "string",
            "nullable": true,
            "description": "Semicolon-joined full author names."
          }
        }
      },
      "created_at": {
        "type": "string",
        "format": "date-time",
        "nullable": true,
        "description": "Work created_at (ISO 8601)."
      }
    }
  },
  "BibliographyItem": {
    "type": "object",
    "description": "A single course-reading assignment row from GET /bibliographies (one per course_id + work_id). author_count and instructors are null on the default/light query path and only populated when a course_id/instructor_id/search filter is applied.",
    "properties": {
      "course_id": {
        "type": "integer",
        "nullable": true,
        "description": "FK courses.id."
      },
      "work_id": {
        "type": "integer",
        "nullable": true,
        "description": "FK works.id."
      },
      "reading_type": {
        "type": "string",
        "nullable": true,
        "description": "Reading classification from course_bibliography.reading_type (free text, e.g. required, recommended)."
      },
      "week_number": {
        "type": "integer",
        "nullable": true,
        "description": "Course week the reading is assigned to."
      },
      "notes": {
        "type": "string",
        "nullable": true,
        "description": "Free-text note from course_bibliography.notes."
      },
      "course_code": {
        "type": "string",
        "nullable": true,
        "description": "courses.code."
      },
      "course_name": {
        "type": "string",
        "nullable": true,
        "description": "courses.name."
      },
      "course_year": {
        "type": "integer",
        "nullable": true,
        "description": "courses.year."
      },
      "semester": {
        "type": "string",
        "nullable": true,
        "description": "courses.semester."
      },
      "program_id": {
        "type": "integer",
        "nullable": true,
        "description": "courses.program_id."
      },
      "title": {
        "type": "string",
        "nullable": true,
        "description": "works.title."
      },
      "publication_year": {
        "type": "integer",
        "nullable": true,
        "description": "Latest publication year for the work (MAX(publications.year))."
      },
      "open_access": {
        "type": "boolean",
        "nullable": true,
        "description": "Open-access flag from the latest publication."
      },
      "language": {
        "type": "string",
        "nullable": true,
        "description": "works.language (ISO 639-1)."
      },
      "document_type": {
        "type": "string",
        "nullable": true,
        "description": "Type of the latest publication.",
        "enum": [
          "ARTICLE",
          "BOOK",
          "CHAPTER",
          "THESIS",
          "CONFERENCE",
          "CONFERENCE_PAPER",
          "REPORT",
          "DATASET",
          "PREPRINT",
          "REVIEW",
          "EDITORIAL",
          "OTHER"
        ]
      },
      "author_count": {
        "type": "integer",
        "nullable": true,
        "description": "Count of authorships for the work. Null on the light/default query path."
      },
      "first_author_name": {
        "type": "string",
        "nullable": true,
        "description": "First author's preferred_name, by authorship position."
      },
      "instructors": {
        "type": "string",
        "nullable": true,
        "description": "Semicolon-separated distinct instructor preferred_names for the course. Null on the light/default query path."
      },
      "authors": {
        "type": "array",
        "description": "Author preferred_names ordered by authorship position; empty when none.",
        "items": {
          "type": "string"
        }
      }
    }
  },
  "BibliographyAnalyses": {
    "type": "object",
    "description": "Aggregate analytics returned by GET /bibliographies/analyses.",
    "properties": {
      "most_used_works": {
        "type": "array",
        "description": "Most-reused works, ordered by used_in_courses DESC then used_in_programs DESC; capped by the limit param.",
        "items": {
          "type": "object",
          "properties": {
            "id": {
              "type": "integer",
              "description": "works.id."
            },
            "title": {
              "type": "string",
              "nullable": true,
              "description": "works.title."
            },
            "publication_year": {
              "type": "integer",
              "nullable": true,
              "description": "Latest publication year."
            },
            "open_access": {
              "type": "boolean",
              "nullable": true,
              "description": "Open-access flag from the latest publication."
            },
            "document_type": {
              "type": "string",
              "nullable": true,
              "description": "Latest publication type enum.",
              "enum": [
                "ARTICLE",
                "BOOK",
                "CHAPTER",
                "THESIS",
                "CONFERENCE",
                "CONFERENCE_PAPER",
                "REPORT",
                "DATASET",
                "PREPRINT",
                "REVIEW",
                "EDITORIAL",
                "OTHER"
              ]
            },
            "used_in_courses": {
              "type": "integer",
              "description": "COUNT(DISTINCT course_id)."
            },
            "used_in_programs": {
              "type": "integer",
              "description": "COUNT(DISTINCT program_id)."
            },
            "reading_types": {
              "type": "array",
              "description": "Distinct reading_type values for this work.",
              "items": {
                "type": "string"
              }
            }
          }
        }
      },
      "trends_by_year": {
        "type": "array",
        "description": "Per-course-year trend, ordered by year DESC, fixed at 10 rows.",
        "items": {
          "type": "object",
          "properties": {
            "year": {
              "type": "integer",
              "nullable": true,
              "description": "courses.year."
            },
            "works_count": {
              "type": "integer",
              "description": "COUNT(DISTINCT work_id)."
            },
            "courses_count": {
              "type": "integer",
              "description": "COUNT(DISTINCT course_id)."
            },
            "programs_count": {
              "type": "integer",
              "description": "COUNT(DISTINCT program_id)."
            },
            "avg_publication_year": {
              "type": "number",
              "nullable": true,
              "description": "AVG(publications.year), fractional."
            }
          }
        }
      },
      "reading_type_distribution": {
        "type": "array",
        "description": "Usage per reading_type, ordered by count DESC (unbounded).",
        "items": {
          "type": "object",
          "properties": {
            "reading_type": {
              "type": "string",
              "nullable": true,
              "description": "The reading_type value."
            },
            "count": {
              "type": "integer",
              "description": "Total bibliography rows of that type."
            },
            "unique_works": {
              "type": "integer",
              "description": "COUNT(DISTINCT work_id)."
            },
            "courses": {
              "type": "integer",
              "description": "COUNT(DISTINCT course_id)."
            }
          }
        }
      },
      "document_type_distribution": {
        "type": "array",
        "description": "Usage per document (publication) type, ordered by usage_count DESC, fixed at 10 rows.",
        "items": {
          "type": "object",
          "properties": {
            "document_type": {
              "type": "string",
              "nullable": true,
              "description": "Latest publication type enum.",
              "enum": [
                "ARTICLE",
                "BOOK",
                "CHAPTER",
                "THESIS",
                "CONFERENCE",
                "CONFERENCE_PAPER",
                "REPORT",
                "DATASET",
                "PREPRINT",
                "REVIEW",
                "EDITORIAL",
                "OTHER"
              ]
            },
            "usage_count": {
              "type": "integer",
              "description": "Total bibliography rows."
            },
            "unique_works": {
              "type": "integer",
              "description": "COUNT(DISTINCT works.id)."
            },
            "courses_count": {
              "type": "integer",
              "description": "COUNT(DISTINCT course_id)."
            }
          }
        }
      }
    }
  },
  "BibliographyStatistics": {
    "type": "object",
    "description": "Global rollup counts returned by GET /bibliographies/statistics.",
    "properties": {
      "total_bibliography_entries": {
        "type": "integer",
        "description": "COUNT(*) of course_bibliography rows."
      },
      "unique_works": {
        "type": "integer",
        "description": "COUNT(DISTINCT work_id)."
      },
      "courses_with_bibliography": {
        "type": "integer",
        "description": "COUNT(DISTINCT course_id)."
      },
      "programs_with_bibliography": {
        "type": "integer",
        "description": "COUNT(DISTINCT program_id)."
      },
      "avg_works_per_course": {
        "type": "number",
        "nullable": true,
        "description": "Average works per course; null when empty."
      },
      "max_works_per_course": {
        "type": "integer",
        "nullable": true,
        "description": "Max works on any one course; null when empty."
      },
      "reading_type_distribution": {
        "type": "array",
        "description": "Per reading_type breakdown, ordered by count DESC.",
        "items": {
          "type": "object",
          "properties": {
            "reading_type": {
              "type": "string",
              "nullable": true,
              "description": "The reading_type value."
            },
            "count": {
              "type": "integer",
              "description": "Number of rows of that type."
            },
            "percentage": {
              "type": "number",
              "description": "count * 100 / total, 2 decimal places."
            }
          }
        }
      },
      "year_range": {
        "type": "object",
        "description": "Year bounds across courses and their publications; all null when empty.",
        "properties": {
          "earliest_course_year": {
            "type": "integer",
            "nullable": true,
            "description": "MIN(courses.year)."
          },
          "latest_course_year": {
            "type": "integer",
            "nullable": true,
            "description": "MAX(courses.year)."
          },
          "earliest_publication_year": {
            "type": "integer",
            "nullable": true,
            "description": "MIN(publications.year)."
          },
          "latest_publication_year": {
            "type": "integer",
            "nullable": true,
            "description": "MAX(publications.year)."
          },
          "avg_publication_year": {
            "type": "number",
            "nullable": true,
            "description": "AVG(publications.year), fractional."
          }
        }
      }
    }
  },
  "MetricsAnnualItem": {
    "type": "object",
    "description": "One year's publication/works roll-up (grouped by publications.year).",
    "properties": {
      "year": {
        "type": "integer",
        "description": "Publication year (bounded 1000..YEAR(CURDATE())+1).",
        "example": 2024
      },
      "metrics": {
        "type": "object",
        "properties": {
          "total_publications": {
            "type": "integer",
            "description": "COUNT(*) of publications in the year."
          },
          "unique_works": {
            "type": "integer",
            "description": "COUNT(DISTINCT work_id) in the year."
          },
          "open_access_count": {
            "type": "integer",
            "description": "Publications with open_access = 1."
          },
          "open_access_percentage": {
            "type": "number",
            "format": "float",
            "description": "open_access_count * 100 / total_publications, 2dp."
          },
          "articles": {
            "type": "integer",
            "description": "Publications of type ARTICLE."
          },
          "books": {
            "type": "integer",
            "description": "Publications of type BOOK."
          },
          "unique_organizations": {
            "type": "integer",
            "description": "Distinct affiliated organizations active in the year (real, from the operator-maintained metrics_annual_summary table). 0 only for very sparse historical years."
          },
          "avg_citations": {
            "type": "number",
            "format": "float",
            "description": "Mean citations per publication in the year (precomputed in metrics_annual_summary)."
          }
        }
      },
      "growth": {
        "type": "object",
        "properties": {
          "publications_vs_previous": {
            "type": "number",
            "nullable": true,
            "description": "Always null (not computed)."
          },
          "authors_vs_previous": {
            "type": "number",
            "nullable": true,
            "description": "Always null (not computed)."
          }
        }
      }
    }
  },
  "MetricsVenueRankingItem": {
    "type": "object",
    "description": "Compact venue ranking row (ordered by venues.works_count DESC).",
    "properties": {
      "venue_id": {
        "type": "integer",
        "description": "venues.id."
      },
      "ranking": {
        "type": "integer",
        "description": "1-based, page-relative (offset + index + 1)."
      },
      "name": {
        "type": "string",
        "description": "venues.name."
      },
      "abbreviated_name": {
        "type": "string",
        "nullable": true,
        "description": "venues.abbreviated_name."
      },
      "type": {
        "type": "string",
        "enum": [
          "JOURNAL",
          "CONFERENCE",
          "REPOSITORY",
          "BOOK_SERIES",
          "SOURCE_BOOK",
          "OTHER"
        ],
        "description": "venues.type."
      },
      "metrics": {
        "type": "object",
        "properties": {
          "total_works": {
            "type": "integer",
            "description": "venues.works_count."
          },
          "unique_authors": {
            "type": "integer",
            "description": "Always 0 (placeholder)."
          },
          "open_access_works": {
            "type": "integer",
            "description": "Always 0 (placeholder)."
          },
          "open_access_percentage": {
            "type": "number",
            "description": "Always 0 (placeholder)."
          }
        }
      },
      "timespan": {
        "type": "object",
        "properties": {
          "first_publication_year": {
            "type": "integer",
            "nullable": true,
            "description": "venues.coverage_start_year."
          },
          "latest_publication_year": {
            "type": "integer",
            "nullable": true,
            "description": "venues.coverage_end_year."
          },
          "years_active": {
            "type": "integer",
            "description": "latest - first + 1, else 0."
          }
        }
      }
    }
  },
  "MetricsInstitutionRankingItem": {
    "type": "object",
    "description": "Compact organization ranking row (ordered by organizations.publication_count DESC).",
    "properties": {
      "organization_id": {
        "type": "integer",
        "description": "organizations.id."
      },
      "ranking": {
        "type": "integer",
        "description": "1-based, page-relative."
      },
      "name": {
        "type": "string",
        "description": "organizations.name."
      },
      "country_code": {
        "type": "string",
        "nullable": true,
        "description": "ISO 3166-1 alpha-2 country code."
      },
      "metrics": {
        "type": "object",
        "properties": {
          "total_works": {
            "type": "integer",
            "description": "organizations.publication_count."
          },
          "total_citations": {
            "type": "integer",
            "description": "organizations.total_citations."
          },
          "avg_citations": {
            "type": "number",
            "nullable": true,
            "description": "total_citations / total_works, 2dp (null when total_works = 0)."
          },
          "unique_researchers": {
            "type": "integer",
            "description": "organizations.researcher_count."
          },
          "open_access_works_count": {
            "type": "integer",
            "description": "organizations.open_access_works_count. Scope-mismatched: can exceed total_works; do not derive an OA percentage."
          },
          "h_index": {
            "type": "integer",
            "nullable": true,
            "description": "organizations.h_index."
          }
        }
      },
      "timespan": {
        "type": "object",
        "properties": {
          "first_publication_year": {
            "type": "integer",
            "nullable": true,
            "description": "MIN(publications.year) over affiliated authorships (bounded)."
          },
          "latest_publication_year": {
            "type": "integer",
            "nullable": true,
            "description": "MAX(publications.year); may be a garbage future year."
          },
          "years_active": {
            "type": "integer",
            "description": "latest - first + 1, else 0."
          }
        }
      },
      "productivity_score": {
        "type": "number",
        "nullable": true,
        "description": "Always null (not computed)."
      }
    }
  },
  "MetricsPersonRankingItem": {
    "type": "object",
    "description": "Compact person ranking row (ordered by persons.total_works DESC).",
    "properties": {
      "person_id": {
        "type": "integer",
        "description": "persons.id."
      },
      "ranking": {
        "type": "integer",
        "description": "1-based, page-relative."
      },
      "name": {
        "type": "string",
        "description": "persons.preferred_name."
      },
      "identifiers": {
        "type": "object",
        "properties": {
          "orcid": {
            "type": "string",
            "nullable": true,
            "description": "persons.orcid."
          }
        }
      },
      "is_verified": {
        "type": "boolean",
        "nullable": true,
        "description": "persons.is_verified."
      },
      "primary_affiliation": {
        "type": "object",
        "nullable": true,
        "description": "Always null (not computed)."
      },
      "metrics": {
        "type": "object",
        "properties": {
          "total_works": {
            "type": "integer",
            "description": "persons.total_works."
          },
          "total_citations": {
            "type": "integer",
            "description": "persons.total_citations."
          },
          "avg_citations": {
            "type": "number",
            "description": "ROUND(total_citations / total_works, 2)."
          }
        }
      },
      "timespan": {
        "type": "object",
        "properties": {
          "first_publication_year": {
            "type": "integer",
            "nullable": true,
            "description": "persons.first_publication_year."
          },
          "latest_publication_year": {
            "type": "integer",
            "nullable": true,
            "description": "persons.latest_publication_year."
          },
          "years_active": {
            "type": "integer",
            "description": "latest - first + 1, else 0."
          }
        }
      },
      "productivity_score": {
        "type": "number",
        "nullable": true,
        "description": "Always null (not computed)."
      }
    }
  },
  "MetricsCollaborationRankingItem": {
    "type": "object",
    "description": "Top co-authorship pair (flat shape identical to CollaborationPair; computed over the top ~2000 authors).",
    "properties": {
      "ranking": {
        "type": "integer",
        "description": "1-based, page-relative."
      },
      "collaborators": {
        "type": "object",
        "properties": {
          "person_1": {
            "type": "object",
            "properties": {
              "id": {
                "type": "integer",
                "description": "LEAST of the two person ids."
              },
              "name": {
                "type": "string",
                "nullable": true,
                "description": "persons.preferred_name."
              }
            }
          },
          "person_2": {
            "type": "object",
            "properties": {
              "id": {
                "type": "integer",
                "description": "GREATEST of the two person ids."
              },
              "name": {
                "type": "string",
                "nullable": true,
                "description": "persons.preferred_name."
              }
            }
          }
        }
      },
      "metrics": {
        "type": "object",
        "properties": {
          "shared_works": {
            "type": "integer",
            "description": "COUNT(DISTINCT work_id) co-authored."
          },
          "avg_shared_citations": {
            "type": "number",
            "description": "ROUND(AVG(works.citation_count), 2) over shared works."
          },
          "collaboration_strength": {
            "type": "string",
            "enum": [
              "very_strong",
              "strong",
              "moderate",
              "weak"
            ],
            "description": "Derived from shared_works (>=10 very_strong, >=5 strong, >=3 moderate, else weak)."
          }
        }
      },
      "timespan": {
        "type": "object",
        "properties": {
          "first_collaboration_year": {
            "type": "integer",
            "nullable": true,
            "description": "MIN(publications.year)."
          },
          "latest_collaboration_year": {
            "type": "integer",
            "nullable": true,
            "description": "MAX(publications.year)."
          },
          "collaboration_years": {
            "type": "integer",
            "description": "latest - first + 1, else 0."
          }
        }
      }
    }
  },
  "DashboardAlert": {
    "type": "object",
    "description": "A single threshold-based system alert. Same shape in /dashboard/alerts and DashboardOverview.alerts[].",
    "properties": {
      "type": {
        "type": "string",
        "enum": [
          "error",
          "performance",
          "volume",
          "unknown"
        ],
        "description": "Alert category."
      },
      "severity": {
        "type": "string",
        "enum": [
          "critical",
          "high",
          "medium",
          "low"
        ],
        "description": "Alert severity; alerts are sorted by descending severity."
      },
      "message": {
        "type": "string",
        "description": "Human-readable alert message, e.g. 'Slow average response time: 373ms'."
      },
      "threshold": {
        "type": "string",
        "nullable": true,
        "description": "Threshold that was crossed, e.g. '5%', '50ms', '100 QPS'."
      },
      "current_value": {
        "type": "string",
        "nullable": true,
        "description": "Current observed value as a string with unit, e.g. '373ms', '2.31%'."
      },
      "timestamp": {
        "type": "string",
        "format": "date-time",
        "description": "ISO 8601 time the alert was generated."
      },
      "requires_action": {
        "type": "boolean",
        "description": "True when severity is high or critical."
      },
      "alert_id": {
        "type": "string",
        "description": "Deterministic id 'alert_<md5[:8]>' derived from type+severity+message."
      }
    }
  },
  "DashboardTopEndpoint": {
    "type": "object",
    "description": "Request-count entry for one endpoint.",
    "properties": {
      "endpoint": {
        "type": "string",
        "description": "Method and path, e.g. 'GET /publications'."
      },
      "count": {
        "type": "integer",
        "description": "Number of requests to this endpoint since process start."
      }
    }
  },
  "DashboardTrendIndicator": {
    "type": "object",
    "description": "Trend indicator comparing a recent 3-day average against the oldest 3-day average.",
    "properties": {
      "trend": {
        "type": "string",
        "enum": [
          "increasing",
          "decreasing",
          "stable",
          "unknown"
        ],
        "description": "increasing when change > +10%, decreasing when < -10%, else stable; unknown when data is insufficient."
      },
      "change_percent": {
        "type": "number",
        "description": "Percent change of recent vs historical average (2 dp)."
      },
      "recent_average": {
        "type": "number",
        "description": "Average over the most recent 3 days."
      },
      "historical_average": {
        "type": "number",
        "description": "Average over the oldest 3 days."
      },
      "is_significant": {
        "type": "boolean",
        "description": "True when the absolute change_percent exceeds 10."
      }
    }
  },
  "DashboardDailySearch": {
    "type": "object",
    "description": "Per-day search analytics point (search-trends daily_data).",
    "properties": {
      "date": {
        "type": "string",
        "format": "date-time",
        "description": "ISO 8601 datetime for the day (midnight UTC)."
      },
      "total_searches": {
        "type": "integer",
        "description": "Total searches recorded that day."
      },
      "unique_queries": {
        "type": "integer",
        "description": "Distinct query strings that day."
      },
      "avg_results": {
        "type": "number",
        "description": "Average result count per search that day."
      },
      "top_terms": {
        "type": "array",
        "description": "Always an empty array in the current DTO output.",
        "items": {
          "type": "object"
        }
      }
    }
  },
  "DashboardOverview": {
    "type": "object",
    "description": "Complete dashboard snapshot from in-process monitoring telemetry (not the database). Numbers are cumulative since the last process restart.",
    "properties": {
      "timestamp": {
        "type": "string",
        "format": "date-time",
        "description": "DTO generation time (ISO 8601)."
      },
      "search_performance": {
        "type": "object",
        "properties": {
          "engine_status": {
            "type": "string",
            "description": "Search engine label; hardcoded 'Manticore'."
          },
          "current_metrics": {
            "type": "object",
            "properties": {
              "queries_per_second": {
                "type": "number",
                "description": "Total requests divided by uptime seconds (2 dp)."
              },
              "avg_response_time": {
                "type": "integer",
                "description": "Average response time in milliseconds over the recent sampling window."
              },
              "error_rate": {
                "type": "number",
                "description": "Error rate in PERCENT units (e.g. 2.31 means 2.31%), computed as errors/requests*100. Not a 0-1 fraction."
              },
              "index_size_mb": {
                "type": "number",
                "description": "Index size in MB; always 0 (not tracked)."
              }
            }
          },
          "performance_distribution": {
            "type": "object",
            "properties": {
              "total_queries": {
                "type": "integer",
                "description": "Total requests since process start."
              },
              "by_status": {
                "type": "object",
                "description": "Map of HTTP status code (string key) to request count.",
                "additionalProperties": {
                  "type": "integer"
                }
              },
              "top_endpoints": {
                "type": "array",
                "description": "Up to 10 endpoints, sorted by descending count.",
                "items": {
                  "$ref": "#/components/schemas/DashboardTopEndpoint"
                }
              }
            }
          }
        }
      },
      "system_health": {
        "type": "object",
        "properties": {
          "rollback_active": {
            "type": "boolean",
            "description": "Hardcoded false."
          },
          "uptime_seconds": {
            "type": "integer",
            "description": "Process uptime in seconds."
          },
          "consecutive_failures": {
            "type": "integer",
            "description": "Hardcoded 0."
          },
          "last_successful_check": {
            "type": "string",
            "format": "date-time",
            "description": "Synthetic; equals generation time."
          },
          "memory_usage": {
            "type": "string",
            "description": "Resident set size as a string with unit, e.g. '142MB rss'."
          },
          "active_connections": {
            "type": "integer",
            "description": "Hardcoded 0."
          },
          "health_status": {
            "type": "string",
            "enum": [
              "healthy",
              "warning",
              "unhealthy",
              "degraded",
              "unknown"
            ],
            "description": "Derived health status; effectively always 'healthy'."
          }
        }
      },
      "recent_activity": {
        "type": "object",
        "properties": {
          "queries_last_hour": {
            "type": "integer",
            "description": "Sample count in the recent monitoring window (labeled hour)."
          },
          "queries_last_minute": {
            "type": "integer",
            "description": "Hardcoded 0."
          },
          "recent_queries": {
            "type": "array",
            "description": "Always an empty array (no query retention).",
            "items": {
              "type": "object"
            }
          },
          "search_analytics": {
            "type": "object",
            "description": "Map of date key 'YYYY-MM-DD' to that day's search analytics; spans a fixed 7-day window. May instead be { message } when no analytics data is available.",
            "additionalProperties": {
              "type": "object",
              "properties": {
                "total_searches": {
                  "type": "integer"
                },
                "unique_queries": {
                  "type": "integer"
                },
                "avg_results": {
                  "type": "number"
                },
                "top_queries": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "query": {
                        "type": "string"
                      },
                      "count": {
                        "type": "integer"
                      }
                    }
                  }
                }
              }
            }
          },
          "activity_level": {
            "type": "string",
            "enum": [
              "minimal",
              "low",
              "moderate",
              "high",
              "very_high",
              "unknown"
            ],
            "description": "Bucketed activity level derived from queries_last_hour."
          }
        }
      },
      "alerts": {
        "type": "array",
        "description": "Current threshold alerts (same shape as /dashboard/alerts items).",
        "items": {
          "$ref": "#/components/schemas/DashboardAlert"
        }
      }
    }
  },
  "DashboardPerformance": {
    "type": "object",
    "description": "Performance summary, status distribution and an (always empty) time-series for charts, from in-process telemetry.",
    "properties": {
      "chart_data": {
        "type": "array",
        "description": "Historical time series for charts; always an empty array (no historical retention).",
        "items": {
          "type": "object"
        }
      },
      "summary": {
        "type": "object",
        "properties": {
          "total_queries": {
            "type": "integer",
            "description": "Cumulative requests since process start."
          },
          "avg_response_time": {
            "type": "integer",
            "description": "Average response time in milliseconds (recent window)."
          },
          "p95_response_time": {
            "type": "integer",
            "description": "95th percentile response time in milliseconds (recent window)."
          },
          "error_count": {
            "type": "number",
            "description": "MISLABELED: this is the error RATE in PERCENT (e.g. 2.26 means 2.26%), not a count. Route sets error_count = error_rate."
          },
          "uptime_seconds": {
            "type": "integer",
            "description": "Process uptime in seconds."
          }
        }
      },
      "distribution": {
        "type": "object",
        "properties": {
          "total_queries": {
            "type": "integer",
            "description": "Same as summary.total_queries."
          },
          "by_status": {
            "type": "object",
            "description": "Map of HTTP status code (string key) to request count.",
            "additionalProperties": {
              "type": "integer"
            }
          },
          "top_endpoints": {
            "type": "array",
            "description": "Up to 10 endpoints, sorted by descending count.",
            "items": {
              "$ref": "#/components/schemas/DashboardTopEndpoint"
            }
          }
        }
      }
    }
  },
  "DashboardSearchTrends": {
    "type": "object",
    "description": "Search trend indicators, popular autocomplete terms and per-day search analytics.",
    "properties": {
      "trends": {
        "type": "object",
        "description": "Trend indicators. May instead be { message: 'Insufficient data for trend analysis' } when fewer than 2 days of analytics exist.",
        "properties": {
          "search_volume": {
            "$ref": "#/components/schemas/DashboardTrendIndicator"
          },
          "unique_queries": {
            "$ref": "#/components/schemas/DashboardTrendIndicator"
          },
          "avg_results": {
            "$ref": "#/components/schemas/DashboardTrendIndicator"
          }
        }
      },
      "popular_terms": {
        "type": "array",
        "description": "Up to 20 popular terms sorted by descending frequency; frequency is corpus autocomplete frequency, not user-search counts.",
        "items": {
          "type": "object",
          "properties": {
            "term": {
              "type": "string",
              "description": "Search term."
            },
            "frequency": {
              "type": "integer",
              "description": "Corpus frequency of the term."
            },
            "trend": {
              "type": "string",
              "description": "Always 'stable'."
            }
          }
        }
      },
      "daily_data": {
        "type": "array",
        "description": "Per-day analytics, ascending by date, over the fixed 7-day window.",
        "items": {
          "$ref": "#/components/schemas/DashboardDailySearch"
        }
      },
      "analytics_period": {
        "type": "string",
        "description": "Analytics window label; hardcoded to the fixed 7-day window, e.g. '7 days'. Does not reflect the days parameter."
      },
      "generated_at": {
        "type": "string",
        "format": "date-time",
        "description": "DTO generation time (ISO 8601)."
      }
    }
  },
  "DashboardAlerts": {
    "type": "object",
    "description": "Current threshold-based system alerts with severity rollup.",
    "properties": {
      "alerts": {
        "type": "array",
        "description": "Active alerts, sorted by descending severity.",
        "items": {
          "$ref": "#/components/schemas/DashboardAlert"
        }
      },
      "alert_count": {
        "type": "integer",
        "description": "Number of active alerts (equals alerts.length)."
      },
      "last_check": {
        "type": "string",
        "format": "date-time",
        "description": "ISO 8601 time of this evaluation."
      },
      "severity_counts": {
        "type": "object",
        "description": "Map of severity to count; only severities that are present appear.",
        "additionalProperties": {
          "type": "integer"
        }
      }
    }
  },
  "SecurityStats": {
    "type": "object",
    "description": "Effective rate-limiter configuration plus in-memory block/violation counters returned by GET /security/stats. Rate limiting uses in-memory rolling windows, so no per-IP violation or block tracking is persisted.",
    "properties": {
      "rate_limit_config": {
        "type": "object",
        "description": "Effective rate-limiter configuration.",
        "properties": {
          "disabled": {
            "type": "boolean",
            "description": "Whether rate limiting is globally disabled (RATE_LIMIT_DISABLED); false in production."
          },
          "windowMs": {
            "type": "integer",
            "description": "Rolling window length in milliseconds (default 60000)."
          },
          "general": {
            "type": "integer",
            "description": "Requests allowed per window for the general limiter (default 120)."
          },
          "search": {
            "type": "integer",
            "description": "Requests allowed per window for the search limiter (observed 1200)."
          },
          "metrics": {
            "type": "integer",
            "description": "Requests allowed per window for the metrics limiter (observed 3000)."
          },
          "relational": {
            "type": "integer",
            "description": "Requests allowed per window for the relational limiter (observed 240)."
          },
          "slowDown": {
            "type": "object",
            "description": "Speed-limiter (progressive delay) configuration.",
            "properties": {
              "delayAfter": {
                "type": "integer",
                "description": "Number of requests in the window before delays begin (observed 5000)."
              },
              "delayMs": {
                "type": "integer",
                "description": "Delay in milliseconds added per request beyond the threshold (observed 50)."
              },
              "maxDelayMs": {
                "type": "integer",
                "description": "Maximum added delay in milliseconds (observed 1000)."
              }
            },
            "required": [
              "delayAfter",
              "delayMs",
              "maxDelayMs"
            ]
          }
        },
        "required": [
          "disabled",
          "windowMs",
          "general",
          "search",
          "metrics",
          "relational",
          "slowDown"
        ]
      },
      "blocked_ips": {
        "type": "array",
        "description": "Currently blocked IP addresses; always empty (no persistent block list).",
        "items": {
          "type": "string"
        }
      },
      "stats": {
        "type": "object",
        "description": "Block/violation counters.",
        "properties": {
          "total_blocked": {
            "type": "integer",
            "description": "Count of blocked IPs (blocked_ips.length); always 0."
          },
          "total_violations": {
            "type": "integer",
            "description": "Total recorded violations; not tracked, always 0."
          },
          "block_tracking_persisted": {
            "type": "boolean",
            "description": "Whether block tracking is persisted; always false."
          }
        },
        "required": [
          "total_blocked",
          "total_violations",
          "block_tracking_persisted"
        ]
      }
    },
    "required": [
      "rate_limit_config",
      "blocked_ips",
      "stats"
    ]
  },
  "SecurityHeaders": {
    "type": "object",
    "description": "Snapshot of active HTTP security headers (helmet), effective CORS configuration, and expected headers that are absent, returned by GET /security/headers.",
    "properties": {
      "headers": {
        "type": "object",
        "description": "Active security header values; null when the header is not set.",
        "properties": {
          "content-security-policy": {
            "type": "string",
            "nullable": true,
            "description": "Content-Security-Policy header value."
          },
          "strict-transport-security": {
            "type": "string",
            "nullable": true,
            "description": "Strict-Transport-Security (HSTS) header value."
          },
          "x-frame-options": {
            "type": "string",
            "nullable": true,
            "description": "X-Frame-Options header value (e.g. DENY)."
          },
          "x-content-type-options": {
            "type": "string",
            "nullable": true,
            "description": "X-Content-Type-Options header value (e.g. nosniff)."
          },
          "referrer-policy": {
            "type": "string",
            "nullable": true,
            "description": "Referrer-Policy header value."
          },
          "x-dns-prefetch-control": {
            "type": "string",
            "nullable": true,
            "description": "X-DNS-Prefetch-Control header value (e.g. off)."
          },
          "x-permitted-cross-domain-policies": {
            "type": "string",
            "nullable": true,
            "description": "X-Permitted-Cross-Domain-Policies header value; null when unset."
          },
          "x-download-options": {
            "type": "string",
            "nullable": true,
            "description": "X-Download-Options header value (e.g. noopen)."
          },
          "x-powered-by": {
            "type": "string",
            "nullable": true,
            "description": "X-Powered-By header value; null (disabled by design)."
          }
        },
        "required": [
          "content-security-policy",
          "strict-transport-security",
          "x-frame-options",
          "x-content-type-options",
          "referrer-policy",
          "x-dns-prefetch-control",
          "x-permitted-cross-domain-policies",
          "x-download-options",
          "x-powered-by"
        ]
      },
      "cors": {
        "type": "object",
        "description": "Effective CORS configuration.",
        "properties": {
          "allowed_origins": {
            "type": "array",
            "description": "Allowed CORS origins (from CORS_ORIGINS env or defaults).",
            "items": {
              "type": "string"
            }
          },
          "allowed_methods": {
            "type": "array",
            "description": "Allowed HTTP methods.",
            "items": {
              "type": "string"
            }
          },
          "allowed_headers": {
            "type": "array",
            "description": "Allowed request headers.",
            "items": {
              "type": "string"
            }
          },
          "credentials": {
            "type": "boolean",
            "description": "Whether credentials are allowed."
          }
        },
        "required": [
          "allowed_origins",
          "allowed_methods",
          "allowed_headers",
          "credentials"
        ]
      },
      "missing_headers": {
        "type": "array",
        "description": "Expected security headers whose value is null (excluding x-powered-by, which is intentionally disabled).",
        "items": {
          "type": "string"
        }
      }
    },
    "required": [
      "headers",
      "cors",
      "missing_headers"
    ]
  },
  "SecurityAudit": {
    "type": "object",
    "description": "Access-key enforcement audit results returned by GET /security/audit; verifies the internal access-key guard is mounted on the dashboard, health, and security route groups.",
    "properties": {
      "audit": {
        "type": "object",
        "description": "Per-router guard-presence flags.",
        "properties": {
          "dashboard_protected": {
            "type": "boolean",
            "description": "Whether the access-key guard is mounted on the /dashboard router."
          },
          "health_protected": {
            "type": "boolean",
            "description": "Whether the access-key guard is mounted on the /health router."
          },
          "security_protected": {
            "type": "boolean",
            "description": "Whether the access-key guard is mounted on the /security router."
          }
        },
        "required": [
          "dashboard_protected",
          "health_protected",
          "security_protected"
        ]
      },
      "missing": {
        "type": "array",
        "description": "Audit keys whose value is false; empty when all route groups are protected.",
        "items": {
          "type": "string"
        }
      }
    },
    "required": [
      "audit",
      "missing"
    ]
  },
  "UnblockResult": {
    "type": "object",
    "description": "Result of POST /security/unblock/{ip}. Because the block list is in-memory and always empty, unblocked is effectively always false.",
    "properties": {
      "ip": {
        "type": "string",
        "description": "The IP address that was requested to be unblocked (echoed)."
      },
      "unblocked": {
        "type": "boolean",
        "description": "Whether the IP was present in the in-memory block list and removed; effectively always false."
      }
    },
    "required": [
      "ip",
      "unblocked"
    ]
  },
  "SystemRoot": {
    "type": "object",
    "description": "API root service-discovery document: identity, live corpus totals, endpoint category map, feature blurbs, and quick-start examples.",
    "properties": {
      "name": {
        "type": "string",
        "example": "Ethnos.app Academic Bibliography API"
      },
      "version": {
        "type": "string",
        "example": "2.0.0"
      },
      "description": {
        "type": "string",
        "description": "Interpolates live corpus totals; falls back to a plain string if the boot snapshot is unavailable."
      },
      "environment": {
        "type": "string",
        "description": "process.env.NODE_ENV.",
        "example": "production"
      },
      "timestamp": {
        "type": "string",
        "format": "date-time",
        "description": "Per-request server time (ISO 8601)."
      },
      "documentation": {
        "type": "object",
        "properties": {
          "swagger_ui": {
            "type": "string",
            "example": "/docs"
          },
          "openapi_spec": {
            "type": "string",
            "example": "/docs.json"
          }
        }
      },
      "system_status": {
        "type": "object",
        "properties": {
          "database": {
            "type": "string",
            "description": "Human-readable corpus size blurb."
          },
          "search_engine": {
            "type": "string",
            "description": "Search backend blurb: Manticore for works/persons, MariaDB FULLTEXT for venues/subjects/organizations."
          },
          "cache": {
            "type": "string",
            "example": "Redis with 30min TTL"
          },
          "rate_limiting": {
            "type": "string"
          },
          "authentication": {
            "type": "string"
          }
        }
      },
      "main_categories": {
        "type": "object",
        "description": "Map of endpoint groups; each value is a category descriptor.",
        "additionalProperties": {
          "type": "object",
          "properties": {
            "description": {
              "type": "string"
            },
            "endpoints": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "description": "Example endpoint paths (some carry a {id} template placeholder)."
            }
          }
        }
      },
      "data_statistics": {
        "type": "object",
        "description": "Live corpus totals as comma-grouped number STRINGS (e.g. \"7,136,695\"), not integers. Do not parseInt directly.",
        "properties": {
          "total_works": {
            "type": "string",
            "nullable": true,
            "example": "7,136,695"
          },
          "total_publications": {
            "type": "string",
            "nullable": true,
            "example": "7,220,125"
          },
          "total_researchers": {
            "type": "string",
            "nullable": true,
            "example": "4,727,444"
          },
          "total_organizations": {
            "type": "string",
            "nullable": true,
            "example": "639,573"
          },
          "total_venues": {
            "type": "string",
            "nullable": true,
            "example": "189,076"
          },
          "total_courses": {
            "type": "string",
            "nullable": true,
            "example": "1"
          },
          "collected_at": {
            "type": "string",
            "format": "date-time",
            "nullable": true,
            "description": "Snapshot collection time; null if the boot snapshot failed."
          }
        }
      },
      "technical_features": {
        "type": "object",
        "properties": {
          "search_performance": {
            "type": "string"
          },
          "authentication": {
            "type": "string"
          },
          "rate_limits": {
            "type": "string"
          },
          "response_format": {
            "type": "string"
          },
          "cache_ttl": {
            "type": "string"
          },
          "security": {
            "type": "string"
          }
        }
      },
      "quick_examples": {
        "type": "object",
        "properties": {
          "search_works": {
            "type": "string",
            "example": "GET /search/works?q=machine+learning&limit=10"
          },
          "get_work_details": {
            "type": "string",
            "example": "GET /works/22519667"
          },
          "search_authors": {
            "type": "string",
            "example": "GET /persons?search=silva&limit=5"
          },
          "venue_metrics": {
            "type": "string",
            "example": "GET /venues/statistics"
          },
          "system_health": {
            "type": "string",
            "example": "GET /health/liveness"
          }
        }
      },
      "support": {
        "type": "object",
        "properties": {
          "license": {
            "type": "string",
            "example": "MIT License"
          },
          "website": {
            "type": "string",
            "example": "https://ethnos.app"
          },
          "technical_contact": {
            "type": "string"
          }
        }
      }
    }
  },
  "HealthLiveness": {
    "type": "object",
    "description": "Liveness probe payload. No database access.",
    "properties": {
      "alive": {
        "type": "boolean",
        "description": "Always true while the process serves.",
        "example": true
      },
      "timestamp": {
        "type": "string",
        "format": "date-time",
        "description": "Server time (ISO 8601)."
      }
    }
  },
  "HealthReadiness": {
    "type": "object",
    "description": "Readiness probe payload returned on 200 when the database is reachable.",
    "properties": {
      "ready": {
        "type": "boolean",
        "example": true
      },
      "message": {
        "type": "string",
        "example": "Service is ready to accept requests"
      }
    }
  }
};
