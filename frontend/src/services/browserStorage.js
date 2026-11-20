const legacyKeys = new Map([
  ['spagent-token', 'motion-analysis-token'],
  ['spagent-theme', 'motion-analysis-theme'],
  ['spagent-athlete-profile', 'motioncare-athlete-profile'],
  ['spagent-my-routes', 'motioncare-my-routes'],
  ['spagent-activity-self-review', 'motioncare-activity-self-review'],
])

function getLegacyKey(key) {
  const separator = key.indexOf(':')
  const namespace = separator < 0 ? key : key.slice(0, separator)
  const previous = legacyKeys.get(namespace)
  return previous && (separator < 0 ? previous : previous + key.slice(separator))
}

export function readSavedValue(storage, key) {
  const value = storage.getItem(key)
  const previous = getLegacyKey(key)
  if (value !== null || !previous) return value

  const saved = storage.getItem(previous)
  if (saved !== null) {
    storage.setItem(key, saved)
    storage.removeItem(previous)
  }
  return saved
}

export function clearSavedValue(storage, key) {
  storage.removeItem(key)
  const previous = getLegacyKey(key)
  if (previous) storage.removeItem(previous)
}
