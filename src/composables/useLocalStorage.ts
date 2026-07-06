import { ref, type Ref, watch } from 'vue'

export function useLocalStorage<T>(key: string, defaultValue: T): Ref<T> {
  const stored = localStorage.getItem(key)

  let parsed: T
  if (stored !== null) {
    try {
      parsed = JSON.parse(stored) as T
    } catch {
      parsed = defaultValue
    }
  } else {
    parsed = defaultValue
  }

  const value = ref<T>(parsed) as Ref<T>

  watch(
    value,
    (newValue) => {
      try {
        localStorage.setItem(key, JSON.stringify(newValue))
      } catch {
        // localStorage write failed (e.g. quota exceeded) — ignore silently
      }
    },
    { deep: true },
  )

  return value
}
