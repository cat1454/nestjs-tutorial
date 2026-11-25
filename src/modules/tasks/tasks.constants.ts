export const DAILY_DIGEST_CRON = '0 8 * * *';
export const ORPHAN_AVATARS_CLEANUP_CRON = '0 3 * * *';

export const DAILY_DIGEST_LOOKBACK_HOURS = 24;
export const DAILY_DIGEST_TOP_ARTICLES_LIMIT = 5;

export const CRON_LOCK_TTL_SECONDS = 23 * 60 * 60;
export const DAILY_DIGEST_LOCK_KEY_PREFIX = 'cron:lock:daily-articles-digest';
export const ORPHAN_AVATARS_LOCK_KEY_PREFIX =
  'cron:lock:cleanup-orphan-avatars';
