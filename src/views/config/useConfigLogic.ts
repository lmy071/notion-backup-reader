import { ref } from 'vue'
import { useConfigStore } from '@/stores/config'
import { createMcpClient } from '@/services/mcp'

export function useConfigLogic() {
  const store = useConfigStore()

  const apiBaseUrl = ref(store.config.apiBaseUrl)
  const apiKey = ref(store.config.apiKey)
  const syncConcurrency = ref(store.config.syncConcurrency)
  const requestDelay = ref(store.config.requestDelay)

  const saved = ref(false)
  const testing = ref(false)
  const testResult = ref<{ ok: boolean; message: string } | null>(null)

  function save() {
    store.config.apiBaseUrl = apiBaseUrl.value
    store.config.apiKey = apiKey.value
    store.config.syncConcurrency = syncConcurrency.value
    store.config.requestDelay = requestDelay.value
    store.save()
    saved.value = true
    setTimeout(() => { saved.value = false }, 2000)
  }

  function reset() {
    store.reset()
    apiBaseUrl.value = store.config.apiBaseUrl
    apiKey.value = store.config.apiKey
    syncConcurrency.value = store.config.syncConcurrency
    requestDelay.value = store.config.requestDelay
  }

  async function testConnection() {
    if (!apiKey.value.trim()) {
      testResult.value = { ok: false, message: '请先填写 Notion Integration Token' }
      return
    }
    testing.value = true
    testResult.value = null
    try {
      const client = createMcpClient(apiKey.value.trim())
      testResult.value = await client.testConnection()
    } catch (e) {
      testResult.value = { ok: false, message: e instanceof Error ? e.message : String(e) }
    } finally {
      testing.value = false
    }
  }

  return {
    apiBaseUrl,
    apiKey,
    syncConcurrency,
    requestDelay,
    saved,
    testing,
    testResult,
    save,
    reset,
    testConnection,
  }
}
