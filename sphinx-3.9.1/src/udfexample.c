//
// $Id$
//

//
// Sphinx UDF function example
//
// Linux
// gcc -fPIC -Wall -Wextra -shared -o udfexample.so udfexample.c
// CREATE FUNCTION sequence RETURNS INT SONAME 'udfexample.so';
// CREATE FUNCTION strtoint RETURNS INT SONAME 'udfexample.so';
// CREATE FUNCTION avgmva RETURNS FLOAT SONAME 'udfexample.so';
// CREATE FUNCTION failtest RETURNS STRING SONAME 'udfexample.so';
//
// Windows
// cl /W4 /MTd /LD udfexample.c
// CREATE FUNCTION sequence RETURNS INT SONAME 'udfexample.dll';
// CREATE FUNCTION strtoint RETURNS INT SONAME 'udfexample.dll';
// CREATE FUNCTION avgmva RETURNS FLOAT SONAME 'udfexample.dll';
// CREATE FUNCTION failtest RETURNS STRING SONAME 'udfexample.dll';
//

#define _CRT_SECURE_NO_WARNINGS

#include "sphinxudf.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#ifdef _MSC_VER
	#define snprintf	_snprintf
	#define DLLEXPORT	__declspec(dllexport)
#else
	#define DLLEXPORT
#endif

#define UNUSED(x) (void)(x);

/// UDF version control
/// gets called once when the library is loaded
DLLEXPORT int udfexample_ver()
{
	return SPH_UDF_VERSION;
}


/// unaligned load
static int load_int(const void * p)
{
	int i;
	memcpy(&i, p, sizeof(i));
	return i;
}


/// unaligned store
static void store_int(void * p, int i)
{
	memcpy(p, &i, sizeof(i));
}

//////////////////////////////////////////////////////////////////////////
// EXAMPLE: SEQUENCE() FUNCTION, WITH A STATEFUL COUNTER
//////////////////////////////////////////////////////////////////////////

/// UDF initialization
/// gets called on every query, when query begins
/// args are filled with values for a particular query
DLLEXPORT int sequence_init(SPH_UDF_INIT * init, SPH_UDF_ARGS * args, char * error_message)
{
	// check argument count
	if (args->arg_count > 1)
	{
		snprintf(error_message, SPH_UDF_ERROR_LEN, "SEQUENCE() takes either 0 or 1 arguments");
		return 1;
	}

	// check argument type
	if (args->arg_count && args->arg_types[0] != SPH_UDF_TYPE_UINT32)
	{
		snprintf(error_message, SPH_UDF_ERROR_LEN, "SEQUENCE() requires 1st argument to be uint");
		return 1;
	}

	// allocate and init counter storage
	init->func_data = (void *)malloc(sizeof(int));
	if (!init->func_data)
	{
		snprintf(error_message, SPH_UDF_ERROR_LEN, "malloc() failed");
		return 1;
	}
	store_int(init->func_data, 1);

	// all done
	return 0;
}


/// UDF deinitialization
/// gets called on every query, when query ends
DLLEXPORT void sequence_deinit(SPH_UDF_INIT * init)
{
	// deallocate storage
	if (init->func_data)
	{
		free(init->func_data);
		init->func_data = NULL;
	}
}


/// UDF implementation
/// gets called for every row, unless optimized away
DLLEXPORT sphinx_int64_t sequence(SPH_UDF_INIT * init, SPH_UDF_ARGS * args, char * error_message)
{
	UNUSED(error_message);
	int res = load_int(init->func_data);
	store_int(init->func_data, res + 1);
	if (args->arg_count)
		res += load_int(args->arg_values);
	return res;
}

//////////////////////////////////////////////////////////////////////////
// EXAMPLE: STRTOINT() FUNCTION, SIMPLE AND STATELESS
//////////////////////////////////////////////////////////////////////////

DLLEXPORT int strtoint_init(SPH_UDF_INIT * init, SPH_UDF_ARGS * args, char * error_message)
{
	UNUSED(init);
	if (args->arg_count != 1 || args->arg_types[0] != SPH_UDF_TYPE_STRING)
	{
		snprintf(error_message, SPH_UDF_ERROR_LEN, "STRTOINT() requires 1 string argument");
		return 1;
	}
	return 0;
}


DLLEXPORT sphinx_int64_t strtoint(SPH_UDF_INIT * init, SPH_UDF_ARGS * args, char * error_message)
{
	UNUSED(init);
	UNUSED(error_message);
	const char * s = args->arg_values[0];
	int len = args->str_lengths[0], res = 0;

	while (len > 0 && *s >= '0' && *s <= '9')
	{
		res += *s - '0';
		len--;
	}

	return res;
}

//////////////////////////////////////////////////////////////////////////
// EXAMPLE: AVGMVA() FUNCTION, POLYMORPHIC, AND WITH MVA TYPES
//////////////////////////////////////////////////////////////////////////

