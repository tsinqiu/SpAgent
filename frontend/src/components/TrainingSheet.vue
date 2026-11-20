<template>
  <dialog
    ref="dialog"
    class="training-sheet-dialog"
    :aria-label="label"
    @cancel.prevent="$emit('dismiss')"
    @click.self="$emit('dismiss')"
    @keydown.tab="wrapFocus"
  >
    <slot />
  </dialog>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

defineProps({ label: { type: String, required: true } })
defineEmits(['dismiss'])

const dialog = ref(null)
function wrapFocus(event) {
  const controls = Array.from(dialog.value.querySelectorAll('a[href], button, input, select, textarea, [tabindex]'))
    .filter(control => control.tabIndex >= 0 && !control.matches(':disabled') && control.getClientRects().length)
  if (event.shiftKey ? document.activeElement === controls[0] : document.activeElement === controls.at(-1)) {
    event.preventDefault()
    const target = event.shiftKey ? controls.at(-1) : controls[0]
    target?.focus()
  }
}
onMounted(() => dialog.value.showModal())
onBeforeUnmount(() => dialog.value?.close())
</script>

<style scoped>
.training-sheet-dialog {
  box-sizing: border-box;
  inset: auto 0 0;
  width: min(100%, var(--phone-max));
  max-width: none;
  margin: 0 auto;
  padding: 12px 12px calc(12px + var(--safe-bottom));
  border: 0;
  color: var(--text);
  background: transparent;
}
.training-sheet-dialog[open] { animation: sheet-enter 150ms cubic-bezier(0.2, 0.7, 0.3, 1); }
.training-sheet-dialog::backdrop { background: rgb(6 20 14 / 0.34); }
@keyframes sheet-enter { from { transform: translateY(12px); opacity: 0.86; } }
@media (min-width: 540px) {
  .training-sheet-dialog { bottom: 24px; width: min(calc(100% - 48px), 540px); }
}
@media (prefers-reduced-motion: reduce) {
  .training-sheet-dialog[open] { animation: none; }
}
</style>
