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

      return async ({ position, date = moment().subtract(1, "days").toISOString() }: TideForecastParams): Promise<TideForecastResult> => {
        const endPoint = new URL("https://api.stormglass.io/v2/tide/extremes/point");

        endPoint.search = new URLSearchParams({
          start: moment(date).format("YYYY-MM-DD"),
          end: moment(date).add(7, "days").format("YYYY-MM-DD"),
          datum: "MLLW",  // Request MLLW datum (StormGlass only supports MSL and MLLW)
          lat: position.latitude.toString(),
          lng: position.longitude.toString()
        }).toString();

        app.debug("Fetching StormGlass.io: " + endPoint.toString());

        const res = await fetch(endPoint, {
          headers: { Authorization: stormglassApiKey ?? '' },
        });

        if (!res.ok) throw new Error('Failed to fetch StormGlass.io: ' + res.statusText);

        const data = await res.json() as StormGlassApiResponse;
        app.debug(JSON.stringify(data, null, 2));

        // Log StormGlass's datum offset for debugging data quality issues
        if (data.meta.offset !== undefined) {
          app.debug(`StormGlass offset: ${data.meta.offset}m (station: ${data.meta.station.source})`);
        }

        return {
          station: {
            name: `${data.meta.station.name} (${data.meta.station.source})`,
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
          datum: {
            source: 'MLLW',  // StormGlass returns MLLW data when datum=MLLW is requested
            // StormGlass doesn't provide MSL offset, will be estimated if needed
          }
        };
      };
    }
  }
}
