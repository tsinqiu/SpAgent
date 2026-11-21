import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function readProjectFile(path) {
  return readFile(resolve(root, path), 'utf8')
}

test('AI frontend service exposes coach feedback endpoints', async () => {
  const source = await readProjectFile('src/services/ai.js')

  assert.match(source, /export function submitAiFeedback\(payload\)\s*{\s*return mutateEnvelope\('post', '\/ai\/feedback', payload\)/)
  assert.match(source, /export function submitMorningReadiness\(payload\)\s*{\s*return mutateEnvelope\('post', '\/ai\/morning-readiness', payload\)/)
})

test('coach uses one composer and renders actions only when the server proposes them', async () => {
  const source = await readProjectFile('src/components/CoachPlanAgent.vue')
  const page = await readProjectFile('src/views/Coach.vue')
  assert.equal((source.match(/class="plan-agent__composer"/g) || []).length, 1)
  assert.doesNotMatch(page + source, /教练对话模式|建议反馈|晨间状态/)
  assert.match(source, /v-else-if="card.type === 'plan_draft'"/)
  assert.match(source, /v-else-if="card.type === 'plan_diff'"/)
  assert.match(source, /answerProvider === 'deepseek'/)
})

test('conversation shows local send feedback immediately and protects IME composition', async () => {
  const source = await readProjectFile('src/components/CoachPlanAgent.vue')
  assert.match(source, /v-if="pendingMessage"/)
  assert.match(source, /event\.isComposing/)
  assert.match(source, /role="alert"/)
})

test('coach history and attachments are local tabs with no duplicate entries in global navigation', async () => {
  const source = await readProjectFile('src/components/CoachPlanAgent.vue')
  const shell = await readProjectFile('src/components/AppShell.vue')
  assert.doesNotMatch(shell, /coach-drawer-history|历史对话|新对话/)
  assert.match(source, /id="coach-panel-history"[\s\S]*?@click="startConversation"[\s\S]*?@click="switchConversation\(/)
  assert.match(source, /id="coach-panel-files"[\s\S]*?@click="openAttachmentMessage\(/)
  assert.match(source, /role="tablist" aria-label="AI 工作台"/)
})
