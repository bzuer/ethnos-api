//
// $Id$
//

#pragma once

//
// Copyright (c) 2001-2025, Andrew Aksyonoff
// Copyright (c) 2011-2016, Sphinx Technologies Inc
// All rights reserved
//

//
// Sphinx plugin interface header
//
// This file will be included by plugin implementations, so it should be
// portable plain C, stay standalone, and change as rarely as possible.
//
// Refer to src/udfexample.c for a working UDF example, and refer to
// doc/sphinx3.html#using-udfs for more information on writing
// plugins and UDFs.
//

#ifdef __cplusplus
extern "C" {
#endif

/// current udf version
/// NOTE: when changing FACTORS() blob, do not forget to bump master-agent protocol, too!
/// (see VER_MASTER, VER_MASTER_FACTORS in searchdapi.h)
///
/// v.19, 2022-jun-02, added wordpair_ctr factor
/// v.20, 2022-jun-03, added annot factors
/// v.21, 2022-jul-01, added tokclass_mask factor
/// v.22, 2022-aug-08, changed bm15 type from int to float
/// v.23, 2022-sep-08, added optional $LIBNAME_libinit() call
/// v.24  2025-apr-20, added bpe tokenizer factors
#define SPH_UDF_VERSION 24

/// error buffer size
#define SPH_UDF_ERROR_LEN 256

//////////////////////////////////////////////////////////////////////////
// UDF PLUGINS
//////////////////////////////////////////////////////////////////////////

/// UDF argument and result value types
enum sphinx_udf_argtype
{
	SPH_UDF_TYPE_UINT32		= 1,	// unsigned 32-bit integer
	SPH_UDF_TYPE_UINT32SET	= 2,	// sorted set of unsigned 32-bit integers
	SPH_UDF_TYPE_INT64		= 3,	// signed 64-bit integer
	SPH_UDF_TYPE_FLOAT		= 4,	// single-precision IEEE 754 float
	SPH_UDF_TYPE_STRING		= 5,	// non-ASCIIZ string, with a separately stored length
	SPH_UDF_TYPE_INT64SET	= 6,	// sorted set of signed 64-bit integers
	SPH_UDF_TYPE_FACTORS	= 7,	// packed ranking factors
	SPH_UDF_TYPE_JSON		= 8,	// whole json or particular field as a string
	SPH_UDF_TYPE_FLOAT_VEC	= 9		// vector of floats, with a separately stored length
};


/// our malloc() replacement type
/// results that are returned to searchd MUST be allocated using this replacement
typedef void * sphinx_malloc_fn(int);

/// UDF call arguments
typedef struct st_sphinx_udf_args
{
	int							arg_count;		// number of arguments
	enum sphinx_udf_argtype *	arg_types;		// argument types
	char **						arg_values;		// argument values (strings are not (!) ASCIIZ; see str_lengths below)
	char **						arg_names;		// argument names (ASCIIZ argname in 'expr AS argname' case; NULL otherwise)
	int *						str_lengths;	// string argument lengths
	sphinx_malloc_fn *			fn_malloc;		// malloc() replacement to allocate returned values
} SPH_UDF_ARGS;

/// UDF initialization
typedef struct st_sphinx_udf_init
{
	void *	func_data;	// function data (will be passed to calls, deinit)
	char	is_const;	// whether a function returns a constant
} SPH_UDF_INIT;

/// integer return types
#if defined(_MSC_VER) || defined(__WIN__)
typedef __int64 sphinx_int64_t;
typedef unsigned __int64 sphinx_uint64_t;
#else
typedef long long sphinx_int64_t;
typedef unsigned long long sphinx_uint64_t;
#endif

//////////////////////////////////////////////////////////////////////////

/// ranking factors interface, v1
/// functions that unpack FACTORS() blob into a few helper C structures
/// slower because of malloc()s and copying, but easier to use

/// unpacked representation of all the field-level ranking factors
typedef struct st_sphinx_field_factors
{
	unsigned int	hit_count;
	unsigned int	id;
	unsigned int	lcs;
	unsigned int	word_count;
	float			tf_idf;
	float			min_idf;
	float			max_idf;
	float			sum_idf;
	int				min_hit_pos;
	int				min_best_span_pos;
	char			exact_hit;
	int				max_window_hits;
	int				min_gaps;			// added in v.3
	char			exact_order;		// added in v.4
	float			atc;				// added in v.4
	int				lccs;				// added in v.5
	float			wlccs;				// added in v.5
	char			exact_field_hit;	// added in v.10
	char			full_field_hit;		// added in v.11
	float			sum_idf_boost;		// added in v.13
	int				is_noun_hits;		// added in v.14
	int				is_latin_hits;		// added in v.14
	int				is_number_hits;		// added in v.14
	int				has_digit_hits;		// added in v.14
	float			trf_qt;				// added in v.15
	float			trf_i2u;			// added in v.15
	float			trf_i2q;			// added in v.15
	float			trf_i2f;			// added in v.15
	float			trf_aqt;			// added in v.15
	float			trf_naqt;			// added in v.15
	float			phrase_decay10;		// added in v.17
	float			phrase_decay30;		// added in v.17
	float			wordpair_ctr;		// added in v.19

	// TODO: bpe: check that fields are required
	float	bpe_qt;		// added in v.24
	float	bpe_i2u;	// added in v.24
	float	bpe_i2q;	// added in v.24
	float	bpe_i2f;	// added in v.24
	float	bpe_aqt;	// added in v.24
	float	bpe_naqt;	// added in v.24
} SPH_UDF_FIELD_FACTORS;

/// unpacked representation of all the term-level ranking factors
typedef struct st_sphinx_term_factors
{
	unsigned int	keyword_mask;
	unsigned int	id;
	int				tf;
	float			idf;
	float			idf_boost;	// added in v.13
	unsigned char	flags;		// added in v.14
} SPH_UDF_TERM_FACTORS;

/// unpacked representation of all the ranking factors (document, field, and term-level)
typedef struct st_sphinx_factors
{
	float					doc_bm15;				// float since v.22, int before
	float					doc_bm25a;
	unsigned int			matched_fields;
	int						doc_word_count;
	int						num_fields;
	int						max_uniq_qpos;
	float					annot_max_score;
	int						annot_hit_count;
	char					annot_exact_hit;
	char					annot_exact_order;
	float					annot_sum_idf;

	SPH_UDF_FIELD_FACTORS *	field;
	SPH_UDF_TERM_FACTORS *	term;

	int						query_max_lcs;			// added in v.14
	int						query_word_count;		// added in v.14
	int						query_is_noun_words;	// added in v.14
	int						query_is_latin_words;	// added in v.14
	int						query_is_number_words;	// added in v.14
	int						query_has_digit_words;	// added in v.14
	float					query_max_idf;			// added in v.14
	float					query_min_idf;			// added in v.14
	float					query_sum_idf;			// added in v.14
	float					query_words_clickstat;	// added in v.18
	unsigned int			query_tokclass_mask;	// added in v.21

	int *					field_tf;
} SPH_UDF_FACTORS;

/// helper function that must be called to initialize the SPH_UDF_FACTORS structure
/// before it is passed to sphinx_factors_unpack
/// returns 0 on success
/// returns an error code on error
int	sphinx_factors_init(SPH_UDF_FACTORS * out);

/// helper function that unpacks FACTORS() blob into SPH_UDF_FACTORS structure
/// MUST be in sync with PackFactors() method in sphinxsearch.cpp
/// returns 0 on success
/// returns an error code on error
int	sphinx_factors_unpack(const unsigned int * in, SPH_UDF_FACTORS * out);

/// helper function that must be called to free the memory allocated by the sphinx_factors_unpack
/// function call
/// returns 0 on success
/// returns an error code on error
int	sphinx_factors_deinit(SPH_UDF_FACTORS * out);

//////////////////////////////////////////////////////////////////////////

/// ranking factors interface, v2
/// functions that access factor values directly in the FACTORS() blob
///
/// faster, as no memory allocations are guaranteed, but type-punned
/// meaning that you have to call a proper get_xxx_factor_int() or xxx_float() variant
/// the accessor functions themselves will NOT perform any type checking or conversions
/// or in other words, sphinx_get_field_factor_int() on a float factor like min_idf is legal,
/// but returns "garbage" (floating value from the blob reinterpreted as an integer)

enum sphinx_doc_factor
{
	SPH_DOCF_BM15					= 1,	// v.22, float
	SPH_DOCF_BM25A					= 2,	// float
	SPH_DOCF_MATCHED_FIELDS			= 3,	// unsigned int
	SPH_DOCF_DOC_WORD_COUNT			= 4,	// int
	SPH_DOCF_NUM_FIELDS				= 5,	// int
	SPH_DOCF_MAX_UNIQ_QPOS			= 6,	// int
	SPH_DOCF_EXACT_HIT_MASK			= 7,	// unsigned int
	SPH_DOCF_EXACT_ORDER_MASK		= 8,	// v.4, unsigned int
	SPH_DOCF_EXACT_FIELD_HIT_MASK	= 9,	// v.10, unsigned int
	SPH_DOCF_FULL_FIELD_HIT_MASK	= 10,	// v.11, unsigned int
	SPH_DOCF_ANNOT_MAX_SCORE		= 11,	// v.18, float
	SPH_DOCF_ANNOT_HIT_COUNT		= 12,	// v.18, int
	SPH_DOCF_ANNOT_EXACT_HIT		= 13,	// v.18, bool
	SPH_DOCF_ANNOT_EXACT_ORDER		= 14,	// v.18, bool
	SPH_DOCF_ANNOT_SUM_IDF			= 15	// v.18, unsigned int
};


/// WARNING: you MUST update these when adding new per-doc factors
#define SPH_DOCF_TOTAL	10	// per-doc factors size, EXCLUDING masks, in ints
#define SPH_DOCF_NMASKS	4	// per-field masks count, in items (mask lengths may vary)

/// INTERNAL: per-doc flags bits
enum sphinx_doc_flag
{
	SPH_DOCFLAG_ANNOT_EXACT_HIT		= 0,
	SPH_DOCFLAG_ANNOT_EXACT_ORDER	= 1
};


enum sphinx_query_factor
{
	SPH_QUERYF_MAX_LCS			= 1,	// v.14, unsigned int
	SPH_QUERYF_WORD_COUNT		= 2,	// v.14, unsigned int
	SPH_QUERYF_IS_NOUN_WORDS	= 3,	// v.14, unsigned int
	SPH_QUERYF_IS_LATIN_WORDS	= 4,	// v.14, unsigned int
	SPH_QUERYF_IS_NUMBER_WORDS	= 5,	// v.14, unsigned int
	SPH_QUERYF_HAS_DIGIT_WORDS	= 6,	// v.14, unsigned int
	SPH_QUERYF_MAX_IDF			= 7,	// v.14, float
	SPH_QUERYF_MIN_IDF			= 8,	// v.14, float
	SPH_QUERYF_SUM_IDF			= 9,	// v.14, float
	SPH_QUERYF_WORDS_CLICKSTAT	= 10,	// v.18, float
	SPH_QUERYF_TOKCLASS_MASK	= 11	// v.21, unsigned int
};


/// WARNING: you MUST update this when adding new per-query factors
#define SPH_QUERYF_TOTAL 11 // per-query factors size, in ints

enum sphinx_field_factor
{
	SPH_FIELDF_HIT_COUNT			= 1,	// unsigned int
	SPH_FIELDF_LCS					= 2,	// unsigned int
	SPH_FIELDF_WORD_COUNT			= 3,	// unsigned int
	SPH_FIELDF_TF_IDF				= 4,	// float
	SPH_FIELDF_MIN_IDF				= 5,	// float
	SPH_FIELDF_MAX_IDF				= 6,	// float
	SPH_FIELDF_SUM_IDF				= 7,	// float
	SPH_FIELDF_MIN_HIT_POS			= 8,	// int
	SPH_FIELDF_MIN_BEST_SPAN_POS	= 9,	// int
	SPH_FIELDF_MAX_WINDOW_HITS		= 10,	// int
	SPH_FIELDF_MIN_GAPS				= 11,	// v.3, int
	SPH_FIELDF_ATC					= 12,	// v.4, float
	SPH_FIELDF_LCCS					= 13,	// v.5, int
	SPH_FIELDF_WLCCS				= 14,	// v.5, float
	SPH_FIELDF_SUM_IDF_BOOST		= 15,	// v.13, float
	SPH_FIELDF_IS_NOUN_HITS			= 16,	// v.14, unsigned int
	SPH_FIELDF_IS_LATIN_HITS		= 17,	// v.14, unsigned int
	SPH_FIELDF_IS_NUMBER_HITS		= 18,	// v.14, unsigned int
	SPH_FIELDF_HAS_DIGIT_HITS		= 19,	// v.14, unsigned int
	SPH_FIELDF_TRF_QT				= 20,	// v.15, float
	SPH_FIELDF_TRF_I2U				= 21,	// v.15, float
	SPH_FIELDF_TRF_I2Q				= 22,	// v.15, float
	SPH_FIELDF_TRF_I2F				= 23,	// v.15, float
	SPH_FIELDF_TRF_AQT				= 24,	// v.15, float
	SPH_FIELDF_TRF_NAQT				= 25,	// v.15, float
	SPH_FIELDF_PHRASE_DECAY10		= 26,	// v.17, float
	SPH_FIELDF_PHRASE_DECAY30		= 27,	// v.17, float
	SPH_FIELDF_WORDPAIR_CTR			= 28,	// v.19, float
	SPH_FIELDF_BPE_QT				= 29,	// v.24, float
	SPH_FIELDF_BPE_I2U				= 30,	// v.24, float
	SPH_FIELDF_BPE_I2Q				= 31,	// v.24, float
	SPH_FIELDF_BPE_I2F				= 32,	// v.24, float
	SPH_FIELDF_BPE_AQT				= 33,	// v.24, float
	SPH_FIELDF_BPE_NAQT				= 34	// v.24, float
};


/// WARNING: you MUST update this when adding new per-field factors
#define SPH_FIELDF_TOTAL 35 // per-field factors size, in ints (for matched fields only, otherwise 1)

enum sphinx_term_factor
{
	SPH_TERMF_KEYWORD_MASK	= 1,	// unsigned int
	SPH_TERMF_TF			= 2,	// int
	SPH_TERMF_IDF			= 3,	// float
	SPH_TERMF_IDF_BOOST		= 4,	// float
	SPH_TERMF_FLAGS			= 5		// int
};


/// WARNING: you MUST update this when adding new per-term factors
#define SPH_TERMF_TOTAL 6 // per-term factors size, in ints (for matched qpos'es only, otherwise 1)

//////////////////////////////////////////////////////////////////////////

/// returns a document factor value, interpreted as float
float					sphinx_get_doc_factor_float(const unsigned int * in, enum sphinx_doc_factor f);

/// returns a document factor value, interpreted as integer
int						sphinx_get_doc_factor_int(const unsigned int * in, enum sphinx_doc_factor f);

/// returns a pointer to document factor value, interpreted as vector of integers
const unsigned int *	sphinx_get_doc_factor_ptr(const unsigned int * in, enum sphinx_doc_factor f);

/// returns a field factor value, interpreted as float
float					sphinx_get_field_factor_float(const unsigned int * in, enum sphinx_field_factor f);

/// returns a field factor value, interpreted as integer
int						sphinx_get_field_factor_int(const unsigned int * in, enum sphinx_field_factor f);

/// returns a pointer to the field factors, or NULL for a non-matched field index
const unsigned int *	sphinx_get_field_factors(const unsigned int * in, int field);

/// returns a query factor value, interpreted as float
float					sphinx_get_query_factor_float(const unsigned int * in, enum sphinx_query_factor f);

/// returns a query factor value, interpreted as integer
int						sphinx_get_query_factor_int(const unsigned int * in, enum sphinx_query_factor f);

/// returns a pointer to the query factors (skip field and term factors)
const unsigned int *	sphinx_get_query_factors(const unsigned int * in);

/// returns a term factor value, interpreted as float
float					sphinx_get_term_factor_float(const unsigned int * in, enum sphinx_term_factor f);

/// returns a term factor value, interpreted as integer
int						sphinx_get_term_factor_int(const unsigned int * in, enum sphinx_term_factor f);

/// returns a pointer to the term factors, or NULL for a non-matched field index
const unsigned int *	sphinx_get_term_factors(const unsigned int * in, int term);

//////////////////////////////////////////////////////////////////////////
// RANKER PLUGINS
//////////////////////////////////////////////////////////////////////////

/// ranker plugin intialization info
typedef struct st_plugin_rankerinfo
{
	int				num_field_weights;
	int *			field_weights;
	const char *	options;
	unsigned int	payload_mask;
	int				num_query_words;
	int				max_qpos;
} SPH_RANKER_INIT;

/// a structure that represents a hit
typedef struct st_plugin_hit
{
	sphinx_uint64_t	doc_id;
	unsigned int	hit_pos;
	unsigned short	query_pos;
	unsigned short	node_pos;
	unsigned short	span_length;
	unsigned short	match_length;
	unsigned int	weight;
	unsigned int	query_pos_mask;
} SPH_RANKER_HIT;

#ifdef __cplusplus
}
#endif

//
// $Id$
//
