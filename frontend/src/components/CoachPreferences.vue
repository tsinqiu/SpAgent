<template>
  <Teleport defer to="#coach-navbar-actions">
    <button
      ref="trigger"
      type="button"
      class="coach-preferences__trigger"
      :aria-label="'教练设置，当前角色：' + selectedLabel"
      aria-haspopup="dialog"
      aria-controls="coach-preferences"
      :aria-expanded="open"
      data-haptic
      @click="show"
    >
      <Ellipsis :size="23" aria-hidden="true" />
    </button>
  </Teleport>

  <dialog
    id="coach-preferences"
    ref="dialog"
    class="coach-preferences"
    aria-labelledby="coach-preferences-title"
    @click.self="close"
    @close="handleClose"
  >
    <form class="coach-preferences__form" @submit.prevent="save">
      <header class="coach-preferences__header">
        <h2 id="coach-preferences-title">教练设置</h2>
        <button
          class="workspace-button"
          type="button"
          aria-label="关闭教练设置"
          autofocus
          data-haptic
          @click="close"
        >
          <X :size="22" aria-hidden="true" />
        </button>
      </header>

      <div class="coach-preferences__body">
        <fieldset class="coach-preferences__roles">
          <legend>教练角色</legend>
          <label v-for="role in roles" :key="role.key" class="coach-preferences__role">
            <input
              v-model="draft.role"
              class="coach-preferences__radio"
              type="radio"
              name="coach-role"
              :value="role.key"
              data-haptic
            />
            <component :is="role.icon" :size="19" class="coach-preferences__icon" aria-hidden="true" />
            <span>{{ role.label }}</span>
            <Check v-if="draft.role === role.key" :size="17" class="coach-preferences__check" aria-hidden="true" />
          </label>
        </fieldset>

        <div class="coach-preferences__instructions">
          <div class="coach-preferences__instruction-heading">
            <label for="coach-instructions">自定义指令</label>
            <span aria-hidden="true">{{ draft.instructions.length }} / {{ maxInstructions }}</span>
          </div>
          <textarea
            id="coach-instructions"
            v-model="draft.instructions"
            :maxlength="maxInstructions"
            aria-describedby="coach-instructions-hint"
            rows="5"
            placeholder="例如：先给结论，再用两三条要点说明。"
          ></textarea>
          <p id="coach-instructions-hint">最多 {{ maxInstructions }} 字。保存后应用到新消息。</p>
        </div>

        <section class="coach-preferences__memories" aria-label="教练长期记忆">
          <div class="coach-preferences__instruction-heading">
            <span class="coach-preferences__section-title">教练记住的关于你</span>
            <span>{{ memories.length }} 条</span>
          </div>
          <p class="coach-preferences__memory-hint">对话中提到的目标、伤病或偏好会自动记住，跨对话生效。</p>
          <div class="coach-preferences__memory-add">
            <input
              v-model="newMemory"
              type="text"
              maxlength="200"
              placeholder="添加记忆（如：半马目标破 1:18）"
              @keydown.enter.prevent="addMemory"
            />
            <button type="button" :disabled="memoryBusy || !newMemory.trim()" data-haptic @click="addMemory">
              记住
            </button>
          </div>
          <p v-if="memoryError" class="coach-preferences__error" role="alert">{{ memoryError }}</p>
          <p v-else-if="memoriesLoading" class="coach-preferences__memory-empty">正在读取记忆…</p>
          <p v-else-if="!memories.length" class="coach-preferences__memory-empty">暂无长期记忆。</p>
          <ul v-else class="coach-preferences__memory-list">
            <li v-for="item in memories" :key="item.id">
              <div class="coach-preferences__memory-body">
                <span class="coach-preferences__memory-tag">{{ item.categoryLabel }}</span>
                <p>{{ item.content }}</p>
              </div>
              <button
                type="button"
                class="coach-preferences__memory-del"
                :disabled="memoryBusy"
                :aria-label="'删除记忆：' + item.content"
                data-haptic
                @click="removeMemory(item.id)"
              >
                <Trash2 :size="15" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </section>
      </div>

      <footer class="coach-preferences__footer">
        <p v-if="saveError" class="coach-preferences__error" role="alert">{{ saveError }}</p>
        <button type="submit" class="coach-preferences__save" :disabled="!accountKey || !changed" data-haptic>
          保存设置
        </button>
      </footer>
    </form>
  </dialog>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Bike, Check, Dumbbell, Ellipsis, Footprints, Sparkles, Trash2, Waves, X } from '@lucide/vue'
import { readSavedValue } from '@/services/browserStorage'
import { createCoachMemory, deleteCoachMemory, listCoachMemories } from '@/services/coachAgent'
import { authSession } from '@/stores/authStore'

