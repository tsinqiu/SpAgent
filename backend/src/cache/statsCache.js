const { LRUCache } = require('lru-cache');
const config = require('../config');

const maxEntries = 256;
const ttlSeconds = config.cache.statsTtlSeconds;
const cache = new LRUCache({ max: maxEntries, ttl: Math.max(0, ttlSeconds * 1000), ttlAutopurge: true });
const pending = new Map();

async function load(req, filters, fetchData) {
  if (ttlSeconds <= 0) return { data: await fetchData(), hit: false };

  // Filters have already been validated and normalized by the route.
  const key = JSON.stringify([req.path, req.user?.id, req.user?.role, filters]);
  const cached = cache.get(key);
  if (cached !== undefined) return { data: cached, hit: true };
  if (pending.has(key)) return { data: await pending.get(key), hit: false };
  if (pending.size >= maxEntries) return { data: await fetchData(), hit: false };

  const result = Promise.resolve().then(fetchData);
  pending.set(key, result);
  try {
    const data = await result;
    if (pending.get(key) === result) cache.set(key, data);
    return { data, hit: false };
  } finally {
    if (pending.get(key) === result) pending.delete(key);
  }
}

function clear() {
  cache.clear();
  pending.clear();
}

function stats() {
  return { enabled: ttlSeconds > 0, ttlSeconds, size: cache.size };
}

module.exports = { load, clear, stats };
