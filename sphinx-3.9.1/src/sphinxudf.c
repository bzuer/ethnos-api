//
// $Id$
//

//
// Copyright (c) 2001-2025, Andrew Aksyonoff
// Copyright (c) 2011-2016, Sphinx Technologies Inc
// All rights reserved
//

//
// Sphinx UDF helpers implementation
//

#include "sphinxudf.h"

#include <assert.h>
#include <memory.h>
#include <stdlib.h>

#define SPH_UDF_MAX_FIELD_FACTORS	256
#define SPH_UDF_MAX_TERM_FACTORS	2048

/// helper function to compute mask size in ints
static inline int mask_size(unsigned int n)
{
	return (n + 31) / 32;
}


/// helper function that must be called to initialize the SPH_UDF_FACTORS structure
/// before it is passed to sphinx_factors_unpack
/// returns 0 on success
/// returns an error code on error
int sphinx_factors_init(SPH_UDF_FACTORS * out)
{
	if (!out)
		return 1;

	memset(out, 0, sizeof(SPH_UDF_FACTORS));
	return 0;
}


/// unaligned load
static inline float load_float(const void * p)
{
	float f;
	memcpy(&f, p, sizeof(f));
	return f;
}


/// unaligned load
static inline unsigned int load_uint(const void * p)
{
	unsigned int u;
	memcpy(&u, p, sizeof(u));
	return u;
}


/// unaligned load
static inline int load_int(const void * p)
{
	int i;
	memcpy(&i, p, sizeof(i));
	return i;
}


/// helper that loads a given bit from a mask
static inline char load_mask_bit(const unsigned int * in, int bit)
{
	return (char)((load_uint(in + (bit >> 5)) >> (bit & 31)) & 1);
}


