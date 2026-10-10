/**
 * Admin stats controller
 *
 * GET /api/v1/admin/stats/overview  — KPI counts (cached 60s)
 * GET /api/v1/admin/stats/signups   — daily signup time series
 * GET /api/v1/admin/stats/matches   — daily match time series
 */
import { adminRepository } from '../../db/repositories/admin.repository.js';
import * as R from '../../utils/response.js';

// Simple in-process 60s cache (single instance is fine for a dashboard)
let overviewCache = null;
let overviewCachedAt = 0;
const CACHE_TTL_MS = 60_000;

// ── GET /api/v1/admin/stats/overview ─────────────────────────────────
export const getOverview = async (req, res, next) => {
  try {
    if (overviewCache && Date.now() - overviewCachedAt < CACHE_TTL_MS) {
      return R.success(res, overviewCache, 'Stats fetched (cached)');
    }
    const stats = await adminRepository.getOverviewStats();
    overviewCache = stats;
    overviewCachedAt = Date.now();
    return R.success(res, stats, 'Stats fetched');
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/admin/stats/signups ──────────────────────────────────
export const getSignupTimeSeries = async (req, res, next) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 365);
    const data = await adminRepository.getSignupTimeSeries(days);
    return R.success(res, { days, series: data }, 'Signup series fetched');
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/admin/stats/matches ──────────────────────────────────
export const getMatchTimeSeries = async (req, res, next) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 365);
    const data = await adminRepository.getMatchTimeSeries(days);
    return R.success(res, { days, series: data }, 'Match series fetched');
  } catch (err) {
    next(err);
  }
};
