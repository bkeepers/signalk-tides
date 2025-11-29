#!/usr/bin/env node
/**
 * Extract harmonic constituents from NOAA CO-OPS API
 *
 * This tool downloads harmonic constituent data for NOAA tide stations
 * within a specified radius of a position and converts it to the format
 * expected by the offline tide prediction source.
 *
 * Usage:
 *   node extract-noaa-harmonics.mjs <latitude> <longitude> [radius_nm]
 *
 * Example:
 *   node extract-noaa-harmonics.mjs -17.68 177.38 200
 *
 * NOAA API Documentation:
 * - Station list: https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=harcon
 * - Harmonics per station: https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/{id}/harcon.json
 *
 * Output format matches src/data/sample-harmonics.json schema
 */

import { writeFileSync } from 'fs';
import { setTimeout } from 'timers/promises';

const NOAA_BASE_URL = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi';
const OUTPUT_FILE = './src/data/noaa-harmonics.json';
const RATE_LIMIT_DELAY_MS = 100; // Delay between API requests to be respectful
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// We only need the primary 8 constituents that @neaps/tide-predictor uses
// These are the most significant for tide prediction accuracy
const PRIMARY_CONSTITUENTS = ['M2', 'S2', 'N2', 'K2', 'K1', 'O1', 'P1', 'Q1'];

/**
 * Calculate distance between two coordinates using Haversine formula
 * @returns Distance in nautical miles
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3440.065; // Earth's radius in nautical miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Fetch with retry logic
 */