/// helper function that unpacks FACTORS() blob into SPH_UDF_FACTORS structure
/// MUST be in sync with PackFactors() method in sphinxsearch.cpp
/// returns 0 on success
/// returns an error code on error
int sphinx_factors_unpack(const unsigned int * in, SPH_UDF_FACTORS * out)
{
	assert((size_t)in % 4 == 0); // ensure data is aligned

	const unsigned int * pack = in;
	SPH_UDF_FIELD_FACTORS * f;
	SPH_UDF_TERM_FACTORS * t;
	int i, size, fields, fields_size;
	unsigned int doc_flags;
	const unsigned int *exact_hit_mask, *exact_order_mask, *exact_field_hit_mask, *full_field_hit_mask;

	if (!in || !out)
		return 1;

	if (out->field || out->term)
		return 1;

	// extract size, extract document-level factors
	size = load_int(in++);

	out->doc_bm15 = load_float(in++);
	out->doc_bm25a = load_float(in++);
	out->matched_fields = load_uint(in++);
	out->doc_word_count = load_int(in++);
	out->num_fields = load_int(in++);
	doc_flags = load_uint(in++);
	out->annot_max_score = load_float(in++);
	out->annot_hit_count = load_int(in++);
	out->annot_exact_hit = (doc_flags >> SPH_DOCFLAG_ANNOT_EXACT_HIT) & 1;
	out->annot_exact_order = (doc_flags >> SPH_DOCFLAG_ANNOT_EXACT_ORDER) & 1;
	out->annot_sum_idf = load_float(in++);

	// extract field-level factors
	if (out->num_fields > SPH_UDF_MAX_FIELD_FACTORS)
		return 1;

	fields_size = mask_size(out->num_fields);
	exact_hit_mask = in;
	exact_order_mask = in + fields_size;
	exact_field_hit_mask = in + 2 * fields_size;
	full_field_hit_mask = in + 3 * fields_size;
	in += SPH_DOCF_NMASKS * fields_size;

	if (out->num_fields > 0)
	{
		i = out->num_fields * sizeof(SPH_UDF_FIELD_FACTORS);
		out->field = (SPH_UDF_FIELD_FACTORS *)malloc(i);
		memset(out->field, 0, i);
	}

	for (i = 0; i < out->num_fields; i++)
	{
		f = &(out->field[i]);
		f->hit_count = load_uint(in++);

		if (f->hit_count)
		{
			f->id = load_uint(in++);
			f->lcs = load_uint(in++);
			f->word_count = load_uint(in++);
			f->tf_idf = load_float(in++);
			f->min_idf = load_float(in++);
			f->max_idf = load_float(in++);
			f->sum_idf = load_float(in++);
			f->min_hit_pos = load_int(in++);
			f->min_best_span_pos = load_int(in++);
			f->max_window_hits = load_int(in++);
			f->min_gaps = load_int(in++);
			f->atc = load_float(in++);
			f->lccs = load_int(in++);
			f->wlccs = load_float(in++);
			f->sum_idf_boost = load_float(in++);
			f->is_noun_hits = load_int(in++);
			f->is_latin_hits = load_int(in++);
			f->is_number_hits = load_int(in++);
			f->has_digit_hits = load_int(in++);
			f->trf_qt = load_float(in++);
			f->trf_i2u = load_float(in++);
			f->trf_i2q = load_float(in++);
			f->trf_i2f = load_float(in++);
			f->trf_aqt = load_float(in++);
			f->trf_naqt = load_float(in++);
			f->phrase_decay10 = load_float(in++);
			f->phrase_decay30 = load_float(in++);
			f->wordpair_ctr = load_float(in++);
			f->bpe_qt = load_float(in++); // TODO: bpe: check that fields are required
			f->bpe_i2u = load_float(in++);
			f->bpe_i2q = load_float(in++);
			f->bpe_i2f = load_float(in++);
			f->bpe_aqt = load_float(in++);
			f->bpe_naqt = load_float(in++);

			f->exact_hit = load_mask_bit(exact_hit_mask, i);
			f->exact_order = load_mask_bit(exact_order_mask, i);
			f->exact_field_hit = load_mask_bit(exact_field_hit_mask, i);
			f->full_field_hit = load_mask_bit(full_field_hit_mask, i);
		} else
		{
			// everything else is already zeroed out by memset() above
			f->id = i;
		}
	}

	// extract term-level factors
	out->max_uniq_qpos = load_int(in++);
	if (out->max_uniq_qpos > SPH_UDF_MAX_TERM_FACTORS)
		return 1;

	if (out->max_uniq_qpos > 0)
		out->term = (SPH_UDF_TERM_FACTORS *)malloc(out->max_uniq_qpos * sizeof(SPH_UDF_TERM_FACTORS));

	for (i = 0; i < out->max_uniq_qpos; i++)
	{
		t = &(out->term[i]);
		t->keyword_mask = load_uint(in++);
		if (t->keyword_mask)
		{
			t->id = load_uint(in++);
			t->tf = load_int(in++);
			t->idf = load_float(in++);
			t->idf_boost = load_float(in++);
			t->flags = (unsigned char)load_uint(in++);
		}
	}

	out->query_max_lcs = load_int(in++);
	out->query_word_count = load_int(in++);
	out->query_is_noun_words = load_int(in++);
	out->query_is_latin_words = load_int(in++);
	out->query_is_number_words = load_int(in++);
	out->query_has_digit_words = load_int(in++);
	out->query_max_idf = load_float(in++);
	out->query_min_idf = load_float(in++);
	out->query_sum_idf = load_float(in++);
	out->query_words_clickstat = load_float(in++);
	out->query_tokclass_mask = load_uint(in++);

	// extract field_tf factors
	// perform size safety check to avoid allocating and copying too much
	fields = load_int(in++);
	if (in + sizeof(int) * fields <= pack + size)
	{
		out->field_tf = (int *)malloc(fields * sizeof(int));
		memcpy(out->field_tf, in, fields * sizeof(int));
	}
	in += fields;

	// do a final safety check, and return
	return (size != (int)((in - pack) * sizeof(int))) ? 1 : 0;
}


/// helper function that must be called to free the memory allocated by the sphinx_factors_unpack
/// function call
/// returns 0 on success
/// returns an error code on error
int sphinx_factors_deinit(SPH_UDF_FACTORS * out)
{
	if (!out)
		return 1;

	free(out->term);
	free(out->field);
	free(out->field_tf);

	return 0;
}

//////////////////////////////////////////////////////////////////////////

static const unsigned int * skip_fields(const unsigned int * in, int n)
{
	in += SPH_DOCF_TOTAL + mask_size(load_int(in + 5)) * SPH_DOCF_NMASKS; // skip heading document factors and exact/full/etc masks
	while (n-- > 0)
		in += (load_int(in) > 0) ? SPH_FIELDF_TOTAL : 1; // skip all factors in matched field, or just 1 in unmatched
	return in;
}


static const unsigned int * skip_terms(const unsigned int * in, int n)
{
	in += 1; // skip max_uniq_qpos
	while (n-- > 0)
		in += (load_int(in) > 0) ? SPH_TERMF_TOTAL : 1; // skip 6 ints per matched term, or 1 per unmatched
	return in;
}


const unsigned int * sphinx_get_field_factors(const unsigned int * in, int field)
{
	if (!in || field < 0 || field >= load_int(in + 5))
		return NULL; // blob[5] is num_fields, do a sanity check
	in = skip_fields(in, field);
	if (!load_uint(in))
		return NULL; // no hits, no fun
	if (load_int(in + 1) != field)
		return NULL; // field[1] is field_id, do a sanity check
	return in; // all good
}


