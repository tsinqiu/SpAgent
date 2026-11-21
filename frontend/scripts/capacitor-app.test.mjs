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
  androidManifest,
  androidNetworkSecurity,
  androidStrings,
  androidGradle,
  androidGradleProperties,
  gradleWrapper,
  androidSyncScript,
  androidBuildScript,
  androidReleaseScript,
] = await Promise.all([
  json('package.json'),
  source('capacitor.config.ts'),
  source('android/app/src/main/AndroidManifest.xml'),
  source('android/app/src/main/res/xml/network_security_config.xml'),
  source('android/app/src/main/res/values/strings.xml'),
  source('android/app/build.gradle'),
  source('android/gradle.properties'),
  source('android/gradle/wrapper/gradle-wrapper.properties'),
  source('scripts/sync-android-server.ps1'),
  source('scripts/build-android-debug.ps1'),
  source('scripts/build-android-release.ps1'),
])

test('frontend declares Capacitor dependencies and native app scripts', () => {
  assert.ok(packageJson.dependencies['@capacitor/core'])
  assert.ok(packageJson.devDependencies['@capacitor/cli'])
  assert.ok(packageJson.devDependencies['@capacitor/android'])
  assert.match(packageJson.scripts['cap:sync'] || '', /npm run build && cap sync/)
  assert.match(packageJson.scripts['android:sync'] || '', /sync-android-server\.ps1/)
})

test('native touch feedback is light and limited to opted-in direct actions', async () => {
  assert.ok(packageJson.dependencies['@capacitor/haptics'])
  const feedback = await source('src/services/touchFeedback.js')
  assert.match(feedback, /Capacitor\.isNativePlatform/)
  assert.match(feedback, /event\.isTrusted/)
  assert.match(feedback, /\[data-haptic\]/)
  assert.match(feedback, /Haptics\.impact\(\{ style: ImpactStyle\.Light \}\)/)
})