const maxInstructions = 1500
const roles = [
  { key: 'general', label: '综合教练', icon: Sparkles },
  { key: 'running', label: '跑步教练', icon: Footprints },
  { key: 'swimming', label: '游泳教练', icon: Waves },
  { key: 'strength_training', label: '力量教练', icon: Dumbbell },
  { key: 'cycling', label: '骑行教练', icon: Bike },
]

function normalizeProfile(value) {
  return {
    role: roles.some(role => role.key === value?.role) ? value.role : 'general',
    instructions: typeof value?.instructions === 'string'
      ? value.instructions.trim().slice(0, maxInstructions)
      : '',
  }
}

const profile = defineModel({ type: Object, required: true })
const draft = ref(normalizeProfile(profile.value))
const trigger = ref(null)
const dialog = ref(null)
const open = ref(false)
const saveError = ref('')
const memories = ref([])
const memoriesLoading = ref(false)
const memoryBusy = ref(false)
const memoryError = ref('')
const newMemory = ref('')
const accountKey = computed(() => {
  const id = authSession.user?.id
  return id == null ? null : 'spagent-coach-profile:' + id
})
const selectedLabel = computed(() => roles.find(role => role.key === profile.value?.role)?.label || roles[0].label)
const changed = computed(() => draft.value.role !== profile.value?.role ||
  draft.value.instructions.trim() !== profile.value?.instructions)

watch(accountKey, (key) => {
  close()
  let saved = null
  if (key) {
    try {
      saved = JSON.parse(readSavedValue(window.localStorage, key))
    } catch {
      saved = null
    }
  }
  profile.value = normalizeProfile(saved)
}, { immediate: true })

async function refreshMemories() {
  if (!accountKey.value) return
  memoriesLoading.value = true
  memoryError.value = ''
  try {
    memories.value = await listCoachMemories()
  } catch {
    memoryError.value = '暂时无法读取教练记忆。'
  } finally {
    memoriesLoading.value = false
  }
}

async function addMemory() {
  const text = newMemory.value.trim()
  if (!text || memoryBusy.value) return
  memoryBusy.value = true
  memoryError.value = ''
  try {
    const saved = await createCoachMemory({ category: 'note', content: text })
    memories.value = [saved, ...memories.value.filter(item => item.id !== saved.id)]
    newMemory.value = ''
  } catch {
    memoryError.value = '保存记忆失败，请稍后重试。'
  } finally {
    memoryBusy.value = false
  }
}

async function removeMemory(id) {
  if (memoryBusy.value) return
  memoryBusy.value = true
  memoryError.value = ''
  try {
    await deleteCoachMemory(id)
    memories.value = memories.value.filter(item => item.id !== id)
  } catch {
    memoryError.value = '删除记忆失败，请稍后重试。'
  } finally {
    memoryBusy.value = false
  }
}

function show() {
  if (!dialog.value || dialog.value.open) return
  draft.value = normalizeProfile(profile.value)
  saveError.value = ''
  dialog.value.showModal()
  open.value = true
  void refreshMemories()
}

function close() {
  if (!dialog.value?.open) return
  dialog.value.close()
  open.value = false
}

async function handleClose() {
  open.value = false
  await nextTick()
  if (!open.value) trigger.value?.focus({ preventScroll: true })
}

function save() {
  const key = accountKey.value
  if (!key || !changed.value) return
  const saved = normalizeProfile(draft.value)
  try {
    window.localStorage.setItem(key, JSON.stringify(saved))
  } catch {
    saveError.value = '当前设备无法保存设置，请稍后重试。'
    return
  }
  profile.value = saved
  close()
}
</script>

<style scoped>
.coach-preferences__trigger {
  display: inline-grid;
  width: 44px;
  min-height: 44px;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 50%;
  padding: 0;
  background: var(--panel);
  color: var(--text);
  transition: background-color 140ms ease, transform 140ms ease;
}

.coach-preferences__trigger:hover {
  background: var(--workspace-bubble);
}

.coach-preferences__trigger:active {
  transform: scale(.97);
}

.coach-preferences {
  position: fixed;
  inset: 0 0 0 auto;
  box-sizing: border-box;
  width: min(360px, calc(100vw - 24px));
  max-width: none;
  height: 100vh;
  height: 100dvh;
  max-height: none;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 22px 0 0 22px;
  background: var(--workspace-surface, var(--panel));
  color: var(--text);
  box-shadow: var(--shadow-md);
}

.coach-preferences[open] {
  animation: coach-preferences-enter 180ms cubic-bezier(.2, .7, .2, 1) both;
}

.coach-preferences::backdrop {
  background: rgb(17 18 22 / .32);
}

