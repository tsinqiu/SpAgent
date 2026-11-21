import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

export function installTouchFeedback() {
  if (!Capacitor.isNativePlatform()) return
  document.addEventListener('click', (event) => {
    if (!event.isTrusted || event.detail === 0 || !(event.target instanceof Element)) return
    const action = event.target.closest('[data-haptic]')
    if (!action || action.matches(':disabled,[aria-disabled="true"]')) return
    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
  }, { capture: true, passive: true })
}
