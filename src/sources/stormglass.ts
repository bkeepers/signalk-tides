import type { SignalKApp, TideForecastParams, TideForecastResult, TideSource } from "../types.js";
import type { StormGlassApiResponse } from "../types/stormglass.js";
import moment from 'moment';

export default function (app: SignalKApp): TideSource {
  return {
    id: 'stormglass',
    title: 'StormGlass.io',
    properties: {
      stormglassApiKey: {
        type: 'string',
        title: 'StormGlass.io API key'
      }
    },

    start({ stormglassApiKey } = {}) {
      app.debug("Using StormGlass.io API");

      return async (params: TideForecastParams = {}): Promise<TideForecastResult> => {
        const { date = moment().subtract(1, "days").toISOString() } = params;
        const endPoint = new URL("https://api.stormglass.io/v2/tide/extremes/point");

        const position = app.getSelfPath("navigation.position.value");
        if (!position) throw new Error("no position");

        endPoint.search = new URLSearchParams({
          start: moment(date).format("YYYY-MM-DD"),
          end: moment(date).add(7, "days").format("YYYY-MM-DD"),
          // datum: "CD",
          lat: position.latitude,
          lng: position.longitude,
        }).toString();

        app.debug("Fetching StormGlass.io: " + endPoint.toString());

        const res = await fetch(endPoint, {
          headers: { Authorization: stormglassApiKey ?? '' },
        });

        if (!res.ok) throw new Error('Failed to fetch StormGlass.io: ' + res.statusText);

        const data = await res.json() as StormGlassApiResponse;
        app.debug(JSON.stringify(data, null, 2));

        return {
          station: {
            name: data.meta.station.name,
            position: {
              latitude: data.meta.station.lat,
              longitude: data.meta.station.lng,
            },
          },
          extremes: data.data.map(({ type, time, height }) => {
            return {
              type: type === "high" ? "High" : "Low",
              value: height,
              time: new Date(time).toISOString(),
            };
          }),
        };
      };
    }
  }
}