@keyframes coach-preferences-enter {
  from { transform: translateX(28px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

.coach-preferences__form {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.coach-preferences__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: calc(14px + var(--safe-top)) 12px 12px 22px;
  border-bottom: 1px solid var(--border);
}

.coach-preferences__header h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 760;
  letter-spacing: -.025em;
}

.coach-preferences__body {
  flex: 1;
  min-height: 0;
  padding: 20px 20px 18px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.coach-preferences__roles {
  display: grid;
  min-width: 0;
  margin: 0;
  padding: 0;
  gap: 5px;
  border: 0;
}

.coach-preferences__roles legend,
.coach-preferences__instruction-heading label {
  padding: 0;
  font-size: 14px;
  font-weight: 720;
}

.coach-preferences__roles legend {
  margin-bottom: 8px;
}

.coach-preferences__role {
  position: relative;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 17px;
  align-items: center;
  min-height: 46px;
  padding: 0 12px;
  gap: 11px;
  border: 1px solid transparent;
  border-radius: 11px;
  color: var(--text);
  font-size: 14px;
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease;
}

.coach-preferences__role:hover {
  background: var(--panel);
}

.coach-preferences__role:has(.coach-preferences__radio:checked) {
  border-color: var(--border);
  background: var(--workspace-bubble);
}

.coach-preferences__radio {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

.coach-preferences__icon,
.coach-preferences__check {
  color: var(--green-strong);
}

.coach-preferences__instructions {
  display: grid;
  margin-top: 22px;
  gap: 8px;
}

.coach-preferences__instruction-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.coach-preferences__instruction-heading span,
.coach-preferences__instructions p {
  color: var(--muted);
  font-size: 12px;
}

.coach-preferences__instructions p {
  margin: 0;
  text-wrap: pretty;
}

.coach-preferences__instructions textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 116px;
  padding: 11px 12px;
  resize: vertical;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-size: 16px;
  line-height: 1.5;
}

.coach-preferences__instructions textarea::placeholder {
  color: var(--muted);
}

.coach-preferences__footer {
  display: grid;
  gap: 8px;
  padding: 12px 20px calc(16px + var(--safe-bottom));
  border-top: 1px solid var(--border);
  background: var(--workspace-surface, var(--panel));
}

.coach-preferences__save {
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: var(--text);
  color: var(--workspace-surface, var(--panel));
  font: inherit;
  font-size: 14px;
  font-weight: 720;
  transition: opacity 140ms ease, transform 140ms ease;
}

.coach-preferences__save:disabled {
  border-color: var(--border);
  background: var(--panel);
  color: var(--muted);
}

.coach-preferences__save:enabled:active {
  transform: scale(.985);
}

.coach-preferences__trigger:focus-visible,
.coach-preferences__role:has(.coach-preferences__radio:focus-visible),
.coach-preferences__instructions textarea:focus-visible,
.coach-preferences__save:focus-visible {
  outline: 2px solid var(--green-strong);
  outline-offset: 2px;
}

.coach-preferences__error {
  margin: 0;
  color: var(--red);
  font-size: 13px;
}

.coach-preferences__memories {
  display: grid;
  gap: 8px;
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid var(--border);
}

.coach-preferences__section-title {
  font-size: 14px;
  font-weight: 720;
  color: var(--text);
}

.coach-preferences__memory-hint,
.coach-preferences__memory-empty {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

.coach-preferences__memory-add {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
}

.coach-preferences__memory-add input {
  min-width: 0;
  min-height: 38px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-size: 13px;
}

.coach-preferences__memory-add button {
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--workspace-bubble);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}

.coach-preferences__memory-add button:disabled {
  opacity: .5;
  cursor: default;
}

.coach-preferences__memory-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.coach-preferences__memory-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel);
}

.coach-preferences__memory-body {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.coach-preferences__memory-body p {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.coach-preferences__memory-tag {
  width: fit-content;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--workspace-bubble);
  color: var(--green-strong);
  font-size: 11px;
  font-weight: 650;
}

.coach-preferences__memory-del {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.coach-preferences__memory-del:hover:not(:disabled) {
  background: var(--workspace-bubble);
  color: var(--red, #b42318);
}

@media (min-width: 540px) {
  .coach-preferences {
    inset:
      max(24px, calc((100dvh - 924px) / 2))
      max(24px, calc((100vw - var(--workspace-frame-max, 760px)) / 2))
      auto auto;
    height: min(calc(100dvh - 48px), 924px);
    border-radius: 20px 32px 32px 20px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .coach-preferences[open] {
    animation: none;
  }

  .coach-preferences__trigger,
  .coach-preferences__role,
  .coach-preferences__save {
    transition: none;
  }
}
</style>
