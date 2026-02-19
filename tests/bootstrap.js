'use strict';

const path = require('path');
const Module = require('module');
const nodeTest = require('node:test');

const matcherTypeSymbol = Symbol('matcherType');
const matcherAny = 'any';
const matcherObjectContaining = 'objectContaining';
const trackedSpies = new Set();
const trackedMocks = new Set();

function getCallerFile() {
  const previous = Error.prepareStackTrace;
  Error.prepareStackTrace = (_, stack) => stack;
  const err = {};
  Error.captureStackTrace(err, getCallerFile);
  const stack = err.stack || [];
  Error.prepareStackTrace = previous;

  for (const callSite of stack) {
    const fileName = callSite && typeof callSite.getFileName === 'function' ? callSite.getFileName() : null;
    if (!fileName) continue;
    if (fileName === __filename) continue;
    if (fileName.includes('node:internal')) continue;
    return fileName;
  }

  return path.join(process.cwd(), 'index.js');
}

function createMockFunction(implementation) {
  const mockFn = function mockFnWrapper(...args) {
    mockFn.mock.calls.push(args);
    mockFn.mock.instances.push(this);
    return mockFn._implementation.apply(this, args);
  };

  mockFn._implementation = typeof implementation === 'function' ? implementation : () => undefined;
  mockFn.mock = { calls: [], instances: [] };

  mockFn.mockImplementation = (nextImplementation) => {
    mockFn._implementation = typeof nextImplementation === 'function' ? nextImplementation : () => undefined;
    return mockFn;
  };

  mockFn.mockResolvedValue = (value) => {
    mockFn._implementation = () => Promise.resolve(value);
    return mockFn;
  };

  mockFn.mockRejectedValue = (error) => {
    mockFn._implementation = () => Promise.reject(error);
    return mockFn;
  };

  mockFn.mockReturnValue = (value) => {
    mockFn._implementation = () => value;
    return mockFn;
  };

  mockFn.mockClear = () => {
    mockFn.mock.calls = [];
    mockFn.mock.instances = [];
    return mockFn;
  };

  mockFn.mockReset = () => {
    mockFn.mockClear();
    mockFn._implementation = () => undefined;
    return mockFn;
  };

  trackedMocks.add(mockFn);
  return mockFn;
}

function spyOn(target, methodName) {
  if (!target || typeof target[methodName] !== 'function') {
    throw new Error(`Cannot spy on ${String(methodName)}`);
  }

  const original = target[methodName];
  const spy = createMockFunction(function callOriginal(...args) {
    return original.apply(this, args);
  });

  const restore = () => {
    target[methodName] = original;
    trackedSpies.delete(restore);
  };

  spy.mockRestore = restore;
  trackedSpies.add(restore);
  target[methodName] = spy;

  return spy;
}

function resolveFromCaller(modulePath) {
  const caller = getCallerFile();
  return require.resolve(modulePath, { paths: [path.dirname(caller)] });
}

function mock(modulePath, factory) {
  const resolvedPath = resolveFromCaller(modulePath);
  const exportsValue = typeof factory === 'function' ? factory() : factory;
  const mockedModule = new Module(resolvedPath, module);
  mockedModule.filename = resolvedPath;
  mockedModule.paths = Module._nodeModulePaths(path.dirname(resolvedPath));
  mockedModule.loaded = true;
  mockedModule.exports = exportsValue;
  require.cache[resolvedPath] = mockedModule;
}

function restoreAllMocks() {
  for (const restore of Array.from(trackedSpies)) {
    restore();
  }
}

function clearAllMocks() {
  for (const mockFn of trackedMocks) {
    mockFn.mockClear();
  }
}

function resetAllMocks() {
  for (const mockFn of trackedMocks) {
    mockFn.mockReset();
  }
}

function createAnyMatcher(ctor) {
  return {
    [matcherTypeSymbol]: matcherAny,
    ctor,
  };
}

function createObjectContainingMatcher(sample) {
  return {
    [matcherTypeSymbol]: matcherObjectContaining,
    sample,
  };
}

