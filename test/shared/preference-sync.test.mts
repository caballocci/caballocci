import assert from 'node:assert/strict'
import test from 'node:test'
import { optionalIntegrationsPreferenceKey, preferencesToSyncFromStorage } from '../../src/shared/preference-sync.ts'

test('los accesos rápidos no se reenvían desde localStorage al arrancar', () => {
  const synced = preferencesToSyncFromStorage({
    'caballocci.collection-label-date': '2026-11-24',
    [optionalIntegrationsPreferenceKey]: '[{"id":"primero"}]',
  })

  assert.deepEqual(synced, { 'caballocci.collection-label-date': '2026-11-24' })
})

test('las demás preferencias locales siguen subiendo a la base de datos', () => {
  const entries = {
    'caballocci.collection-label-date': '2026-11-24',
    'caballocci.post-date-marks': '{}',
  }

  assert.deepEqual(preferencesToSyncFromStorage(entries), entries)
})
