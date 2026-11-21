import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { clearSavedValue, readSavedValue } from '../src/services/browserStorage.js'

async function source(path) {
  try {
    return await readFile(new URL(`../${path}`, import.meta.url), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return ''
    throw error
  }
}

async function json(path) {
  const text = await source(path)
  return text ? JSON.parse(text) : null
}

const [indexHtml, manifest, icon, maskable] = await Promise.all([
  source('index.html'),
  json('public/manifest.webmanifest'),
  readFile(new URL('../public/icons/spagent-icon.png', import.meta.url)),
  readFile(new URL('../public/icons/spagent-maskable.png', import.meta.url)),
])

test('rebranded browser storage preserves a session and per-activity drafts across the upgrade', () => {
  const entries = new Map([
    ['motion-analysis-token', 'synthetic-session'],
    ['motioncare-activity-self-review:12', 'synthetic-draft'],
    ['motioncare-activity-self-review:13', 'other-draft'],
  ])
  const storage = {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key),
  }

  assert.equal(readSavedValue(storage, 'spagent-token'), 'synthetic-session')
  assert.equal(entries.has('motion-analysis-token'), false)
  assert.equal(readSavedValue(storage, 'spagent-activity-self-review:12'), 'synthetic-draft')
  assert.equal(entries.get('motioncare-activity-self-review:13'), 'other-draft')
  entries.set('motion-analysis-token', 'stale-session')
  assert.equal(readSavedValue(storage, 'spagent-token'), 'synthetic-session')
  clearSavedValue(storage, 'spagent-token')
  assert.equal(readSavedValue(storage, 'spagent-token'), null)
})

test('index advertises SpAgent as an installable mobile app', () => {
  assert.match(indexHtml, /<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"\s*\/?>/)
  assert.match(indexHtml, /<meta\s+name="theme-color"\s+content="#15b66a"\s*\/?>/)
  assert.match(indexHtml, /<meta\s+name="apple-mobile-web-app-capable"\s+content="yes"\s*\/?>/)
  assert.match(indexHtml, /<meta\s+name="apple-mobile-web-app-title"\s+content="SpAgent"\s*\/?>/)
  assert.match(indexHtml, /<link\s+rel="apple-touch-icon"\s+href="\/icons\/spagent-maskable\.png"\s*\/?>/)
})

test('the installed web app opens the SpAgent conversation workspace', () => {
  assert.ok(manifest, 'manifest.webmanifest should exist')
  assert.equal(manifest.name, 'SpAgent')
  assert.equal(manifest.short_name, 'SpAgent')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.start_url, '/coach')
  assert.equal(manifest.scope, '/')
  assert.equal(manifest.theme_color, '#15b66a')
  assert.equal(manifest.background_color, '#eef8f2')
  assert.match(manifest.description, /跑者/)
})

test('manifest provides regular and maskable app icons', () => {
  assert.ok(manifest, 'manifest.webmanifest should exist')
  assert.ok(Array.isArray(manifest.icons))
  assert.ok(manifest.icons.some((item) => item.src === '/icons/spagent-icon.png' && item.purpose === 'any'))
  assert.ok(manifest.icons.some((item) => item.src === '/icons/spagent-maskable.png' && item.purpose === 'maskable'))
  assert.ok(manifest.icons.every((item) => item.type === 'image/png' && item.sizes === '512x512'))
})

test('the two icon files are full-resolution PNG assets', () => {
  for (const file of [icon, maskable]) {
    assert.equal(file.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(file.readUInt32BE(16), 512)
    assert.equal(file.readUInt32BE(20), 512)
  }
  assert.notDeepEqual(icon, maskable)
})