async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Attempt ${attempt}/${retries} failed for ${url}: ${error.message}`);

      if (attempt === retries) {
        throw error;
      }

      await setTimeout(RETRY_DELAY_MS);
    }
  }
}

/**
 * Fetch all NOAA stations with harmonic constituents
 */
async function fetchAllStations() {
  console.log('Fetching station list from NOAA...');
  const url = `${NOAA_BASE_URL}/stations.json?type=harcon`;
  const data = await fetchWithRetry(url);

  console.log(`Found ${data.count} stations with harmonic constituents`);
  return data.stations;
}

/**
 * Fetch harmonic constituents for a specific station
 */
async function fetchStationHarmonics(stationId) {
  const url = `${NOAA_BASE_URL}/stations/${stationId}/harcon.json?units=metric`;
  const data = await fetchWithRetry(url);
  return data;
}

/**
 * Fetch datum information for a specific station
 * Returns the offset from MLLW to MSL in meters
 */
async function fetchStationDatum(stationId) {
  try {
    const url = `${NOAA_BASE_URL}/stations/${stationId}/datums.json?units=metric`;
    const data = await fetchWithRetry(url);

    // Find MLLW and MSL datums
    const datums = data.datums || [];
    const msl = datums.find(d => d.name === 'MSL');
    const mllw = datums.find(d => d.name === 'MLLW');

    if (msl && mllw) {
      // Calculate offset: MSL - MLLW (both are absolute values relative to station datum)
      const offset = parseFloat(msl.value) - parseFloat(mllw.value);
      return offset;
    }

    return 0; // No datum offset available
  } catch (error) {
    console.warn(`  Could not fetch datum for station ${stationId}: ${error.message}`);
    return 0;
  }
}

/**
 * Convert NOAA harmonic data to our format
 */
function convertStation(stationData, harmonicsData, datumOffset) {
  const constituents = [];

  // Extract only the primary constituents we need
  for (const constituent of harmonicsData.HarmonicConstituents || []) {
    if (PRIMARY_CONSTITUENTS.includes(constituent.name)) {
      constituents.push({
        name: constituent.name,
        amplitude: parseFloat(constituent.amplitude),
        phase: parseFloat(constituent.phase_GMT)
      });
    }
  }

  // Only include stations that have all 8 primary constituents
  if (constituents.length < PRIMARY_CONSTITUENTS.length) {
    return null;
  }

  // Sort constituents by name for consistency
  constituents.sort((a, b) => a.name.localeCompare(b.name));

  return {
    id: stationData.id,
    name: stationData.name,
    lat: parseFloat(stationData.lat),
    lon: parseFloat(stationData.lng),
    timezone: stationData.timezone || 'UTC',
    country: stationData.state || stationData.region || 'Unknown',
    offset: datumOffset, // Offset from MLLW to MSL in meters
    constituents
  };
}

/**
 * Main extraction process
 */
async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length < 2) {
      console.error('Usage: node extract-noaa-harmonics.mjs <latitude> <longitude> [radius_nm]');
      console.error('Example: node extract-noaa-harmonics.mjs -17.68 177.38 200');
      process.exit(1);
    }

    const centerLat = parseFloat(args[0]);
    const centerLon = parseFloat(args[1]);
    const radiusNM = args[2] ? parseFloat(args[2]) : 200;

    if (isNaN(centerLat) || isNaN(centerLon) || isNaN(radiusNM)) {
      console.error('Error: Invalid coordinates or radius');
      process.exit(1);
    }

    console.log('Starting NOAA harmonic constituents extraction...');
    console.log(`Center: ${centerLat}°, ${centerLon}°`);
    console.log(`Radius: ${radiusNM} nautical miles\n`);

    // Fetch all stations
    const allStations = await fetchAllStations();

    // Filter stations by distance
    const nearbyStations = allStations.filter(station => {
      const distance = calculateDistance(
        centerLat,
        centerLon,
        parseFloat(station.lat),
        parseFloat(station.lng)
      );
      return distance <= radiusNM;
    });

    console.log(`Found ${nearbyStations.length} stations within ${radiusNM}nm`);
    console.log(`Processing stations...\n`);

    const extractedStations = [];
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    // Process each station
    for (let i = 0; i < nearbyStations.length; i++) {
      const station = nearbyStations[i];
      const progress = `[${i + 1}/${nearbyStations.length}]`;
      const distance = calculateDistance(
        centerLat,
        centerLon,
        parseFloat(station.lat),
        parseFloat(station.lng)
      ).toFixed(1);

      try {
        console.log(`${progress} Fetching ${station.name} (${distance}nm)...`);

        // Rate limiting
        if (i > 0) {
          await setTimeout(RATE_LIMIT_DELAY_MS);
        }

        const harmonicsData = await fetchStationHarmonics(station.id);
        const datumOffset = await fetchStationDatum(station.id);

        if (datumOffset > 0) {
          console.log(`  Datum offset (MLLW to MSL): ${datumOffset.toFixed(3)}m`);
        }

        const converted = convertStation(station, harmonicsData, datumOffset);

        if (converted) {
          extractedStations.push(converted);
          successCount++;
        } else {
          console.log(`  ⚠️  Skipped - missing primary constituents`);
          skippedCount++;
        }

      } catch (error) {
        console.error(`  ❌ Failed: ${error.message}`);
        failCount++;
      }
    }

    // Sort stations by latitude (north to south) for easier browsing
    extractedStations.sort((a, b) => b.lat - a.lat);

    // Create output database
    const database = {
      version: `noaa-${new Date().toISOString().split('T')[0]}`,
      info: `NOAA CO-OPS harmonic constituents within ${radiusNM}nm of ${centerLat}°, ${centerLon}°. Contains ${extractedStations.length} stations with 8 primary tidal constituents (M2, S2, N2, K2, K1, O1, P1, Q1) for offline tide prediction.`,
      source: 'NOAA Center for Operational Oceanographic Products and Services',
      url: 'https://tidesandcurrents.noaa.gov/',
      extracted: new Date().toISOString(),
      center: { latitude: centerLat, longitude: centerLon },
      radiusNM: radiusNM,
      stations: extractedStations
    };

    // Write to file
    console.log(`\nWriting ${extractedStations.length} stations to ${OUTPUT_FILE}...`);
    writeFileSync(OUTPUT_FILE, JSON.stringify(database, null, 2));

    // Calculate file size
    const stats = await import('fs').then(fs => fs.statSync(OUTPUT_FILE));
    const sizeKB = (stats.size / 1024).toFixed(2);

    console.log('\n✅ Extraction complete!');
    console.log(`\nStatistics:`);
    console.log(`  Success: ${successCount}`);
    console.log(`  Skipped: ${skippedCount} (incomplete constituent data)`);
    console.log(`  Failed:  ${failCount}`);
    console.log(`  Nearby:  ${nearbyStations.length}`);
    console.log(`  Total:   ${allStations.length}`);
    console.log(`\nOutput:`);
    console.log(`  File:    ${OUTPUT_FILE}`);
    console.log(`  Size:    ${sizeKB} KB`);
    console.log(`  Stations: ${extractedStations.length}`);

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
