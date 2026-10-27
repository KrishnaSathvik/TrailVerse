import '@testing-library/jest-dom/vitest';

// Node 25+ defines its own `localStorage`/`sessionStorage` globals, which are
// undefined without --localstorage-file and shadow jsdom's Storage. Install an
// in-memory Storage only when the environment didn't provide a usable one.
class MemoryStorage {
  #items = new Map();

  get length() {
    return this.#items.size;
  }

  key(index) {
    return [...this.#items.keys()][index] ?? null;
  }

  getItem(key) {
    return this.#items.has(String(key)) ? this.#items.get(String(key)) : null;
  }

  setItem(key, value) {
    this.#items.set(String(key), String(value));
  }

  removeItem(key) {
    this.#items.delete(String(key));
  }

  clear() {
    this.#items.clear();
  }
}

for (const name of ['localStorage', 'sessionStorage']) {
  if (typeof window !== 'undefined' && typeof window[name]?.getItem !== 'function') {
    const storage = new MemoryStorage();
    Object.defineProperty(window, name, { value: storage, configurable: true, writable: true });
    Object.defineProperty(globalThis, name, { value: storage, configurable: true, writable: true });
  }
}
