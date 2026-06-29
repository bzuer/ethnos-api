const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Ethnos.app Academic Bibliography API',
      version: '2.0.0',
      description: [
        'REST API for academic bibliographic research: works, publications, persons, institutions, venues, courses, citations, collaborations and system health.',
        '',
        '## Conventions',
        '- Open access: data and metrics endpoints need no key. The optional `x-access-key` header (see the `XAccessKey` security scheme) lifts the rate limit. A key is still required for `/dashboard`, `/security/*`, and the internal health probes `/health/readiness` and `/health/metrics`.',
        '- Unauthenticated requests are limited to 120/min per IP; a valid key removes the limit. Requests over the limit are rejected with 429.',
        '- Read-only by design. The only mutating endpoint is `POST /security/unblock/{ip}`.',
        '- Standard response envelope: `{ status, data, pagination?, meta? }`. Errors: `{ status: "error", message, code, timestamp }`.',
        '- Pagination accepts `page/limit` and `offset/limit` interchangeably.',
        '- Supported identifier families: DOI, ORCID, ROR, ISSN / eISSN, Scopus, OpenAlex, Wikidata, Handle, PMID, PMCID, arXiv.'
      ].join('\n'),
      contact: {
        name: 'Bruno Cesar Cunha Cruz, PhD Student'
      },
      license: {
        name: 'MIT License',
        url: 'https://opensource.org/licenses/MIT'
      },
      'x-developer-orcid': '0000-0001-8652-2333',
      'x-institution': 'PPGAS/MN/UFRJ'
    },
    servers: [
      {
        url: 'https://api.ethnos.app',
        description: 'Production'
      },
      {
        url: 'http://localhost:1211',
        description: 'Development'
      }
    ],
    externalDocs: {
      description: 'Ethnos.app Platform',
      url: 'https://ethnos.app'
    },
    components: {
      securitySchemes: {
        XAccessKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-access-key',
          description: 'Optional on data and metrics endpoints, where it only removes the 120/min per-IP rate limit. Required for `/dashboard`, `/security/*`, `/health/readiness`, and `/health/metrics`. Aliases: `x-access-key`, `x-internal-key`, `x-api-key`.'
        }
      },
      schemas: {
        Signature: {
          type: 'object',
          description: 'Author signature (a normalized name form) backed by the signatures base table. Exposed at /signatures.',
          properties: {
            id: { type: 'integer', example: 92152 },
            signature: { type: 'string', example: 'SILVA, J.', description: 'Normalized author name form' },
            persons_count: { type: 'integer', nullable: true, example: 3, description: 'Distinct persons sharing this signature' },
            created_at: { type: 'string', format: 'date-time', nullable: true }
          }
        },
        SuccessEnvelope: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            data: { description: 'Response payload. Varies per endpoint.' },
            pagination: { $ref: '#/components/schemas/PaginationMeta' },
            meta: { type: 'object', additionalProperties: true }
          },
          required: ['status', 'data']
        },
        PerformanceMeta: {
          type: 'object',
          properties: {
            engine: { type: 'string', example: 'MariaDB' },
            query_type: { type: 'string', example: 'search' },
            controller_time_ms: { type: 'integer', example: 42 },
            elapsed_ms: { type: 'integer', example: 77 }
          }
        },
        Error: {
          type: 'object',
          required: ['status', 'message'],
          properties: {
            status: {
              type: 'string',
              example: 'error'
            },
            message: {
              type: 'string',
              example: 'Resource not found'
            },
            code: {
              type: 'string',
              example: 'NOT_FOUND'
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Work: {
          type: 'object',
          description: 'Canonical work payload used across list and detail endpoints. List responses expose top-level publication_year; detailed responses expose publication.year. Legacy aliases work_type and year may appear in /works/showcase for backward compatibility.',
          properties: {
            id: {
              type: 'integer',
              example: 123456,
              description: 'Unique identifier for the work'
            },
            title: {
              type: 'string',
              example: 'Machine Learning Applications in Academic Research: A Comprehensive Survey',
              description: 'Primary title of the work'
            },
            subtitle: {
              type: 'string',
              nullable: true,
              example: 'An Analysis of Current Trends and Future Directions',
              description: 'Subtitle of the work'
            },
            abstract: {
              type: 'string',
              nullable: true,
              example: 'This paper presents a comprehensive survey of machine learning applications in academic research, covering methodologies, tools, and emerging trends across multiple disciplines. We analyze current approaches, identify gaps, and propose future research directions.',
              description: 'Abstract or summary of the work'
            },
            author_string: {
              type: 'string',
              nullable: true,
              example: 'Maria S. Santos;Joao C. Lima;Ana P. Costa',
              description: 'Raw author list from summary index'
            },
            subjects_string: {
              type: 'string',
              nullable: true,
              example: 'machine learning; bibliometrics; data mining',
              description: 'Raw subjects list from summary index'
            },
            venue_name: {
              type: 'string',
              nullable: true,
              example: 'Nature Machine Intelligence',
              description: 'Raw venue name from summary index'
            },
            venue_abbreviated_name: {
              type: 'string',
              nullable: true,
              example: 'Nat. Mach. Intell.',
              description: 'Raw venue abbreviated name from summary index'
            },
            created_ts: {
              type: 'integer',
              nullable: true,
              example: 1705365000,
              description: 'Unix timestamp from summary index'
            },
            year: {
              type: 'integer',
              nullable: true,
              example: 2023,
              deprecated: true,
              description: 'Legacy alias kept for /works/showcase compatibility. Prefer publication_year in list payloads or publication.year in detailed payloads.'
            },
            work_type: {
              type: 'string',
              nullable: true,
              enum: ['ARTICLE', 'BOOK', 'CHAPTER', 'THESIS', 'CONFERENCE', 'CONFERENCE_PAPER', 'REPORT', 'DATASET', 'PREPRINT', 'REVIEW', 'EDITORIAL', 'OTHER'],
              example: 'ARTICLE',
              deprecated: true,
              description: 'Legacy alias kept for /works/showcase compatibility. Prefer type.'
            },
            type: {
              type: 'string',
              nullable: true,
              enum: ['ARTICLE', 'BOOK', 'CHAPTER', 'THESIS', 'CONFERENCE', 'CONFERENCE_PAPER', 'REPORT', 'DATASET', 'PREPRINT', 'REVIEW', 'EDITORIAL', 'OTHER'],
              example: 'ARTICLE',
              description: 'Canonical work type used by list/search/detail responses. In /works/showcase, this is semantically equivalent to work_type.'
            },
            publication_year: {
              type: 'integer',
              nullable: true,
              example: 2023,
              description: 'Canonical top-level publication year for list/search/showcase responses. In detailed /works/{id} responses, the canonical year is publication.year.'
            },
            language: {
              type: 'string',
              nullable: true,
              example: 'en',
              description: 'ISO 639 language code'
            },
            open_access: {
              type: 'boolean',
              nullable: true,
              description: 'Open access flag (present in list items or publication.open_access in details)'
            },
            peer_reviewed: {
              type: 'boolean',
              nullable: true,
              description: 'Peer reviewed flag (present in list items or publication.peer_reviewed in details)'
            },
            publication: {
              type: 'object',
              nullable: true,
              properties: {
                id: {
                  type: 'integer',
                  nullable: true,
                  description: 'Publication record ID'
                },
                year: {
                  type: 'integer',
                  nullable: true,
                  example: 2023,
                  description: 'Canonical publication year in detailed /works/{id} responses. Equivalent to publication_year in list/search/showcase responses.'
                },
                volume: {
                  type: 'string',
                  nullable: true,
                  example: '15',
                  description: 'Volume number'
                },
                issue: {
                  type: 'string',
                  nullable: true,
                  example: '3',
                  description: 'Issue number'
                },
                pages: {
                  type: 'string',
                  nullable: true,
                  example: '1-25',
                  description: 'Page range'
                },
                doi: {
                  type: 'string',
                  nullable: true,
                  example: '10.1038/s42256-023-00123-4',
                  description: 'Digital Object Identifier from publications table'
                },
                peer_reviewed: {
                  type: 'boolean',
                  example: true,
                  description: 'Peer review status'
                },
                publication_date: {
                  type: 'string',
                  format: 'date',
                  nullable: true,
                  example: '2023-06-15',
                  description: 'Exact publication date'
                }
              },
              description: 'Publication metadata'
            },
            venue: {
              type: 'object',
              nullable: true,
              properties: {
                id: {
                  type: 'integer',
                  example: 1,
                  description: 'Venue ID'
                },
                name: {
                  type: 'string',
                  example: 'Nature Machine Intelligence',
                  description: 'Venue name'
                },
                abbreviated_name: {
                  type: 'string',
                  nullable: true,
                  example: 'Nat. Mach. Intell.',
                  description: 'Venue abbreviated name'
                },
                type: {
                  type: 'string',
                  enum: ['JOURNAL', 'CONFERENCE', 'REPOSITORY', 'BOOK_SERIES'],
                  example: 'JOURNAL',
                  description: 'Venue type'
                },
                issn: {
                  type: 'string',
                  nullable: true,
                  example: '2522-5839',
                  description: 'ISSN identifier'
                },
                eissn: {
                  type: 'string',
                  nullable: true,
                  example: '2522-5847',
                  description: 'Electronic ISSN'
                },
                scopus_source_id: {
                  type: 'string',
                  nullable: true,
                  example: '21100865475',
                  description: 'Scopus source ID'
                }
              },
              description: 'Publication venue information'
            },
            publisher: {
              type: 'object',
              nullable: true,
              properties: {
                id: {
                  type: 'integer',
                  example: 13,
                  description: 'Publisher ID'
                },
                name: {
                  type: 'string',
                  example: 'Springer Nature',
                  description: 'Publisher name'
                },
                type: {
                  type: 'string',
                  enum: ['ACADEMIC', 'COMMERCIAL', 'UNIVERSITY', 'SOCIETY', 'GOVERNMENT', 'OTHER'],
                  example: 'COMMERCIAL',
                  description: 'Publisher type'
                },
                country: {
                  type: 'string',
                  nullable: true,
                  example: 'United Kingdom',
                  description: 'Publisher country'
                },
                website: {
                  type: 'string',
                  nullable: true,
                  example: 'https://www.springernature.com',
                  description: 'Publisher website'
                }
              },
              description: 'Publisher information'
            },
            author_count: {
              type: 'integer',
              example: 3,
              description: 'Number of authors'
            },
            authors_preview: {
              type: 'array',
              items: { type: 'string' },
              example: ['Maria S. Santos', 'João C. Lima', 'Ana P. Costa'],
              description: 'Preview of up to 3 author names (list items)'
            },
            authors: {
              type: 'array',
              items: { $ref: '#/components/schemas/Author' },
              description: 'Detailed list of authors (work details)'
            },
            citations: {
              type: 'object',
              description: 'Inline citations and references for the work',
              properties: {
                cited_by: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      work_id: { type: 'integer' },
                      title: { type: 'string', nullable: true },
                      authors: { type: 'string', nullable: true },
                      publication_year: { type: 'integer', nullable: true },
                      venue_name: { type: 'string', nullable: true },
                      venue_abbreviated_name: { type: 'string', nullable: true },
                      open_access: { type: 'boolean', nullable: true },
                      citation_type: { type: 'string', nullable: true },
                      citation_status: {
                        type: 'string',
                        nullable: true,
                        enum: ['PENDING', 'RESOLVED', 'FAILED']
                      },
                      citation_context: { type: 'string', nullable: true }
                    }
                  }
                },
                references: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      work_id: { type: 'integer' },
                      title: { type: 'string', nullable: true },
                      authors: { type: 'string', nullable: true },
                      publication_year: { type: 'integer', nullable: true },
                      venue_name: { type: 'string', nullable: true },
                      venue_abbreviated_name: { type: 'string', nullable: true },
                      doi: { type: 'string', nullable: true },
                      open_access: { type: 'boolean', nullable: true },
                      citation_type: { type: 'string', nullable: true },
                      citation_context: { type: 'string', nullable: true }
                    }
                  }
                },
                unresolved_references: {
                  type: 'array',
                  description: 'Outgoing references that are not resolved to a target work (status PENDING/FAILED)',
                  items: {
                    type: 'object',
                    properties: {
                      cited_doi: { type: 'string', nullable: true },
                      status: {
                        type: 'string',
                        enum: ['PENDING', 'RESOLVED', 'FAILED'],
                        example: 'PENDING'
                      },
                      citation_type: {
                        type: 'string',
                        enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'SELF'],
                        nullable: true,
                        example: 'NEUTRAL'
                      },
                      created_at: { type: 'string', format: 'date-time', nullable: true },
                      resolved_at: { type: 'string', format: 'date-time', nullable: true }
                    }
                  }
                },
                unsolved: {
                  type: 'array',
                  description: 'Alias for unresolved_references, kept for compatibility',
                  items: {
                    type: 'object',
                    properties: {
                      cited_doi: { type: 'string', nullable: true },
                      status: {
                        type: 'string',
                        enum: ['PENDING', 'RESOLVED', 'FAILED'],
                        example: 'PENDING'
                      },
                      citation_type: {
                        type: 'string',
                        enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'SELF'],
                        nullable: true,
                        example: 'NEUTRAL'
                      },
                      created_at: { type: 'string', format: 'date-time', nullable: true },
                      resolved_at: { type: 'string', format: 'date-time', nullable: true }
                    }
                  }
                }
              }
            },
            first_author: {
              type: 'string',
              nullable: true,
              example: 'Maria S. Santos',
              description: 'First author display name (list items)'
            },
            first_author_id: {
              type: 'integer',
              nullable: true,
              example: 5952,
              description: 'First author person ID (list items)'
            },
            first_author_identifiers: {
              type: 'object',
              nullable: true,
              description: 'External identifiers of the first author (list items)',
              additionalProperties: { type: 'string', nullable: true }
            },
            doi: {
              type: 'string',
              nullable: true,
              example: '10.1038/s42256-023-00123-4',
              description: 'Top-level DOI (list items and showcase)'
            },
            url: {
              type: 'string',
              nullable: true,
              example: 'https://doi.org/10.1038/s42256-023-00123-4',
              description: 'URL for the work'
            },
            subjects: {
              type: 'array',
              description: 'Subject classifications (detail only)',
              items: {
                type: 'object',
                properties: {
                  subject_id: { type: 'integer', example: 346489 },
                  term: { type: 'string', example: 'Anthropology' },
                  vocabulary: { type: 'string', nullable: true, example: 'KEYWORD' },
                  lang: { type: 'string', nullable: true },
                  relevance_score: { type: 'number', nullable: true, example: 1 },
                  assigned_by: { type: 'string', nullable: true, example: 'AUTHOR' }
                }
              }
            },
            metrics: {
              type: 'object',
              description: 'Work-level metrics (detail only)',
              properties: {
                citation_count: { type: 'integer', example: 15 },
                reference_count: { type: 'integer', example: 42 },
                download_count: { type: 'integer', example: 230 },
                view_count: { type: 'integer', example: 1500 },
                altmetric_score: { type: 'number', nullable: true },
                social_media_mentions: { type: 'integer', example: 0 },
                news_mentions: { type: 'integer', example: 0 }
              }
            },
            files: {
              type: 'array',
              description: 'Associated files (detail only)',
              items: {
                type: 'object',
                properties: {
                  file_id: { type: 'integer' },
                  md5: { type: 'string', nullable: true },
                  sha1: { type: 'string', nullable: true },
                  sha256: { type: 'string', nullable: true },
                  ipfs_cid: { type: 'string', nullable: true },
                  file_role: { type: 'string', nullable: true }
                }
              }
            },
            licenses: {
              type: 'array',
              description: 'License information (detail only)',
              items: {
                type: 'object',
                properties: {
                  publication_id: { type: 'integer' },
                  license_url: { type: 'string', nullable: true, example: 'http://creativecommons.org/licenses/by-nc/4.0' },
                  license_version: { type: 'string', nullable: true, example: 'publishedVersion' },
                  created_at: { type: 'string', format: 'date-time', nullable: true }
                }
              }
            },
            added_to_database: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'When the work was added to the database (list items)'
            },
            data_source: {
              type: 'string',
              nullable: true,
              description: 'Data provenance source (list items)'
            },
            search_engine: {
              type: 'string',
              nullable: true,
              example: 'MariaDB',
              description: 'Search engine used for the query (list items)'
            },
            identifiers: {
              type: 'object',
              description: 'External identifiers for this work',
              additionalProperties: {
                type: 'array',
                items: {
                  type: 'string'
                }
              },
              example: {
                doi: ['10.1038/s42256-023-00123-4'],
                pmid: ['37845123'],
                arxiv: ['2301.00123'],
                handle: ['11449/123456']
              }
            },
            pmid: { type: 'string', nullable: true, description: 'PubMed ID (from publications)' },
            pmcid: { type: 'string', nullable: true, description: 'PubMed Central ID (from publications)' },
            arxiv: { type: 'string', nullable: true, description: 'arXiv identifier (from publications)' },
            wos_id: { type: 'string', nullable: true, description: 'Web of Science ID (from publications)' },
            handle: { type: 'string', nullable: true, description: 'Handle identifier (from publications)' },
            wikidata_id: { type: 'string', nullable: true, description: 'Wikidata entity ID (from publications)' },
            openalex_id: { type: 'string', nullable: true, description: 'OpenAlex ID (from publications)' },
            isbn: { type: 'string', nullable: true, description: 'ISBN identifier (from publications)' },
            openlibrary_id: { type: 'string', nullable: true, description: 'OpenLibrary ID (from publications)' },
            funding: {
              type: 'array',
              description: 'Funding information including funder organization, grant number, and amounts',
              items: {
                type: 'object',
                properties: {
                  funder_id: { type: 'integer', example: 4567 },
                  funder_name: { type: 'string', example: 'National Science Foundation' },
                  grant_number: { type: 'string', nullable: true, example: 'NSF-123456' }
                }
              }
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              example: '2023-01-15T10:30:00Z',
              description: 'Creation timestamp'
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              example: '2023-06-20T14:22:00Z',
              description: 'Last update timestamp'
            }
          },
          required: ['id', 'title', 'type']
        },
        Person: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 5952,
              description: 'Unique identifier for the person'
            },
            preferred_name: {
              type: 'string',
              example: 'Dr. Maria Silva Santos',
              description: 'Preferred display name of the person'
            },
            given_names: {
              type: 'string',
              example: 'Maria Silva',
              description: 'Given names'
            },
            family_name: {
              type: 'string',
              example: 'Santos',
              description: 'Family name or surname'
            },
            name_variations: {
              type: 'array',
              items: { type: 'string' },
              nullable: true,
              description: 'Known name variations'
            },
            name_signature: {
              type: 'string',
              nullable: true,
              description: 'Normalized name signature used for matching'
            },
            orcid: {
              type: 'string',
              nullable: true,
              example: '0000-0002-1825-0097',
              description: 'ORCID identifier'
            },
            lattes_id: {
              type: 'string',
              nullable: true,
              example: '1234567890123456',
              description: 'Lattes CV platform ID (Brazil)'
            },
            scopus_id: {
              type: 'string',
              nullable: true,
              example: '57194582100',
              description: 'Scopus Author ID'
            },
            wikidata_id: {
              type: 'string',
              nullable: true,
              description: 'Wikidata entity ID'
            },
            openalex_id: {
              type: 'string',
              nullable: true,
              description: 'OpenAlex ID'
            },
            url: {
              type: 'string',
              nullable: true,
              description: 'Personal or institutional URL'
            },
            identifiers: {
              type: 'object',
              nullable: true,
              description: 'All external identifiers grouped',
              properties: {
                orcid: { type: 'string', nullable: true },
                lattes_id: { type: 'string', nullable: true },
                scopus_id: { type: 'string', nullable: true },
                wikidata_id: { type: 'string', nullable: true },
                openalex_id: { type: 'string', nullable: true },
                url: { type: 'string', nullable: true }
              }
            },
            is_verified: {
              type: 'boolean',
              nullable: true,
              description: 'Whether the person record has been verified'
            },
            metrics: {
              type: 'object',
              nullable: true,
              description: 'Bibliometric indicators',
              properties: {
                works_count: { type: 'integer', example: 46 },
                latest_publication_year: { type: 'integer', nullable: true, example: 2025 }
              }
            },
            primary_affiliation: {
              $ref: '#/components/schemas/Organization',
              nullable: true,
              description: 'Primary institutional affiliation'
            },
            authorship_profile: {
              type: 'object',
              nullable: true,
              description: 'Authorship statistics and positioning analysis'
            },
            subject_expertise: {
              type: 'array',
              nullable: true,
              description: 'Subject areas of expertise',
              items: { type: 'object', additionalProperties: true }
            },
            top_collaborators: {
              type: 'array',
              nullable: true,
              description: 'Most frequent collaborators',
              items: { type: 'object', additionalProperties: true }
            },
            recent_works: {
              type: 'array',
              nullable: true,
              description: 'Most recent publications',
              items: { type: 'object', additionalProperties: true }
            },
            created_at: {
              type: 'string',
              format: 'date-time'
            },
            updated_at: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Organization: {
          type: 'object',
          description: 'Academic institution or organization (university, institute, publisher, funder, company). Exposed at `/institutions`.',
          properties: {
            id: {
              type: 'integer',
              example: 698684,
              description: 'Unique identifier for the organization'
            },
            name: {
              type: 'string',
              example: 'Universidade de São Paulo',
              description: 'Canonical name of the organization'
            },
            type: {
              type: 'string',
              enum: ['UNIVERSITY', 'INSTITUTE', 'PUBLISHER', 'FUNDER', 'COMPANY', 'OTHER'],
              example: 'INSTITUTE',
              description: 'Organization type'
            },
            openalex_type: {
              type: 'string',
              nullable: true,
              example: 'education',
              description: 'OpenAlex institution type (education, healthcare, government, nonprofit, archive, funder, company)'
            },
            status: {
              type: 'string',
              nullable: true,
              enum: ['active', 'inactive', 'withdrawn'],
              example: 'active',
              description: 'Lifecycle status'
            },
            acronyms: {
              type: 'array',
              items: { type: 'string' },
              example: ['USP'],
              description: 'Known acronyms (list responses)'
            },
            location: {
              type: 'object',
              nullable: true,
              properties: {
                country_code: { type: 'string', nullable: true, example: 'BR' },
                city: { type: 'string', nullable: true, example: 'São Paulo' }
              }
            },
            names: {
              type: 'object',
              description: 'Name surface (detail responses)',
              properties: {
                acronyms: { type: 'array', items: { type: 'string' }, example: ['USP'] },
                alternative_names: { type: 'array', items: { type: 'string' }, example: ['University of São Paulo'] },
                aliases_count: { type: 'integer', example: 3, description: 'Count of known name variants (acronyms + alternative_names).' }
              }
            },
            identifiers: {
              type: 'object',
              properties: {
                ror_id: { type: 'string', nullable: true, example: '036rp1748' },
                grid_id: { type: 'string', nullable: true, example: 'grid.11899.38' },
                wikidata_id: { type: 'string', nullable: true, example: 'Q835960' },
                openalex_id: { type: 'string', nullable: true, example: 'I17974374' },
                url: { type: 'string', nullable: true, example: 'https://www5.usp.br' }
              }
            },
            metrics: {
              type: 'object',
              description: 'Institution metrics. works_count/researchers_count/total_citations and the provisional h_index/i10_index/two_yr_mean_citedness are read straight from stored organizations columns (the database calculates them, the API never recomputes them); first_publication_year/latest_publication_year are not stored and are derived by the API from the affiliated-works corpus (bounded + cached). The open-access count/percentage are intentionally not surfaced here (the stored open_access_works_count has a scope mismatch with publication_count).',
              properties: {
                works_count: { type: 'integer', example: 13766 },
                researchers_count: { type: 'integer', example: 10872 },
                total_citations: { type: 'integer', example: 51898 },
                h_index: { type: 'integer', nullable: true, example: 51 },
                i10_index: { type: 'integer', nullable: true, example: 708 },
                two_yr_mean_citedness: { type: 'number', nullable: true, example: 0.0507 },
                first_publication_year: { type: 'integer', nullable: true, example: 1949 },
                latest_publication_year: { type: 'integer', nullable: true, example: 2026 }
              }
            },
            funding_role: {
              type: 'object',
              description: 'Footprint as a funder (detail responses)',
              properties: {
                funded_works_count: { type: 'integer', example: 0 },
                grants_count: { type: 'integer', example: 0 }
              }
            },
            relationships: {
              type: 'object',
              description: 'Organizational hierarchy (detail responses)',
              properties: {
                parents: { type: 'array', items: { type: 'object', additionalProperties: true } },
                children: { type: 'array', items: { type: 'object', additionalProperties: true } },
                related: { type: 'array', items: { type: 'object', additionalProperties: true } },
                parents_count: { type: 'integer', example: 0 },
                children_count: { type: 'integer', example: 24 },
                related_count: { type: 'integer', example: 3 }
              }
            },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
            _links: {
              type: 'object',
              properties: {
                self: { type: 'string', example: '/institutions/698684' },
                works: { type: 'string', example: '/institutions/698684/works' },
                funded_works: { type: 'string', example: '/institutions/698684/funded-works' }
              }
            }
          }
        },
        Author: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 5952
            },
            preferred_name: {
              type: 'string',
              example: 'Dr. Maria Silva Santos'
            },
            author_position: {
              type: 'integer',
              example: 1,
              description: 'Position in the author list (1-based)'
            },
            is_corresponding: {
              type: 'boolean',
              example: true,
              description: 'Whether this is the corresponding author'
            },
            affiliation: {
              $ref: '#/components/schemas/Organization',
              description: 'Author affiliation at time of publication'
            }
          }
        },
        Venue: {
          type: 'object',
          description: 'Canonical venue payload backed by the venues base table. Identifiers, bibliometric metrics, the global ranking surface and the indexing/quality flags are grouped into dedicated blocks so clients can consume each domain without scanning top-level fields.',
          properties: {
            id: { type: 'integer', example: 1012134 },
            name: { type: 'string', example: 'Cultural Anthropology', description: 'Official name of the venue' },
            abbreviated_name: { type: 'string', nullable: true, example: 'Cult. Anthropol' },
            type: { type: 'string', enum: ['JOURNAL', 'CONFERENCE', 'REPOSITORY', 'BOOK_SERIES', 'OTHER'], example: 'JOURNAL' },
            aggregation_type: { type: 'string', nullable: true, example: 'journal' },
            country_code: { type: 'string', nullable: true, example: 'US' },
            language: { type: 'string', nullable: true, description: 'Primary language of the venue (ISO 639-1).', example: 'en' },
            homepage_url: { type: 'string', nullable: true, example: 'http://www.culanth.org/' },
            open_access: { type: 'boolean', nullable: true, description: 'Declared open-access policy (fully OA)', example: true },
            coverage_start_year: { type: 'integer', nullable: true, example: 1986 },
            coverage_end_year: { type: 'integer', nullable: true, example: 2026 },
            works_count: { type: 'integer', example: 1107 },
            cited_by_count: { type: 'integer', example: 35836 },
            publisher: {
              type: 'object',
              nullable: true,
              description: 'Publishing organization linked from organizations',
              properties: {
                id: { type: 'integer', nullable: true, example: 693663 },
                name: { type: 'string', nullable: true, example: 'Wiley' },
                type: { type: 'string', nullable: true, example: 'PUBLISHER' },
                country_code: { type: 'string', nullable: true, example: 'US' }
              }
            },
            identifiers: {
              type: 'object',
              description: 'External identifier block. The same fields are NOT repeated at the top level.',
              properties: {
                issn: { type: 'string', nullable: true, example: '0886-7356' },
                eissn: { type: 'string', nullable: true, example: '1548-1360' },
                scopus_id: { type: 'string', nullable: true, example: '32383' },
                wikidata_id: { type: 'string', nullable: true },
                openalex_id: { type: 'string', nullable: true, example: 'S22506700' },
                scielo_id: { type: 'string', nullable: true }
              }
            },
            indexing: {
              type: 'object',
              description: 'Indexing and validation flags.',
              properties: {
                is_in_doaj: { type: 'boolean', nullable: true, example: true },
                is_in_scielo: { type: 'boolean', nullable: true, example: false },
                is_indexed_in_scopus: { type: 'boolean', nullable: true, example: true },
                validation_status: { type: 'string', nullable: true, enum: ['PENDING', 'VALIDATED', 'NOT_FOUND', 'FAILED'], example: 'VALIDATED' }
              }
            },
            metrics: {
              type: 'object',
              description: 'Bibliometric indicators for the venue.',
              properties: {
                impact_factor: { type: 'number', nullable: true, example: 3.519 },
                citescore: { type: 'number', nullable: true, example: 3.9 },
                sjr: { type: 'number', nullable: true, example: 0.983 },
                snip: { type: 'number', nullable: true, example: 1.686 },
                h_index: { type: 'integer', nullable: true, example: 72 },
                i10_index: { type: 'integer', nullable: true, example: 807 },
                two_yr_mean_citedness: { type: 'number', nullable: true, example: 1.57143 }
              }
            },
            ranking: {
              type: 'object',
              description: 'Global ranking surface with per-component breakdown and LLM assessment. The four components sum to score: score = subject + oa + impact + llm.',
              properties: {
                score: { type: 'number', nullable: true, description: 'Global ranking score (= venues.total_score = subject + oa + impact + llm).', example: 23.955 },
                components: {
                  type: 'object',
                  description: 'Additive ranking components; their sum equals score.',
                  properties: {
                    subject: { type: 'number', nullable: true, description: 'Subject-relevance score (Scopus/OpenAlex tiers + LLM boost).', example: 10 },
                    oa: { type: 'number', nullable: true, description: 'Open-access bonus.', example: 0.2 },
                    impact: { type: 'number', nullable: true, description: 'Blended bibliometric impact (citescore, 2-yr mean citedness, citations/work, SJR, h-index).', example: 3.755 },
                    llm: { type: 'number', nullable: true, description: 'LLM relevance score (= llm_relevance * 2).', example: 10 }
                  }
                },
                llm: {
                  type: 'object',
                  properties: {
                    relevance: { type: 'integer', nullable: true, minimum: 0, maximum: 5, example: 5 },
                    justification: { type: 'string', nullable: true, example: 'Core venue for ethnographic and anthropological research' }
                  }
                }
              }
            },
            subjects: {
              type: 'array',
              description: 'Top subjects associated with the venue (pre-sorted; already capped at the top 10 on detail).',
              items: {
                type: 'object',
                properties: {
                  subject_id: { type: 'integer', nullable: true, example: 1989273 },
                  term: { type: 'string', example: 'Anthropology' },
                  score: { type: 'number', format: 'float', nullable: true, example: 1.0 },
                  vocabulary: { type: 'string', nullable: true },
                  lang: { type: 'string', nullable: true }
                }
              }
            },
            publication_summary: {
              type: 'object',
              description: 'Detail-only rollup. first/latest_publication_year fall back to the coverage range; total/open-access works and open_access_percentage are derived from the venue per-year aggregation (numerator and denominator share the same year-bearing publication source). open_access_percentage is null when no yearly data is available.',
              properties: {
                first_publication_year: { type: 'integer', nullable: true, example: 1986 },
                latest_publication_year: { type: 'integer', nullable: true, example: 2026 },
                total_works_count: { type: 'integer', example: 1107 },
                open_access_works_count: { type: 'integer', example: 412 },
                open_access_percentage: { type: 'number', nullable: true, description: 'Derived percentage of open-access publications (0–100, one decimal).', example: 37.2 },
                publication_trend: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      year: { type: 'integer', nullable: true, example: 2024 },
                      works_count: { type: 'integer', example: 58 },
                      oa_works_count: { type: 'integer', example: 21 }
                    }
                  }
                }
              }
            }
          }
        },
        Collaboration: {
          type: 'object',
          properties: {
            collaborator_id: {
              type: 'integer',
              example: 9876
            },
            collaborator_name: {
              type: 'string',
              example: 'Dr. João Carlos Oliveira'
            },
            collaboration_metrics: {
              type: 'object',
              properties: {
                total_collaborations: {
                  type: 'integer',
                  example: 8,
                  description: 'Total number of collaborative works'
                },
                collaboration_span_years: {
                  type: 'integer',
                  example: 5,
                  description: 'Years of active collaboration'
                },
                avg_citations_together: {
                  type: 'number',
                  format: 'float',
                  example: 24.5,
                  description: 'Average citations for collaborative works'
                },
                first_collaboration_year: {
                  type: 'integer',
                  example: 2018
                },
                latest_collaboration_year: {
                  type: 'integer',
                  example: 2023
                }
              }
            },
            collaboration_strength: {
              type: 'string',
              enum: ['very_strong', 'strong', 'moderate', 'weak'],
              example: 'strong',
              description: 'Calculated collaboration strength category'
            }
          }
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            total: {
              type: 'integer',
              example: 6894,
              description: 'Total number of results'
            },
            page: {
              type: 'integer',
              example: 1,
              description: 'Current page number'
            },
            limit: {
              type: 'integer',
              example: 20,
              description: 'Number of results per page'
            },
            totalPages: {
              type: 'integer',
              example: 345,
              description: 'Total number of pages'
            },
            hasNext: {
              type: 'boolean',
              example: true,
              description: 'Whether there is a next page'
            },
            hasPrev: {
              type: 'boolean',
              example: false,
              description: 'Whether there is a previous page'
            }
          },
          required: ['total', 'page', 'limit', 'totalPages', 'hasNext', 'hasPrev']
        },
        HealthMetrics: {
          type: 'object',
          properties: {
            uptime_ms: {
              type: 'integer',
              example: 86400000
            },
            uptime_human: {
              type: 'string',
              example: '1d 0h 0m'
            },
            requests: {
              type: 'object',
              properties: {
                total: {
                  type: 'integer',
                  example: 15420
                },
                by_status: {
                  type: 'object',
                  additionalProperties: {
                    type: 'integer'
                  },
                  example: {
                    200: 15000,
                    404: 300,
                    500: 120
                  }
                },
                top_endpoints: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      endpoint: {
                        type: 'string',
                        example: 'GET /works'
                      },
                      count: {
                        type: 'integer',
                        example: 2140
                      }
                    }
                  }
                },
                performance: {
                  type: 'object',
                  properties: {
                    avg_response_time_ms: {
                      type: 'integer',
                      example: 63
                    },
                    p95_response_time_ms: {
                      type: 'integer',
                      example: 180
                    },
                    total_samples: {
                      type: 'integer',
                      example: 1000
                    }
                  },
                  required: ['avg_response_time_ms', 'p95_response_time_ms', 'total_samples']
                }
              },
              required: ['total', 'by_status', 'top_endpoints', 'performance']
            },
            errors: {
              type: 'object',
              properties: {
                total: {
                  type: 'integer',
                  example: 120
                },
                by_type: {
                  type: 'object',
                  additionalProperties: {
                    type: 'integer'
                  }
                },
                recent_count: {
                  type: 'integer',
                  example: 17
                },
                error_rate: {
                  type: 'number',
                  format: 'float',
                  example: 0.78
                }
              },
              required: ['total', 'by_type', 'recent_count', 'error_rate']
            },
            system: {
              type: 'object',
              properties: {
                memory: {
                  type: 'object',
                  additionalProperties: {
                    type: 'integer'
                  }
                },
                cpu_cores: {
                  type: 'integer',
                  example: 8
                },
                load_average: {
                  type: 'array',
                  items: {
                    type: 'number'
                  },
                  example: [0.42, 0.56, 0.61]
                },
                free_memory_mb: {
                  type: 'integer',
                  example: 6144
                },
                total_memory_mb: {
                  type: 'integer',
                  example: 16384
                }
              },
              required: ['memory', 'cpu_cores', 'load_average', 'free_memory_mb', 'total_memory_mb']
            }
          },
          required: ['uptime_ms', 'uptime_human', 'requests', 'errors', 'system']
        },

        CourseDetailedPayload: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 25
            },
            code: {
              type: 'string',
              example: 'MNA201'
            },
            name: {
              type: 'string',
              example: 'AS-201 Instituições Comparadas'
            },
            credits: {
              type: 'integer',
              nullable: true,
              example: 4
            },
            program_id: {
              type: 'integer',
              example: 2
            },
            semester: {
              type: 'string',
              example: '2'
            },
            year: {
              type: 'integer',
              example: 1968
            },
            metrics: {
              type: 'object',
              properties: {
                instructor_count: {
                  type: 'integer',
                  example: 2
                },
                bibliography_count: {
                  type: 'integer',
                  example: 25
                },
                subject_count: {
                  type: 'integer',
                  example: 15
                }
              }
            },
            instructors_preview: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['Bruce Corrie', 'Roque de Barros Laraia']
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              nullable: true
            },
            source_file: {
              type: 'string',
              nullable: true,
              example: '1968.2_-_mna201_-_bruce_corrie___roque_laraia.json'
            },
            bibliography: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  work_id: {
                    type: 'integer',
                    example: 2715248
                  },
                  title: {
                    type: 'string',
                    example: 'Changing Emphases in Social Structure'
                  },
                  publication_year: {
                    type: 'integer',
                    nullable: true,
                    example: 1965
                  },
                  language: {
                    type: 'string',
                    nullable: true,
                    example: 'en'
                  },
                  document_type: {
                    type: 'string',
                    example: 'ARTICLE'
                  },
                  open_access: {
                    type: 'boolean',
                    example: false
                  },
                  reading_type: {
                    type: 'string',
                    enum: ['REQUIRED', 'RECOMMENDED', 'SUPPLEMENTARY', 'OPTIONAL'],
                    example: 'RECOMMENDED'
                  },
                  week_number: {
                    type: 'integer',
                    nullable: true,
                    example: 3
                  },
                  notes: {
                    type: 'string',
                    nullable: true
                  },
                  authors_preview: {
                    type: 'array',
                    items: {
                      type: 'string'
                    }
                  },
                  author_count: {
                    type: 'integer',
                    example: 1
                  },
                  first_author_name: {
                    type: 'string',
                    nullable: true
                  }
                }
              }
            },
            instructors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  person_id: {
                    type: 'integer',
                    example: 31
                  },
                  preferred_name: {
                    type: 'string',
                    example: 'Bruce Corrie'
                  },
                  given_names: {
                    type: 'string',
                    nullable: true
                  },
                  family_name: {
                    type: 'string',
                    nullable: true
                  },
                  role: {
                    type: 'string',
                    example: 'PROFESSOR'
                  },
                  identifiers: {
                    type: 'object',
                    properties: {
                      orcid: {
                        type: 'string',
                        nullable: true
                      }
                    }
                  },
                  is_verified: {
                    type: 'boolean',
                    example: true
                  }
                }
              }
            },
            subjects: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'integer',
                    example: 1
                  },
                  term: {
                    type: 'string',
                    example: 'Anthropology'
                  },
                  vocabulary: {
                    type: 'string',
                    example: 'KEYWORD'
                  },
                  parent_id: {
                    type: 'integer',
                    nullable: true
                  },
                  work_count: {
                    type: 'integer',
                    example: 15
                  }
                }
              }
            },
            bibliography_statistics: {
              type: 'object',
              additionalProperties: true
            },
            instructor_statistics: {
              type: 'object',
              additionalProperties: true
            },
            subject_statistics: {
              type: 'object',
              additionalProperties: true
            }
          },
          required: ['id', 'code', 'name', 'program_id', 'semester', 'year', 'metrics', 'instructors_preview', 'created_at']
        },
        InstructorDetailedPayload: {
          type: 'object',
          properties: {
            person_id: {
              type: 'integer',
              example: 31
            },
            preferred_name: {
              type: 'string',
              example: 'Bruce Corrie'
            },
            given_names: {
              type: 'string',
              nullable: true,
              example: 'Bruce'
            },
            family_name: {
              type: 'string',
              nullable: true,
              example: 'Corrie'
            },
            identifiers: {
              type: 'object',
              properties: {
                orcid: {
                  type: 'string',
                  nullable: true,
                  example: '0000-0002-1825-0097'
                },
                lattes_id: {
                  type: 'string',
                  nullable: true,
                  example: '1234567890123456'
                },
                scopus_id: {
                  type: 'string',
                  nullable: true,
                  example: '57194582100'
                }
              }
            },
            is_verified: {
              type: 'boolean',
              example: true
            },
            teaching_metrics: {
              type: 'object',
              properties: {
                courses_taught: {
                  type: 'integer',
                  example: 15
                },
                programs_count: {
                  type: 'integer',
                  example: 3
                },
                bibliography_contributed: {
                  type: 'integer',
                  example: 250
                },
                teaching_span: {
                  type: 'object',
                  properties: {
                    earliest_year: {
                      type: 'integer',
                      nullable: true,
                      example: 1968
                    },
                    latest_year: {
                      type: 'integer',
                      nullable: true,
                      example: 2024
                    }
                  }
                }
              }
            },
            roles: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['PROFESSOR']
            },
            program_ids: {
              type: 'array',
              items: {
                type: 'integer'
              },
              example: [2, 3]
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              nullable: true
            }
          },
          required: ['person_id', 'preferred_name', 'identifiers', 'is_verified', 'teaching_metrics', 'roles', 'program_ids']
        },
        CoursesStatistics: {
          type: 'object',
          properties: {
            total_courses: {
              type: 'integer',
              example: 433,
              description: 'Total number of courses'
            },
            programs_count: {
              type: 'integer',
              example: 15,
              description: 'Number of programs'
            },
            earliest_year: {
              type: 'integer',
              example: 1968,
              description: 'Earliest academic year'
            },
            latest_year: {
              type: 'integer',
              example: 2024,
              description: 'Latest academic year'
            },
            semesters_count: {
              type: 'integer',
              example: 3,
              description: 'Number of distinct semesters'
            },
            avg_credits: {
              type: 'number',
              format: 'float',
              example: 3.5,
              description: 'Average credits per course'
            },
            courses_with_credits: {
              type: 'integer',
              example: 285,
              description: 'Courses with credit information'
            },
            year_distribution: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  year: {
                    type: 'integer',
                    example: 2024
                  },
                  course_count: {
                    type: 'integer',
                    example: 45
                  },
                  program_count: {
                    type: 'integer',
                    example: 8
                  }
                }
              },
              description: 'Course distribution by year'
            },
            semester_distribution: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  semester: {
                    type: 'string',
                    example: '2'
                  },
                  course_count: {
                    type: 'integer',
                    example: 200
                  }
                }
              },
              description: 'Course distribution by semester'
            }
          },
          required: ['total_courses', 'programs_count', 'earliest_year', 'latest_year', 'semesters_count', 'avg_credits', 'courses_with_credits', 'year_distribution', 'semester_distribution']
        },
        InstructorsStatistics: {
          type: 'object',
          properties: {
            total_instructors: {
              type: 'integer',
              example: 285,
              description: 'Total number of instructors'
            },
            total_courses_taught: {
              type: 'integer',
              example: 433,
              description: 'Total courses taught'
            },
            programs_with_instructors: {
              type: 'integer',
              example: 15,
              description: 'Programs with instructors'
            },
            avg_courses_per_instructor: {
              type: 'number',
              format: 'float',
              example: 2.8,
              description: 'Average courses per instructor'
            },
            role_distribution: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  role: {
                    type: 'string',
                    example: 'PROFESSOR'
                  },
                  instructor_count: {
                    type: 'integer',
                    example: 250
                  },
                  assignment_count: {
                    type: 'integer',
                    example: 400
                  }
                }
              },
              description: 'Distribution by role'
            },
            top_instructors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  preferred_name: {
                    type: 'string',
                    example: 'John Smith'
                  },
                  courses_taught: {
                    type: 'integer',
                    example: 25
                  },
                  programs_count: {
                    type: 'integer',
                    example: 3
                  },
                  earliest_year: {
                    type: 'integer',
                    example: 1970
                  },
                  latest_year: {
                    type: 'integer',
                    example: 2024
                  }
                }
              },
              description: 'Top instructors by course count'
            }
          },
          required: ['total_instructors', 'total_courses_taught', 'programs_with_instructors', 'avg_courses_per_instructor', 'role_distribution', 'top_instructors']
        },
      },
      parameters: {
        limitParam: {
          name: 'limit',
          in: 'query',
          description: 'Number of items to return per page (works with both page and offset formats)',
          required: false,
          schema: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 20
          }
        },
        offsetParam: {
          name: 'offset',
          in: 'query',
          description: 'Number of items to skip. Automatically converts to page format: offset÷limit = page number',
          required: false,
          schema: {
            type: 'integer',
            minimum: 0,
            default: 0
          },
          example: 20
        },
        pageParam: {
          name: 'page',
          in: 'query',
          description: 'Page number (1-based). Use with limit parameter for traditional pagination',
          required: false,
          schema: {
            type: 'integer',
            minimum: 1,
            default: 1
          },
          example: 2
        },
      },
      responses: {
        Success: {
          description: 'Successful operation',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SuccessEnvelope'
              }
            }
          }
        },
        CourseDetailsSuccess: {
          description: 'Course details retrieved successfully',
          content: {
            'application/json': {
              schema: {
                allOf: [
                  { $ref: '#/components/schemas/SuccessEnvelope' },
                  {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/CourseDetailedPayload' }
                    }
                  }
                ]
              }
            }
          }
        },
        CoursesStatisticsSuccess: {
          description: 'Course statistics retrieved successfully',
          content: {
            'application/json': {
              schema: {
                allOf: [
                  { $ref: '#/components/schemas/SuccessEnvelope' },
                  {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/CoursesStatistics' }
                    }
                  }
                ]
              }
            }
          }
        },
        InstructorDetailsSuccess: {
          description: 'Instructor details retrieved successfully',
          content: {
            'application/json': {
              schema: {
                allOf: [
                  { $ref: '#/components/schemas/SuccessEnvelope' },
                  {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/InstructorDetailedPayload' }
                    }
                  }
                ]
              }
            }
          }
        },
        InstructorsStatisticsSuccess: {
          description: 'Instructors statistics retrieved successfully',
          content: {
            'application/json': {
              schema: {
                allOf: [
                  { $ref: '#/components/schemas/SuccessEnvelope' },
                  {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/InstructorsStatistics' }
                    }
                  }
                ]
              }
            }
          }
        },
        HealthMetricsSuccess: {
          description: 'Detailed health metrics retrieved successfully',
          content: {
            'application/json': {
              schema: {
                allOf: [
                  { $ref: '#/components/schemas/SuccessEnvelope' },
                  {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/HealthMetrics' }
                    }
                  }
                ]
              }
            }
          }
        },
        BadRequest: {
          description: 'Bad request - Invalid input parameters',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                status: 'error',
                message: 'Invalid venue ID',
                code: 'VALIDATION_ERROR'
              }
            }
          }
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                status: 'error',
                message: 'Resource not found',
                code: 'NOT_FOUND'
              }
            }
          }
        },
        InternalError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                status: 'error',
                message: 'Internal server error',
                code: 'INTERNAL_ERROR'
              }
            }
          }
        },
        RateLimitExceeded: {
          description: 'Rate limit exceeded - Too many requests',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                status: 'error',
                message: 'Rate limit exceeded. Please try again later.',
                code: 'RATE_LIMIT_EXCEEDED'
              }
            }
          }
        },
        ServiceUnavailable: {
          description: 'Service unavailable - Required dependencies are unavailable',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                status: 'error',
                message: 'Service dependencies are not available',
                code: 'INTERNAL_ERROR'
              }
            }
          }
        },
        Unauthorized: {
          description: 'Missing or invalid X-Access-Key on a gated endpoint.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                status: 'error',
                message: 'Invalid or missing access key',
                code: 'UNAUTHORIZED'
              }
            }
          }
        }
      }
    },
    security: [
      {},
      { XAccessKey: [] }
    ],
    tags: [
      { name: 'System', description: 'API root: service metadata, version, and endpoint catalogue.' },
      { name: 'Health', description: 'Liveness, readiness, and runtime metrics probes.' },
      { name: 'Security', description: 'Security headers, rate-limit stats, and IP management. Requires `x-access-key`.' },
      { name: 'Search', description: 'Full-text search across works, publications, and persons using MariaDB FULLTEXT indexes, plus autocomplete and popular-terms helpers.' },
      { name: 'Works', description: 'Canonical academic works (articles, books, chapters, theses, conferences). Listings surface the latest matching publication per work.' },
      { name: 'Publications', description: 'Per-publication view over the `publications` + `works` + `venues` base tables, including DOI resolution and sibling navigation.' },
      { name: 'Persons', description: 'Researcher profiles: preferred name, identifiers, affiliations, publication history, collaborators.' },
      { name: 'Institutions', description: 'Institutional entities (universities, institutes, companies, government, NGOs) exposed at `/institutions`.' },
      { name: 'Venues', description: 'Journals, conferences, repositories, and book series. Backed by the `venues` base table with ranking and bibliometric surface.' },
      { name: 'Citations', description: 'Citation and reference relationships, per-work metrics, and citation-network traversal.' },
      { name: 'Collaborations', description: 'Co-authorship analysis, collaborator lookup, collaboration networks, and top-collaborator rankings.' },
      { name: 'Courses', description: 'Academic courses with instructors, bibliography, and subject coverage.' },
      { name: 'Instructors', description: 'Instructors with course history, bibliography usage, and subject expertise.' },
      { name: 'Bibliography', description: 'Course bibliographies and their usage analysis.' },
      { name: 'Subjects', description: 'Subject taxonomy and subject-linked listings (works, courses).' },
      { name: 'Signatures', description: 'Name signatures and author-identity linkage.' },
      { name: 'Metrics', description: 'Bibliometric analytics and aggregate metrics. Dashboard routes require `x-access-key`.' },
      { name: 'Dashboard', description: 'Real-time dashboards for search, performance, trends, and alerts. Requires `x-access-key`.' }
    ]
  },
  apis: [
    './src/routes/*.js',
    './src/app.js'
  ]
};

const specs = swaggerJsdoc(options);

module.exports = specs;
