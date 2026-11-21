import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function source(path) {
  try {
    return await readFile(new URL(`../${path}`, import.meta.url), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return ''
    throw error
  }
}

const [
  manifest,
  adaptiveIcon,
  adaptiveRoundIcon,
  launcherBackground,
  launcherForeground,
  legacyBackground,
  legacyForeground,
  mark,
] = await Promise.all([
  source('android/app/src/main/AndroidManifest.xml'),
  source('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'),
  source('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml'),
  source('android/app/src/main/res/drawable/spagent_launcher_background.xml'),
  source('android/app/src/main/res/drawable/spagent_launcher_foreground.xml'),
  source('android/app/src/main/res/drawable/ic_launcher_background.xml'),
  source('android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml'),
  readFile(new URL('../android/app/src/main/res/drawable-nodpi/spagent_icon_adaptive.png', import.meta.url)),
])

test('Android launcher icon uses SpAgent adaptive icon resources', () => {
  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/)
  assert.match(manifest, /android:roundIcon="@mipmap\/ic_launcher_round"/)
  assert.match(adaptiveIcon, /@drawable\/spagent_launcher_background/)
  assert.match(adaptiveIcon, /@drawable\/spagent_launcher_foreground/)
  assert.match(adaptiveRoundIcon, /@drawable\/spagent_launcher_background/)
  assert.match(adaptiveRoundIcon, /@drawable\/spagent_launcher_foreground/)
})

test('SpAgent launcher uses the same dark background and centered mark on older Android versions', () => {
  for (const background of [launcherBackground, legacyBackground]) assert.match(background, /#0F1014/i)
  for (const foreground of [launcherForeground, legacyForeground]) assert.match(foreground, /@drawable\/spagent_icon_adaptive/)
  assert.equal(mark.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.equal(mark.readUInt32BE(16), 432)
  assert.equal(mark.readUInt32BE(20), 432)
})
