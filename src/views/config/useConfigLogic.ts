import { ref, watch } from 'vue'
import { useConfigStore } from '@/stores/config'

export function useConfigLogic() {
  const store = useConfigStore()

  const apiBaseUrl = ref(store.config.apiBaseUrl)
  const apiKey = ref(store.config.apiKey)
  const syncConcurrency = ref(store.config.syncConcurrency)
  const requestDelay = ref(store.config.requestDelay)

  const saved = ref(false)

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

  return {
    apiBaseUrl,
    apiKey,
    syncConcurrency,
    requestDelay,
    saved,
    save,
    reset,
  }
}
