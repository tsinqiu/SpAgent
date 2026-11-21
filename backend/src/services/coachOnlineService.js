const config = require('../config');

const ALLOWED_HOSTS = new Set([
  'weather.cma.cn',
  'geocoding-api.open-meteo.com',
  'api.open-meteo.com',
  'air-quality-api.open-meteo.com',
  'api.tavily.com',
  'www.so.com',
  'cn.bing.com'
]);

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 1.5 * 1024 * 1024;
const WEATHER_CACHE_TTL_MS = 15 * 60 * 1000;
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 120;

const weatherCache = new Map();
const searchCache = new Map();

const WMO_WEATHER_LABELS = Object.freeze({
  0: '晴朗',
  1: '大部晴朗',
  2: '多云',
  3: '阴天',
  45: '有雾',
  48: '冻雾',
  51: '毛毛雨',
  53: '小阵雨',
  55: '细雨',
  56: '冻毛毛雨',
  57: '强冻毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '冻雨',
  67: '强冻雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '霰',
  80: '小阵雨',
  81: '中阵雨',
  82: '大阵雨',
  85: '小阵雪',
  86: '大阵雪',
  95: '雷阵雨',
  96: '雷阵雨伴小冰雹',
  99: '雷阵雨伴强冰雹'
});

function getCached(cache, key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(cache, key, value, ttlMs) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function clearCaches() {
  weatherCache.clear();
  searchCache.clear();
}

function assertAllowedOutboundUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid outbound URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS outbound requests are allowed');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Outbound URL credentials are not allowed');
  }
  if (parsed.port && parsed.port !== '443') {
    throw new Error('Custom outbound ports are not allowed');
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(`Outbound host "${parsed.hostname}" is not in the allowlist`);
  }
  return parsed.toString();
}

async function safeFetchText(rawUrl, {
  method = 'GET',
  headers = {},
  body = undefined,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch
} = {}) {
  const safeUrl = assertAllowedOutboundUrl(rawUrl);
  const response = await fetchImpl(safeUrl, {
    method,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      ...headers
    },
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`Upstream HTTP ${response.status}`);
  }

  const contentLength = Number(response.headers?.get?.('content-length') || 0);
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new Error('Upstream response exceeds size limit');
  }

  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new Error('Upstream response exceeds size limit');
  }
  return text;
}

async function safeFetchJson(rawUrl, options = {}) {
  const text = await safeFetchText(rawUrl, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers || {})
    }
  });
  return JSON.parse(text);
}

function decodeHtmlEntities(input = '') {
  return String(input)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });
}

