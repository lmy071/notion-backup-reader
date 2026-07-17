import { defineStore } from 'pinia'
import { reactive } from 'vue'
// @ts-ignore
import type { AppConfig } from '@/types'

const STORAGE_KEY = 'notion-config'

function getDefaultConfig(): AppConfig {
  return {
    apiBaseUrl: '',
    apiKey: '',
    syncConcurrency: 2,
    requestDelay: 350,
    enableDbImport: false,
  }
}

function isAppConfig(value: unknown): value is AppConfig {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.apiBaseUrl === 'string' &&
    typeof obj.apiKey === 'string' &&
    typeof obj.syncConcurrency === 'number' &&
    typeof obj.requestDelay === 'number' &&
    typeof obj.enableDbImport === 'boolean'
  )
}

export const useConfigStore = defineStore('config', () => {
  const config = reactive<AppConfig>(loadFromStorage())

  function loadFromStorage(): AppConfig {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        if (isAppConfig(parsed)) {
          return parsed
        }
      }
    } catch {
      // corrupted data — fall through to defaults
    }
    return getDefaultConfig()
  }

  function save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config }))
    } catch {
      // quota exceeded — ignore silently
    }
  }

  function reset(): void {
    const defaults = getDefaultConfig()
    config.apiBaseUrl = defaults.apiBaseUrl
    config.apiKey = defaults.apiKey
    config.syncConcurrency = defaults.syncConcurrency
    config.requestDelay = defaults.requestDelay
    config.enableDbImport = defaults.enableDbImport
    save()
  }

  return { config, loadFromStorage, save, reset }
})
