import TidePrediction from '@neaps/tide-predictor';
import { getDistance } from 'geolib';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { SignalKApp, TideSource, TideForecastParams, TideForecastResult } from '../types.js';
import harmonicsData from '../data/noaa-harmonics.json';

interface HarmonicConstituent {
  name: string;
  amplitude: number;
  phase: number;
  [key: string]: number | string;
}

interface HarmonicStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  timezone: string;
  country: string;
  constituents: HarmonicConstituent[];
}

interface HarmonicsDatabase {
  version: string;
  info: string;
  stations: HarmonicStation[];
}

/**
 * Offline tide prediction using harmonic constituents
 * Uses @neaps/tide-predictor with bundled harmonic database
 */
export default function (app: SignalKApp): TideSource {
  return {
    id: 'Offline',
    title: 'Offline (Harmonic Prediction)',
    properties: {},

    start() {
      app.debug("Offline harmonic tide prediction initialized");

      // Try to load from cache first, fallback to bundled data
      const cacheFile = join(app.getDataDirPath(), 'harmonics-cache', 'harmonics.json');
      let database: HarmonicsDatabase;

      if (existsSync(cacheFile)) {
        try {
          const data = readFileSync(cacheFile, 'utf-8');
          database = JSON.parse(data) as HarmonicsDatabase;
          app.debug(`Loaded ${database.stations.length} harmonic stations from cache (${database.version})`);
        } catch (error) {
          app.debug(`Failed to load cache, using bundled data: ${error}`);
          database = harmonicsData as HarmonicsDatabase;
          app.debug(`Loaded ${database.stations.length} harmonic stations from bundle (${database.version})`);
        }
      } else {
        database = harmonicsData as HarmonicsDatabase;
        app.debug(`Loaded ${database.stations.length} harmonic stations from bundle (${database.version})`);
      }

      return async (params: TideForecastParams): Promise<TideForecastResult> => {
        const { position } = params;

        // Find nearest station
        const nearestStation = findNearestStation(position, database);
        const distance = getDistance(
          position,
          { latitude: nearestStation.lat, longitude: nearestStation.lon }
        );

        app.debug(`Selected offline station: ${nearestStation.name} at ${(distance / 1000).toFixed(1)}km`);

        // Generate predictions using @neaps/tide-predictor
        // Start from 1 day ago to ensure we have historical data for interpolation
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        // Use offset if available (converts MLLW-relative predictions to MSL)
        const offset = (nearestStation as any).offset || 0;

        const prediction = TidePrediction(nearestStation.constituents, {
          phaseKey: 'phase',
          offset: offset  // Add datum offset from MLLW to MSL
        });

        const extremes = prediction.getExtremesPrediction({
          start: oneDayAgo,
          end: sevenDaysLater
        });

        // Convert to our TideForecastResult format
        return {
          station: {
            name: `${nearestStation.name} (Offline)`,
            position: {
              latitude: nearestStation.lat,
              longitude: nearestStation.lon
            }
          },
          extremes: extremes.map((extreme: any) => ({
            type: extreme.high ? 'High' : 'Low',
            time: extreme.time.toISOString(),
            value: extreme.level
          })),
          datum: {
            source: 'MSL',
            mllwToMslOffset: offset
          }
        };
      };
    }
  };
}

/**
 * Find the nearest harmonic station to the given position
 */
function findNearestStation(
  position: { latitude: number; longitude: number },
  database: HarmonicsDatabase
): HarmonicStation {
  let nearest: HarmonicStation | null = null;
  let minDistance = Infinity;

  for (const station of database.stations) {
    const distance = getDistance(
      position,
      { latitude: station.lat, longitude: station.lon }
    );

    if (distance < minDistance) {
      minDistance = distance;
      nearest = station;
    }
  }

  if (!nearest) {
    throw new Error('No harmonic stations available in database');
  }

  return nearest;
}
