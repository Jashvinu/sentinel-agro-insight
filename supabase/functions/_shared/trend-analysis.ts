/**
 * Trend Analysis Library
 * Implements Theil-Sen robust trend estimator and Mann-Kendall significance test
 */

export interface TrendResult {
    theilsenSlope: number;
    trendDirection: 'Increasing' | 'Decreasing' | 'Stable';
    pValue: number;
    rSquared: number;
    confidenceIntervalLow: number;
    confidenceIntervalHigh: number;
    windowCount: number;
}

export interface TimeSeriesData {
    date: string;
    value: number;
}

/**
 * Calculate Theil-Sen slope estimator
 * Non-parametric method that calculates median of all pairwise slopes
 * More robust to outliers than ordinary least squares regression
 *
 * @param timeSeries Array of {date, value} pairs sorted chronologically
 * @returns Slope value (change per day)
 */
export function calculateTheilSenSlope(timeSeries: TimeSeriesData[]): number {
    if (timeSeries.length < 2) {
        return 0;
    }

    // Calculate all pairwise slopes
    const slopes: number[] = [];

    for (let i = 0; i < timeSeries.length; i++) {
        for (let j = i + 1; j < timeSeries.length; j++) {
            const point1 = timeSeries[i];
            const point2 = timeSeries[j];

            const date1 = new Date(point1.date).getTime();
            const date2 = new Date(point2.date).getTime();

            const daysDiff = (date2 - date1) / (1000 * 60 * 60 * 24);

            if (daysDiff !== 0) {
                const slope = (point2.value - point1.value) / daysDiff;
                slopes.push(slope);
            }
        }
    }

    if (slopes.length === 0) {
        return 0;
    }

    // Return median slope
    return calculateMedian(slopes);
}

/**
 * Calculate median of an array
 */
function calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        // Even length: average of two middle values
        return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
        // Odd length: middle value
        return sorted[mid];
    }
}

/**
 * Calculate confidence interval for Theil-Sen slope
 * Uses percentile method on pairwise slopes
 *
 * @param timeSeries Time series data
 * @param confidenceLevel Confidence level (e.g., 0.95 for 95%)
 * @returns {low, high} confidence interval bounds
 */
export function calculateConfidenceInterval(
    timeSeries: TimeSeriesData[],
    confidenceLevel: number = 0.95
): { low: number; high: number } {
    if (timeSeries.length < 3) {
        return { low: 0, high: 0 };
    }

    // Calculate all pairwise slopes
    const slopes: number[] = [];

    for (let i = 0; i < timeSeries.length; i++) {
        for (let j = i + 1; j < timeSeries.length; j++) {
            const point1 = timeSeries[i];
            const point2 = timeSeries[j];

            const date1 = new Date(point1.date).getTime();
            const date2 = new Date(point2.date).getTime();

            const daysDiff = (date2 - date1) / (1000 * 60 * 60 * 24);

            if (daysDiff !== 0) {
                const slope = (point2.value - point1.value) / daysDiff;
                slopes.push(slope);
            }
        }
    }

    if (slopes.length === 0) {
        return { low: 0, high: 0 };
    }

    // Sort slopes
    const sorted = [...slopes].sort((a, b) => a - b);

    // Calculate percentile indices
    const alpha = 1 - confidenceLevel;
    const lowerIndex = Math.floor(sorted.length * (alpha / 2));
    const upperIndex = Math.floor(sorted.length * (1 - alpha / 2));

    return {
        low: sorted[lowerIndex] || sorted[0],
        high: sorted[upperIndex] || sorted[sorted.length - 1],
    };
}

/**
 * Calculate Mann-Kendall test statistic and p-value
 * Non-parametric test for monotonic trend
 *
 * @param timeSeries Time series data
 * @returns p-value (< 0.05 indicates significant trend)
 */
export function calculateMannKendallTest(timeSeries: TimeSeriesData[]): number {
    const n = timeSeries.length;

    if (n < 3) {
        return 1.0; // Not enough data for significance
    }

    // Calculate S statistic
    let S = 0;

    for (let i = 0; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
            const diff = timeSeries[j].value - timeSeries[i].value;

            if (diff > 0) {
                S += 1;
            } else if (diff < 0) {
                S -= 1;
            }
            // If diff === 0, no change to S
        }
    }

    // Calculate variance of S
    const varS = (n * (n - 1) * (2 * n + 5)) / 18;

    // Calculate Z statistic (standardized test statistic)
    let Z: number;

    if (S > 0) {
        Z = (S - 1) / Math.sqrt(varS);
    } else if (S < 0) {
        Z = (S + 1) / Math.sqrt(varS);
    } else {
        Z = 0;
    }

    // Calculate two-tailed p-value using normal approximation
    const pValue = 2 * (1 - normalCDF(Math.abs(Z)));

    return Math.max(0, Math.min(1, pValue)); // Clamp to [0, 1]
}

/**
 * Cumulative distribution function for standard normal distribution
 * Approximation using error function
 */
function normalCDF(z: number): number {
    // Using approximation: CDF(z) ≈ 0.5 * (1 + erf(z / sqrt(2)))
    return 0.5 * (1 + erf(z / Math.sqrt(2)));
}

