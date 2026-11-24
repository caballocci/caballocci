export const optionalIntegrationsPreferenceKey = 'caballocci.optional-integrations'

// Estas preferencias se escriben primero en SQLite y se reflejan después en localStorage.
// En el arranque no deben reenviarse desde localStorage: una copia desactualizada
// sobrescribiría en la base de datos la lista completa de accesos rápidos.
const databaseAuthoritativeKeys = new Set([optionalIntegrationsPreferenceKey])

export function preferencesToSyncFromStorage(current: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(current).filter(([key]) => !databaseAuthoritativeKeys.has(key)))
}
