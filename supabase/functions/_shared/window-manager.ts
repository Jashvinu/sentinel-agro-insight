/**
 * Window Manager Library
 * Handles temporal window splitting and date range management for time series analysis
 */

export interface TimeWindow {
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD
}

export interface WindowConfig {
    windowSizeDays: number; // Window size in days (e.g., 10)
    minWindows: number; // Minimum number of windows required
    maxWindows: number; // Maximum number of windows allowed
}

// Default configuration
export const DEFAULT_WINDOW_CONFIG: WindowConfig = {
    windowSizeDays: 10,
    minWindows: 3, // 30 days minimum
    maxWindows: 18, // 180 days maximum
};

/**
 * Split a date range into fixed-size temporal windows
 *
 * @param startDate Start date (YYYY-MM-DD)
 * @param endDate End date (YYYY-MM-DD)
 * @param windowSizeDays Size of each window in days
 * @returns Array of time windows
 */
export function splitIntoWindows(
    startDate: string,
    endDate: string,
    windowSizeDays: number = 10
): TimeWindow[] {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Validate dates
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error('Invalid date format. Expected YYYY-MM-DD');
    }

    if (end <= start) {
        throw new Error('End date must be after start date');
    }

    const windows: TimeWindow[] = [];
    let currentStart = new Date(start);

    while (currentStart < end) {
        // Calculate window end date
        const currentEnd = new Date(currentStart);
        currentEnd.setDate(currentEnd.getDate() + windowSizeDays);

        // If window end exceeds overall end date, use overall end date
        const windowEnd = currentEnd > end ? end : currentEnd;

        windows.push({
            startDate: formatDate(currentStart),
            endDate: formatDate(windowEnd),
        });

        // Move to next window
        currentStart = new Date(windowEnd);
    }

    return windows;
}

/**
 * Validate date range for trend analysis
 *
 * @param startDate Start date
 * @param endDate End date
 * @param config Window configuration
 * @returns Validation result with error message if invalid
 */
