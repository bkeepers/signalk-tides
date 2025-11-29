/*
 * Copyright 2017 Scott Bender <scott@scottbender.net> and Joachim Bakke
 * Copyright 2025 Brandon Keepers <brandon@opensoul.org>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Plugin, Position } from '@signalk/server-api';
import noaa from './sources/noaa.js';
import stormglass from './sources/stormglass.js';
import worldtides from './sources/worldtides.js';
import offline from './sources/offline.js';
import type { SignalKApp, TideSource, Config, TideForecastResult } from './types.js';
import { approximateTideHeightAt } from './calculations.js';
import FileCache from './cache.js';
import { HarmonicsCache } from './harmonics-cache.js';
import { getDistance } from 'geolib';

export = function (app: SignalKApp): Plugin {
  // Interval to update tide data
  const defaultPeriod = 60; // 1 hour
  let unsubscribes: (() => void)[] = [];

  const sources: TideSource[] = [
    noaa(app),
    stormglass(app),
    worldtides(app),
    offline(app),
  ];

  const plugin: Plugin = {
    id: "tides",
    name: "Tides",
    description: "Tidal predictions for the vessel's position from various online sources.",
    schema: () => ({
      title: "Tides API",
      type: "object",
      properties: {
        source: {
          title: "Data source",
          type: "string",
          "anyOf": sources.map(({ id, title }) => ({
            const: id,
            title
          })),
          default: sources[0].id,
        },
        // Update plugin schema with sources
        ...sources.reduce((properties, source) => Object.assign(properties, source.properties ?? {}), {}),
        period: {
          title: "Update frequency",
          type: "number",
          description: "How often to update tide forecast (minutes)",
          default: 60,
          minimum: 1,
        },
        stationSwitchThreshold: {
          title: "Station switch threshold",
          type: "number",
          description: "Minimum distance difference (in km) required to switch to a different tide station. Prevents frequent switching between nearby stations. Set to 0 to disable.",
          default: 10,
          minimum: 0,
        },
        enableOfflineFallback: {
          title: "Enable offline fallback",
          type: "boolean",
          description: "Automatically use offline harmonic prediction when online providers fail",
          default: true,
        },
        offlineMode: {
          title: "Offline mode",
          type: "string",
          enum: ["auto", "always"],
          enumNames: ["Auto (fallback)", "Always offline"],
          description: "Auto: Use online first, fallback to offline. Always: Skip online providers entirely",
          default: "auto",
        },
        showOfflineWarning: {
          title: "Show offline warning",
          type: "boolean",
          description: "Display 'NOT FOR NAVIGATION' warning when using offline mode",
          default: true,
        },
      }
    }),
    stop() {
      unsubscribes.forEach((f) => f());
      unsubscribes = [];
    },
    start: async function (props: Config) {
    app.debug("Starting tides-api: " + JSON.stringify(props));

    let lastForecast: TideForecastResult | null = null;
    let lastPosition: Position | null = null;
    let preferredStation: { name: string; position: { latitude: number; longitude: number } } | null = null;
    let lastSuccessfulFetch: Date | null = null;
    let dataSource: 'online' | 'offline' | 'cached' = 'online';
    const cache = new FileCache(app.getDataDirPath());

    // Harmonics cache for automatic background downloads (500nm radius, quarterly updates)
    const harmonicsCache = new HarmonicsCache(
      app,
      app.getDataDirPath(),
      {
        autoDownloadRadius: 500,
        updateFrequency: 'quarterly',
        minStations: 2,
        expandRadiusIfNeeded: true,
        maxRadius: 1000,
      }
    );
    let harmonicsUpdateInProgress = false;
    let positionRetries = 0;

    // Use the selected source, or the first one if not specified
    const source = sources.find(source => source.id === props.source) || sources[0];

    // Load the selected source
    const provider = await source.start(props);

    // Register the source as a resource provider
    app.registerResourceProvider({
      type: "tides",
      methods: {
        async listResources(query: Record<string, unknown>) {
          if (!lastForecast) {
            // No cached forecast available, fetch new one
            if (!lastPosition) throw new Error("No position available");
            return provider({ position: lastPosition, ...query })
          }
          // Return cached forecast to avoid excessive API calls
          return lastForecast;
        },
        getResource(): never {
          throw new Error("Not implemented");
        },
        setResource(): never {
          throw new Error("Not implemented");
        },
        deleteResource(): never {
          throw new Error("Not implemented");
        }
      }
    });

    app.subscriptionmanager.subscribe(
      {
        context: "vessels." + app.selfId,
        subscribe: [
          {
            path: "navigation.position",
            period: (props.period ?? defaultPeriod) * 60 * 1000,
            policy: "fixed",
          },
        ],
      },
      unsubscribes,
      (subscriptionError: unknown) => {
        app.error("Error:" + subscriptionError);
      },
      updatePosition,
    );

    async function updatePosition() {
      lastPosition = app.getSelfPath('navigation.position.value') || await cache.get('position') || null;

      if (lastPosition) {
        await cache.set('position', lastPosition);

        // Background harmonics cache update (non-blocking)
        if (!harmonicsUpdateInProgress) {
          tryUpdateHarmonics();
        }

        await updateForecast();
      } else if (positionRetries < 3) {
        // Retry getting position for harmonics update
        positionRetries++;
        app.debug(`Position not available for harmonics update, will retry (${positionRetries}/3)`);
        setTimeout(updatePosition, 5 * 60 * 1000); // Retry in 5 minutes
      }
    }

    // Background task: Update harmonics cache if needed (non-blocking)
    async function tryUpdateHarmonics() {
      if (!lastPosition || harmonicsUpdateInProgress) return;

      try {
        harmonicsUpdateInProgress = true;
        app.debug('Checking if harmonics cache needs update...');

        // This runs in background and won't block tide updates
        await harmonicsCache.updateIfNeeded(lastPosition);
        positionRetries = 0; // Reset on success

      } catch (error) {
        app.debug(`Harmonics cache update failed: ${error}`);
      } finally {
        harmonicsUpdateInProgress = false;
      }
    }

    async function updateForecast() {
      if (!lastPosition) {
        app.debug("No position available, cannot fetch tide data");
        return
      }

      try {
        let newForecast = await provider({ position: lastPosition });

        // Check if we should switch to this new station
        const threshold = (props.stationSwitchThreshold ?? 10) * 1000; // Convert km to meters

        if (preferredStation && threshold > 0) {
          // Calculate distances from current position to both stations
          const distanceToPreferred = getDistance(
            lastPosition,
            preferredStation.position
          );
          const distanceToNew = getDistance(
            lastPosition,
            newForecast.station.position
          );

          // Only switch if the new station is significantly closer
          if (distanceToNew < distanceToPreferred - threshold) {
            app.debug(`Switching from ${preferredStation.name} (${(distanceToPreferred / 1000).toFixed(1)}km) to ${newForecast.station.name} (${(distanceToNew / 1000).toFixed(1)}km)`);
            preferredStation = newForecast.station;
            lastForecast = newForecast;
            lastSentTideState = null; // Force delta update for new station
          } else {
            app.debug(`Keeping ${preferredStation.name} (${(distanceToPreferred / 1000).toFixed(1)}km) instead of ${newForecast.station.name} (${(distanceToNew / 1000).toFixed(1)}km)`);
            // Keep using the existing lastForecast data for the preferred station
            // The newForecast from a different station is discarded
          }
        } else {
          // First time or threshold is 0 (disabled), use the new forecast
          preferredStation = newForecast.station;
          lastForecast = newForecast;
          lastSentTideState = null; // Force delta update for new forecast
        }

        // Mark successful fetch
        lastSuccessfulFetch = new Date();
        dataSource = 'online';

        const timestamp = lastSuccessfulFetch.toISOString();
        app.setPluginStatus(`Updated from ${source.title} at ${timestamp}`);
        app.debug(`Data source: ${dataSource}, Station: ${preferredStation?.name}`);
        updateTides()
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        app.debug(`Online provider failed: ${errorMessage}`);

        // Try offline fallback if enabled
        if (props.enableOfflineFallback !== false && props.offlineMode !== 'always') {
          try {
            app.debug('Attempting offline fallback...');
            const offlineSource = sources.find(s => s.id === 'Offline');
            if (offlineSource) {
              const offlineProvider = await offlineSource.start(props);
              let offlineForecast = await offlineProvider({ position: lastPosition });

              preferredStation = offlineForecast.station;
              lastForecast = offlineForecast;
              dataSource = 'offline';
              lastSentTideState = null; // Force delta update for offline fallback

              const warning = props.showOfflineWarning !== false
                ? " - NOT FOR NAVIGATION"
                : "";
              const timestamp = new Date().toISOString();
              app.setPluginStatus(`Offline mode${warning} at ${timestamp}`);
              app.debug('Offline fallback successful');
              updateTides();
              return;
            }
          } catch (offlineError: unknown) {
            const offlineErrorMsg = offlineError instanceof Error ? offlineError.message : String(offlineError);
            app.debug(`Offline fallback failed: ${offlineErrorMsg}`);
          }
        }

        // Both online and offline failed, or offline disabled
        app.setPluginError(errorMessage);
        app.error(e);
      }
    }

    let lastSentTideState: {
      stationName: string;
      lowTime: string;
      highTime: string;
    } | null = null;

    async function updateTides(now = new Date()) {
      if (!lastForecast) return;
      // Get the next two upcoming extremes
      const nextTides = lastForecast.extremes.filter(({ time }) => new Date(time) >= now).slice(0, 2)

      // Check if we need to send an update
      const currentState = {
        stationName: lastForecast.station.name,
        lowTime: nextTides.find(t => t.type === 'Low')?.time || '',
        highTime: nextTides.find(t => t.type === 'High')?.time || '',
      };

      // Only send delta if something changed (station, or next tide times)
      const shouldUpdate = !lastSentTideState ||
        lastSentTideState.stationName !== currentState.stationName ||
        lastSentTideState.lowTime !== currentState.lowTime ||
        lastSentTideState.highTime !== currentState.highTime;

      if (!shouldUpdate) {
        app.debug("Tide state unchanged, skipping delta");
        return;
      }

      const delta = {
        context: "vessels." + app.selfId,
        updates: [
          {
            timestamp: now.toISOString(),
            values: [
              {
                path: "environment.tide.stationName",
                value: lastForecast.station.name
              },
              {
                path: "environment.tide.heightNow",
                value: approximateTideHeightAt(lastForecast.extremes, now)
              },
              ...nextTides.flatMap(
                ({ type, time, value }) => {
                  return [
                    { path: `environment.tide.height${type}`, value },
                    { path: `environment.tide.time${type}`, value: time },
                  ];
                }
              )
            ]
          },
        ],
      };

      app.debug("Sending delta: " + JSON.stringify(delta));
      app.handleMessage(plugin.id, delta);
      lastSentTideState = currentState;
    }

      // Perform initial update on startup after short delay to allow gnss position to be populated
      delay(4000).then(updatePosition);
      // Update every minute
      setInterval(updateTides, 60 * 1000);
    }
  };

  function delay(time: number) {
    return new Promise((resolve) => setTimeout(resolve, time));
  }

  return plugin;
}