function isMatcher(value) {
  return value && typeof value === 'object' && value[matcherTypeSymbol];
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function matchesAny(received, ctor) {
  if (ctor === String) return typeof received === 'string' || received instanceof String;
  if (ctor === Number) return typeof received === 'number' || received instanceof Number;
  if (ctor === Boolean) return typeof received === 'boolean' || received instanceof Boolean;
  if (ctor === Function) return typeof received === 'function';
  if (ctor === Array) return Array.isArray(received);
  if (ctor === Object) return isObject(received);
  return received instanceof ctor;
}

function deepEqual(received, expected) {
  if (isMatcher(expected)) {
    if (expected[matcherTypeSymbol] === matcherAny) {
      return matchesAny(received, expected.ctor);
    }
    if (expected[matcherTypeSymbol] === matcherObjectContaining) {
      return matchesSubset(received, expected.sample);
    }
  }

  if (Object.is(received, expected)) return true;

  if (Array.isArray(expected)) {
    if (!Array.isArray(received)) return false;
    if (received.length !== expected.length) return false;
    for (let i = 0; i < expected.length; i += 1) {
      if (!deepEqual(received[i], expected[i])) return false;
    }
    return true;
  }

  if (isObject(expected)) {
    if (!isObject(received) || Array.isArray(received)) return false;
    const expectedKeys = Object.keys(expected);
    const receivedKeys = Object.keys(received);
    if (receivedKeys.length !== expectedKeys.length) return false;
    for (const key of expectedKeys) {
      if (!Object.prototype.hasOwnProperty.call(received, key)) return false;
      if (!deepEqual(received[key], expected[key])) return false;
    }
    return true;
  }

  return false;
}

function matchesSubset(received, expected) {
  if (isMatcher(expected)) {
    if (expected[matcherTypeSymbol] === matcherAny) {
      return matchesAny(received, expected.ctor);
    }
    if (expected[matcherTypeSymbol] === matcherObjectContaining) {
      return matchesSubset(received, expected.sample);
    }
  }

  if (Object.is(received, expected)) return true;

  if (Array.isArray(expected)) {
    if (!Array.isArray(received)) return false;
    if (received.length !== expected.length) return false;
    for (let i = 0; i < expected.length; i += 1) {
      if (!matchesSubset(received[i], expected[i])) return false;
    }
    return true;
  }

  if (isObject(expected)) {
    if (!isObject(received)) return false;
    for (const key of Object.keys(expected)) {
      if (!Object.prototype.hasOwnProperty.call(received, key)) return false;
      if (!matchesSubset(received[key], expected[key])) return false;
    }
    return true;
  }

  return false;
}

function getPropertyPath(pathValue) {
  if (Array.isArray(pathValue)) return pathValue.map(String);
  const matches = String(pathValue).match(/[^.[\]]+/g);
  return matches ? matches : [];
}

function readPath(target, pathValue) {
  const tokens = getPropertyPath(pathValue);
  let current = target;

  for (const token of tokens) {
    if (current === null || current === undefined) {
      return { exists: false, value: undefined };
    }
    if (!(token in Object(current))) {
      return { exists: false, value: undefined };
    }
    current = current[token];
  }

  return { exists: true, value: current };
}

function buildMatchers(received, negated) {
  const assertResult = (pass, message) => {
    const outcome = negated ? !pass : pass;
    if (!outcome) {
      throw new Error(message);
    }
  };

  const matchers = {
    toBe(expected) {
      assertResult(Object.is(received, expected), `Expected ${JSON.stringify(received)} to be ${JSON.stringify(expected)}`);
    },
    toEqual(expected) {
      assertResult(deepEqual(received, expected), 'Expected values to be deeply equal');
    },
    toMatchObject(expected) {
      assertResult(matchesSubset(received, expected), 'Expected object to match subset');
    },
    toHaveProperty(pathValue, expectedValue) {
      const result = readPath(received, pathValue);
      let pass = result.exists;
      if (pass && arguments.length > 1) {
        pass = deepEqual(result.value, expectedValue);
      }
      assertResult(pass, `Expected property ${String(pathValue)} to exist`);
    },
    toHaveLength(expectedLength) {
      const pass = received !== null
        && received !== undefined
        && typeof received.length === 'number'
        && received.length === expectedLength;
      assertResult(pass, `Expected length ${expectedLength}`);
    },
    toContain(expectedValue) {
      let pass = false;
      if (typeof received === 'string') {
        pass = received.includes(expectedValue);
      } else if (Array.isArray(received)) {
        pass = received.includes(expectedValue);
      }
      assertResult(pass, `Expected to contain ${JSON.stringify(expectedValue)}`);
    },
    toBeGreaterThan(expectedValue) {
      assertResult(received > expectedValue, `Expected ${received} to be greater than ${expectedValue}`);
    },
    toBeGreaterThanOrEqual(expectedValue) {
      assertResult(received >= expectedValue, `Expected ${received} to be greater than or equal to ${expectedValue}`);
    },
    toBeLessThan(expectedValue) {
      assertResult(received < expectedValue, `Expected ${received} to be less than ${expectedValue}`);
    },
    toBeLessThanOrEqual(expectedValue) {
      assertResult(received <= expectedValue, `Expected ${received} to be less than or equal to ${expectedValue}`);
    },
    toBeInstanceOf(expectedCtor) {
      assertResult(received instanceof expectedCtor, `Expected instance of ${expectedCtor && expectedCtor.name ? expectedCtor.name : 'constructor'}`);
    },
    toBeUndefined() {
      assertResult(received === undefined, 'Expected value to be undefined');
    },
    toBeNull() {
      assertResult(received === null, 'Expected value to be null');
    },
  };

  Object.defineProperty(matchers, 'not', {
    get() {
      return buildMatchers(received, !negated);
    },
  });

  return matchers;
}

function expectValue(received) {
  return buildMatchers(received, false);
}

expectValue.any = createAnyMatcher;
expectValue.objectContaining = createObjectContainingMatcher;

global.describe = nodeTest.describe;
global.it = nodeTest.it || nodeTest.test;
global.test = nodeTest.test;
global.beforeAll = nodeTest.before;
global.afterAll = nodeTest.after;
global.beforeEach = nodeTest.beforeEach;
global.afterEach = nodeTest.afterEach;
global.expect = expectValue;
global.jest = {
  fn: createMockFunction,
  spyOn,
  mock,
  restoreAllMocks,
  clearAllMocks,
  resetAllMocks,
};
