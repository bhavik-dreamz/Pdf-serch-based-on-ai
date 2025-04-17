const NodeCache = require('node-cache');
const queryCache = new NodeCache({ stdTTL: 3600 }); // 1 hour TTL

function getCacheKey(query, pdfIds) {
  return `${query}_${pdfIds.sort().join('_')}`;
}

async function getCachedResponse(query, pdfIds) {
  const cacheKey = getCacheKey(query, pdfIds);
  return queryCache.get(cacheKey);
}

async function cacheResponse(query, pdfIds, response) {
  const cacheKey = getCacheKey(query, pdfIds);
  queryCache.set(cacheKey, response);
}