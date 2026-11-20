import { computed, onMounted, ref } from 'vue'
import { readSavedValue } from '@/services/browserStorage'

const THEME_STORAGE_KEY = 'spagent-theme'
const theme = ref('day')

function normalizeTheme(value) {
  return value === 'night' ? 'night' : 'day'
}

export function applyTheme(nextTheme) {
  theme.value = normalizeTheme(nextTheme)
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme.value
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(THEME_STORAGE_KEY, theme.value)
  }
}

export function initTheme() {
  const stored = typeof localStorage !== 'undefined'
    ? readSavedValue(localStorage, THEME_STORAGE_KEY)
    : 'day'
  applyTheme(stored || 'day')
}

export function useThemeMode() {
  const isNightTheme = computed(() => theme.value === 'night')

  function toggleTheme() {
    applyTheme(isNightTheme.value ? 'day' : 'night')
  }

  onMounted(initTheme)

  return {
    theme,
    isNightTheme,
    toggleTheme,
    applyTheme,
  }
}
