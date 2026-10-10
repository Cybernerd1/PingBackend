/**
 * Purge job — hard-deletes soft-deleted accounts after the retention
 * window, plus expired refresh tokens. Zero new dependencies (setInterval).
 *
 * Deliberately NOT cron-library based: one interval, one query, idempotent,
 * safe to run in a single-instance deployment. If you scale to multiple
 * instances, gate this behind a leader election or run it as a separate
 * one-shot container (npm run jobs:purge) from your scheduler.
 *
 * Config (.env):
 *   PURGE_RETENTION_DAYS  — days between soft delete and hard purge (default 30)
 *   PURGE_INTERVAL_HOURS  — how often the job runs        (default 24)
 *   RUN_PURGE_JOB         — set to "false" to disable     (default on)
 */
import { adminRepository } from '../db/repositories/admin.repository.js';
import logger from '../utils/logger.js';

const retentionDays = Number(process.env.PURGE_RETENTION_DAYS) || 30;
const intervalHours = Number(process.env.PURGE_INTERVAL_HOURS) || 24;

export const runPurgeOnce = async () => {
  const purgedUsers = await adminRepository.purgeDeletedUsers(retentionDays);
  const purgedTokens = await adminRepository.purgeExpiredRefreshTokens();

  if (purgedUsers.length || purgedTokens) {
    logger.info(
      { purged_users: purgedUsers.length, purged_refresh_tokens: purgedTokens },
      'Purge job completed'
    );
  }
  return { purgedUsers: purgedUsers.length, purgedTokens };
};

export const startPurgeJob = () => {
  if (process.env.RUN_PURGE_JOB === 'false') {
    logger.info('Purge job disabled (RUN_PURGE_JOB=false)');
    return;
  }

  logger.info(
    { retentionDays, intervalHours },
    'Purge job scheduled (soft-deleted users + expired refresh tokens)'
  );

  // First run shortly after boot so a missed previous cycle catches up,
  // then on the configured interval. Never crash the server over it.
  const tick = () =>
    runPurgeOnce().catch((err) => {
      logger.error({ err }, 'Purge job failed');
    });

  const initialDelayMs = 30_000;
  setTimeout(tick, initialDelayMs);
  const handle = setInterval(tick, intervalHours * 60 * 60 * 1000);
  handle.unref?.(); // don't keep the process alive just for the job
};
