const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertAllowedOutboundUrl,
  sanitizeSearchQuery,
  evaluateRunningSuitability,
  parseSo360Html,
  parseBingRssXml,
  getLiveWeatherAndAqi,
  searchWeb,
  clearCaches
} = require('../src/services/coachOnlineService');

function makeResponse(body, status = 200) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-length': String(Buffer.byteLength(text, 'utf8')) }),
    async text() {
      return text;
    }
  };
}

test('assertAllowedOutboundUrl blocks SSRF targets and non-HTTPS URLs', () => {
  assert.throws(() => assertAllowedOutboundUrl('http://api.open-meteo.com/v1/forecast'), /HTTPS/);
  assert.throws(() => assertAllowedOutboundUrl('https://127.0.0.1/secret'), /allowlist/);
  assert.throws(() => assertAllowedOutboundUrl('https://169.254.169.254/latest/meta-data/'), /allowlist/);
  assert.throws(() => assertAllowedOutboundUrl('https://user:pass@api.open-meteo.com/v1/forecast'), /credentials/);
  assert.throws(() => assertAllowedOutboundUrl('https://api.open-meteo.com:8443/v1/forecast'), /ports/);
  assert.throws(() => assertAllowedOutboundUrl('https://evil.example/search'), /allowlist/);

  const okUrl = assertAllowedOutboundUrl('https://api.open-meteo.com/v1/forecast?latitude=31.5&longitude=120.3');
  assert.match(okUrl, /^https:\/\/api\.open-meteo\.com/);
});

test('sanitizeSearchQuery strips personal emails, phone numbers, and API keys', () => {
  const cleaned = sanitizeSearchQuery('无锡马拉松 runner@example.com 13812345678 sk-secretkey123456 报名');
  assert.equal(cleaned, '无锡马拉松 报名');
});

test('evaluateRunningSuitability classifies ideal vs hazardous running conditions', () => {
  const ideal = evaluateRunningSuitability({
    tempC: 14,
    apparentTempC: 13.5,
    humidityPct: 55,
    windSpeedKmh: 9,
    precipitationMm: 0,
    weatherCode: 1,
    usAqi: 38,
    pm25: 10
  });
  assert.equal(ideal.suitability, 'ideal');
  assert.equal(ideal.label, '非常适宜跑步');

  const polluted = evaluateRunningSuitability({
    tempC: 16,
    apparentTempC: 16,
    humidityPct: 60,
    windSpeedKmh: 8,
    precipitationMm: 0,
    weatherCode: 2,
    usAqi: 185,
    pm25: 112
  });
  assert.equal(polluted.suitability, 'indoor_recommended');
  assert.equal(polluted.label, '建议转室内');
});

