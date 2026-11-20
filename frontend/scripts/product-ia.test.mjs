import test from 'node:test'
import assert from 'node:assert/strict'

import * as product from '../src/constants/product.js'
import * as insights from '../src/utils/productInsights.js'

test('product navigation keeps its five primary destinations, including recording', () => {
  assert.deepEqual(product.primaryNavigation.map(({ label, to }) => ({ label, to })), [
    { label: '今日', to: '/today' },
    { label: '运动', to: '/activities' },
    { label: '记录', to: '/record' },
    { label: '探索', to: '/explore' },
    { label: '运动圈', to: '/community' },
  ])
})

test('product constants do not ship hard-coded user race goals', () => {
  assert.equal(product.targetRace, undefined)
})

test('deriveStatusBadge prioritizes recovery signals and handles load ranges', () => {
  assert.equal(typeof insights.deriveStatusBadge, 'function')
  assert.equal(insights.deriveStatusBadge({ sleepScore: 59, avgStressLevel: 20, tsb: 12 }).label, '建议恢复')
  assert.equal(insights.deriveStatusBadge({ sleepScore: 80, avgStressLevel: 75, tsb: 12 }).label, '建议恢复')
  assert.equal(insights.deriveStatusBadge({ sleepScore: 80, avgStressLevel: 20, tsb: -26 }).label, '建议恢复')
  assert.equal(insights.deriveStatusBadge({ sleepScore: 60, avgStressLevel: 74, tsb: -25 }).label, '适合轻松练')
  assert.equal(insights.deriveStatusBadge({ sleepScore: 80, avgStressLevel: 20, tsb: -9 }).label, '适合轻松练')
  assert.equal(insights.deriveStatusBadge({ sleepScore: 80, avgStressLevel: 20, tsb: -8 }).label, '适合按计划练')
  assert.equal(insights.deriveStatusBadge({ sleepScore: 80, avgStressLevel: 20, tsb: 10 }).label, '适合按计划练')
  assert.equal(insights.deriveStatusBadge({ sleepScore: 80, avgStressLevel: 20, tsb: 11 }).label, '状态轻松')
  assert.equal(insights.deriveStatusBadge({}).label, '数据不足')
})

test('getRaceCountdown uses local dates and never returns a negative countdown', () => {
  assert.equal(typeof insights.getRaceCountdown, 'function')
  assert.deepEqual(
    insights.getRaceCountdown('2026-10-18', new Date(2026, 9, 17, 23, 59)),
    { days: 1, label: '距比赛 1 天', ended: false },
  )
  assert.deepEqual(
    insights.getRaceCountdown('2026-10-18', new Date(2026, 9, 18, 12, 0)),
    { days: 0, label: '今天比赛', ended: false },
  )
  assert.deepEqual(
    insights.getRaceCountdown('2026-10-18', new Date(2026, 9, 19, 0, 1)),
    { days: 0, label: '赛事已结束', ended: true },
  )
})
