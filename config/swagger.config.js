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
        '- Public endpoints. Administrative and metrics routes require the `x-access-key` header (see the `XAccessKey` security scheme).',
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
          description: 'Internal access key required for protected endpoints (security, dashboard, health except /liveness)'
        }
      },
      schemas: {
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
              description: 'Legacy alias from summary_publications. Returned only by /works/showcase. Prefer publication_year in list payloads or publication.year in detailed payloads.'
            },
            work_type: {
              type: 'string',
              nullable: true,
              enum: ['ARTICLE', 'BOOK', 'CHAPTER', 'THESIS', 'CONFERENCE', 'CONFERENCE_PAPER', 'REPORT', 'DATASET', 'PREPRINT', 'REVIEW', 'EDITORIAL', 'OTHER'],
              example: 'ARTICLE',
              deprecated: true,
              description: 'Legacy alias from summary_publications. Returned only by /works/showcase. Prefer type.'
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
              example: 'sphinx',
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
          properties: {
            id: {
              type: 'integer',
              example: 12345,
              description: 'Unique identifier for the organization'
            },
            name: {
              type: 'string',
              example: 'Universidade de São Paulo',
              description: 'Full name of the organization'
            },
            short_name: {
              type: 'string',
              example: 'USP',
              description: 'Short name or acronym'
            },
            type: {
              type: 'string',
              enum: ['UNIVERSITY', 'RESEARCH_INSTITUTE', 'COMPANY', 'GOVERNMENT', 'NGO', 'HOSPITAL'],
              example: 'UNIVERSITY',
              description: 'Type of organization'
            },
            country: {
              type: 'string',
              example: 'Brazil',
              description: 'Country where organization is located'
            },
            region: {
              type: 'string',
              example: 'South America',
              description: 'Geographic region'
            },
            city: {
              type: 'string',
              example: 'São Paulo',
              description: 'City location'
            },
            website: {
              type: 'string',
              format: 'uri',
              example: 'https://www.usp.br',
              description: 'Official website URL'
            },
            ror_id: {
              type: 'string',
              example: 'https://ror.org/036rp1748',
              description: 'Research Organization Registry ID'
            },
            works_count: {
              type: 'integer',
              example: 125420,
              description: 'Total number of works from this organization'
            },
            members_count: {
              type: 'integer',
              example: 8250,
              description: 'Number of affiliated researchers'
            },
            h_index: {
              type: 'integer',
              example: 245,
              description: 'Institutional H-index'
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
          description: 'Canonical venue payload backed by summary_venues. Identifiers, bibliometric metrics, the global ranking surface and the indexing/quality flags are grouped into dedicated blocks so clients can consume each domain without scanning top-level fields.',
          properties: {
            id: { type: 'integer', example: 1012134 },
            name: { type: 'string', example: 'Cultural Anthropology', description: 'Official name of the venue' },
            abbreviated_name: { type: 'string', nullable: true, example: 'Cult. Anthropol' },
            type: { type: 'string', enum: ['JOURNAL', 'CONFERENCE', 'REPOSITORY', 'BOOK_SERIES', 'OTHER'], example: 'JOURNAL' },
            aggregation_type: { type: 'string', nullable: true, example: 'journal' },
            country_code: { type: 'string', nullable: true, example: 'US' },
            homepage_url: { type: 'string', nullable: true, example: 'http://www.culanth.org/' },
            open_access: { type: 'boolean', nullable: true, description: 'Declared open-access policy (fully OA)', example: true },
            open_access_percentage: { type: 'number', nullable: true, description: 'Measured percentage of open-access publications', example: 0 },
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
              description: 'Global ranking surface with per-component breakdown and LLM assessment.',
              properties: {
                score: { type: 'number', nullable: true, description: 'Global ranking score (aka global_ranking_score)', example: 26.107 },
                components: {
                  type: 'object',
                  properties: {
                    subject: { type: 'number', nullable: true, example: 10 },
                    snip: { type: 'number', nullable: true },
                    oa: { type: 'number', nullable: true, example: 0.2 },
                    authorship: { type: 'number', nullable: true, example: 2 },
                    affiliation: { type: 'number', nullable: true, example: 2 },
                    citation: { type: 'number', nullable: true, example: 1.907 },
                    llm: { type: 'number', nullable: true, example: 10 }
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
            }
          }
        },
        Citation: {
          type: 'object',
          properties: {
            citing_work_id: {
              type: 'integer',
              example: 123456,
              description: 'ID of the work that makes the citation'
            },
            title: {
              type: 'string',
              example: 'Advances in Machine Learning',
              description: 'Title of the citing work'
            },
            type: {
              type: 'string',
              example: 'ARTICLE',
              description: 'Type of the citing work'
            },
            year: {
              type: 'integer',
              nullable: true,
              example: 2023,
              description: 'Publication year of the citing work'
            },
            doi: {
              type: 'string',
              nullable: true,
              example: '10.1000/journal.2023.001',
              description: 'DOI of the citing work'
            },
            authors_count: {
              type: 'integer',
              example: 3,
              description: 'Number of authors'
            },
            citation: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'SELF'],
                  example: 'NEUTRAL',
                  description: 'Type of citation context'
                },
                context: {
                  type: 'string',
                  nullable: true,
                  example: 'This methodology builds upon the seminal work by Santos et al. (2023)...',
                  description: 'Citation context from the text (truncated to 200 chars)'
                }
              }
            }
          }
        },
        CitationMetrics: {
          type: 'object',
          properties: {
            work_id: {
              type: 'integer',
              example: 123456,
              description: 'Work ID'
            },
            title: {
              type: 'string',
              example: 'Advances in Machine Learning',
              description: 'Work title'
            },
            type: {
              type: 'string',
              example: 'ARTICLE',
              description: 'Work type'
            },
            publication_year: {
              type: 'integer',
              nullable: true,
              example: 2020,
              description: 'Publication year'
            },
            citation_metrics: {
              type: 'object',
              properties: {
                total_citations_received: {
                  type: 'integer',
                  example: 145,
                  description: 'Total citations received'
                },
                total_references_made: {
                  type: 'integer',
                  example: 67,
                  description: 'Total references made by this work'
                },
                unique_citing_works: {
                  type: 'integer',
                  example: 134,
                  description: 'Number of unique works citing this'
                },
                citations_per_year: {
                  type: 'number',
                  format: 'float',
                  example: 36.25,
                  description: 'Average citations per year since publication'
                },
                citation_types: {
                  type: 'object',
                  properties: {
                    positive: {
                      type: 'integer',
                      example: 120,
                      description: 'Positive citations'
                    },
                    neutral: {
                      type: 'integer',
                      example: 20,
                      description: 'Neutral citations'
                    },
                    negative: {
                      type: 'integer',
                      example: 3,
                      description: 'Negative citations'
                    },
                    self: {
                      type: 'integer',
                      example: 2,
                      description: 'Self citations'
                    }
                  }
                }
              }
            },
            temporal_metrics: {
              type: 'object',
              properties: {
                first_citation_year: {
                  type: 'integer',
                  nullable: true,
                  example: 2020,
                  description: 'Year of first citation received'
                },
                latest_citation_year: {
                  type: 'integer',
                  nullable: true,
                  example: 2024,
                  description: 'Year of most recent citation'
                },
                citation_span_years: {
                  type: 'integer',
                  nullable: true,
                  example: 5,
                  description: 'Years between first and latest citation'
                }
              }
            },
            impact_indicators: {
              type: 'object',
              properties: {
                highly_cited: {
                  type: 'boolean',
                  example: true,
                  description: 'Whether work is highly cited (>100 citations)'
                },
                citation_velocity: {
                  type: 'string',
                  enum: ['current', 'recent', 'historical'],
                  example: 'current',
                  description: 'Citation velocity category'
                }
              }
            }
          }
        },
        CitationNetwork: {
          type: 'object',
          properties: {
            central_work_id: {
              type: 'integer',
              example: 123456,
              description: 'ID of the central work'
            },
            network_depth: {
              type: 'integer',
              example: 2,
              description: 'Depth of network analysis'
            },
            nodes: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  id: {
                    type: 'integer',
                    example: 123456
                  },
                  title: {
                    type: 'string',
                    example: 'Machine Learning Fundamentals'
                  },
                  year: {
                    type: 'integer',
                    nullable: true,
                    example: 2020
                  },
                  is_central: {
                    type: 'boolean',
                    example: true,
                    description: 'Whether this is the central work'
                  }
                }
              },
              description: 'Network nodes (works) indexed by work ID'
            },
            edges: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  source: {
                    type: 'integer',
                    example: 123456,
                    description: 'Source work ID (citing work)'
                  },
                  target: {
                    type: 'integer',
                    example: 789012,
                    description: 'Target work ID (cited work)'
                  },
                  depth: {
                    type: 'integer',
                    example: 1,
                    description: 'Depth level in network'
                  },
                  citation_type: {
                    type: 'string',
                    enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'SELF'],
                    example: 'NEUTRAL',
                    description: 'Type of citation'
                  },
                  source_year: {
                    type: 'integer',
                    nullable: true,
                    example: 2021,
                    description: 'Publication year of source work'
                  },
                  target_year: {
                    type: 'integer',
                    nullable: true,
                    example: 2020,
                    description: 'Publication year of target work'
                  }
                }
              },
              description: 'Citation relationships between works'
            },
            network_stats: {
              type: 'object',
              properties: {
                total_nodes: {
                  type: 'integer',
                  example: 25,
                  description: 'Total number of nodes in network'
                },
                total_edges: {
                  type: 'integer',
                  example: 42,
                  description: 'Total number of citation edges'
                },
                max_depth: {
                  type: 'integer',
                  example: 2,
                  description: 'Maximum depth reached in network'
                }
              }
            }
          }
        },
        File: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 789,
              description: 'Unique file identifier'
            },
            md5: {
              type: 'string',
              example: 'a1b2c3d4e5f67890123456789abcdef',
              description: 'MD5 hash of the file (primary identifier)'
            },
            sha1: {
              type: 'string',
              nullable: true,
              example: 'b1c2d3e4f5a67890123456789abcdef01234567',
              description: 'SHA1 hash of the file'
            },
            sha256: {
              type: 'string',
              nullable: true,
              example: 'c1d2e3f4a5b67890123456789abcdef0123456789abcdef0123456789abcdef0',
              description: 'SHA256 hash of the file'
            },
            size_bytes: {
              type: 'integer',
              example: 2048576,
              description: 'File size in bytes'
            },
            format: {
              type: 'string',
              enum: ['PDF', 'EPUB', 'MOBI', 'HTML', 'XML', 'DOCX', 'TXT', 'OTHER'],
              example: 'PDF',
              description: 'File format'
            },
            version: {
              type: 'string',
              nullable: true,
              example: '1.0',
              description: 'File version'
            },
            pages: {
              type: 'integer',
              nullable: true,
              example: 15,
              description: 'Number of pages (for paginated formats)'
            },
            language: {
              type: 'string',
              nullable: true,
              example: 'en',
              description: 'Language of the file content (ISO 639 code)'
            },
            upload_date: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2023-01-15T10:30:00Z',
              description: 'File upload timestamp'
            },
            download_count: {
              type: 'integer',
              example: 25,
              description: 'Number of times file has been downloaded'
            },
            libgen_id: {
              type: 'integer',
              nullable: true,
              example: 123456,
              description: 'LibGen database identifier'
            },
            scimag_id: {
              type: 'integer',
              nullable: true,
              example: 789012,
              description: 'SciMag database identifier'
            },
            openaccess_id: {
              type: 'string',
              nullable: true,
              example: 'OA-123456',
              description: 'Canonical identifier referencing the open access catalog'
            },
            openacess_id: {
              type: 'string',
              nullable: true,
              deprecated: true,
              example: 'OA-123456',
              description: 'Identifier referencing the open access catalog (files.openacess_id)'
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
        HealthStatus: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['ok', 'degraded', 'error'],
              example: 'ok'
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            },
            uptime: {
              type: 'number',
              example: 86400.5,
              description: 'Uptime in seconds'
            },
            responseTime: {
              type: 'string',
              example: '15ms'
            },
            version: {
              type: 'string',
              example: '2.0.0'
            },
            environment: {
              type: 'string',
              example: 'production'
            },
            services: {
              type: 'object',
              properties: {
                database: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      enum: ['connected', 'disconnected']
                    },
                    type: {
                      type: 'string',
                      example: 'MariaDB'
                    }
                  }
                },
                cache: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      enum: ['connected', 'disconnected']
                    },
                    type: {
                      type: 'string',
                      example: 'Redis'
                    }
                  }
                }
              }
            },
            monitoring: {
              type: 'object',
              properties: {
                requests: {
                  type: 'object',
                  properties: {
                    total: {
                      type: 'integer',
                      example: 15420
                    },
                    performance: {
                      type: 'object',
                      properties: {
                        p95_response_time_ms: {
                          type: 'number',
                          example: 85.5
                        }
                      }
                    }
                  }
                },
                errors: {
                  type: 'object',
                  properties: {
                    error_rate: {
                      type: 'string',
                      example: '0.5%'
                    }
                  }
                }
              }
            }
          }
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
        DashboardStats: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              example: 'success'
            },
            totals: {
              type: 'object',
              properties: {
                total_works: {
                  type: 'integer',
                  example: 650645
                },
                total_persons: {
                  type: 'integer',
                  example: 385670
                },
                total_organizations: {
                  type: 'integer',
                  example: 235833
                },
                total_authorships: {
                  type: 'integer',
                  example: 1070000
                },
                total_citations: {
                  type: 'integer',
                  example: 2500000
                }
              }
            },
            recent_trends: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  year: {
                    type: 'integer',
                    example: 2023
                  },
                  total_publications: {
                    type: 'integer',
                    example: 45620
                  },
                  unique_authors: {
                    type: 'integer',
                    example: 28950
                  },

                }
              }
            },
            meta: {
              type: 'object',
              properties: {
                query_time_ms: {
                  type: 'integer',
                  example: 180
                }
              }
            }
          }
        },
        VenueMetrics: {
          type: 'object',
          properties: {
            publications_count: {
              type: 'integer',
              example: 1523
            },
            works_count: {
              type: 'integer',
              example: 1487
            },
            unique_authors: {
              type: 'integer',
              example: 512
            },
            cited_by_count: {
              type: 'integer',
              example: 4375
            },
            h_index: {
              type: 'integer',
              example: 32
            },
            i10_index: {
              type: 'integer',
              example: 144
            },
            open_access_publications: {
              type: 'integer',
              example: 420
            },
            open_access_percentage: {
              type: 'number',
              format: 'float',
              nullable: true,
              example: 27.53
            },
            total_citations: {
              type: 'integer',
              example: 18345
            },
            avg_citations: {
              type: 'number',
              format: 'float',
              nullable: true,
              example: 12.04
            },
            total_downloads: {
              type: 'integer',
              example: 92341
            },
            first_publication_year: {
              type: 'integer',
              nullable: true,
              example: 1984
            },
            latest_publication_year: {
              type: 'integer',
              nullable: true,
              example: 2025
            }
          }
        },

        VenueStatistics: {
          type: 'object',
          properties: {
            total_venues: {
              type: 'integer',
              example: 1179
            },
            journals: {
              type: 'integer',
              example: 1179
            },
            conferences: {
              type: 'integer',
              example: 0
            },
            repositories: {
              type: 'integer',
              example: 0
            },
            book_series: {
              type: 'integer',
              example: 0
            },
            with_impact_factor: {
              type: 'integer',
              example: 42
            },
            avg_impact_factor: {
              type: 'number',
              format: 'float',
              example: 1.7492857
            },
            max_impact_factor: {
              type: 'number',
              format: 'float',
              example: 6.77
            },
            min_impact_factor: {
              type: 'number',
              format: 'float',
              example: 0
            }
          }
        },
        AutocompleteResponse: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              example: 'machine'
            },
            suggestions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  text: {
                    type: 'string',
                    example: 'Machine Learning Applications'
                  },
                  type: {
                    type: 'string',
                    enum: ['title', 'venue', 'author'],
                    example: 'title'
                  },
                  relevance: {
                    type: 'number',
                    example: 1
                  },
                  preview: {
                    type: 'string',
                    example: 'Machine Learning Applications in...'
                  },
                  work_count: {
                    type: 'integer',
                    example: 5
                  }
                }
              }
            },
            type: {
              type: 'string',
              example: 'all'
            },
            count: {
              type: 'integer',
              example: 8
            },
            generated_at: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Course: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 25,
              description: 'Unique identifier for the course'
            },
            program_id: {
              type: 'integer',
              example: 2,
              description: 'Program identifier'
            },
            code: {
              type: 'string',
              example: 'MNA201',
              description: 'Course code'
            },
            name: {
              type: 'string',
              example: 'AS-201 Instituições Comparadas',
              description: 'Course name'
            },
            credits: {
              type: 'integer',
              nullable: true,
              example: 4,
              description: 'Course credit hours'
            },
            semester: {
              type: 'string',
              enum: ['1', '2', 'SUMMER', 'WINTER', 'YEAR_LONG'],
              example: '2',
              description: 'Course semester'
            },
            year: {
              type: 'integer',
              example: 1968,
              description: 'Academic year'
            },
            instructor_count: {
              type: 'integer',
              example: 2,
              description: 'Number of instructors'
            },
            bibliography_count: {
              type: 'integer',
              example: 25,
              description: 'Number of bibliography items'
            },
            instructors: {
              type: 'string',
              example: 'Bruce Corrie; Roque de Barros Laraia',
              description: 'Instructor names'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Creation timestamp'
            },
            source_file: {
              type: 'string',
              example: '1968.2_-_mna201_-_bruce_corrie___roque_laraia.json',
              description: 'Source file name'
            }
          }
        },
        CourseDetails: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 25,
              description: 'Unique identifier for the course'
            },
            program_id: {
              type: 'integer',
              example: 2,
              description: 'Program identifier'
            },
            code: {
              type: 'string',
              example: 'MNA201',
              description: 'Course code'
            },
            name: {
              type: 'string',
              example: 'AS-201 Instituições Comparadas',
              description: 'Course name'
            },
            credits: {
              type: 'integer',
              nullable: true,
              example: 4,
              description: 'Course credit hours'
            },
            semester: {
              type: 'string',
              enum: ['1', '2', 'SUMMER', 'WINTER', 'YEAR_LONG'],
              example: '2',
              description: 'Course semester'
            },
            year: {
              type: 'integer',
              example: 1968,
              description: 'Academic year'
            },
            instructor_count: {
              type: 'integer',
              example: 2,
              description: 'Number of instructors'
            },
            bibliography_count: {
              type: 'integer',
              example: 25,
              description: 'Number of bibliography items'
            },
            subject_count: {
              type: 'integer',
              example: 15,
              description: 'Number of associated subjects'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Creation timestamp'
            },
            source_file: {
              type: 'string',
              example: '1968.2_-_mna201_-_bruce_corrie___roque_laraia.json',
              description: 'Source file name'
            }
          }
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
        CourseInstructor: {
          type: 'object',
          properties: {
            course_id: {
              type: 'integer',
              example: 25,
              description: 'Course identifier'
            },
            person_id: {
              type: 'integer',
              example: 31,
              description: 'Original person identifier'
            },
            canonical_person_id: {
              type: 'integer',
              example: 31,
              description: 'Canonical person identifier'
            },
            role: {
              type: 'string',
              enum: ['PROFESSOR', 'ASSISTANT', 'TA', 'GUEST'],
              example: 'PROFESSOR',
              description: 'Instructor role'
            },
            preferred_name: {
              type: 'string',
              example: 'Bruce Corrie',
              description: 'Preferred name'
            },
            given_names: {
              type: 'string',
              example: 'Bruce',
              description: 'Given names'
            },
            family_name: {
              type: 'string',
              example: 'Corrie',
              description: 'Family name'
            },
            orcid: {
              type: 'string',
              nullable: true,
              example: '0000-0002-1825-0097',
              description: 'ORCID identifier'
            },
            is_verified: {
              type: 'boolean',
              example: true,
              description: 'Verification status'
            }
          }
        },
        Instructor: {
          type: 'object',
          properties: {
            person_id: {
              type: 'integer',
              example: 31,
              description: 'Person identifier'
            },
            preferred_name: {
              type: 'string',
              example: 'Bruce Corrie',
              description: 'Preferred name'
            },
            given_names: {
              type: 'string',
              example: 'Bruce',
              description: 'Given names'
            },
            family_name: {
              type: 'string',
              example: 'Corrie',
              description: 'Family name'
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
              description: 'Lattes CV platform ID'
            },
            is_verified: {
              type: 'boolean',
              example: true,
              description: 'Verification status'
            },
            courses_taught: {
              type: 'integer',
              example: 15,
              description: 'Number of courses taught'
            },
            programs_count: {
              type: 'integer',
              example: 3,
              description: 'Number of programs involved'
            },
            earliest_year: {
              type: 'integer',
              example: 1968,
              description: 'First year teaching'
            },
            latest_year: {
              type: 'integer',
              example: 2024,
              description: 'Latest year teaching'
            },
            roles: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['PROFESSOR', 'ASSISTANT'],
              description: 'Teaching roles'
            },
            program_ids: {
              type: 'array',
              items: {
                type: 'integer'
              },
              example: [2, 3],
              description: 'Program identifiers'
            }
          }
        },
        InstructorDetails: {
          type: 'object',
          properties: {
            person_id: {
              type: 'integer',
              example: 31,
              description: 'Person identifier'
            },
            preferred_name: {
              type: 'string',
              example: 'Bruce Corrie',
              description: 'Preferred name'
            },
            given_names: {
              type: 'string',
              example: 'Bruce',
              description: 'Given names'
            },
            family_name: {
              type: 'string',
              example: 'Corrie',
              description: 'Family name'
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
              description: 'Lattes CV platform ID'
            },
            scopus_id: {
              type: 'string',
              nullable: true,
              example: '57194582100',
              description: 'Scopus Author ID'
            },
            is_verified: {
              type: 'boolean',
              example: true,
              description: 'Verification status'
            },
            courses_taught: {
              type: 'integer',
              example: 15,
              description: 'Number of courses taught'
            },
            programs_count: {
              type: 'integer',
              example: 3,
              description: 'Number of programs involved'
            },
            bibliography_contributed: {
              type: 'integer',
              example: 250,
              description: 'Bibliography items contributed'
            },
            earliest_year: {
              type: 'integer',
              example: 1968,
              description: 'First year teaching'
            },
            latest_year: {
              type: 'integer',
              example: 2024,
              description: 'Latest year teaching'
            },
            roles: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['PROFESSOR'],
              description: 'Teaching roles'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Creation timestamp'
            }
          }
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
        Subject: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 1,
              description: 'Unique identifier for the subject'
            },
            term: {
              type: 'string',
              example: 'Machine Learning',
              description: 'Subject term'
            },
            vocabulary: {
              type: 'string',
              enum: ['KEYWORD', 'MESH', 'LCSH', 'DDC', 'UDC', 'CUSTOM'],
              example: 'KEYWORD',
              description: 'Vocabulary type'
            },
            parent_id: {
              type: 'integer',
              nullable: true,
              example: null,
              description: 'Parent subject ID for hierarchy'
            },
            works_count: {
              type: 'integer',
              example: 1250,
              description: 'Number of associated works'
            },
            courses_count: {
              type: 'integer',
              example: 25,
              description: 'Number of associated courses'
            },
            children_count: {
              type: 'integer',
              example: 5,
              description: 'Number of child subjects'
            },
            parent_term: {
              type: 'string',
              nullable: true,
              example: 'Artificial Intelligence',
              description: 'Parent subject term'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Creation timestamp'
            }
          }
        },
        SubjectDetails: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 1,
              description: 'Unique identifier for the subject'
            },
            term: {
              type: 'string',
              example: 'Machine Learning',
              description: 'Subject term'
            },
            vocabulary: {
              type: 'string',
              enum: ['KEYWORD', 'MESH', 'LCSH', 'DDC', 'UDC', 'CUSTOM'],
              example: 'KEYWORD',
              description: 'Vocabulary type'
            },
            parent_id: {
              type: 'integer',
              nullable: true,
              example: null,
              description: 'Parent subject ID'
            },
            works_count: {
              type: 'integer',
              example: 1250,
              description: 'Number of associated works'
            },
            courses_count: {
              type: 'integer',
              example: 25,
              description: 'Number of associated courses'
            },
            children_count: {
              type: 'integer',
              example: 5,
              description: 'Number of child subjects'
            },
            parent_term: {
              type: 'string',
              nullable: true,
              example: 'Artificial Intelligence',
              description: 'Parent subject term'
            },
            parent_vocabulary: {
              type: 'string',
              nullable: true,
              example: 'KEYWORD',
              description: 'Parent vocabulary type'
            },
            avg_relevance_score: {
              type: 'number',
              format: 'float',
              example: 0.85,
              description: 'Average relevance score'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Creation timestamp'
            }
          }
        },
        BibliographyEntry: {
          type: 'object',
          properties: {
            course_id: {
              type: 'integer',
              example: 25,
              description: 'Course identifier'
            },
            work_id: {
              type: 'integer',
              example: 2690411,
              description: 'Work identifier'
            },
            reading_type: {
              type: 'string',
              enum: ['REQUIRED', 'RECOMMENDED', 'SUPPLEMENTARY'],
              example: 'RECOMMENDED',
              description: 'Type of reading assignment'
            },
            week_number: {
              type: 'integer',
              nullable: true,
              example: 5,
              description: 'Week number in course'
            },
            notes: {
              type: 'string',
              nullable: true,
              example: 'Essential reading for understanding theoretical foundations',
              description: 'Additional notes'
            },
            course_code: {
              type: 'string',
              example: 'MNA201',
              description: 'Course code'
            },
            course_name: {
              type: 'string',
              example: 'AS-201 Instituições Comparadas',
              description: 'Course name'
            },
            course_year: {
              type: 'integer',
              example: 1968,
              description: 'Course year'
            },
            semester: {
              type: 'string',
              example: '2',
              description: 'Course semester'
            },
            program_id: {
              type: 'integer',
              example: 2,
              description: 'Program identifier'
            },
            title: {
              type: 'string',
              example: 'Comparative Political Institutions',
              description: 'Work title'
            },
            publication_year: {
              type: 'integer',
              example: 1965,
              description: 'Publication year'
            },
            language: {
              type: 'string',
              example: 'en',
              description: 'Work language'
            },
            document_type: {
              type: 'string',
              example: 'BOOK',
              description: 'Document type'
            },
            author_count: {
              type: 'integer',
              example: 2,
              description: 'Number of authors'
            },
            authors: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['John Smith', 'Jane Doe'],
              description: 'Author names'
            },
            instructors: {
              type: 'string',
              example: 'Bruce Corrie; Roque de Barros Laraia',
              description: 'Course instructors'
            }
          }
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
        SubjectsStatistics: {
          type: 'object',
          properties: {
            total_subjects: {
              type: 'integer',
              example: 42822,
              description: 'Total number of subjects'
            },
            root_subjects: {
              type: 'integer',
              example: 35000,
              description: 'Root subjects (no parent)'
            },
            child_subjects: {
              type: 'integer',
              example: 7822,
              description: 'Child subjects (have parent)'
            },
            vocabularies_count: {
              type: 'integer',
              example: 6,
              description: 'Number of vocabularies'
            },
            subjects_with_works: {
              type: 'integer',
              example: 38500,
              description: 'Subjects associated with works'
            },
            total_work_subject_relations: {
              type: 'integer',
              example: 74338,
              description: 'Total work-subject relationships'
            },
            vocabulary_distribution: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  vocabulary: {
                    type: 'string',
                    example: 'KEYWORD'
                  },
                  subject_count: {
                    type: 'integer',
                    example: 40000
                  },
                  root_count: {
                    type: 'integer',
                    example: 32000
                  },
                  works_count: {
                    type: 'integer',
                    example: 65000
                  }
                }
              },
              description: 'Distribution by vocabulary'
            },
            top_subjects: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  term: {
                    type: 'string',
                    example: 'Anthropology'
                  },
                  vocabulary: {
                    type: 'string',
                    example: 'KEYWORD'
                  },
                  works_count: {
                    type: 'integer',
                    example: 1500
                  },
                  courses_count: {
                    type: 'integer',
                    example: 25
                  },
                  avg_relevance: {
                    type: 'number',
                    format: 'float',
                    example: 0.85
                  }
                }
              },
              description: 'Top subjects by work count'
            }
          }
        },
        BibliographyStatistics: {
          type: 'object',
          properties: {
            total_bibliography_entries: {
              type: 'integer',
              example: 17003,
              description: 'Total bibliography entries'
            },
            unique_works: {
              type: 'integer',
              example: 12500,
              description: 'Unique works in bibliographies'
            },
            courses_with_bibliography: {
              type: 'integer',
              example: 380,
              description: 'Courses with bibliography'
            },
            programs_with_bibliography: {
              type: 'integer',
              example: 15,
              description: 'Programs with bibliography'
            },
            avg_works_per_course: {
              type: 'number',
              format: 'float',
              example: 45.8,
              description: 'Average works per course'
            },
            max_works_per_course: {
              type: 'integer',
              example: 250,
              description: 'Maximum works in a course'
            },
            reading_type_distribution: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  reading_type: {
                    type: 'string',
                    example: 'RECOMMENDED'
                  },
                  count: {
                    type: 'integer',
                    example: 15000
                  },
                  percentage: {
                    type: 'number',
                    format: 'float',
                    example: 88.2
                  }
                }
              },
              description: 'Distribution by reading type'
            },
            year_range: {
              type: 'object',
              properties: {
                earliest_course_year: {
                  type: 'integer',
                  example: 1968
                },
                latest_course_year: {
                  type: 'integer',
                  example: 2024
                },
                earliest_publication_year: {
                  type: 'integer',
                  example: 1850
                },
                latest_publication_year: {
                  type: 'integer',
                  example: 2024
                },
                avg_publication_year: {
                  type: 'number',
                  format: 'float',
                  example: 1985.5
                }
              },
              description: 'Year range information'
            }
          }
        },
        BibliographyAnalysis: {
          type: 'object',
          properties: {
            most_used_works: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'integer',
                    example: 2690411
                  },
                  title: {
                    type: 'string',
                    example: 'Comparative Political Institutions'
                  },
                  publication_year: {
                    type: 'integer',
                    example: 1965
                  },
                  document_type: {
                    type: 'string',
                    example: 'BOOK'
                  },
                  author_count: {
                    type: 'integer',
                    example: 2
                  },
                  authors: {
                    type: 'array',
                    items: {
                      type: 'string'
                    },
                    example: ['John Smith', 'Jane Doe']
                  },
                  used_in_courses: {
                    type: 'integer',
                    example: 15
                  },
                  used_in_programs: {
                    type: 'integer',
                    example: 5
                  },
                  reading_types: {
                    type: 'array',
                    items: {
                      type: 'string'
                    },
                    example: ['REQUIRED', 'RECOMMENDED']
                  }
                }
              },
              description: 'Most frequently used works'
            },
            trends_by_year: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  year: {
                    type: 'integer',
                    example: 2023
                  },
                  works_count: {
                    type: 'integer',
                    example: 850
                  },
                  courses_count: {
                    type: 'integer',
                    example: 35
                  },
                  programs_count: {
                    type: 'integer',
                    example: 8
                  },
                  avg_publication_year: {
                    type: 'number',
                    format: 'float',
                    example: 1995.5
                  }
                }
              },
              description: 'Bibliography trends by year'
            },
            reading_type_distribution: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  reading_type: {
                    type: 'string',
                    example: 'RECOMMENDED'
                  },
                  count: {
                    type: 'integer',
                    example: 15000
                  },
                  unique_works: {
                    type: 'integer',
                    example: 8500
                  },
                  courses: {
                    type: 'integer',
                    example: 350
                  }
                }
              },
              description: 'Distribution by reading type'
            },
            document_type_distribution: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  document_type: {
                    type: 'string',
                    example: 'BOOK'
                  },
                  usage_count: {
                    type: 'integer',
                    example: 8500
                  },
                  unique_works: {
                    type: 'integer',
                    example: 3200
                  },
                  courses_count: {
                    type: 'integer',
                    example: 280
                  }
                }
              },
              description: 'Distribution by document type'
            }
          }
        },
        InstructorBibliography: {
          type: 'object',
          properties: {
            work_id: {
              type: 'integer',
              example: 2684644,
              description: 'Work identifier'
            },
            title: {
              type: 'string',
              example: 'The Gift: Forms and Functions of Exchange in Archaic Societies',
              description: 'Work title'
            },
            publication_year: {
              type: 'integer',
              example: 1950,
              description: 'Year of publication'
            },
            language: {
              type: 'string',
              example: 'en',
              description: 'Publication language'
            },
            document_type: {
              type: 'string',
              enum: ['ARTICLE', 'BOOK', 'CHAPTER', 'THESIS', 'REPORT'],
              example: 'BOOK',
              description: 'Type of document'
            },
            reading_type: {
              type: 'string',
              enum: ['REQUIRED', 'RECOMMENDED', 'SUPPLEMENTARY', 'OPTIONAL'],
              example: 'RECOMMENDED',
              description: 'Reading assignment type'
            },
            author_count: {
              type: 'integer',
              example: 1,
              description: 'Number of authors'
            },
            first_author_name: {
              type: 'string',
              example: 'Marcel Mauss',
              description: 'First author name'
            },
            authors: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['Marcel Mauss'],
              description: 'List of authors'
            },
            used_in_courses: {
              type: 'integer',
              example: 3,
              description: 'Number of courses using this work'
            }
          },
          description: 'Bibliography entry used by instructor'
        },
        WorkBibliography: {
          type: 'object',
          properties: {
            course_id: {
              type: 'integer',
              example: 465,
              description: 'Course identifier'
            },
            course_name: {
              type: 'string',
              example: 'Antropologia do Parentesco',
              description: 'Course name'
            },
            course_year: {
              type: 'integer',
              example: 2025,
              description: 'Academic year'
            },
            program_id: {
              type: 'integer',
              example: 2,
              description: 'Academic program identifier'
            },
            reading_type: {
              type: 'string',
              enum: ['REQUIRED', 'RECOMMENDED', 'SUPPLEMENTARY', 'OPTIONAL'],
              example: 'RECOMMENDED',
              description: 'Reading assignment type'
            },
            instructor_count: {
              type: 'integer',
              example: 2,
              description: 'Number of instructors'
            },
            instructors: {
              type: 'string',
              example: 'João Silva; Maria Santos',
              description: 'Instructor names (semicolon separated)'
            }
          },
          description: 'Course usage information for a work'
        },
        ComprehensiveInstructorProfile: {
          type: 'object',
          properties: {
            person: {
              type: 'object',
              properties: {
                id: {
                  type: 'integer',
                  example: 1
                },
                preferred_name: {
                  type: 'string',
                  example: 'Luiz Fernando Dias Duarte'
                },
                given_names: {
                  type: 'string',
                  example: 'Luiz Fernando Dias'
                },
                family_name: {
                  type: 'string',
                  example: 'Duarte'
                },
                orcid: {
                  type: 'string',
                  example: '0000-0001-7610-1527'
                },
                lattes_id: {
                  type: 'string',
                  nullable: true,
                  example: null
                },
                scopus_id: {
                  type: 'string',
                  nullable: true,
                  example: null
                },
                is_verified: {
                  type: 'boolean',
                  example: true
                },
                created_at: {
                  type: 'string',
                  format: 'date-time',
                  example: '2025-08-13T22:29:24.000Z'
                }
              },
              description: 'Complete person information'
            },
            teaching_profile: {
              type: 'object',
              properties: {
                courses_taught: {
                  type: 'integer',
                  example: 29
                },
                programs_count: {
                  type: 'integer',
                  example: 1
                },
                bibliography_items_used: {
                  type: 'integer',
                  example: 1018
                },
                unique_collaborators: {
                  type: 'integer',
                  example: 1
                },
                teaching_start_year: {
                  type: 'integer',
                  example: 1981
                },
                teaching_end_year: {
                  type: 'integer',
                  example: 2022
                },
                teaching_roles: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['PROFESSOR', 'ASSISTANT', 'TA', 'GUEST']
                  },
                  example: ['PROFESSOR']
                },
                teaching_span_years: {
                  type: 'integer',
                  example: 42
                }
              },
              description: 'Teaching career statistics and timeline'
            },
            authorship_profile: {
              type: 'object',
              properties: {
                works_authored: {
                  type: 'integer',
                  example: 25
                },
                unique_signatures: {
                  type: 'integer',
                  example: 1
                },
                confirmed_authorships: {
                  type: 'integer',
                  example: 38
                },
                first_publication_year: {
                  type: 'integer',
                  nullable: true,
                  example: 1971
                },
                latest_publication_year: {
                  type: 'integer',
                  nullable: true,
                  example: 2022
                }
              },
              description: 'Research output and authorship statistics'
            },
            signatures: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'integer',
                    example: 92152
                  },
                  signature: {
                    type: 'string',
                    example: 'DUARTE L F D'
                  },
                  works_with_signature: {
                    type: 'integer',
                    example: 25
                  }
                }
              },
              description: 'Author signatures and their usage in works'
            },
            recent_authored_works: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'integer',
                    example: 2683933
                  },
                  title: {
                    type: 'string',
                    example: 'Un nouveau centenaire pour le Brésil et pour son Musée National'
                  },
                  year: {
                    type: 'integer',
                    example: 2022
                  },
                  work_type: {
                    type: 'string',
                    example: 'ARTICLE'
                  },
                  language: {
                    type: 'string',
                    nullable: true,
                    example: null
                  },
                  signature_text: {
                    type: 'string',
                    example: 'DUARTE L F D'
                  }
                }
              },
              description: '10 most recent authored works by publication year'
            },
            bibliography_usage_patterns: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  reading_type: {
                    type: 'string',
                    enum: ['REQUIRED', 'RECOMMENDED', 'SUPPLEMENTARY'],
                    example: 'RECOMMENDED'
                  },
                  works_count: {
                    type: 'integer',
                    example: 1018
                  },
                  courses_count: {
                    type: 'integer',
                    example: 29
                  }
                }
              },
              description: 'Bibliography usage patterns in courses taught'
            },
            most_used_authors_in_courses: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  author_string: {
                    type: 'string',
                    example: 'Marcel Mauss;Claude Lévi-Strauss'
                  },
                  first_author_name: {
                    type: 'string',
                    example: 'Marcel Mauss'
                  },
                  usage_count: {
                    type: 'integer',
                    example: 15
                  },
                  courses_count: {
                    type: 'integer',
                    example: 8
                  },
                  authors_array: {
                    type: 'array',
                    items: {
                      type: 'string'
                    },
                    example: ['Marcel Mauss', 'Claude Lévi-Strauss']
                  }
                }
              },
              description: '15 most frequently used authors in instructor courses'
            },
            subject_expertise: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  vocabulary: {
                    type: 'string',
                    enum: ['KEYWORD', 'MESH', 'LCSH', 'DDC', 'UDC', 'CUSTOM'],
                    example: 'KEYWORD'
                  },
                  subjects_count: {
                    type: 'integer',
                    example: 45
                  },
                  works_count: {
                    type: 'integer',
                    example: 120
                  },
                  courses_count: {
                    type: 'integer',
                    example: 15
                  }
                }
              },
              description: 'Subject expertise analysis by vocabulary type'
            },
            teaching_collaborators: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  collaborator_id: {
                    type: 'integer',
                    example: 6
                  },
                  collaborator_name: {
                    type: 'string',
                    example: 'Adriana Vianna'
                  },
                  shared_courses: {
                    type: 'integer',
                    example: 1
                  }
                }
              },
              description: 'Top 10 teaching collaborators by shared courses'
            },
            combined_statistics: {
              type: 'object',
              properties: {
                total_academic_span_years: {
                  type: 'integer',
                  example: 52,
                  description: 'Maximum span between teaching and publication activities'
                },
                academic_productivity_ratio: {
                  type: 'string',
                  example: '0.86',
                  description: 'Ratio of works authored to courses taught'
                },
                bibliography_diversity_score: {
                  type: 'integer',
                  example: 1,
                  description: 'Number of different reading types used'
                },
                signature_consistency_score: {
                  type: 'number',
                  example: 25,
                  description: 'Average works per signature (consistency measure)'
                }
              },
              description: 'Combined academic performance metrics'
            }
          },
          description: 'Comprehensive academic profile combining teaching, research, authorship, and collaboration data'
        },
        ComprehensiveCourseDetails: {
          type: 'object',
          properties: {
            course: {
              $ref: '#/components/schemas/CourseDetails',
              description: 'Basic course information'
            },
            bibliography: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  course_id: {
                    type: 'integer',
                    example: 25
                  },
                  work_id: {
                    type: 'integer',
                    example: 2715248
                  },
                  reading_type: {
                    type: 'string',
                    enum: ['REQUIRED', 'RECOMMENDED', 'SUPPLEMENTARY'],
                    example: 'RECOMMENDED'
                  },
                  week_number: {
                    type: 'integer',
                    nullable: true,
                    example: 3
                  },
                  notes: {
                    type: 'string',
                    nullable: true,
                    example: 'Essential reading for module introduction'
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
                  author_string: {
                    type: 'string',
                    example: 'George Peter Murdock'
                  },
                  first_author_name: {
                    type: 'string',
                    example: 'George Peter Murdock'
                  },
                  authors: {
                    type: 'array',
                    items: {
                      type: 'string'
                    },
                    example: ['George Peter Murdock']
                  },
                  author_count: {
                    type: 'integer',
                    example: 1
                  }
                }
              },
              description: 'Course bibliography with detailed work information'
            },
            instructors: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/CourseInstructor'
              },
              description: 'Course instructors with roles and verification'
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
                    enum: ['KEYWORD', 'MESH', 'LCSH', 'DDC', 'UDC', 'CUSTOM'],
                    example: 'KEYWORD'
                  },
                  parent_id: {
                    type: 'integer',
                    nullable: true,
                    example: null
                  },
                  work_count: {
                    type: 'integer',
                    example: 15,
                    description: 'Number of works in this course using this subject'
                  }
                }
              },
              description: 'Subjects covered in course bibliography'
            },
            statistics: {
              type: 'object',
              properties: {
                total_bibliography_items: {
                  type: 'integer',
                  example: 17,
                  description: 'Total bibliography entries'
                },
                total_instructors: {
                  type: 'integer',
                  example: 2,
                  description: 'Total number of instructors'
                },
                total_subjects: {
                  type: 'integer',
                  example: 0,
                  description: 'Total number of subjects covered'
                }
              },
              description: 'Course statistical summary'
            },
            bibliography_statistics: {
              type: 'object',
              properties: {
                by_type: {
                  type: 'object',
                  additionalProperties: {
                    type: 'object',
                    properties: {
                      count: {
                        type: 'integer',
                        example: 17
                      },
                      first_week: {
                        type: 'integer',
                        nullable: true,
                        example: null
                      },
                      last_week: {
                        type: 'integer',
                        nullable: true,
                        example: null
                      }
                    }
                  },
                  example: {
                    'RECOMMENDED': {
                      'count': 17,
                      'first_week': null,
                      'last_week': null
                    }
                  },
                  description: 'Bibliography statistics by reading type'
                },
                by_week: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      week_number: {
                        type: 'integer',
                        example: 1
                      },
                      count: {
                        type: 'integer',
                        example: 3
                      },
                      reading_types: {
                        type: 'string',
                        example: 'REQUIRED,RECOMMENDED'
                      }
                    }
                  },
                  description: 'Bibliography distribution by week'
                }
              },
              description: 'Detailed bibliography statistics'
            },
            instructor_statistics: {
              type: 'object',
              properties: {
                by_role: {
                  type: 'object',
                  additionalProperties: {
                    type: 'integer'
                  },
                  example: {
                    'PROFESSOR': 2
                  },
                  description: 'Instructor count by role'
                }
              },
              description: 'Instructor distribution statistics'
            },
            subject_statistics: {
              type: 'object',
              properties: {
                by_vocabulary: {
                  type: 'object',
                  additionalProperties: {
                    type: 'object',
                    properties: {
                      unique_subjects: {
                        type: 'integer',
                        example: 15
                      },
                      works_covered: {
                        type: 'integer',
                        example: 12
                      }
                    }
                  },
                  example: {
                    'KEYWORD': {
                      'unique_subjects': 15,
                      'works_covered': 12
                    }
                  },
                  description: 'Subject statistics by vocabulary'
                }
              },
              description: 'Subject coverage statistics'
            }
          },
          description: 'Comprehensive course details with bibliography, instructors, subjects, and statistics'
        }
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
        searchParam: {
          name: 'search',
          in: 'query',
          description: 'Search term for filtering results',
          required: false,
          schema: {
            type: 'string',
            minLength: 2,
            maxLength: 255
          }
        },
        yearFromParam: {
          name: 'year_from',
          in: 'query',
          description: 'Filter by minimum publication year',
          required: false,
          schema: {
            type: 'integer',
            minimum: 1900
          }
        },
        yearToParam: {
          name: 'year_to',
          in: 'query',
          description: 'Filter by maximum publication year',
          required: false,
          schema: {
            type: 'integer',
            minimum: 1900
          }
        }
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
        WorkDetailsSuccess: {
          description: 'Work details retrieved successfully',
          content: {
            'application/json': {
              schema: {
                allOf: [
                  { $ref: '#/components/schemas/SuccessEnvelope' },
                  {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/Work' }
                    }
                  }
                ]
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
        Forbidden: {
          description: 'Access forbidden - Insufficient permissions',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                status: 'error',
                message: 'Access forbidden',
                code: 'FORBIDDEN'
              }
            }
          }
        }
      }
    },
    tags: [
      { name: 'Health', description: 'Liveness, readiness, and runtime metrics probes.' },
      { name: 'Security', description: 'Security headers, rate-limit stats, and IP management. Requires `x-access-key`.' },
      { name: 'Search', description: 'Full-text search across works, publications, and persons. Sphinx-backed with MariaDB fallback, plus autocomplete and popular-terms helpers.' },
      { name: 'Works', description: 'Canonical academic works (articles, books, chapters, theses, conferences). Listings surface the latest matching publication per work.' },
      { name: 'Publications', description: 'Per-publication view over `summary_publications`, including DOI resolution and sibling navigation.' },
      { name: 'Persons', description: 'Researcher profiles: preferred name, identifiers, affiliations, publication history, collaborators.' },
      { name: 'Institutions', description: 'Institutional entities (universities, institutes, companies, government, NGOs) exposed at `/institutions`.' },
      { name: 'Venues', description: 'Journals, conferences, repositories, and book series. Backed by `summary_venues` with ranking and bibliometric surface.' },
      { name: 'Citations', description: 'Citation and reference relationships, per-work metrics, and citation-network traversal.' },
      { name: 'Collaborations', description: 'Co-authorship analysis, collaborator lookup, collaboration networks, and top-collaborator rankings.' },
      { name: 'Courses', description: 'Academic courses with instructors, bibliography, and subject coverage.' },
      { name: 'Instructors', description: 'Instructors with course history, bibliography usage, and subject expertise.' },
      { name: 'Bibliography', description: 'Course bibliographies and their usage analysis.' },
      { name: 'Subjects', description: 'Subject taxonomy and subject-linked listings (works, courses).' },
      { name: 'Signatures', description: 'Name signatures and author-identity linkage.' },
      { name: 'Metrics', description: 'Bibliometric analytics and Sphinx runtime metrics. Dashboard routes require `x-access-key`.' },
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
