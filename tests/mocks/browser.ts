// Browser API mocks for testing

// Mock IndexedDB
const mockIDBRequest = {
  result: null,
  error: null,
  onsuccess: null,
  onerror: null,
  onupgradeneeded: null,
};

const mockIDBDatabase = {
  createObjectStore: jest.fn(),
  transaction: jest.fn(() => ({
    objectStore: jest.fn(() => ({
      add: jest.fn(() => mockIDBRequest),
      get: jest.fn(() => mockIDBRequest),
      put: jest.fn(() => mockIDBRequest),
      delete: jest.fn(() => mockIDBRequest),
      clear: jest.fn(() => mockIDBRequest),
      openCursor: jest.fn(() => mockIDBRequest),
    })),
    oncomplete: null,
    onerror: null,
  })),
  close: jest.fn(),
};

global.indexedDB = {
  open: jest.fn(() => ({
    ...mockIDBRequest,
    result: mockIDBDatabase,
  })),
  deleteDatabase: jest.fn(() => mockIDBRequest),
  databases: jest.fn(() => Promise.resolve([])),
} as any;

// Mock Web Workers
global.Worker = jest.fn().mockImplementation(() => ({
  postMessage: jest.fn(),
  terminate: jest.fn(),
  onmessage: null,
  onerror: null,
}));

// Mock Blob and File constructors
global.Blob = jest.fn().mockImplementation((parts, options) => ({
  size: parts?.reduce((total: number, part: any) => total + (part.length || 0), 0) || 0,
  type: options?.type || '',
  arrayBuffer: jest.fn(() => Promise.resolve(new ArrayBuffer(0))),
  text: jest.fn(() => Promise.resolve('')),
  stream: jest.fn(),
  slice: jest.fn(() => new Blob()),
}));

global.File = jest.fn().mockImplementation((parts, name, options) => ({
  ...new Blob(parts, options),
  name,
  lastModified: Date.now(),
  webkitRelativePath: '',
}));

// Mock FileReader
global.FileReader = jest.fn().mockImplementation(() => ({
  readAsDataURL: jest.fn(),
  readAsText: jest.fn(),
  readAsArrayBuffer: jest.fn(),
  result: null,
  error: null,
  onload: null,
  onerror: null,
  onprogress: null,
}));

// Mock fetch for API calls
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    blob: () => Promise.resolve(new Blob()),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    headers: new Map(),
  })
) as jest.Mock;

// Mock performance API
global.performance = {
  ...global.performance,
  now: jest.fn(() => Date.now()),
  mark: jest.fn(),
  measure: jest.fn(),
  getEntriesByName: jest.fn(() => []),
  getEntriesByType: jest.fn(() => []),
} as any;

// Mock WebAssembly for FFmpeg.wasm
global.WebAssembly = {
  instantiate: jest.fn(() => Promise.resolve({ instance: {}, module: {} })),
  compile: jest.fn(() => Promise.resolve({})),
  validate: jest.fn(() => true),
  Module: jest.fn(),
  Instance: jest.fn(),
  Memory: jest.fn(),
  Table: jest.fn(),
  CompileError: Error,
  RuntimeError: Error,
  LinkError: Error,
} as any;

// Mock SharedArrayBuffer (needed for FFmpeg.wasm)
if (typeof SharedArrayBuffer === 'undefined') {
  (global as any).SharedArrayBuffer = ArrayBuffer;
}

// Mock Atomics (needed for FFmpeg.wasm)
if (typeof Atomics === 'undefined') {
  (global as any).Atomics = {
    add: jest.fn(),
    and: jest.fn(),
    compareExchange: jest.fn(),
    exchange: jest.fn(),
    isLockFree: jest.fn(() => true),
    load: jest.fn(),
    or: jest.fn(),
    store: jest.fn(),
    sub: jest.fn(),
    wait: jest.fn(),
    wake: jest.fn(),
    xor: jest.fn(),
  };
}