const unsigned int * sphinx_get_term_factors(const unsigned int * in, int term)
{
	if (!in || term < 0)
		return NULL;
	in = skip_fields(in, load_int(in + 5)); // skip all fields
	if (term > load_int(in))
		return NULL; // sanity check vs max_uniq_qpos ( qpos and terms range - [1, max_uniq_qpos]
	in = skip_terms(in, term - 1);
	if (!load_uint(in))
		return NULL; // unmatched term
	if (load_int(in + 1) != term)
		return NULL; // term[1] is keyword_id, sanity check failed
	return in;
}


int sphinx_get_doc_factor_int(const unsigned int * in, enum sphinx_doc_factor f)
{
	switch (f)
	{
		case SPH_DOCF_BM15: return (int)load_float(in + 1); // autoconv from float to int, because why not
		case SPH_DOCF_BM25A: return (int)load_float(in + 2); // autoconv from float to int, because why not
		case SPH_DOCF_MATCHED_FIELDS: return load_int(in + 3);
		case SPH_DOCF_DOC_WORD_COUNT: return load_int(in + 4);
		case SPH_DOCF_NUM_FIELDS: return load_int(in + 5);
		// NOLINT: in[6] is flags, see just below
		case SPH_DOCF_ANNOT_MAX_SCORE: return load_int(in + 7);
		case SPH_DOCF_ANNOT_HIT_COUNT: return load_int(in + 8);
		case SPH_DOCF_ANNOT_EXACT_HIT: return (load_uint(in + 6) >> SPH_DOCFLAG_ANNOT_EXACT_HIT) & 1;
		case SPH_DOCF_ANNOT_EXACT_ORDER: return (load_uint(in + 6) >> SPH_DOCFLAG_ANNOT_EXACT_ORDER) & 1;
		case SPH_DOCF_ANNOT_SUM_IDF: return load_int(in + 9);
		case SPH_DOCF_MAX_UNIQ_QPOS: return load_int(skip_fields(in, load_int(in + 5)));
		case SPH_DOCF_EXACT_HIT_MASK: return load_int(in + SPH_DOCF_TOTAL);
		case SPH_DOCF_EXACT_ORDER_MASK: return load_int(in + (SPH_DOCF_TOTAL + mask_size(load_int(in + 5))));
		case SPH_DOCF_EXACT_FIELD_HIT_MASK: return load_int(in + (SPH_DOCF_TOTAL + mask_size(load_int(in + 5)) * 2));
		case SPH_DOCF_FULL_FIELD_HIT_MASK: return load_int(in + (SPH_DOCF_TOTAL + mask_size(load_int(in + 5)) * 3));
	}
	return 0;
}


const unsigned int * sphinx_get_doc_factor_ptr(const unsigned int * in, enum sphinx_doc_factor f)
{
	switch (f)
	{
		case SPH_DOCF_EXACT_HIT_MASK: return in + SPH_DOCF_TOTAL;
		case SPH_DOCF_EXACT_ORDER_MASK: return in + SPH_DOCF_TOTAL + mask_size(load_int(in + 5));
		case SPH_DOCF_EXACT_FIELD_HIT_MASK: return in + SPH_DOCF_TOTAL + mask_size(load_int(in + 5)) * 2;
		case SPH_DOCF_FULL_FIELD_HIT_MASK: return in + SPH_DOCF_TOTAL + mask_size(load_int(in + 5)) * 3;
		default: return NULL;
	}
}


float sphinx_get_doc_factor_float(const unsigned int * in, enum sphinx_doc_factor f)
{
	switch (f)
	{
		case SPH_DOCF_BM15: return load_float(in + 1);
		case SPH_DOCF_BM25A: return load_float(in + 2);
		case SPH_DOCF_ANNOT_MAX_SCORE: return load_float(in + 7);
		case SPH_DOCF_ANNOT_SUM_IDF: return load_float(in + 9);
		default: return 0.0f;
	}
}