export function validateDateRange(
    startDate: string,
    endDate: string,
    config: WindowConfig = DEFAULT_WINDOW_CONFIG
): { valid: boolean; error?: string; windowCount?: number } {
    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Check valid dates
    if (isNaN(start.getTime())) {
        return { valid: false, error: `Invalid start date: ${startDate}` };
    }

    if (isNaN(end.getTime())) {
        return { valid: false, error: `Invalid end date: ${endDate}` };
    }

    // Check date order
    if (end <= start) {
        return { valid: false, error: 'End date must be after start date' };
    }

    // Calculate total days
    const daysBetween = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    // Calculate window count
    const windowCount = Math.floor(daysBetween / config.windowSizeDays);

    // Check minimum windows
    const minDays = config.minWindows * config.windowSizeDays;
    if (daysBetween < minDays) {
        return {
            valid: false,
            error: `Date range must be at least ${minDays} days (${config.minWindows} windows of ${config.windowSizeDays} days)`,
            windowCount,
        };
    }

    // Check maximum windows
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

/**
 * Get recommended date ranges based on current date
 *
 * @returns Object with recommended date ranges
 */
export function getRecommendedDateRanges(): {
    last30Days: { start: string; end: string };
    last90Days: { start: string; end: string };
    last180Days: { start: string; end: string };
} {
    const today = new Date();
    const todayStr = formatDate(today);

    // 30 days ago
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 90 days ago
    const ninetyDaysAgo = new Date(today);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // 180 days ago
    const oneEightyDaysAgo = new Date(today);
    oneEightyDaysAgo.setDate(oneEightyDaysAgo.getDate() - 180);

    return {
        last30Days: {
            start: formatDate(thirtyDaysAgo),
            end: todayStr,
        },
        last90Days: {
            start: formatDate(ninetyDaysAgo),
            end: todayStr,
        },
        last180Days: {
            start: formatDate(oneEightyDaysAgo),
            end: todayStr,
        },
    };
}

/**
 * Calculate window statistics
 *
 * @param startDate Start date
 * @param endDate End date
 * @param windowSizeDays Window size in days
 * @returns Statistics about the windows
 */
export function calculateWindowStats(
    startDate: string,
    endDate: string,
    windowSizeDays: number = 10
): {
    totalDays: number;
    windowCount: number;
    averageWindowSize: number;
    coveragePercentage: number;
} {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const totalDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const windowCount = Math.floor(totalDays / windowSizeDays);
    const coveredDays = windowCount * windowSizeDays;
    const coveragePercentage = (coveredDays / totalDays) * 100;

    return {
        totalDays,
        windowCount,
        averageWindowSize: windowSizeDays,
        coveragePercentage,
    };
}

/**
 * Check if a date falls within a time window
 *
 * @param date Date to check (YYYY-MM-DD)
 * @param window Time window
 * @returns True if date is within window
 */
export function isDateInWindow(date: string, window: TimeWindow): boolean {
    const d = new Date(date);
    const start = new Date(window.startDate);
    const end = new Date(window.endDate);

    return d >= start && d < end;
}

/**
 * Find which window a date belongs to
 *
 * @param date Date to find (YYYY-MM-DD)
 * @param windows Array of time windows
 * @returns Window index or -1 if not found
 */
export function findWindowForDate(date: string, windows: TimeWindow[]): number {
    return windows.findIndex((window) => isDateInWindow(date, window));
}

/**
 * Merge overlapping or adjacent windows
 * Useful for handling irregular data availability
 *
 * @param windows Array of time windows
 * @returns Merged windows
 */
export function mergeAdjacentWindows(windows: TimeWindow[]): TimeWindow[] {
    if (windows.length === 0) {
        return [];
    }

    // Sort windows by start date
    const sorted = [...windows].sort(
        (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );

    const merged: TimeWindow[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        const current = sorted[i];
        const lastMerged = merged[merged.length - 1];

        const lastEnd = new Date(lastMerged.endDate);
        const currentStart = new Date(current.startDate);

        // If windows are adjacent or overlapping, merge them
        if (currentStart <= lastEnd) {
            // Extend the last merged window
            const currentEnd = new Date(current.endDate);
            const extendedEnd = currentEnd > lastEnd ? currentEnd : lastEnd;
            lastMerged.endDate = formatDate(extendedEnd);
        } else {
            // Add as new window
            merged.push(current);
        }
    }

    return merged;
}

/**
 * Format a Date object as YYYY-MM-DD string
 */
function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Calculate days between two dates
 *
 * @param startDate Start date (YYYY-MM-DD)
 * @param endDate End date (YYYY-MM-DD)
 * @returns Number of days between dates
 */
export function calculateDaysBetween(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Get window center date (midpoint)
 *
 * @param window Time window
 * @returns Center date as YYYY-MM-DD
 */
export function getWindowCenter(window: TimeWindow): string {
    const start = new Date(window.startDate);
    const end = new Date(window.endDate);
    const midpoint = new Date((start.getTime() + end.getTime()) / 2);
    return formatDate(midpoint);
}

/**
 * Generate date sequence for a window
 * Useful for gap-filling or daily analysis
 *
 * @param window Time window
 * @returns Array of dates (YYYY-MM-DD) within window
 */
export function generateDateSequence(window: TimeWindow): string[] {
    const dates: string[] = [];
    const start = new Date(window.startDate);
    const end = new Date(window.endDate);

    let current = new Date(start);
    while (current < end) {
        dates.push(formatDate(current));
        current.setDate(current.getDate() + 1);
    }

    return dates;
}

/**
 * Adjust date range to align with window boundaries
 * Ensures clean window splitting
 *
 * @param startDate Original start date
 * @param endDate Original end date
 * @param windowSizeDays Window size in days
 * @returns Adjusted date range
 */
export function alignToWindowBoundaries(
    startDate: string,
    endDate: string,
    windowSizeDays: number = 10
): { alignedStart: string; alignedEnd: string } {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const daysBetween = calculateDaysBetween(startDate, endDate);
    const windowCount = Math.floor(daysBetween / windowSizeDays);

    // Calculate aligned end date
    const alignedEnd = new Date(start);
    alignedEnd.setDate(alignedEnd.getDate() + windowCount * windowSizeDays);

    return {
        alignedStart: formatDate(start),
        alignedEnd: formatDate(alignedEnd),
    };
}