DLLEXPORT int avgmva_init(SPH_UDF_INIT * init, SPH_UDF_ARGS * args, char * error_message)
{
	if (args->arg_count != 1 ||
		(args->arg_types[0] != SPH_UDF_TYPE_UINT32SET && args->arg_types[0] != SPH_UDF_TYPE_INT64SET))
	{
		snprintf(error_message, SPH_UDF_ERROR_LEN, "AVGMVA() requires 1 MVA argument");
		return 1;
	}

	// store our mva vs mva64 flag to func_data
	init->func_data = (void *)(long long int)(args->arg_types[0] == SPH_UDF_TYPE_INT64SET ? 1 : 0);
	return 0;
}


DLLEXPORT double avgmva(SPH_UDF_INIT * init, SPH_UDF_ARGS * args, char * error_message)
{
	UNUSED(error_message);
	double res = 0;
	int i, is64;
	int len = args->str_lengths[0]; // since 3.0, element count is passed here

	if (!args->arg_values[0])
		return res;

	is64 = (long long int)(init->func_data) != 0;
	if (is64)
	{
		// handle mva64
		sphinx_uint64_t * mva = (sphinx_uint64_t *)args->arg_values[0];
		for (i = 0; i < len; i++)
			res += *mva++; // NOTE: unaligned load
	} else
	{
		// handle mva32
		unsigned int * mva = (unsigned int *)args->arg_values[0];
		for (i = 0; i < len; i++)
			res += *mva++; // NOTE: unaligned load
	}

	return res / len;
}

//////////////////////////////////////////////////////////////////////////
// EXAMPLE: FAILTEST() FUNCTION, STOPS PROCESSING AFTER 3 ROWS
//////////////////////////////////////////////////////////////////////////

DLLEXPORT int failtest_init(SPH_UDF_INIT * init, SPH_UDF_ARGS * args, char * error_message)
{
	if (args->arg_count != 0)
	{
		snprintf(error_message, SPH_UDF_ERROR_LEN, "FAILTEST() takes 0 arguments");
		return 1;
	}

	// allocate counter storage, init counter
	init->func_data = (void *)malloc(sizeof(int));
	if (!init->func_data)
	{
		snprintf(error_message, SPH_UDF_ERROR_LEN, "malloc() failed");
		return 1;
	}
	store_int(init->func_data, 1);

	return 0;
}


DLLEXPORT char * failtest(SPH_UDF_INIT * init, SPH_UDF_ARGS * args, char * error_message)
{
	int a = load_int(init->func_data);
	store_int(init->func_data, a + 1);

	if (a < 4)
	{
		// IMPORTANT!
		// note that strings we return to Sphinx MUST be allocated using fn_malloc!
		char * res = args->fn_malloc(16);
		snprintf(res, 16, "val%d", a);
		return res;
	}

	if (a == 4)
	{
		// starting with UDF version 12, we can emit an error message from the main
		// UDF function too, and not just a 1-byte flag
		snprintf(error_message, SPH_UDF_ERROR_LEN, "err%d", a); // expected error
		return NULL;
	}

	// this must never get called
	// because the engine guarantees to stop calling UDF once we reported an error
	// however, to test that the engine does, lets test
	char * res = args->fn_malloc(16);
	snprintf(res, 16, "wtf%d", a);
	return res;
}


DLLEXPORT void failtest_deinit(SPH_UDF_INIT * init)
{
	// deallocate storage
	if (init->func_data)
	{
		free(init->func_data);
		init->func_data = NULL;
	}
}

//////////////////////////////////////////////////////////////////////////
// EXAMPLE: BATCHTEST()
//////////////////////////////////////////////////////////////////////////

DLLEXPORT int batchtest_init(SPH_UDF_INIT * init, SPH_UDF_ARGS * args, char * error_message)
{
	UNUSED(init);
	if (args->arg_count != 1 || args->arg_types[0] != SPH_UDF_TYPE_FLOAT_VEC)
	{
		snprintf(error_message, SPH_UDF_ERROR_LEN, "BATCHTEST() requires exactly one FLOAT_VEC argument");
		return 1;
	}

	return 0;
}


DLLEXPORT void batchtest_batch(SPH_UDF_INIT * init, SPH_UDF_ARGS * args, float * results,
	int batch_size, char * error_message)
{
	UNUSED(init);
	UNUSED(error_message);

	for (int i = 0; i < batch_size; i++)
	{
		float * fvec = (float *)args->arg_values[i];
		int len = args->str_lengths[i];

		float res = 0.0f;
		for (int j = 0; j < len; j++)
			res += fvec[j];

		results[i] = res;
	}
}

//////////////////////////////////////////////////////////////////////////
// EXAMPLE: BATCHSIZETEST()
//////////////////////////////////////////////////////////////////////////

DLLEXPORT int batchsizetest_init(SPH_UDF_INIT * init, SPH_UDF_ARGS * args, char * error_message)
{
	UNUSED(init);
	UNUSED(args);
	UNUSED(error_message);
	return 0;
}


/// Returns batch size
DLLEXPORT void batchsizetest_batch(SPH_UDF_INIT * init, SPH_UDF_ARGS * args, int * results,
	int batch_size, char * error_message)
{
	UNUSED(init);
	UNUSED(error_message);
	UNUSED(args);
	for (int i = 0; i < batch_size; ++i)
		results[i] = batch_size;
}


// FIXME! add a ranker plugin example?

//
// $Id$
//