int sphinx_get_field_factor_int(const unsigned int * in, enum sphinx_field_factor f)
{
	if (!in)
		return 0;

	// in[1] is id
	switch (f)
	{
		case SPH_FIELDF_HIT_COUNT: return load_int(in);
		case SPH_FIELDF_LCS: return load_int(in + 2);
		case SPH_FIELDF_WORD_COUNT: return load_int(in + 3);
		case SPH_FIELDF_TF_IDF: return load_int(in + 4);
		case SPH_FIELDF_MIN_IDF: return load_int(in + 5);
		case SPH_FIELDF_MAX_IDF: return load_int(in + 6);
		case SPH_FIELDF_SUM_IDF: return load_int(in + 7);
		case SPH_FIELDF_MIN_HIT_POS: return load_int(in + 8);
		case SPH_FIELDF_MIN_BEST_SPAN_POS: return load_int(in + 9);
		case SPH_FIELDF_MAX_WINDOW_HITS: return load_int(in + 10);
		case SPH_FIELDF_MIN_GAPS: return load_int(in + 11);
		case SPH_FIELDF_ATC: return load_int(in + 12);
		case SPH_FIELDF_LCCS: return load_int(in + 13);
		case SPH_FIELDF_WLCCS: return load_int(in + 14);
		case SPH_FIELDF_SUM_IDF_BOOST: return load_int(in + 15);
		case SPH_FIELDF_IS_NOUN_HITS: return load_int(in + 16);
		case SPH_FIELDF_IS_LATIN_HITS: return load_int(in + 17);
		case SPH_FIELDF_IS_NUMBER_HITS: return load_int(in + 18);
		case SPH_FIELDF_HAS_DIGIT_HITS: return load_int(in + 19);
		case SPH_FIELDF_TRF_QT: return load_int(in + 20);
		case SPH_FIELDF_TRF_I2U: return load_int(in + 21);
		case SPH_FIELDF_TRF_I2Q: return load_int(in + 22);
		case SPH_FIELDF_TRF_I2F: return load_int(in + 23);
		case SPH_FIELDF_TRF_AQT: return load_int(in + 24);
		case SPH_FIELDF_TRF_NAQT: return load_int(in + 25);
		case SPH_FIELDF_PHRASE_DECAY10: return load_int(in + 26);
		case SPH_FIELDF_PHRASE_DECAY30: return load_int(in + 27);
		case SPH_FIELDF_WORDPAIR_CTR: return load_int(in + 28);
		case SPH_FIELDF_BPE_QT: return load_int(in + 29); // TODO: bpe: check that fields are required
		case SPH_FIELDF_BPE_I2U: return load_int(in + 30);
		case SPH_FIELDF_BPE_I2Q: return load_int(in + 31);
		case SPH_FIELDF_BPE_I2F: return load_int(in + 32);
		case SPH_FIELDF_BPE_AQT: return load_int(in + 33);
		case SPH_FIELDF_BPE_NAQT: return load_int(in + 34);
	}
	return 0;
}


int sphinx_get_term_factor_int(const unsigned int * in, enum sphinx_term_factor f)
{
	if (!in)
		return 0;
	switch (f)
	{
		case SPH_TERMF_KEYWORD_MASK: return load_int(in);
		case SPH_TERMF_TF: return load_int(in + 2);
		case SPH_TERMF_IDF: return load_int(in + 3);
		case SPH_TERMF_IDF_BOOST: return load_int(in + 4);
		case SPH_TERMF_FLAGS: return load_int(in + 5);
	}
	return 0;
}


float sphinx_get_field_factor_float(const unsigned int * in, enum sphinx_field_factor f)
{
	int r = sphinx_get_field_factor_int(in, f);
	return load_float(&r);
}


float sphinx_get_term_factor_float(const unsigned int * in, enum sphinx_term_factor f)
{
	int r = sphinx_get_term_factor_int(in, f);
	return load_float(&r);
}


const unsigned int * sphinx_get_query_factors(const unsigned int * in)
{
	in = skip_fields(in, load_int(in + 5));
	in = skip_terms(in, load_int(in));
	return in;
}


int sphinx_get_query_factor_int(const unsigned int * in, enum sphinx_query_factor f)
{
	switch (f)
	{
		case SPH_QUERYF_MAX_LCS: return load_int(in);
		case SPH_QUERYF_WORD_COUNT: return load_int(in + 1);
		case SPH_QUERYF_IS_NOUN_WORDS: return load_int(in + 2);
		case SPH_QUERYF_IS_LATIN_WORDS: return load_int(in + 3);
		case SPH_QUERYF_IS_NUMBER_WORDS: return load_int(in + 4);
		case SPH_QUERYF_HAS_DIGIT_WORDS: return load_int(in + 5);
		case SPH_QUERYF_MAX_IDF: return load_int(in + 6);
		case SPH_QUERYF_MIN_IDF: return load_int(in + 7);
		case SPH_QUERYF_SUM_IDF: return load_int(in + 8);
		case SPH_QUERYF_WORDS_CLICKSTAT: return load_int(in + 9);
		case SPH_QUERYF_TOKCLASS_MASK: return load_int(in + 10);
	}
	return 0;
}


float sphinx_get_query_factor_float(const unsigned int * in, enum sphinx_query_factor f)
{
	int r = sphinx_get_query_factor_int(in, f);
	return load_float(&r);
}

//
// $Id$
//
