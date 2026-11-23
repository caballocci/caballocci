import type { TestContext } from 'node:test'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)) },
    removeItem: (key: string) => { values.delete(key) },
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size },
  }
}

/** Instala almacenamientos aislados por test y los retira al terminar. */
export function installStorageMocks(t: TestContext) {
  const local = memoryStorage()
  const session = memoryStorage()

  Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true, writable: true })
  Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true, writable: true })
  t.after(() => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    Reflect.deleteProperty(globalThis, 'sessionStorage')
  })

  return { local, session }
}
