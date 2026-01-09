/**
 * Window Manager Library
 * Handles temporal window splitting and date range management for time series analysis
 */

export const DEFAULT_WINDOW_CONFIG = {
    windowSizeDays: 10,
    minWindows: 3,
    maxWindows: 18,
};

/**
 * Split a date range into fixed-size temporal windows
 */
export function splitIntoWindows(startDate, endDate, windowSizeDays = 10) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error('Invalid date format. Expected YYYY-MM-DD');
    }

    if (end <= start) {
        throw new Error('End date must be after start date');
    }

    const windows = [];
    let currentStart = new Date(start);

    while (currentStart < end) {
        const currentEnd = new Date(currentStart);
        currentEnd.setDate(currentEnd.getDate() + windowSizeDays);

        const windowEnd = currentEnd > end ? end : currentEnd;

        windows.push({
            startDate: formatDate(currentStart),
            endDate: formatDate(windowEnd),
        });

        currentStart = new Date(windowEnd);
    }

    return windows;
}

/**
 * Validate date range for trend analysis
 */
export function validateDateRange(startDate, endDate, config = DEFAULT_WINDOW_CONFIG) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime())) {
        return { valid: false, error: `Invalid start date: ${startDate}` };
    }

    if (isNaN(end.getTime())) {
        return { valid: false, error: `Invalid end date: ${endDate}` };
    }

    if (end <= start) {
        return { valid: false, error: 'End date must be after start date' };
    }

    const daysBetween = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const windowCount = Math.floor(daysBetween / config.windowSizeDays);

    const minDays = config.minWindows * config.windowSizeDays;
    if (daysBetween < minDays) {
        return {
            valid: false,
            error: `Date range must be at least ${minDays} days (${config.minWindows} windows of ${config.windowSizeDays} days)`,
            windowCount,
        };
    }

    const maxDays = config.maxWindows * config.windowSizeDays;
    if (daysBetween > maxDays) {
        return {
            valid: false,
            error: `Date range cannot exceed ${maxDays} days (${config.maxWindows} windows of ${config.windowSizeDays} days)`,
            windowCount,
        };
    }

    return { valid: true, windowCount };
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
