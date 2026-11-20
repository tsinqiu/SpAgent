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

test('Coach renders training guidance and reports the result of submitting suggestion feedback', async () => {
  const source = await readProjectFile('src/views/Coach.vue')

  assert.match(source, /训练指数/)
  assert.match(source, /\{\{\s*readinessScoreDisplay\s*\}\}/)
  assert.match(source, /\{\{\s*loadActionLabel\s*\}\}/)
  assert.match(source, /dailyBrief\.value\?\.ml/)
  assert.match(source, /aria-label="建议反馈"/)
  assert.match(source, /:disabled="feedbackSending"/)
  assert.match(source, /@click="sendFeedback\(option\.value\)"/)
  assert.match(source, /v-if="feedbackMessage"/)
  assert.match(source, /await submitAiFeedback\(\{[\s\S]*?suggestionType:\s*'daily_brief',[\s\S]*?feedback,[\s\S]*?suggestionDate:/)
  assert.match(source, /建议反馈已保存/)
  assert.match(source, /建议反馈保存失败/)
})

test('Coach persists the morning readiness form and reports both save outcomes', async () => {
  const source = await readProjectFile('src/views/Coach.vue')

  assert.match(source, /<h2>晨间状态<\/h2>/)
  assert.match(source, /@submit\.prevent="saveReadiness"/)
  assert.match(source, /v-model\.number="readinessForm\.readinessScore"[^>]*type="range"[^>]*min="1"[^>]*max="5"/)
  assert.match(source, /@click="readinessForm\.muscleSoreness = option\.value"/)
  assert.match(source, /@click="readinessForm\.trainingWillingness = option\.value"/)
  assert.match(source, /v-model\.trim="readinessForm\.note"/)
  assert.match(source, /:disabled="readinessSending"/)
  assert.match(source, /v-if="readinessMessage"/)
  assert.match(source, /await submitMorningReadiness\(\{[\s\S]*?feedbackDate:[\s\S]*?\.\.\.readinessForm\.value/)
  assert.match(source, /晨间状态已保存/)
  assert.match(source, /晨间状态保存失败/)
})

test('training recommendations show their context and hand the selected item to daily advice', async () => {
  const source = await readProjectFile('src/views/Coach.vue')

  assert.match(source, /推荐训练/)
  assert.match(source, /v-for="item in recommendations"/)
  for (const field of ['duration', 'reason', 'intensity']) {
    assert.ok(source.includes(`{{ recommendationMeta(item).${field} }}`), `missing recommendation ${field}`)
  }
  assert.match(source, /@click="ask\(coursePrompt\(item\)\)"/)
  assert.match(source, /@click="ask\(coursePrompt\(item\)\)"[^>]*>[\s\S]*?询问教练[\s\S]*?<\/button>/)
  assert.match(source, /function coursePrompt\(item\)\s*{\s*return `[^`]*\$\{item\.title\}/)
  assert.doesNotMatch(source, /加入今日计划/)
  assert.match(source, /async function ask\(text\)\s*{\s*chatMode\.value = 'advice'\s*draft\.value = text\s*await submit\(\)/)
  assert.match(source, /await sendAiMessage\(content\)/)
})
