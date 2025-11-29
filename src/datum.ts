/**
 * Tidal Datum Conversions
 *
 * Handles conversion between different tidal datums:
 * - MSL (Mean Sea Level): Average sea level, can have negative tide heights
 * - MLLW (Mean Lower Low Water): Average of lower low waters, typically all positive
 *
 * Note: We use MLLW offset data from providers to convert between datums.
 */

import type { TideForecastResult } from './types.js';

export interface DatumInfo {
  sourceDatum: 'MSL' | 'MLLW';
  mllwToMslOffset: number;  // Offset in meters to convert MLLW -> MSL
}

/**
 * Convert tide forecast to target datum
 */
export function convertDatum(
  forecast: TideForecastResult,
  datumInfo: DatumInfo,
  targetDatum: 'MSL' | 'MLLW'
): TideForecastResult {
  const { sourceDatum, mllwToMslOffset } = datumInfo;

  // If source and target are the same, no conversion needed
  if (sourceDatum === targetDatum) {
    return forecast;
  }

  // Calculate conversion offset
  let offset = 0;
  if (sourceDatum === 'MSL' && targetDatum === 'MLLW') {
    // MSL -> MLLW: subtract the offset (shift down)
    offset = -mllwToMslOffset;
  } else if (sourceDatum === 'MLLW' && targetDatum === 'MSL') {
    // MLLW -> MSL: add the offset (shift up)
    offset = mllwToMslOffset;
  }

  // Apply offset to all extremes
  return {
    ...forecast,
    extremes: forecast.extremes.map(extreme => ({
      ...extreme,
      value: extreme.value + offset
    }))
  };
}

/**
 * Estimate MLLW offset from tide data
 * Used when provider doesn't supply datum information
 */
export function estimateMllwOffset(forecast: TideForecastResult): number {
  // Find the lowest low tide value
  const lows = forecast.extremes.filter(e => e.type === 'Low');
  if (lows.length === 0) return 0;

  const lowestLow = Math.min(...lows.map(e => e.value));

  // MLLW should make the lowest low close to 0
  // If we're in MSL and lowest low is negative, the offset is approximately |lowestLow|
  if (lowestLow < 0) {
    return Math.abs(lowestLow) + 0.2; // Add small margin for safety
  }

  return 0;
}
