const db = require('../db');

const SOURCE_SITE = 'chinamarathon';
const SOURCE_BASE_URL = 'https://chinamarathon.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const DEFAULT_MAX_PAGES = 9;
const DEFAULT_MAX_DETAILS = 24;
const DEFAULT_STALE_MS = 12 * 60 * 60 * 1000;
const MANUAL_COOLDOWN_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;

const DOMESTIC_PREFIXES = [
  '北京', '天津', '上海', '重庆', '河北', '山西', '辽宁', '吉林', '黑龙江',
  '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南',
  '广东', '海南', '四川', '贵州', '云南', '陕西', '甘肃', '青海', '台湾',
  '内蒙古', '广西', '西藏', '宁夏', '新疆', '香港', '澳门', '中国'
];

const EXCLUDED_KEYWORDS_RE = /越野|UTP|UTMB|山地|登高|垂直|爬楼|铁人三项|铁三|骑行|自行车|徒步|游泳|线上|虚拟|荧光|彩色跑|Color\s*Run|接力|迷你马拉松|微马拉松|欢乐跑|健康跑|亲子跑|儿童跑|少年跑|校园跑/i;
const SHORT_ONLY_RE = /(?:\b10\s*km\b|\b5\s*km\b|\b8\s*km\b|10公里|十公里|5公里|五公里|女子10|丽人18|新年跑|迎新跑)/i;
const EXPLICIT_HALF_RE = /半程马拉松|半马|21\.0975\s*公里/i;
const EXPLICIT_FULL_RE = /全程马拉松|全马|42\.195\s*公里|设马拉松[（(]\s*42/i;

let activeCrawlPromise = null;
let lastManualRefreshMs = 0;
let lastCrawlError = null;
let lastCrawlAttemptAt = null;

function getShanghaiToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

function addDaysToIso(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function daysBetweenIso(fromIso, toIso) {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&mdash;/gi, '—')
    .replace(/&middot;/gi, '·')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseLocationParts(rawLocation) {
  const cleaned = decodeHtmlEntities(rawLocation).replace(/[·•]/g, '・');
  if (!cleaned) {
    return { province: '', city: '', locationDetail: '' };
  }
  const parts = cleaned.split('・').map((part) => part.trim()).filter(Boolean);
  const province = (parts[0] || '').slice(0, 64);
  const city = (parts[1] || parts[0] || '').slice(0, 96);
  const locationDetail = cleaned.slice(0, 255);
  return { province, city, locationDetail };
}

function isDomesticEvent(name, location, detailText = '') {
  const loc = String(location || '').trim();
  if (loc) {
    return DOMESTIC_PREFIXES.some((prefix) => loc.startsWith(prefix));
  }
  if (/中国大陆|香港|澳门|台湾/.test(detailText)) {
    return true;
  }
  // If location is blank on list page, check common domestic indicators or exclude obvious foreign cities
  if (/芝加哥|柏林|东京|波士顿|伦敦|纽约|巴黎|开普敦|悉尼|首尔|新加坡|曼谷|大阪|名古屋|布拉格|罗马|维也纳/.test(name)) {
    return false;
  }
  return /[\u4e00-\u9fa5]/.test(name);
}

function classifyMarathonRace(name, detailText = '') {
  const safeName = String(name || '').trim();
  const safeDetail = String(detailText || '').trim();
  if (!safeName) return null;

  const hasExplicitHalfName = EXPLICIT_HALF_RE.test(safeName);
  const hasExplicitFullName = EXPLICIT_FULL_RE.test(safeName);

  // Reject trail/triathlon/fun/virtual/kids races unless explicitly half/full marathon
  if (EXCLUDED_KEYWORDS_RE.test(safeName) && !hasExplicitHalfName && !hasExplicitFullName) {
    return null;
  }
  // Reject 10K / 5K / short races unless name explicitly includes half/full marathon
  if (SHORT_ONLY_RE.test(safeName) && !hasExplicitHalfName && !hasExplicitFullName) {
    return null;
  }

  // Must mention marathon in name or detail
  const mentionsMarathon = /马拉松|半马|全马/.test(safeName);
  if (!mentionsMarathon) {
    return null;
  }

  // Check detail text first if available for exact full / half categories
  if (safeDetail) {
    const detailHasFull = /全程马拉松|42\.195\s*公里|马拉松[（(]\s*42\.195|设马拉松|全马项目|全程项目/.test(safeDetail);
    const detailHasHalf = /半程马拉松|21\.0975\s*公里|半马项目|半程项目/.test(safeDetail);
    if (detailHasFull && detailHasHalf) {
      return { raceCategory: 'full_half', distanceLabel: '全马 / 半马' };
    }
    if (detailHasHalf && !detailHasFull) {
      return { raceCategory: 'half', distanceLabel: '半马' };
    }
    if (detailHasFull && !detailHasHalf) {
      return { raceCategory: 'full', distanceLabel: '全马' };
    }
  }

  if (hasExplicitHalfName && hasExplicitFullName) {
    return { raceCategory: 'full_half', distanceLabel: '全马 / 半马' };
  }
  if (hasExplicitHalfName) {
    return { raceCategory: 'half', distanceLabel: '半马' };
  }
  if (hasExplicitFullName) {
    return { raceCategory: 'full', distanceLabel: '全马' };
  }

  // General city marathon (e.g. "2026上海马拉松", "2026海口马拉松") defaults to full_half / full
  return { raceCategory: 'full', distanceLabel: '全马' };
}

function parseListPageHtml(html) {
  const results = [];
  const cardRe = /<a\s+href="(https:\/\/chinamarathon\.com\/events\/(\d+))"[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)<\/a>/g;
  for (const match of html.matchAll(cardRe)) {
    const fullCard = match[0];
    const sourceUrl = match[1];
    const sourceEventId = match[2];
    const name = decodeHtmlEntities(match[3]);
    const tail = match[4];

    const dateMatch = tail.match(/(\d{4})年(\d{2})月(\d{2})日/);
    if (!dateMatch) continue;
    const eventDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;

    const locMatch = tail.match(/line-clamp-1">\s*([\s\S]*?)\s*<\/span>/);
    const rawLocation = locMatch ? locMatch[1] : '';
    const { province, city, locationDetail } = parseLocationParts(rawLocation);

    const imgMatch = fullCard.match(/<img[^>]+src="([^"]+)"/i);
    const coverUrl = imgMatch ? imgMatch[1].trim().slice(0, 512) : null;

    results.push({
      sourceSite: SOURCE_SITE,
      sourceEventId,
      name: name.slice(0, 255),
      eventDate,
      province,
      city,
      locationDetail,
      coverUrl,
      sourceUrl: sourceUrl.slice(0, 512)
    });
  }
  return results;
}

function parseDetailPageHtml(html, eventDate) {
  const plain = decodeHtmlEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );

  // Extract main intro section between 赛事简介 and 亮点 / 详情 / 相关赛事
  const introMatch = plain.match(/赛事简介\s+([\s\S]{10,600}?)(?:\s+(?:资格要求|亮点|详情\s*\/\s*报名|联系方式|相关赛事)|$)/);
  const summary = introMatch ? introMatch[1].trim().slice(0, 220) : '';

  // Extract country/region if present
  const regionMatch = plain.match(/国家\/地区\s+([^\s]+)/);
  const region = regionMatch ? regionMatch[1] : '';

  // Extract registration deadline if a range like "2026年10月28日14:00-11月27日18:00" or "截止2026年12月10日" appears
  let registrationDeadline = null;
  const fullRangeMatch = plain.match(/(\d{4})年(\d{1,2})月(\d{1,2})日[^-至到]{0,12}[-–—至到]\s*(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/);
  if (fullRangeMatch) {
    const endYear = Number(fullRangeMatch[4] || fullRangeMatch[1]);
    const endMonth = String(Number(fullRangeMatch[5])).padStart(2, '0');
    const endDay = String(Number(fullRangeMatch[6])).padStart(2, '0');
    registrationDeadline = `${endYear}-${endMonth}-${endDay}`;
  } else {
    const deadlineMatch = plain.match(/(?:报名截止|截止时间|截止至)[^\d]{0,8}(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})/);
    if (deadlineMatch) {
      registrationDeadline = `${deadlineMatch[1]}-${String(Number(deadlineMatch[2])).padStart(2, '0')}-${String(Number(deadlineMatch[3])).padStart(2, '0')}`;
    }
  }

  const today = getShanghaiToday();
  let registrationStatus = '';
  if (registrationDeadline) {
    if (registrationDeadline < today) {
      registrationStatus = '报名已截止';
    } else if (/抽签/.test(summary)) {
      registrationStatus = '预报名 / 抽签';
    } else {
      registrationStatus = '报名开放中';
    }
  } else if (/已截止|额满|名额已满/.test(summary)) {
    registrationStatus = '名额紧张 / 已截止';
  } else if (/开放报名|先报先得|报名中|火热报名/.test(summary)) {
    registrationStatus = '报名开放中';
  } else if (eventDate && daysBetweenIso(today, eventDate) > 60) {
    registrationStatus = '即将开启报名';
  } else {
    registrationStatus = '查看赛事公告';
  }

  return {
    detailText: `${region} ${summary}`.trim(),
    summary,
    registrationDeadline,
    registrationStatus
  };
}

async function fetchHtml(url, fetchImpl = globalThis.fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9'
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function crawlUpcomingMarathonEvents({
  fetchImpl = globalThis.fetch,
  maxPages = DEFAULT_MAX_PAGES,
  maxDetails = DEFAULT_MAX_DETAILS,
  windowDays = 180,
  today = getShanghaiToday()
} = {}) {
  const maxDate = addDaysToIso(today, windowDays);
  const seen = new Map();

  for (let page = 1; page <= maxPages; page += 1) {
    const url = page === 1 ? `${SOURCE_BASE_URL}/` : `${SOURCE_BASE_URL}/?page=${page}`;
    let html;
    try {
      html = await fetchHtml(url, fetchImpl);
    } catch (error) {
      if (page === 1) throw error;
      break;
    }

    const cards = parseListPageHtml(html);
    if (!cards.length) break;

    let anyFutureOnPage = false;
    for (const card of cards) {
      if (card.eventDate >= today) {
        anyFutureOnPage = true;
      }
      if (card.eventDate < today || card.eventDate > maxDate) continue;
      if (seen.has(card.sourceEventId)) continue;
      if (!isDomesticEvent(card.name, card.locationDetail)) continue;

      const initialClassification = classifyMarathonRace(card.name);
      if (!initialClassification) continue;

      seen.set(card.sourceEventId, {
        ...card,
        ...initialClassification,
        registrationStatus: '查看赛事公告',
        registrationDeadline: null,
        summary: ''
      });
    }

    // Pages are ordered descending by event date; stop once a full page is in the past
    if (!anyFutureOnPage && page >= 3) {
      break;
    }
  }

  const upcoming = [...seen.values()].sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  // Enrich the nearest upcoming events with detail pages for accurate 全马/半马 labels & registration info
  const targetsForDetail = upcoming.slice(0, maxDetails);
  await mapWithConcurrency(targetsForDetail, 4, async (item) => {
    try {
      const detailHtml = await fetchHtml(item.sourceUrl, fetchImpl);
      const detail = parseDetailPageHtml(detailHtml, item.eventDate);
      if (!isDomesticEvent(item.name, item.locationDetail, detail.detailText)) {
        item._exclude = true;
        return;
      }
      const refined = classifyMarathonRace(item.name, detail.detailText);
      if (!refined) {
        item._exclude = true;
        return;
      }
      item.raceCategory = refined.raceCategory;
      item.distanceLabel = refined.distanceLabel;
      item.summary = detail.summary;
      item.registrationDeadline = detail.registrationDeadline;
      item.registrationStatus = detail.registrationStatus;
    } catch {
      // Keep list-page classification if individual detail page times out
    }
  });

  return upcoming.filter((item) => !item._exclude);
}

async function upsertMarathonEvents(events, dbClient = db) {
  if (!events.length) return 0;
  let affected = 0;
  const sql = `
    INSERT INTO MarathonEvents (
      source_site,
      source_event_id,
      name,
      event_date,
      province,
      city,
      location_detail,
      race_category,
      distance_label,
      registration_status,
      registration_deadline,
      summary,
      cover_url,
      source_url,
      crawled_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      event_date = VALUES(event_date),
      province = VALUES(province),
      city = VALUES(city),
      location_detail = VALUES(location_detail),
      race_category = VALUES(race_category),
      distance_label = VALUES(distance_label),
      registration_status = IF(VALUES(registration_status) <> '', VALUES(registration_status), registration_status),
      registration_deadline = COALESCE(VALUES(registration_deadline), registration_deadline),
      summary = IF(VALUES(summary) IS NOT NULL AND VALUES(summary) <> '', VALUES(summary), summary),
      cover_url = COALESCE(VALUES(cover_url), cover_url),
      source_url = VALUES(source_url),
      crawled_at = NOW(3)
  `;

  for (const event of events) {
    await dbClient.query(sql, [
      event.sourceSite || SOURCE_SITE,
      String(event.sourceEventId),
      event.name,
      event.eventDate,
      event.province || '',
      event.city || '',
      event.locationDetail || '',
      event.raceCategory,
      event.distanceLabel,
      event.registrationStatus || '',
      event.registrationDeadline || null,
      event.summary || null,
      event.coverUrl || null,
      event.sourceUrl
    ]);
    affected += 1;
  }
  return affected;
}

function toEventDto(row, today = getShanghaiToday()) {
  const eventDate = String(row.eventDate || '').slice(0, 10);
  const daysLeft = eventDate ? daysBetweenIso(today, eventDate) : null;
  const cityLabel = row.province && row.city && row.province !== row.city
    ? `${row.province}·${row.city}`
    : (row.city || row.province || '国内');
  return {
    id: `crawl-${row.sourceEventId}`,
    dbId: row.id,
    sourceEventId: row.sourceEventId,
    name: row.name,
    date: eventDate,
    daysUntil: daysLeft,
    province: row.province || '',
    city: cityLabel,
    locationDetail: row.locationDetail || cityLabel,
    raceCategory: row.raceCategory,
    distance: row.distanceLabel,
    type: '路跑',
    registrationStatus: row.registrationStatus || '查看赛事公告',
    registrationEnd: row.registrationDeadline ? String(row.registrationDeadline).slice(0, 10) : null,
    note: row.summary || '',
    coverUrl: row.coverUrl || '',
    source: row.sourceUrl,
    crawledAt: row.crawledAt
  };
}

async function getCrawlStatus(dbClient = db) {
  const rows = await dbClient.query(
    'SELECT COUNT(*) AS total, MAX(crawled_at) AS lastCrawledAt FROM MarathonEvents WHERE event_date >= ?',
    [getShanghaiToday()]
  );
  return {
    upcomingCount: Number(rows[0]?.total || 0),
    lastCrawledAt: rows[0]?.lastCrawledAt || null
  };
}

async function refreshUpcomingEvents({ force = false, dbClient = db, fetchImpl = globalThis.fetch } = {}) {
  if (activeCrawlPromise) {
    return activeCrawlPromise;
  }

  const now = Date.now();
  const status = await getCrawlStatus(dbClient);
  if (force && status.upcomingCount > 0 && now - lastManualRefreshMs < MANUAL_COOLDOWN_MS) {
    return {
      crawled: 0,
      skipped: true,
      reason: 'cooldown',
      lastCrawledAt: status.lastCrawledAt
    };
  }

  if (!force && status.upcomingCount > 0 && status.lastCrawledAt) {
    const ageMs = now - Date.parse(status.lastCrawledAt);
    if (Number.isFinite(ageMs) && ageMs < DEFAULT_STALE_MS) {
      return {
        crawled: 0,
        skipped: true,
        reason: 'fresh',
        lastCrawledAt: status.lastCrawledAt
      };
    }
  }

  activeCrawlPromise = (async () => {
    lastCrawlAttemptAt = new Date().toISOString();
    try {
      const events = await crawlUpcomingMarathonEvents({ fetchImpl });
      if (!events.length) {
        lastCrawlError = '源站未解析出有效半马/全马赛事，已保留现有缓存赛历';
        return {
          crawled: 0,
          skipped: true,
          reason: 'empty_parse',
          lastCrawledAt: status.lastCrawledAt
        };
      }
      const saved = await upsertMarathonEvents(events, dbClient);
      lastManualRefreshMs = Date.now();
      lastCrawlError = null;
      return {
        crawled: saved,
        skipped: false,
        lastCrawledAt: new Date().toISOString()
      };
    } catch (error) {
      lastCrawlError = error?.message || '赛事抓取失败';
      throw error;
    } finally {
      activeCrawlPromise = null;
    }
  })();

  return activeCrawlPromise;
}

const MAJOR_CITY_KEYWORDS = [
  '上海', '北京', '广州', '深圳', '杭州', '南京', '厦门', '武汉', '成都',
  '重庆', '苏州', '无锡', '西安', '长沙', '青岛', '大连', '福州', '海口',
  '香港', '澳门', '天津', '郑州', '合肥', '济南', '兰州', '哈尔滨', '昆明', '宁波'
];

function scoreFeaturedEvent(event) {
  let score = 0;
  const text = `${event.province}${event.city}${event.name}`;
  if (MAJOR_CITY_KEYWORDS.some((city) => text.includes(city))) score += 30;
  if (event.raceCategory === 'full_half') score += 12;
  if (event.raceCategory === 'full') score += 8;
  if (event.registrationStatus === '报名开放中' || event.registrationStatus === '预报名 / 抽签') score += 18;
  if (event.daysUntil != null && event.daysUntil >= 5 && event.daysUntil <= 90) score += 15;
  if (event.coverUrl) score += 4;
  return score;
}

function selectFeaturedEvents(items, limit) {
  if (items.length <= limit) return items;
  // Group by event date so one busy Sunday does not dominate the home preview
  const byDate = new Map();
  for (const item of items) {
    const list = byDate.get(item.date) || [];
    list.push(item);
    byDate.set(item.date, list);
  }

  const picked = [];
  const usedIds = new Set();

  // Pass 1: take the best event from each distinct upcoming date (preferring >= 3 days out first)
  const sortedDates = [...byDate.keys()].sort();
  const preferredDates = sortedDates.filter((d) => {
    const first = byDate.get(d)[0];
    return first && first.daysUntil >= 3;
  });
  const orderedDates = [...preferredDates, ...sortedDates.filter((d) => !preferredDates.includes(d))];

  for (const date of orderedDates) {
    if (picked.length >= limit) break;
    const candidates = [...byDate.get(date)].sort((a, b) => scoreFeaturedEvent(b) - scoreFeaturedEvent(a));
    const best = candidates[0];
    if (best && !usedIds.has(best.id)) {
      picked.push(best);
      usedIds.add(best.id);
    }
  }

  // Pass 2: fill remaining slots with highest-scoring unpicked events
  if (picked.length < limit) {
    const rest = items
      .filter((item) => !usedIds.has(item.id))
      .sort((a, b) => scoreFeaturedEvent(b) - scoreFeaturedEvent(a));
    for (const item of rest) {
      if (picked.length >= limit) break;
      picked.push(item);
      usedIds.add(item.id);
    }
  }

  return picked.sort((a, b) => a.date.localeCompare(b.date));
}

async function listUpcomingEvents({
  category = 'all',
  days = 120,
  limit = 30,
  city = '',
  featured = false,
  autoCrawlIfEmpty = true,
  dbClient = db,
  fetchImpl = globalThis.fetch
} = {}) {
  const safeDays = Math.min(Math.max(Number(days) || 120, 7), 365);
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const queryLimit = featured ? Math.max(safeLimit * 6, 80) : safeLimit;
  const today = getShanghaiToday();
  const endDate = addDaysToIso(today, safeDays);

  const status = await getCrawlStatus(dbClient);
  if (autoCrawlIfEmpty && status.upcomingCount === 0 && process.env.EVENT_CRAWLER_ENABLED !== 'false') {
    try {
      await refreshUpcomingEvents({ force: true, dbClient, fetchImpl });
    } catch (error) {
      console.warn(`[marathon-crawler] auto crawl failed: ${error.message}`);
    }
  } else if (status.lastCrawledAt && process.env.EVENT_CRAWLER_ENABLED !== 'false') {
    const ageMs = Date.now() - Date.parse(status.lastCrawledAt);
    if (Number.isFinite(ageMs) && ageMs >= DEFAULT_STALE_MS && !activeCrawlPromise) {
      refreshUpcomingEvents({ force: false, dbClient, fetchImpl }).catch((err) => {
        console.warn(`[marathon-crawler] background refresh failed: ${err.message}`);
      });
    }
  }

  const where = ['event_date >= ?', 'event_date <= ?'];
  const params = [today, endDate];

  if (category === 'full') {
    where.push("race_category IN ('full', 'full_half')");
  } else if (category === 'half') {
    where.push("race_category IN ('half', 'full_half')");
  }

  const trimmedCity = String(city || '').trim();
  if (trimmedCity) {
    where.push('(province LIKE ? OR city LIKE ? OR name LIKE ?)');
    const like = `%${trimmedCity}%`;
    params.push(like, like, like);
  }

  const rows = await dbClient.query(
    `
      SELECT
        id,
        source_event_id AS sourceEventId,
        name,
        event_date AS eventDate,
        province,
        city,
        location_detail AS locationDetail,
        race_category AS raceCategory,
        distance_label AS distanceLabel,
        registration_status AS registrationStatus,
        registration_deadline AS registrationDeadline,
        summary,
        cover_url AS coverUrl,
        source_url AS sourceUrl,
        crawled_at AS crawledAt
      FROM MarathonEvents
      WHERE ${where.join(' AND ')}
      ORDER BY event_date ASC, id ASC
      LIMIT ?
    `,
    [...params, queryLimit]
  );

  const countRows = await dbClient.query(
    `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN race_category IN ('full', 'full_half') THEN 1 ELSE 0 END) AS fullCount,
        SUM(CASE WHEN race_category IN ('half', 'full_half') THEN 1 ELSE 0 END) AS halfCount,
        MAX(crawled_at) AS lastCrawledAt
      FROM MarathonEvents
      WHERE event_date >= ? AND event_date <= ?
    `,
    [today, endDate]
  );

  const stats = countRows[0] || {};
  const mapped = rows.map((row) => toEventDto(row, today));
  const items = featured ? selectFeaturedEvents(mapped, safeLimit) : mapped;
  return {
    items,
    meta: {
      source: '中国马拉松 (chinamarathon.com)',
      lastCrawledAt: stats.lastCrawledAt || null,
      lastCrawlAttemptAt,
      lastCrawlError,
      windowDays: safeDays,
      category,
      featured: Boolean(featured),
      isRefreshing: Boolean(activeCrawlPromise),
      counts: {
        total: Number(stats.total || 0),
        full: Number(stats.fullCount || 0),
        half: Number(stats.halfCount || 0)
      }
    }
  };
}

function normalizeUserEventRow(row, today = getShanghaiToday()) {
  const eventDate = row.eventDate ? String(row.eventDate).slice(0, 10) : '';
  return {
    id: row.id,
    eventKey: row.eventKey,
    name: row.name,
    date: eventDate,
    daysUntil: eventDate ? daysBetweenIso(today, eventDate) : null,
    city: row.city || '',
    distance: row.distance || '',
    goal: row.goal || '',
    note: row.note || '',
    source: row.sourceUrl || '',
    type: '路跑',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function listUserEvents(userId, dbClient = db) {
  const today = getShanghaiToday();
  const rows = await dbClient.query(
    `
      SELECT
        id,
        event_key AS eventKey,
        name,
        event_date AS eventDate,
        city,
        distance,
        goal,
        note,
        source_url AS sourceUrl,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM UserMarathonEvents
      WHERE user_id = ?
      ORDER BY (event_date IS NULL) ASC, event_date ASC, id DESC
      LIMIT 100
    `,
    [userId]
  );
  return rows.map((row) => normalizeUserEventRow(row, today));
}

async function saveUserEvent(userId, payload, dbClient = db) {
  const name = String(payload?.name || '').trim().slice(0, 255);
  if (!name) {
    throw new Error('赛事名称不能为空');
  }
  const rawDate = String(payload?.date || '').trim().slice(0, 10);
  const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
  const city = String(payload?.city || '').trim().slice(0, 128);
  const distance = String(payload?.distance || '').trim().slice(0, 64);
  const goal = String(payload?.goal || '').trim().slice(0, 128);
  const note = String(payload?.note || '').trim().slice(0, 1000) || null;
  const rawSource = String(payload?.source || '').trim().slice(0, 512);
  const sourceUrl = /^https?:\/\//i.test(rawSource) ? rawSource : '';
  const eventKey = String(payload?.eventKey || payload?.id || `custom-${name}-${eventDate || 'tbd'}`)
    .trim()
    .slice(0, 96);

  await dbClient.query(
    `
      INSERT INTO UserMarathonEvents (
        user_id, event_key, name, event_date, city, distance, goal, note, source_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        event_date = VALUES(event_date),
        city = VALUES(city),
        distance = VALUES(distance),
        goal = VALUES(goal),
        note = VALUES(note),
        source_url = VALUES(source_url),
        updated_at = NOW(3)
    `,
    [userId, eventKey, name, eventDate, city, distance, goal, note, sourceUrl]
  );

  const rows = await dbClient.query(
    `
      SELECT
        id,
        event_key AS eventKey,
        name,
        event_date AS eventDate,
        city,
        distance,
        goal,
        note,
        source_url AS sourceUrl,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM UserMarathonEvents
      WHERE user_id = ? AND event_key = ?
      LIMIT 1
    `,
    [userId, eventKey]
  );
  return rows[0] ? normalizeUserEventRow(rows[0]) : null;
}

async function deleteUserEvent(userId, eventId, dbClient = db) {
  const result = await dbClient.query(
    'DELETE FROM UserMarathonEvents WHERE id = ? AND user_id = ?',
    [eventId, userId]
  );
  return { deleted: Number(result?.affectedRows || 0) > 0, id: eventId };
}

function startScheduler({ intervalMs = DEFAULT_STALE_MS } = {}) {
  if (process.env.EVENT_CRAWLER_ENABLED === 'false' || process.env.NODE_ENV === 'test') {
    return { stop: async () => {} };
  }

  const runSafe = () => {
    refreshUpcomingEvents({ force: false }).catch((error) => {
      console.warn(`[marathon-crawler] scheduled crawl error: ${error.message}`);
    });
  };

  const bootTimer = setTimeout(runSafe, 3000);
  bootTimer.unref?.();
  const interval = setInterval(runSafe, intervalMs);
  interval.unref?.();

  return {
    stop: async () => {
      clearTimeout(bootTimer);
      clearInterval(interval);
    }
  };
}

module.exports = {
  classifyMarathonRace,
  crawlUpcomingMarathonEvents,
  deleteUserEvent,
  isDomesticEvent,
  listUpcomingEvents,
  listUserEvents,
  parseDetailPageHtml,
  parseListPageHtml,
  refreshUpcomingEvents,
  saveUserEvent,
  startScheduler,
  upsertMarathonEvents
};
