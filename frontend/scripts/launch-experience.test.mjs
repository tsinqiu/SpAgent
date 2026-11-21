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

async function json(path) {
  const text = await source(path)
  return text ? JSON.parse(text) : null
}

const [
  packageJson,
  capacitorConfig,
  mainSource,
  indexHtml,
  stylesXml,
  splashDrawable,
  appCss,
] = await Promise.all([
  json('package.json'),
  source('capacitor.config.ts'),
  source('src/main.js'),
  source('index.html'),
  source('android/app/src/main/res/values/styles.xml'),
  source('android/app/src/main/res/drawable/launch_splash.xml'),
  source('src/assets/app.css'),
])

test('Capacitor shows the SpAgent launcher mark on an ink background', () => {
  assert.ok(packageJson.dependencies['@capacitor/splash-screen'])
  assert.match(capacitorConfig, /reference types=["']@capacitor\/splash-screen["']/)
  assert.match(capacitorConfig, /SplashScreen:\s*\{[\s\S]*?launchAutoHide:\s*false/)
  assert.match(capacitorConfig, /SplashScreen:\s*\{[\s\S]*?backgroundColor:\s*['"]#0f1014['"]/)
  assert.match(capacitorConfig, /SplashScreen:\s*\{[\s\S]*?androidSplashResourceName:\s*['"]launch_splash['"]/)
  assert.match(capacitorConfig, /SplashScreen:\s*\{[\s\S]*?androidScaleType:\s*['"]CENTER_INSIDE['"]/)
})

test('Vue hides the native splash only after mounting the app shell', () => {
  assert.match(mainSource, /import\(['"]@capacitor\/splash-screen['"]\)/)
  assert.match(mainSource, /SplashScreen\.hide\(\{ fadeOutDuration:\s*280 \}\)/)
  assert.match(mainSource, /app\.use\(router\)\.mount\('#app'\)/)
})

test('Android launch theme uses the adaptive icon mark for splash', () => {
  assert.match(stylesXml, /AppTheme\.NoActionBarLaunch[\s\S]*@drawable\/launch_splash/)
  assert.match(stylesXml, /windowSplashScreenBackground">#0f1014/)
  assert.match(splashDrawable, /<bitmap[\s\S]*@drawable\/spagent_icon_adaptive/)
})

test('web root includes a branded startup fallback before JavaScript boots', () => {
  assert.match(indexHtml, /<div id="app">\s*<div class="boot-splash"/)
  assert.match(indexHtml, /SpAgent/)
  assert.match(indexHtml, /class="boot-splash__mark" src="\/icons\/spagent-icon\.png"/)
  assert.match(appCss, /\.boot-splash\s*\{[\s\S]*?background:\s*#0f1014/)
  assert.match(appCss, /\.boot-splash__mark\s*\{[\s\S]*?border-radius:\s*24px/)
})
