/**
 * Enrichment Controller
 *
 * Exposes enrichment data from public APIs:
 *   - Country info for jurisdiction enrichment
 *   - World time for timezone-aware expiry calculations
 *   - Holiday checks for expiry date warnings
 *
 * All endpoints are non-critical — they return null/empty on failure
 * so the frontend can gracefully degrade.
 */

import * as enrichmentService from '../services/enrichment.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import HTTP from '../constants/httpStatus.js';

/**
 * GET /enrichment/country/:name
 * Get country information for jurisdiction enrichment.
 */
export async function getCountryInfo(req, res) {
    const { name } = req.params;

    if (!name || name.trim().length < 2) {
        return res.status(HTTP.BAD_REQUEST).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Country name must be at least 2 characters.' },
        });
    }

    const data = await enrichmentService.getCountryInfo(name);

    if (!data) {
        return res.status(HTTP.NOT_FOUND).json({
            success: false,
            error: { code: 'NOT_FOUND', message: `Could not find country: ${name}` },
        });
    }

    sendSuccess(res, { country: data });
}

/**
 * GET /enrichment/time/:timezone
 * Get current time for a timezone.
 */
export async function getWorldTime(req, res) {
    const { timezone } = req.params;

    const data = await enrichmentService.getWorldTime(timezone);

    if (!data) {
        return res.status(HTTP.NOT_FOUND).json({
            success: false,
            error: { code: 'NOT_FOUND', message: `Could not fetch time for timezone: ${timezone}` },
        });
    }

    sendSuccess(res, { time: data });
}

/**
 * GET /enrichment/holidays?country=US&date=2026-03-15
 * Check if a date falls on a public holiday.
 */
export async function checkHoliday(req, res) {
    const { country, date } = req.query;

    if (!country || !date) {
        return res.status(HTTP.BAD_REQUEST).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Both country (2-letter code) and date (YYYY-MM-DD) are required.' },
        });
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
        return res.status(HTTP.BAD_REQUEST).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Invalid date format. Use YYYY-MM-DD.' },
        });
    }

    const data = await enrichmentService.checkHoliday(country, parsedDate);

    if (!data) {
        return sendSuccess(res, { holiday: { isHoliday: false, holidays: [], note: 'Holiday API unavailable' } });
    }

    sendSuccess(res, { holiday: data });
}
