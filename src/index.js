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

const worldtides = require('./sources/worldtides');
const noaa = require('./sources/noaa')

module.exports = function(app) {
  // Interval to update tide data
  const defaultPeriod = 60; // 1 hour
  let unsubscribes = [];

  const sources = [
    noaa(app),
    worldtides(app),
  ];

  const plugin = {
    id: "tides-api",
    name: "Tide APIs",
    description: "Plugin that fetches tide data from online sources",
    schema: {
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
    },
    stop() {
      unsubscribes.forEach((f) => f());
      unsubscribes = [];
    }
  };

  plugin.start = async function(props) {
    app.debug("Starting tides-api: " + JSON.stringify(props));

    // Use the selected source, or the first one if not specified
    const source = sources.find(source => source.id === props.source) || sources[0];

    // Load the selected source
    const provider = await source.start(props);

    // Register the source as a resource provider
    app.registerResourceProvider({ type: "tides", methods: provider });

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
        delta.updates.forEach(({ values }) => {
          values.forEach(({ path, value }) => {
            if (path === "navigation.position") {
              performUpdate(value);
            }
          });
        });
      }
    );

    async function performUpdate() {
      try {
        const { extremes } = await provider.listResources();

        // Use server date, or current date if not available
        const now = new Date(app.getSelfPath("navigation.datetime.value") ?? Date.now());

        const nextTide = {};

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
      } catch (e) {
        app.setPluginError(e.message);
        app.error(e);
      }
    }

    // Perform initial update on startup
    performUpdate();
  }

  return plugin;
}
