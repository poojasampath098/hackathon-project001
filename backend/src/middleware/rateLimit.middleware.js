const logger = require("../core/logger");

const buckets = new Map();

function cleanup() {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > 120000) {
      buckets.delete(key);
    }
  }
}

let cleanupTimer = setInterval(cleanup, 60000);
if (cleanupTimer.unref) cleanupTimer.unref();

function rateLimit({ windowMs = 60000, max = 10, message = "Too many requests", keyGenerator } = {}) {
  return (req, res, next) => {
    const key = keyGenerator
      ? keyGenerator(req)
      : `${req.ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || now - bucket.windowStart > windowMs) {
      bucket = { windowStart: now, count: 0 };
      buckets.set(key, bucket);
    }

    bucket.count++;

    if (bucket.count > max) {
      logger.warn("Rate limit exceeded", { key, count: bucket.count });
      return res.status(429).json({ success: false, message });
    }

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - bucket.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil((bucket.windowStart + windowMs) / 1000));

    next();
  };
}

// Test/utility hook: clears all in-memory rate-limit buckets. Not used by the
// application runtime; lets tests exercise a limiter from a clean slate without
// depending on cross-test accumulation in the shared module-level Map.
function resetRateLimits() {
  buckets.clear();
}

module.exports = { rateLimit, resetRateLimits };