function stripHtml(input = '') {
  return decodeHtmlEntities(
    String(input)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

function sanitizeSearchQuery(rawQuery) {
  return String(rawQuery || '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '')
    .replace(/\b1[3-9]\d{9}\b/g, '')
    .replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function wmoLabel(code) {
  return WMO_WEATHER_LABELS[Number(code)] || '多云';
}

function aqiGrade(usAqi) {
  if (usAqi == null || !Number.isFinite(Number(usAqi))) return '未知';
  const v = Number(usAqi);
  if (v <= 50) return '优';
  if (v <= 100) return '良';
  if (v <= 150) return '轻度污染';
  if (v <= 200) return '中度污染';
  if (v <= 300) return '重度污染';
  return '严重污染';
}

function evaluateRunningSuitability({
  tempC,
  apparentTempC,
  humidityPct,
  windSpeedKmh,
  precipitationMm,
  weatherCode,
  usAqi,
  pm25
}) {
  const tips = [];
  let severity = 0; // 0=ideal, 1=good, 2=caution, 3=indoor_recommended

  const code = Number(weatherCode);
  const effectiveTemp = Number.isFinite(Number(apparentTempC)) ? Number(apparentTempC) : Number(tempC);

  if ([95, 96, 99, 66, 67].includes(code)) {
    severity = Math.max(severity, 3);
    tips.push('当前有雷暴或冻雨风险，强烈建议改为室内跑步机或力量训练');
  } else if ([65, 82, 75, 86].includes(code) || Number(precipitationMm) >= 4) {
    severity = Math.max(severity, 3);
    tips.push('当前降水较大、路面湿滑且能见度低，建议转室内训练');
  } else if ([51, 53, 55, 61, 63, 80, 81, 71, 73, 85].includes(code) || Number(precipitationMm) > 0.2) {
    severity = Math.max(severity, 2);
    tips.push('有降雨/湿滑路面，户外跑建议降速避开急转弯并做好防风防滑');
  }

  if (Number.isFinite(Number(usAqi))) {
    const aqi = Number(usAqi);
    if (aqi > 150) {
      severity = Math.max(severity, 3);
      tips.push(`空气质量较差（US AQI ${Math.round(aqi)}），不建议户外中高强度跑步，优先室内`);
    } else if (aqi > 100) {
      severity = Math.max(severity, 2);
      tips.push(`空气轻度污染（US AQI ${Math.round(aqi)}${Number.isFinite(Number(pm25)) ? `，PM2.5 ${Math.round(pm25)}` : ''}），建议以低心率轻松跑为主，避免高强度间歇`);
    } else {
      tips.push(`空气质量${aqiGrade(aqi)}（US AQI ${Math.round(aqi)}），呼吸条件友好`);
    }
  }

  if (Number.isFinite(effectiveTemp)) {
    if (effectiveTemp >= 32) {
      severity = Math.max(severity, 3);
      tips.push(`体感温度偏高（${effectiveTemp.toFixed(1)}°C），中暑风险高，建议避开白天或改室内`);
    } else if (effectiveTemp >= 26) {
      severity = Math.max(severity, 2);
      tips.push(`体感偏热（${effectiveTemp.toFixed(1)}°C${Number(humidityPct) >= 70 ? `，湿度 ${Math.round(humidityPct)}%` : ''}），建议放慢目标配速 10–25 秒/公里并提前补水补电解质`);
    } else if (effectiveTemp <= -5) {
      severity = Math.max(severity, 2);
      tips.push(`体感严寒（${effectiveTemp.toFixed(1)}°C），注意防风分层保暖与充分热身，避免冷空气直接刺激呼吸道`);
    } else if (effectiveTemp < 8) {
      severity = Math.max(severity, 1);
      tips.push(`气温偏凉（体感 ${effectiveTemp.toFixed(1)}°C），建议延长动态热身至 10–12 分钟，跑后及时加衣`);
    } else if (effectiveTemp >= 8 && effectiveTemp <= 18) {
      tips.push(`体感 ${effectiveTemp.toFixed(1)}°C 处于跑步黄金温区，非常适合有氧或节奏/阈值课表`);
    } else {
      severity = Math.max(severity, 1);
      tips.push(`体感 ${effectiveTemp.toFixed(1)}°C，整体舒适，注意基础补水`);
    }
  }

  if (Number.isFinite(Number(windSpeedKmh)) && Number(windSpeedKmh) >= 28) {
    severity = Math.max(severity, 2);
    tips.push(`风力较大（${Math.round(windSpeedKmh)} km/h），逆风段按体感/心率控强度，不必死盯配速`);
  }

  const levels = [
    { suitability: 'ideal', label: '非常适宜跑步' },
    { suitability: 'good', label: '适宜跑步' },
    { suitability: 'caution', label: '谨慎户外跑' },
    { suitability: 'indoor_recommended', label: '建议转室内' }
  ];
  const level = levels[severity] || levels[1];
  return {
    ...level,
    tips: tips.slice(0, 4)
  };
}

function hasCjk(text) {
  return /[\u4e00-\u9fff]/.test(String(text || ''));
}

async function geocodeCity(city, fetchImpl) {
  const cleaned = String(city || '').trim().slice(0, 60);
  if (!cleaned) return null;

  const candidates = [cleaned];
  if (cleaned.length >= 3 && /[市区县]$/.test(cleaned)) {
    candidates.push(cleaned.slice(0, -1));
  }

  for (const name of candidates) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=zh&format=json`;
    const data = await safeFetchJson(url, { fetchImpl });
    const results = Array.isArray(data?.results) ? data.results : [];
    if (!results.length) continue;
    if (hasCjk(cleaned)) {
      const cnMatch = results.find(r => r.country_code === 'CN');
      if (cnMatch) return cnMatch;
    }
    return results[0];
  }
  return null;
}

async function fetchCmaWeather(city, safeDays, fetchImpl) {
  const cleaned = String(city || '').trim().slice(0, 60);
  const candidates = [cleaned];
  if (cleaned.length >= 3 && /[市区县]$/.test(cleaned)) {
    candidates.push(cleaned.slice(0, -1));
  }

  let stationId = null;
  for (const name of candidates) {
    const autoUrl = `https://weather.cma.cn/api/autocomplete?q=${encodeURIComponent(name)}&limit=8`;
    const auto = await safeFetchJson(autoUrl, { fetchImpl, timeoutMs: 5000 });
    const rows = Array.isArray(auto?.data) ? auto.data : [];
    const parsed = rows.map(row => {
      const parts = String(row || '').split('|');
      return { id: parts[0], name: parts[1] || '', en: parts[2] || '', country: parts[3] || '' };
    }).filter(item => item.id && item.name);

    const exact = parsed.find(p => p.name === name && p.country === '中国')
      || parsed.find(p => p.name === name)
      || (hasCjk(cleaned) ? parsed.find(p => p.country === '中国') : parsed[0]);
    if (exact) {
      stationId = exact.id;
      break;
    }
  }
  if (!stationId) return null;

  const viewUrl = `https://weather.cma.cn/api/weather/view?stationid=${encodeURIComponent(stationId)}`;
  const view = await safeFetchJson(viewUrl, { fetchImpl, timeoutMs: 5000 });
  const data = view?.data;
  if (!data?.now || !data?.location) return null;

  const now = data.now;
  const loc = data.location;
  const lat = Number(loc.latitude);
  const lon = Number(loc.longitude);
  const todayDaily = Array.isArray(data.daily) ? data.daily[0] : null;
  const condition = todayDaily?.dayText || '多云';
  const windSpeedKmh = Number.isFinite(Number(now.windSpeed))
    ? Math.round(Number(now.windSpeed) * 3.6 * 10) / 10
    : null;

  // Soft-enrich with Open-Meteo AQI (3s cap so live weather stays instantaneous)
  let aqiCur = {};
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10&timezone=Asia%2FShanghai`;
    const aqiData = await safeFetchJson(aqiUrl, { fetchImpl, timeoutMs: 3000 }).catch(() => null);
    aqiCur = aqiData?.current || {};
  }

  // Map Chinese weather condition text to synthetic WMO severity hints for running suitability
  let syntheticCode = 1;
  if (/雷/.test(condition)) syntheticCode = 95;
  else if (/暴雨|大雨/.test(condition)) syntheticCode = 65;
  else if (/中雨|小雨|阵雨|雨/.test(condition)) syntheticCode = 61;
  else if (/雪/.test(condition)) syntheticCode = 73;

  const forecast = (Array.isArray(data.daily) ? data.daily : []).slice(0, safeDays).map(d => ({
    date: String(d.date || '').replace(/\//g, '-'),
    condition: d.dayText && d.nightText && d.dayText !== d.nightText ? `${d.dayText}转${d.nightText}` : (d.dayText || d.nightText || '多云'),
    tempMinC: d.low ?? null,
    tempMaxC: d.high ?? null,
    windScale: d.dayWindScale || null
  }));

  const runningAdvice = evaluateRunningSuitability({
    tempC: now.temperature,
    apparentTempC: now.feelst,
    humidityPct: now.humidity,
    windSpeedKmh,
    precipitationMm: now.precipitation,
    weatherCode: syntheticCode,
    usAqi: aqiCur.us_aqi,
    pm25: aqiCur.pm2_5
  });

  const alarms = Array.isArray(data.alarm)
    ? data.alarm.slice(0, 3).map(a => a?.title || a?.signaltype).filter(Boolean)
    : [];

  return {
    ok: true,
    source: '中国气象局 CMA 实时观测',
    fetchedAt: new Date().toISOString(),
    location: {
      name: loc.name,
      path: loc.path || null,
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lon) ? lon : null,
      timezone: 'Asia/Shanghai'
    },
    current: {
      observedAt: data.lastUpdate || null,
      condition,
      tempC: now.temperature ?? null,
      apparentTempC: now.feelst ?? null,
      humidityPct: now.humidity ?? null,
      windDirection: now.windDirection || null,
      windScale: now.windScale || null,
      windSpeedKmh,
      precipitationMm: now.precipitation ?? 0
    },
    airQuality: {
      observedAt: aqiCur.time || null,
      usAqi: aqiCur.us_aqi ?? null,
      grade: aqiGrade(aqiCur.us_aqi),
      pm25: aqiCur.pm2_5 ?? null,
      pm10: aqiCur.pm10 ?? null
    },
    alarms,
    runningAdvice,
    forecast
  };
}

async function getLiveWeatherAndAqi({ city, days = 3 } = {}, { fetchImpl = globalThis.fetch } = {}) {
  const queryCity = String(city || '').trim();
  if (!queryCity) {
    return { ok: false, error: '请提供要查询的城市名称（例如：无锡、上海、北京）' };
  }

  const safeDays = Math.min(5, Math.max(1, Number.parseInt(days, 10) || 3));
  const cacheKey = `${queryCity.toLowerCase()}::${safeDays}`;
  const cached = getCached(weatherCache, cacheKey);
  if (cached) return { ...cached, cached: true };

  // 1. Primary: Official China Meteorological Administration (ultra-fast ~100ms domestically, covers global major cities too)
  try {
    const cmaPayload = await fetchCmaWeather(queryCity, safeDays, fetchImpl);
    if (cmaPayload) {
      setCached(weatherCache, cacheKey, cmaPayload, WEATHER_CACHE_TTL_MS);
      return cmaPayload;
    }
  } catch {
    // Fall through to Open-Meteo
  }

  // 2. Fallback: Open-Meteo Geocoding + Forecast + Air Quality
  try {
    const location = await geocodeCity(queryCity, fetchImpl);
    if (!location) {
      return {
        ok: false,
        city: queryCity,
        error: `未找到城市「${queryCity}」的地理坐标，请尝试更标准的城市名（如无锡、南京、上海）。`
      };
    }

    const lat = Number(location.latitude);
    const lon = Number(location.longitude);
    const timezone = location.timezone || 'Asia/Shanghai';

    const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max` +
      `&timezone=${encodeURIComponent(timezone)}&forecast_days=${safeDays}`;
    const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&current=us_aqi,pm2_5,pm10&timezone=${encodeURIComponent(timezone)}`;

    const [wxData, aqiData] = await Promise.all([
      safeFetchJson(wxUrl, { fetchImpl }),
      safeFetchJson(aqiUrl, { fetchImpl }).catch(() => null)
    ]);

    const cur = wxData?.current || {};
    const aqiCur = aqiData?.current || {};
    const daily = wxData?.daily || {};
    const forecast = (daily.time || []).map((date, idx) => ({
      date,
      condition: wmoLabel(daily.weather_code?.[idx]),
      tempMinC: daily.temperature_2m_min?.[idx] ?? null,
      tempMaxC: daily.temperature_2m_max?.[idx] ?? null,
      precipitationMm: daily.precipitation_sum?.[idx] ?? null,
      precipitationProbPct: daily.precipitation_probability_max?.[idx] ?? null,
      maxWindKmh: daily.wind_speed_10m_max?.[idx] ?? null
    }));

    const runningAdvice = evaluateRunningSuitability({
      tempC: cur.temperature_2m,
      apparentTempC: cur.apparent_temperature,
      humidityPct: cur.relative_humidity_2m,
      windSpeedKmh: cur.wind_speed_10m,
      precipitationMm: cur.precipitation,
      weatherCode: cur.weather_code,
      usAqi: aqiCur.us_aqi,
      pm25: aqiCur.pm2_5
    });

    const payload = {
      ok: true,
      source: 'Open-Meteo Live Weather & Air Quality',
      fetchedAt: new Date().toISOString(),
      location: {
        name: location.name,
        admin1: location.admin1 || null,
        country: location.country || location.country_code || null,
        latitude: lat,
        longitude: lon,
        timezone
      },
      current: {
        observedAt: cur.time || null,
        condition: wmoLabel(cur.weather_code),
        tempC: cur.temperature_2m ?? null,
        apparentTempC: cur.apparent_temperature ?? null,
        humidityPct: cur.relative_humidity_2m ?? null,
        windSpeedKmh: cur.wind_speed_10m ?? null,
        windGustsKmh: cur.wind_gusts_10m ?? null,
        precipitationMm: cur.precipitation ?? 0
      },
      airQuality: {
        observedAt: aqiCur.time || null,
        usAqi: aqiCur.us_aqi ?? null,
        grade: aqiGrade(aqiCur.us_aqi),
        pm25: aqiCur.pm2_5 ?? null,
        pm10: aqiCur.pm10 ?? null
      },
      runningAdvice,
      forecast
    };

    setCached(weatherCache, cacheKey, payload, WEATHER_CACHE_TTL_MS);
    return payload;
  } catch (error) {
    return {
      ok: false,
      city: queryCity,
      error: `实时天气服务暂时不可达（${error.message}）`
    };
  }
}

function extractDomain(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function cleanSnippet(rawText) {
  return String(rawText || '')
    .replace(/\s*反馈\b[\s\S]*$/i, '')
    .replace(/\s*相关搜索[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function parseSo360Html(html, limit) {
  const results = [];
  const seen = new Set();
  const pattern = /<h3[^>]*class="res-title[^"]*"[^>]*>([\s\S]*?)<\/h3>([\s\S]{0,1400})/gi;

  for (const match of html.matchAll(pattern)) {
    const titleHtml = match[1] || '';
    const afterHtml = match[2] || '';
    const title = stripHtml(titleHtml).slice(0, 120);
    const rawHref =
      titleHtml.match(/data-mdurl="([^"]+)"/i)?.[1] ||
      titleHtml.match(/href="(https?:\/\/[^"]+)"/i)?.[1] ||
      '';
    const url = decodeHtmlEntities(rawHref).trim();

    if (!title || !/^https?:\/\//i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);

    // Stop snippet before the next result block if present
    const boundedAfter = afterHtml.split(/<li[^>]*class="res-list/i)[0] || afterHtml;
    const snippet = cleanSnippet(stripHtml(boundedAfter));

    results.push({
      title,
      url,
      domain: extractDomain(url),
      snippet
    });
    if (results.length >= limit) break;
  }
  return results;
}

function parseBingRssXml(xml, limit) {
  const results = [];
  const seen = new Set();
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = match[1] || '';
    const readTag = tag => decodeHtmlEntities(
      block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] || ''
    ).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    const title = stripHtml(readTag('title')).slice(0, 120);
    const url = readTag('link');
    const snippet = stripHtml(readTag('description')).slice(0, 240);
    if (!title || !/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    results.push({
      title,
      url,
      domain: extractDomain(url),
      snippet
    });
    if (results.length >= limit) break;
  }
  return results;
}

async function searchWithTavily(query, limit, apiKey, fetchImpl) {
  const data = await safeFetchJson('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: limit,
      include_answer: false
    }),
    fetchImpl
  });

  const items = Array.isArray(data?.results) ? data.results : [];
  return items.slice(0, limit).map(item => ({
    title: String(item.title || '').trim().slice(0, 120),
    url: String(item.url || '').trim(),
    domain: extractDomain(item.url),
    snippet: String(item.content || '').replace(/\s+/g, ' ').trim().slice(0, 240)
  })).filter(item => item.title && item.url);
}

async function searchWeb(
  { query, limit = 5 } = {},
  { fetchImpl = globalThis.fetch, aiConfig = config.ai } = {}
) {
  if (aiConfig?.webSearchEnabled === false) {
    return { ok: false, error: '管理员已关闭联网搜索功能。', results: [] };
  }

  const sanitized = sanitizeSearchQuery(query);
  if (!sanitized) {
    return { ok: false, error: '请提供有效的搜索关键词。', results: [] };
  }

  const safeLimit = Math.min(6, Math.max(1, Number.parseInt(limit, 10) || 5));
  const cacheKey = `${sanitized.toLowerCase()}::${safeLimit}`;
  const cached = getCached(searchCache, cacheKey);
  if (cached) return { ...cached, cached: true };

  const errors = [];

  // 1. Optional Tavily API (if user configured TAVILY_API_KEY)
  if (aiConfig?.tavilyApiKey) {
    try {
      const results = await searchWithTavily(sanitized, safeLimit, aiConfig.tavilyApiKey, fetchImpl);
      if (results.length) {
        const payload = { ok: true, provider: 'tavily', query: sanitized, fetchedAt: new Date().toISOString(), results };
        setCached(searchCache, cacheKey, payload, SEARCH_CACHE_TTL_MS);
        return payload;
      }
    } catch (error) {
      errors.push(`tavily:${error.message}`);
    }
  }

  // 2. Zero-key primary: 360 Search (fast, high Chinese relevance, direct URLs)
  try {
    const html = await safeFetchText(`https://www.so.com/s?q=${encodeURIComponent(sanitized)}`, { fetchImpl });
    const results = parseSo360Html(html, safeLimit);
    if (results.length) {
      const payload = { ok: true, provider: 'so360', query: sanitized, fetchedAt: new Date().toISOString(), results };
      setCached(searchCache, cacheKey, payload, SEARCH_CACHE_TTL_MS);
      return payload;
    }
  } catch (error) {
    errors.push(`so360:${error.message}`);
  }

  // 3. Zero-key fallback: Bing CN RSS
  try {
    const xml = await safeFetchText(`https://cn.bing.com/search?format=rss&q=${encodeURIComponent(sanitized)}`, { fetchImpl });
    const results = parseBingRssXml(xml, safeLimit);
    if (results.length) {
      const payload = { ok: true, provider: 'bing-rss', query: sanitized, fetchedAt: new Date().toISOString(), results };
      setCached(searchCache, cacheKey, payload, SEARCH_CACHE_TTL_MS);
      return payload;
    }
  } catch (error) {
    errors.push(`bing-rss:${error.message}`);
  }

  return {
    ok: false,
    query: sanitized,
    results: [],
    error: errors.length ? `联网搜索暂时不可用（${errors.join('; ')}）` : '未检索到相关公开网页结果'
  };
}

module.exports = {
  ALLOWED_HOSTS,
  assertAllowedOutboundUrl,
  sanitizeSearchQuery,
  evaluateRunningSuitability,
  parseSo360Html,
  parseBingRssXml,
  getLiveWeatherAndAqi,
  searchWeb,
  clearCaches
};
