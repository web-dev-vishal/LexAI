/**
 * Enrichment Service
 *
 * Fetches data from public external APIs to enrich contract analysis:
 *   - REST Countries: country/jurisdiction validation, timezone
 *   - World Time API: accurate current time for expiry calculations
 *   - IPify: user's public IP for audit logging
 *   - Abstract API Holidays: public holiday checks for expiry dates
 *
 * All calls use HTTPS with a 5s timeout. Failures are NON-FATAL —
 * enrichment is optional, the app works fine without it.
 * Every function returns null on failure instead of throwing.
 */

import axios from 'axios';
import logger from '../utils/logger.js';

const TIMEOUT = 5000; // 5s timeout — fail fast for external API calls

/**
 * Get country information for jurisdiction enrichment.
 * Used to enrich contracts with region, timezone, and currency data.
 *
 * @param {string} countryName - e.g., "United States"
 * @returns {Promise<object|null>} Country info or null on failure
 */
export async function getCountryInfo(countryName) {
    try {
        const baseUrl = process.env.REST_COUNTRIES_URL || 'https://restcountries.com/v3.1';
        const response = await axios.get(`${baseUrl}/name/${encodeURIComponent(countryName)}`, {
            timeout: TIMEOUT,
            params: { fields: 'name,region,subregion,currencies,timezones,capital' },
        });

        const country = response.data?.[0];
        if (!country) return null;

        const currencies = country.currencies ? Object.keys(country.currencies) : [];
        return {
            name: country.name?.common || countryName,
            region: country.region,
            subregion: country.subregion,
            currency: currencies[0] || 'USD',   // Default to USD if no currency found
            timezones: country.timezones || [],
            capital: country.capital?.[0] || '',
        };
    } catch (err) {
        logger.warn(`REST Countries API failed for "${countryName}": ${err.message}`);
        return null; // Non-fatal — enrichment is optional
    }
}

/**
 * Get the current time for a timezone (used for accurate expiry calculations).
 * Useful when the server is in a different timezone than the contract's jurisdiction.
 *
 * @param {string} timezone - e.g., "America/New_York"
 * @returns {Promise<object|null>}
 */
export async function getWorldTime(timezone) {
    try {
        const baseUrl = process.env.WORLD_TIME_API_URL || 'https://worldtimeapi.org/api';
        const response = await axios.get(`${baseUrl}/timezone/${timezone}`, { timeout: TIMEOUT });
        return {
            datetime: response.data?.datetime,
            timezone: response.data?.timezone,
            utcOffset: response.data?.utc_offset,
        };
    } catch (err) {
        logger.warn(`World Time API failed for "${timezone}": ${err.message}`);
        return null;
    }
}

/**
 * Get the user's public IP address (for audit logging).
 * Calls ipify.org — returns null if the service is unavailable.
 *
 * @returns {Promise<string|null>}
 */
export async function getPublicIP() {
    try {
        const response = await axios.get('https://api.ipify.org', {
            params: { format: 'json' },
            timeout: TIMEOUT,
        });
        return response.data?.ip || null;
    } catch (err) {
        logger.warn('IPify API failed:', err.message);
        return null;
    }
}

/**
 * Check if a date falls on a public holiday in a given country.
 * Uses Abstract API Holidays (requires API key for production).
 * Useful for warning users if a contract expires on a holiday.
 *
 * @param {string} country - 2-letter country code (e.g., "US")
 * @param {Date} date - The date to check
 * @returns {Promise<object|null>} Holiday info or null if unavailable
 */
export async function checkHoliday(country, date) {
    try {
        const apiKey = process.env.ABSTRACT_API_KEY;
        if (!apiKey) {
            logger.debug('Abstract API key not configured — skipping holiday check');
            return null;
        }

        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();

        const response = await axios.get('https://holidays.abstractapi.com/v1/', {
            params: { api_key: apiKey, country, year, month, day },
            timeout: TIMEOUT,
        });

        const holidays = response.data;
        if (Array.isArray(holidays) && holidays.length > 0) {
            return {
                isHoliday: true,
                holidays: holidays.map((h) => ({ name: h.name, type: h.type })),
            };
        }

        return { isHoliday: false, holidays: [] };
    } catch (err) {
        logger.warn('Holiday API check failed:', err.message);
        return null;
    }
}
