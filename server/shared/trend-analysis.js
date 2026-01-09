/**
 * Trend Analysis Library
 * Implements Theil-Sen robust trend estimator and Mann-Kendall significance test
 */

/**
 * Calculate Theil-Sen slope estimator
 */
export function calculateTheilSenSlope(timeSeries) {
    if (timeSeries.length < 2) {
        return 0;
    }

    const slopes = [];

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

    return calculateMedian(slopes);
}

function calculateMedian(values) {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
        return sorted[mid];
    }
}

/**
 * Calculate confidence interval for Theil-Sen slope
 */
export function calculateConfidenceInterval(timeSeries, confidenceLevel = 0.95) {
    if (timeSeries.length < 3) {
        return { low: 0, high: 0 };
    }

    const slopes = [];

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

    const sorted = [...slopes].sort((a, b) => a - b);
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
 */
export function calculateMannKendallTest(timeSeries) {
    const n = timeSeries.length;

    if (n < 3) {
        return 1.0;
    }

    let S = 0;

    for (let i = 0; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
            const diff = timeSeries[j].value - timeSeries[i].value;

            if (diff > 0) {
                S += 1;
            } else if (diff < 0) {
                S -= 1;
            }
        }
    }

    const varS = (n * (n - 1) * (2 * n + 5)) / 18;

    let Z;
    if (S > 0) {
        Z = (S - 1) / Math.sqrt(varS);
    } else if (S < 0) {
        Z = (S + 1) / Math.sqrt(varS);
    } else {
        Z = 0;
    }

    const pValue = 2 * (1 - normalCDF(Math.abs(Z)));

    return Math.max(0, Math.min(1, pValue));
}

function normalCDF(z) {
    return 0.5 * (1 + erf(z / Math.sqrt(2)));
}

function erf(x) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
}

/**
 * Calculate R-squared
 */
export function calculateRSquared(timeSeries, slope) {
    if (timeSeries.length < 2) {
        return 0;
    }

    const meanValue = timeSeries.reduce((sum, point) => sum + point.value, 0) / timeSeries.length;
    const baselineDate = new Date(timeSeries[0].date).getTime();

    const predictions = timeSeries.map((point) => {
        const daysSinceBaseline =
            (new Date(point.date).getTime() - baselineDate) / (1000 * 60 * 60 * 24);
        return timeSeries[0].value + slope * daysSinceBaseline;
    });

    const tss = timeSeries.reduce((sum, point) => {
        return sum + Math.pow(point.value - meanValue, 2);
    }, 0);

    const rss = timeSeries.reduce((sum, point, index) => {
        return sum + Math.pow(point.value - predictions[index], 2);
    }, 0);

    if (tss === 0) {
        return 0;
    }

    const rSquared = 1 - rss / tss;

    return Math.max(0, Math.min(1, rSquared));
}

/**
 * Determine trend direction
 */
export function determineTrendDirection(slope, pValue, significanceThreshold = 0.05) {
    if (pValue >= significanceThreshold) {
        return 'Stable';
    }

    if (Math.abs(slope) < 1e-6) {
        return 'Stable';
    }

    return slope > 0 ? 'Increasing' : 'Decreasing';
}

/**
 * Main trend analysis function
 */
export function analyzeTrend(timeSeries, confidenceLevel = 0.95) {
    const theilsenSlope = calculateTheilSenSlope(timeSeries);
    const confidenceInterval = calculateConfidenceInterval(timeSeries, confidenceLevel);
    const pValue = calculateMannKendallTest(timeSeries);
    const rSquared = calculateRSquared(timeSeries, theilsenSlope);
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
 */
export function validateTimeSeries(timeSeries) {
    if (!timeSeries || timeSeries.length === 0) {
        return { valid: false, error: 'Time series is empty' };
    }

    if (timeSeries.length < 3) {
        return {
            valid: false,
            error: 'Time series must have at least 3 data points for trend analysis',
        };
    }

    for (const point of timeSeries) {
        const date = new Date(point.date);
        if (isNaN(date.getTime())) {
            return { valid: false, error: `Invalid date: ${point.date}` };
        }
    }

    for (const point of timeSeries) {
        if (!isFinite(point.value)) {
            return { valid: false, error: `Invalid value: ${point.value}` };
        }
    }

    for (let i = 1; i < timeSeries.length; i++) {
        const date1 = new Date(timeSeries[i - 1].date).getTime();
        const date2 = new Date(timeSeries[i].date).getTime();

        if (date2 < date1) {
            return { valid: false, error: 'Time series must be sorted chronologically' };
        }
    }

    return { valid: true };
}
