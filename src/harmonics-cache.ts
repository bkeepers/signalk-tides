/**
 * Harmonics Cache Manager
 *
 * Manages persistent caching of NOAA harmonic constituents data.
 * Downloads regional data based on vessel position and caches to disk.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getDistance } from 'geolib';
import type { SignalKApp } from './types.js';

const NOAA_BASE_URL = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi';
const PRIMARY_CONSTITUENTS = ['M2', 'S2', 'N2', 'K2', 'K1', 'O1', 'P1', 'Q1'];

interface Position {
  latitude: number;
  longitude: number;
}

interface HarmonicConstituent {
  name: string;
  amplitude: number;
  phase: number;
}

interface HarmonicStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  timezone: string;
  country: string;
  offset: number;
  constituents: HarmonicConstituent[];
}

interface HarmonicsDatabase {
  version: string;
  info: string;
  source: string;
  url: string;
  extracted: string;
  center: Position;
  radiusNM: number;
  stations: HarmonicStation[];
}

interface CacheMetadata {
  lastUpdate: string;
  center: Position;
  radiusNM: number;
  stationCount: number;
  noaaVersion: string;
}

export interface HarmonicsCacheConfig {
  autoDownloadRadius: number;  // Default: 500nm
  updateFrequency: 'manual' | 'quarterly' | 'semiannual' | 'annual';  // Default: quarterly
  minStations: number;  // Default: 2
  expandRadiusIfNeeded: boolean;  // Default: true
  maxRadius: number;  // Default: 1000nm
}

export class HarmonicsCache {
  private app: SignalKApp;
  private config: HarmonicsCacheConfig;
  private cacheDir: string;
  private cacheFile: string;
  private metadataFile: string;
  private backupFile: string;

  constructor(app: SignalKApp, dataDir: string, config: HarmonicsCacheConfig) {
    this.app = app;
    this.config = config;

    // Set up cache directory
    this.cacheDir = join(dataDir, 'harmonics-cache');
    this.cacheFile = join(this.cacheDir, 'harmonics.json');
    this.metadataFile = join(this.cacheDir, 'metadata.json');
    this.backupFile = join(this.cacheDir, 'harmonics-backup.json');

    // Ensure cache directory exists
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
      this.app.debug(`Created harmonics cache directory: ${this.cacheDir}`);
    }
  }

  /**
   * Load cached harmonics data
   */
  loadCache(): HarmonicsDatabase | null {
    try {
      if (existsSync(this.cacheFile)) {
        const data = readFileSync(this.cacheFile, 'utf-8');
        const database = JSON.parse(data) as HarmonicsDatabase;
        this.app.debug(`Loaded ${database.stations.length} stations from cache`);
        return database;
      }
    } catch (error) {
      this.app.error(`Failed to load harmonics cache: ${error}`);
    }
    return null;
  }

  /**
   * Load cache metadata
   */
  private loadMetadata(): CacheMetadata | null {
    try {
      if (existsSync(this.metadataFile)) {
        const data = readFileSync(this.metadataFile, 'utf-8');
        return JSON.parse(data) as CacheMetadata;
      }
    } catch (error) {
      this.app.error(`Failed to load cache metadata: ${error}`);
    }
    return null;
  }

  /**
   * Save harmonics data to cache
   */
  private saveCache(database: HarmonicsDatabase): void {
    try {
      // Backup existing cache
      if (existsSync(this.cacheFile)) {
        const backup = readFileSync(this.cacheFile, 'utf-8');
        writeFileSync(this.backupFile, backup);
      }

      // Write new cache
      writeFileSync(this.cacheFile, JSON.stringify(database, null, 2));

      // Update metadata
      const metadata: CacheMetadata = {
        lastUpdate: new Date().toISOString(),
        center: database.center,
        radiusNM: database.radiusNM,
        stationCount: database.stations.length,
        noaaVersion: database.version
      };
      writeFileSync(this.metadataFile, JSON.stringify(metadata, null, 2));

      this.app.debug(`Saved ${database.stations.length} stations to cache`);
    } catch (error) {
      this.app.error(`Failed to save harmonics cache: ${error}`);
    }
  }

  /**
   * Check if cache needs update
   */
  shouldUpdate(currentPosition: Position): { update: boolean; reason: string } {
    const metadata = this.loadMetadata();

    if (!metadata) {
      return { update: true, reason: 'No cache exists' };
    }

    // Check if cache is too old
    if (this.config.updateFrequency !== 'manual') {
      const lastUpdate = new Date(metadata.lastUpdate);
      const now = new Date();
      const daysSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);

      let maxDays = 365; // annual
      if (this.config.updateFrequency === 'quarterly') maxDays = 90;
      if (this.config.updateFrequency === 'semiannual') maxDays = 180;

      if (daysSinceUpdate > maxDays) {
        return { update: true, reason: `Cache expired (${Math.floor(daysSinceUpdate)} days old)` };
      }
    }

    // Check if vessel moved too far from cache center
    const distance = getDistance(
      currentPosition,
      metadata.center
    ) / 1852; // Convert meters to nautical miles

    if (distance > 300) {
      return { update: true, reason: `Vessel moved ${distance.toFixed(0)}nm from cache center` };
    }

    // Check if we have enough nearby stations
    const cache = this.loadCache();
    if (cache) {
      const nearbyStations = cache.stations.filter(station => {
        const stationDistance = getDistance(
          currentPosition,
          { latitude: station.lat, longitude: station.lon }
        ) / 1852;
        return stationDistance <= this.config.autoDownloadRadius;
      });

      if (nearbyStations.length < this.config.minStations) {
        return { update: true, reason: `Only ${nearbyStations.length} stations within ${this.config.autoDownloadRadius}nm (need ${this.config.minStations})` };
      }
    }

    return { update: false, reason: 'Cache is current' };
  }

  /**
   * Download harmonics data for a region
   */
  async downloadRegion(center: Position, radiusNM: number): Promise<HarmonicsDatabase | null> {
    try {
      this.app.setPluginStatus(`Downloading harmonics for ${radiusNM}nm radius...`);

      // Fetch all stations
      const allStations = await this.fetchAllStations();

      // Filter by distance
      const nearbyStations = allStations.filter((station: any) => {
        const distance = getDistance(
          center,
          { latitude: parseFloat(station.lat), longitude: parseFloat(station.lng) }
        ) / 1852;
        return distance <= radiusNM;
      });

      this.app.debug(`Found ${nearbyStations.length} stations within ${radiusNM}nm`);

      if (nearbyStations.length === 0) {
        return null;
      }

      // Download harmonics and datums for each station
      const stations: HarmonicStation[] = [];
      for (let i = 0; i < nearbyStations.length; i++) {
        const station = nearbyStations[i];

        try {
          const harmonicsData = await this.fetchStationHarmonics(station.id);
          const datumOffset = await this.fetchStationDatum(station.id);
          const converted = this.convertStation(station, harmonicsData, datumOffset);

          if (converted) {
            stations.push(converted);
            this.app.debug(`Downloaded ${station.name} (${i + 1}/${nearbyStations.length})`);
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          this.app.error(`Failed to download ${station.name}: ${error}`);
        }
      }

      // Create database
      const database: HarmonicsDatabase = {
        version: `noaa-${new Date().toISOString().split('T')[0]}`,
        info: `NOAA CO-OPS harmonic constituents within ${radiusNM}nm of ${center.latitude}°, ${center.longitude}°. Auto-downloaded by SignalK Tides plugin.`,
        source: 'NOAA Center for Operational Oceanographic Products and Services',
        url: 'https://tidesandcurrents.noaa.gov/',
        extracted: new Date().toISOString(),
        center,
        radiusNM,
        stations: stations.sort((a, b) => b.lat - a.lat)
      };

      this.app.setPluginStatus(`Downloaded ${stations.length} stations`);
      return database;

    } catch (error) {
      this.app.error(`Failed to download harmonics: ${error}`);
      this.app.setPluginError(`Harmonics download failed: ${error}`);
      return null;
    }
  }

  /**
   * Update cache if needed
   */
  async updateIfNeeded(currentPosition: Position): Promise<HarmonicsDatabase | null> {
    const check = this.shouldUpdate(currentPosition);

    if (!check.update) {
      this.app.debug(`Harmonics cache up to date: ${check.reason}`);
      return this.loadCache();
    }

    this.app.debug(`Updating harmonics cache: ${check.reason}`);

    let radius = this.config.autoDownloadRadius;
    let database: HarmonicsDatabase | null = null;

    // Try expanding radius if we don't get enough stations
    while (radius <= this.config.maxRadius) {
      database = await this.downloadRegion(currentPosition, radius);

      if (database && database.stations.length >= this.config.minStations) {
        break;
      }

      if (this.config.expandRadiusIfNeeded && radius < this.config.maxRadius) {
        this.app.debug(`Only found ${database?.stations.length || 0} stations, expanding radius to ${radius + 200}nm`);
        radius += 200;
      } else {
        break;
      }
    }

    if (database) {
      this.saveCache(database);
      return database;
    }

    // Return existing cache if download failed
    return this.loadCache();
  }

  /**
   * Helper methods for NOAA API
   */
  private async fetchAllStations(): Promise<any[]> {
    const url = `${NOAA_BASE_URL}/stations.json?type=harcon`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json() as { stations: any[] };
    return data.stations;
  }

  private async fetchStationHarmonics(stationId: string): Promise<any> {
    const url = `${NOAA_BASE_URL}/stations/${stationId}/harcon.json?units=metric`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  }

  private async fetchStationDatum(stationId: string): Promise<number> {
    try {
      const url = `${NOAA_BASE_URL}/stations/${stationId}/datums.json?units=metric`;
      const response = await fetch(url);
      if (!response.ok) return 0;

      const data = await response.json() as { datums: any[] };
      const datums = data.datums || [];
      const msl = datums.find((d: any) => d.name === 'MSL');
      const mllw = datums.find((d: any) => d.name === 'MLLW');

      if (msl && mllw) {
        return parseFloat(msl.value) - parseFloat(mllw.value);
      }
    } catch (error) {
      this.app.debug(`Could not fetch datum for station ${stationId}`);
    }
    return 0;
  }

  private convertStation(stationData: any, harmonicsData: any, datumOffset: number): HarmonicStation | null {
    const constituents: HarmonicConstituent[] = [];

    for (const constituent of harmonicsData.HarmonicConstituents || []) {
      if (PRIMARY_CONSTITUENTS.includes(constituent.name)) {
        constituents.push({
          name: constituent.name,
          amplitude: parseFloat(constituent.amplitude),
          phase: parseFloat(constituent.phase_GMT)
        });
      }
    }

    if (constituents.length < PRIMARY_CONSTITUENTS.length) {
      return null;
    }

    constituents.sort((a, b) => a.name.localeCompare(b.name));

    return {
      id: stationData.id,
      name: stationData.name,
      lat: parseFloat(stationData.lat),
      lon: parseFloat(stationData.lng),
      timezone: stationData.timezone || 'UTC',
      country: stationData.state || stationData.region || 'Unknown',
      offset: datumOffset,
      constituents
    };
  }
}