test('getLiveWeatherAndAqi combines Open-Meteo geocoding, forecast, and AQI with caching', async () => {
  clearCaches();
  let calls = 0;
  const mockFetch = async url => {
    calls += 1;
    if (url.includes('geocoding-api.open-meteo.com')) {
      return makeResponse({
        results: [
          { name: '无锡', admin1: '江苏省', country: '中国', country_code: 'CN', latitude: 31.57, longitude: 120.29, timezone: 'Asia/Shanghai' }
        ]
      });
    }
    if (url.includes('air-quality-api.open-meteo.com')) {
      return makeResponse({
        current: { time: '2026-11-21T12:00', us_aqi: 46, pm2_5: 11.5, pm10: 23.0 }
      });
    }
    if (url.includes('api.open-meteo.com')) {
      return makeResponse({
        current: {
          time: '2026-11-21T12:00',
          temperature_2m: 15.2,
          apparent_temperature: 14.1,
          relative_humidity_2m: 58,
          precipitation: 0,
          weather_code: 2,
          wind_speed_10m: 11.4,
          wind_gusts_10m: 19.2
        },
        daily: {
          time: ['2026-11-21', '2026-11-22'],
          weather_code: [2, 61],
          temperature_2m_min: [9.1, 10.2],
          temperature_2m_max: [17.4, 15.8],
          precipitation_sum: [0, 3.2],
          precipitation_probability_max: [10, 75],
          wind_speed_10m_max: [14, 18]
        }
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const first = await getLiveWeatherAndAqi({ city: '无锡市', days: 2 }, { fetchImpl: mockFetch });
  assert.equal(first.ok, true);
  assert.equal(first.location.name, '无锡');
  assert.equal(first.current.tempC, 15.2);
  assert.equal(first.current.condition, '多云');
  assert.equal(first.airQuality.usAqi, 46);
  assert.equal(first.airQuality.grade, '优');
  assert.equal(first.runningAdvice.suitability, 'ideal');
  assert.equal(first.forecast.length, 2);
  assert.equal(calls, 4); // 1 CMA attempt + 3 Open-Meteo fallback calls

  const second = await getLiveWeatherAndAqi({ city: '无锡市', days: 2 }, { fetchImpl: mockFetch });
  assert.equal(second.cached, true);
  assert.equal(calls, 4);
});

test('getLiveWeatherAndAqi uses official CMA weather primary and enriches with AQI', async () => {
  clearCaches();
  const mockFetch = async url => {
    if (url.includes('weather.cma.cn/api/autocomplete')) {
      return makeResponse({ code: 0, data: ['58354|无锡|Wuxi|中国'] });
    }
    if (url.includes('weather.cma.cn/api/weather/view')) {
      return makeResponse({
        code: 0,
        data: {
          location: { id: '58354', name: '无锡', path: '中国, 江苏, 无锡', latitude: 31.61, longitude: 120.35 },
          now: { temperature: 14, feelst: 11.3, humidity: 26, precipitation: 0, windDirection: '西北风', windSpeed: 2.8, windScale: '微风' },
          daily: [{ date: '2026/11/21', dayText: '晴', nightText: '晴', low: 5, high: 14, dayWindScale: '微风' }],
          alarm: [],
          lastUpdate: '2026/11/21 12:00'
        }
      });
    }
    if (url.includes('air-quality-api.open-meteo.com')) {
      return makeResponse({ current: { time: '2026-11-21T12:00', us_aqi: 62, pm2_5: 17.2, pm10: 29.0 } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const res = await getLiveWeatherAndAqi({ city: '无锡', days: 1 }, { fetchImpl: mockFetch });
  assert.equal(res.ok, true);
  assert.match(res.source, /CMA/);
  assert.equal(res.current.tempC, 14);
  assert.equal(res.current.condition, '晴');
  assert.equal(res.airQuality.usAqi, 62);
  assert.equal(res.runningAdvice.suitability, 'ideal');
});

test('searchWeb parses 360 HTML, falls back to Bing RSS, and respects disable flag', async () => {
  clearCaches();
  const disabled = await searchWeb({ query: '无锡马拉松' }, { aiConfig: { webSearchEnabled: false } });
  assert.equal(disabled.ok, false);

  const soHtml = `
    <li class="res-list">
      <h3 class="res-title"><a href="https://www.so.com/link?m=abc" data-mdurl="https://wx.bendibao.com/2026.shtm">2026无锡马拉松<em>报名</em>攻略</a></h3>
      <p>2026无锡马拉松定档3月22日，设全马和半马项目。</p>
      <span>反馈</span>
    </li>
  `;
  const parsedSo = parseSo360Html(soHtml, 5);
  assert.equal(parsedSo.length, 1);
  assert.equal(parsedSo[0].url, 'https://wx.bendibao.com/2026.shtm');
  assert.equal(parsedSo[0].domain, 'wx.bendibao.com');
  assert.match(parsedSo[0].snippet, /3月22日/);

  const bingXml = `<?xml version="1.0"?><rss><channel><item><title>无锡马拉松官网</title><link>https://wuximarathon.com</link><description>官方赛道信息</description></item></channel></rss>`;
  assert.equal(parseBingRssXml(bingXml, 3)[0].domain, 'wuximarathon.com');

  // Test fallback chain: 360 empty -> Bing RSS succeeds
  const fallbackRes = await searchWeb(
    { query: '无锡马拉松赛道', limit: 3 },
    {
      aiConfig: { webSearchEnabled: true, tavilyApiKey: '' },
      fetchImpl: async url => {
        if (url.includes('www.so.com')) return makeResponse('<html>no results</html>');
        if (url.includes('cn.bing.com')) return makeResponse(bingXml);
        throw new Error(`Unexpected URL: ${url}`);
      }
    }
  );
  assert.equal(fallbackRes.ok, true);
  assert.equal(fallbackRes.provider, 'bing-rss');
  assert.equal(fallbackRes.results.length, 1);
});
