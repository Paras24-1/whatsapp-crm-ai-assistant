// ============================================================
// In-Memory Rate Limiter per User (Sliding Window)
// ============================================================

interface RateLimitRecord {
  timestamps: number[]
}

const windowMs = 60 * 1000 // 1 minute
const maxRequestsPerWindow = 20 // 20 requests per minute per user

const rateLimitMap = new Map<string, RateLimitRecord>()

// Cleanup stale entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    rateLimitMap.forEach((record, key) => {
      record.timestamps = record.timestamps.filter((t: number) => now - t < windowMs)
      if (record.timestamps.length === 0) {
        rateLimitMap.delete(key)
      }
    })
  }, 5 * 60 * 1000)
}

export function checkRateLimit(userId: string): {
  allowed: boolean
  limit: number
  remaining: number
  resetInSeconds: number
} {
  const now = Date.now()
  let record = rateLimitMap.get(userId)

  if (!record) {
    record = { timestamps: [] }
    rateLimitMap.set(userId, record)
  }

  // Remove timestamps outside the sliding window
  record.timestamps = record.timestamps.filter((t) => now - t < windowMs)

  if (record.timestamps.length >= maxRequestsPerWindow) {
    const oldest = record.timestamps[0]
    const resetInSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
    return {
      allowed: false,
      limit: maxRequestsPerWindow,
      remaining: 0,
      resetInSeconds,
    }
  }

  record.timestamps.push(now)
  const remaining = maxRequestsPerWindow - record.timestamps.length
  return {
    allowed: true,
    limit: maxRequestsPerWindow,
    remaining,
    resetInSeconds: Math.ceil(windowMs / 1000),
  }
}