/**
 * Error function (erf) approximation
 * Abramowitz and Stegun approximation
 */
function erf(x: number): number {
    // Constants
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    // Save the sign of x
    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    // A&S formula 7.1.26
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
}

/**
 * Calculate R-squared (coefficient of determination)
 * Measures goodness of fit for the trend line
 *
 * @param timeSeries Time series data
 * @param slope Theil-Sen slope
 * @returns R² value between 0 and 1
 */
export function calculateRSquared(timeSeries: TimeSeriesData[], slope: number): number {
    if (timeSeries.length < 2) {
        return 0;
    }

    // Calculate mean value
    const meanValue = timeSeries.reduce((sum, point) => sum + point.value, 0) / timeSeries.length;

    // Calculate baseline date (first date as reference)
    const baselineDate = new Date(timeSeries[0].date).getTime();

    // Calculate predicted values using Theil-Sen slope
    // y_pred = y_0 + slope * days_since_baseline
    const predictions = timeSeries.map((point) => {
        const daysSinceBaseline =
            (new Date(point.date).getTime() - baselineDate) / (1000 * 60 * 60 * 24);
        return timeSeries[0].value + slope * daysSinceBaseline;
    });

    // Calculate total sum of squares (TSS)
    const tss = timeSeries.reduce((sum, point) => {
        return sum + Math.pow(point.value - meanValue, 2);
    }, 0);

    // Calculate residual sum of squares (RSS)
    const rss = timeSeries.reduce((sum, point, index) => {
        return sum + Math.pow(point.value - predictions[index], 2);
    }, 0);

    // R² = 1 - (RSS / TSS)
    if (tss === 0) {
        return 0; // No variance in data
    }

    const rSquared = 1 - rss / tss;

    // Clamp to [0, 1] (can be negative for very poor fits)
    return Math.max(0, Math.min(1, rSquared));
}

/**
 * Determine trend direction based on slope and statistical significance
 *
 * @param slope Theil-Sen slope
 * @param pValue Mann-Kendall p-value
 * @param significanceThreshold Threshold for significance (default 0.05)
 * @returns Trend direction classification
 */
export function determineTrendDirection(
    slope: number,
    pValue: number,
    significanceThreshold: number = 0.05
): 'Increasing' | 'Decreasing' | 'Stable' {
    // If not statistically significant, classify as stable
    if (pValue >= significanceThreshold) {
        return 'Stable';
    }

    // If slope is very close to zero, classify as stable
    if (Math.abs(slope) < 1e-6) {
        return 'Stable';
    }

    // Classify based on slope direction
    return slope > 0 ? 'Increasing' : 'Decreasing';
}

/**
 * Main trend analysis function
 * Combines all trend metrics into a single result
 *
 * @param timeSeries Time series data (sorted chronologically)
 * @param confidenceLevel Confidence level for interval (default 0.95)
 * @returns Complete trend analysis result
 */
export function analyzeTrend(
    timeSeries: TimeSeriesData[],
    confidenceLevel: number = 0.95
): TrendResult {
    // Calculate Theil-Sen slope
    const theilsenSlope = calculateTheilSenSlope(timeSeries);

    // Calculate confidence interval
    const confidenceInterval = calculateConfidenceInterval(timeSeries, confidenceLevel);

    // Calculate Mann-Kendall p-value
    const pValue = calculateMannKendallTest(timeSeries);

    // Calculate R-squared
    const rSquared = calculateRSquared(timeSeries, theilsenSlope);

    // Determine trend direction
    const trendDirection = determineTrendDirection(theilsenSlope, pValue);

    return {
        theilsenSlope,
        trendDirection,
        pValue,
        rSquared,
        confidenceIntervalLow: confidenceInterval.low,
        confidenceIntervalHigh: confidenceInterval.high,
        windowCount: timeSeries.length,
    };
}

/**
 * Validate time series data
 * Ensures data is suitable for trend analysis
 *
 * @param timeSeries Time series data
 * @returns Validation result with error message if invalid
 */
export function validateTimeSeries(
    timeSeries: TimeSeriesData[]
): { valid: boolean; error?: string } {
    if (!timeSeries || timeSeries.length === 0) {
        return { valid: false, error: 'Time series is empty' };
    }

    if (timeSeries.length < 3) {
        return {
            valid: false,
            error: 'Time series must have at least 3 data points for trend analysis',
        };
    }

    // Check for valid dates
    for (const point of timeSeries) {
        const date = new Date(point.date);
        if (isNaN(date.getTime())) {
            return { valid: false, error: `Invalid date: ${point.date}` };
        }
    }

    // Check for valid values (finite numbers)
    for (const point of timeSeries) {
        if (!isFinite(point.value)) {
            return { valid: false, error: `Invalid value: ${point.value}` };
        }
    }

    // Check if data is sorted chronologically
    for (let i = 1; i < timeSeries.length; i++) {
        const date1 = new Date(timeSeries[i - 1].date).getTime();
        const date2 = new Date(timeSeries[i].date).getTime();

        if (date2 < date1) {
            return { valid: false, error: 'Time series must be sorted chronologically' };
        }
    }

    return { valid: true };
}