test('Capacitor config targets a SpAgent Android app from Vite dist', () => {
  assert.match(capacitorConfig, /appId:\s*['"]com\.spagent\.app['"]/)
  assert.match(capacitorConfig, /appName:\s*['"]SpAgent['"]/)
  assert.match(capacitorConfig, /webDir:\s*['"]dist['"]/)
  assert.match(capacitorConfig, /backgroundColor:\s*['"]#eef8f2['"]/)
  assert.match(capacitorConfig, /androidScheme:\s*['"]https['"]/)
})

test('Android WebView allows the packaged HTTPS app shell to call the HTTP server API', () => {
  assert.match(capacitorConfig, /cleartext:\s*true/)
  assert.match(capacitorConfig, /android:\s*\{[\s\S]*allowMixedContent:\s*true/)
  assert.match(androidManifest, /android:usesCleartextTraffic="true"/)
  assert.match(androidManifest, /android:networkSecurityConfig="@xml\/network_security_config"/)
  assert.match(androidNetworkSecurity, /<base-config\s+cleartextTrafficPermitted="true">/)
  assert.match(androidNetworkSecurity, /<domain-config\s+cleartextTrafficPermitted="true">/)
  assert.match(androidNetworkSecurity, /<domain[^>]*>47\.112\.190\.14<\/domain>/)
})

test('Android platform is generated with SpAgent identity', () => {
  assert.match(androidManifest, /android:theme="@style\/AppTheme/)
  assert.match(androidStrings, /<string name="app_name">SpAgent<\/string>/)
  assert.match(androidStrings, /<string name="package_name">com\.spagent\.app<\/string>/)
  assert.match(androidGradle, /namespace\s*=\s*["']com\.spagent\.app["']/)
  assert.match(androidGradle, /applicationId\s+["']com\.spagent\.app["']/)
})

test('Android app can request location for live workout recording', () => {
  assert.match(androidManifest, /android\.permission\.ACCESS_FINE_LOCATION/)
  assert.match(androidManifest, /android\.permission\.ACCESS_COARSE_LOCATION/)
})

test('Android release signing is configured from environment variables only', () => {
  assert.match(androidGradle, /signingConfigs\s*\{/)
  assert.match(androidGradle, /release\s*\{/)
  assert.match(androidGradle, /SPAGENT_RELEASE_STORE_FILE/)
  assert.match(androidGradle, /SPAGENT_RELEASE_STORE_PASSWORD/)
  assert.match(androidGradle, /SPAGENT_RELEASE_KEY_ALIAS/)
  assert.match(androidGradle, /SPAGENT_RELEASE_KEY_PASSWORD/)
  assert.doesNotMatch(androidGradle, /storePassword\s+["'][^"']+["']/)
  assert.doesNotMatch(androidGradle, /keyPassword\s+["'][^"']+["']/)
})

test('Gradle wrapper allows slower first-time downloads on this workstation', () => {
  assert.match(gradleWrapper, /distributionUrl=.*gradle-8\.14\.3-bin\.zip/)
  assert.match(gradleWrapper, /networkTimeout=60000/)
})

test('Android Gradle release build uses conservative local memory settings', () => {
  assert.match(androidGradleProperties, /org\.gradle\.jvmargs=-Xmx1024m\s+-XX:MaxMetaspaceSize=512m/)
  assert.match(androidGradleProperties, /org\.gradle\.workers\.max=2/)
  assert.match(androidGradleProperties, /org\.gradle\.parallel=false/)
})

test('Android sync script uses the configured npm cache and native tool homes', () => {
  assert.doesNotMatch(androidSyncScript, /\$env:(npm_config_cache|TEMP|TMP|ANDROID_USER_HOME|ANDROID_HOME)\s*=/)
  assert.match(androidSyncScript, /Assert-LastExitCode 'npm run build'/)
  assert.match(androidSyncScript, /Assert-LastExitCode 'npx cap sync android'/)
})

test('Windows debug APK build script uses the configured Gradle and Android SDK', () => {
  assert.match(packageJson.scripts['android:debug'] || '', /build-android-debug\.ps1/)
  assert.doesNotMatch(androidBuildScript, /\$env:(GRADLE_USER_HOME|ANDROID_USER_HOME|ANDROID_HOME)\s*=/)
  assert.match(androidBuildScript, /npm run android:sync/)
  assert.match(androidBuildScript, /Assert-LastExitCode 'npm run android:sync'/)
  assert.match(androidBuildScript, /:app:assembleDebug/)
  assert.match(androidBuildScript, /:app:assembleDebug --no-daemon/)
  assert.match(androidBuildScript, /Assert-LastExitCode '\.\\gradlew\.bat :app:assembleDebug'/)
})

test('Windows release APK build script requires explicitly configured signing credentials', () => {
  assert.match(packageJson.scripts['android:release'] || '', /build-android-release\.ps1/)
  assert.doesNotMatch(androidReleaseScript, /\$env:(GRADLE_USER_HOME|ANDROID_USER_HOME|ANDROID_HOME)\s*=|Get-Content|keytool/)
  assert.match(androidReleaseScript, /SPAGENT_RELEASE_STORE_FILE[\s\S]*SPAGENT_RELEASE_STORE_PASSWORD[\s\S]*SPAGENT_RELEASE_KEY_ALIAS[\s\S]*SPAGENT_RELEASE_KEY_PASSWORD/)
  assert.match(androidReleaseScript, /GetEnvironmentVariable\(\$name, 'Process'\)/)
  assert.match(androidReleaseScript, /:app:assembleRelease/)
  assert.match(androidReleaseScript, /:app:assembleRelease --no-daemon/)
  assert.match(androidReleaseScript, /Assert-LastExitCode 'npm run android:sync'/)
  assert.match(androidReleaseScript, /Assert-LastExitCode '\.\\gradlew\.bat :app:assembleRelease'/)
})
