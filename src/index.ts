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

import { Plugin } from '@signalk/server-api';
import noaa from './sources/noaa.js';
import stormglass from './sources/stormglass.js';
import worldtides from './sources/worldtides.js';
import type { SignalKApp, TideSource, Config, TideExtremeType } from './types.js';

export = function (app: SignalKApp): Plugin {
  // Interval to update tide data
  const defaultPeriod = 60; // 1 hour
  let unsubscribes: (() => void)[] = [];

  const sources: TideSource[] = [
    noaa(app),
    stormglass(app),
    worldtides(app),
  ];

  const plugin: Plugin = {
    id: "tides",
    name: "Tides",
    // @ts-expect-error: TODO[TS]: fix Plugin type upstream
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
          description: "How often to update tide data (minutes)",
          default: 60,
          minimum: 1,
        },
      }
    }),
    stop() {
      unsubscribes.forEach((f) => f());
      unsubscribes = [];
    }
  };

  plugin.start = async function (props: Config) {
    app.debug("Starting tides-api: " + JSON.stringify(props));

    // Use the selected source, or the first one if not specified
    const source = sources.find(source => source.id === props.source) || sources[0];

    // Load the selected source
    const provider = await source.start(props);

    // Register the source as a resource provider
    app.registerResourceProvider({
      type: "tides",
      methods: {
        async listResources(query) {
          return provider(query)
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
      (subscriptionError) => {
        app.error("Error:" + subscriptionError);
      },
      (delta) => {
        // @ts-expect-error: TODO[TS]: fix Delta type upstream
        delta.updates.forEach(({ values }) => {
          // @ts-expect-error: TODO[TS]: fix Delta type upstream
          values.forEach(({ path }) => {
            if (path === "navigation.position") {
              performUpdate();
            }
          });
        });
      }
    );

    async function performUpdate() {
      try {
        const { extremes } = await provider();

        // Use server date, or current date if not available
        const now = new Date(app.getSelfPath("navigation.datetime.value") ?? Date.now());

        const nextTide: Partial<Record<TideExtremeType, { time: string, value: number }>> = {};

        extremes.forEach(({ type, value, time }) => {
          // Get the first tide of this type after now
          if (!nextTide[type] && new Date(time) > now) {
            nextTide[type] = { time, value };
          }
        });

        const delta = {
          context: "vessels." + app.selfId,
          updates: [
            {
              timestamp: now.toISOString(),
              values: Object.entries(nextTide).flatMap(
                ([type, { time, value }]) => {
                  return [
                    { path: `environment.tide.height${type}`, value: value },
                    { path: `environment.tide.time${type}`, value: time },
                  ];
                }
              ),
            },
          ],
        };

        app.debug("Sending delta: " + JSON.stringify(delta));
        app.handleMessage(plugin.id, delta);
        app.setPluginStatus("Updated tide data");
      } catch (e: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        app.setPluginError((e as any).message);
        // @ts-expect-error: TODO[TS] this accepts more than just a string: https://github.com/bkeepers/signalk-server/blob/d6845ee1f915e6b729d66d2b08b15dc2e0da8e51/src/interfaces/plugins.ts#L517-L519
        app.error(e);
      }
    }

    // Perform initial update on startup after short delay to allow gnss position to be populated
    delay(4000).then(() => { performUpdate() });
  }
  function delay(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
  }

  return plugin;
}
