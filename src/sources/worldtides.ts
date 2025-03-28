import type { SignalKApp, TideForecastParams, TideForecastResult, TideSource } from "../types.js";
import type { WorldTidesPredictionApiResponse } from "../types/worldtides.js";
import moment from 'moment';

export default function (app: SignalKApp): TideSource {
  return {
    id: 'WorldTides.info',
    title: 'worldtides.info',
    properties: {
      worldtidesApiKey: {
        type: 'string',
        title: 'worldtides.info API key'
      }
    },

    start(options: { worldtidesApiKey: string }) {
      app.debug("Using WorldTides API");

      return async (params: TideForecastParams = {}): Promise<TideForecastResult> => {
        const { date = moment().subtract(1, "days") } = params;
        const endPoint = new URL("https://www.worldtides.info/api/v3");

        const position = app.getSelfPath("navigation.position.value");
        if (!position) throw new Error("no position");

        endPoint.search = new URLSearchParams({
          date: moment(date).format("YYYY-MM-DD"),
          datum: "CD",
          days: "7",
          extremes: "true",
          key: options.worldtidesApiKey,
          lat: position.latitude,
          lon: position.longitude,
        }).toString();

        app.debug("Fetching worldtides: " + endPoint.toString());

        const res = await fetch(endPoint);
        if(!res.ok) throw new Error('Failed to fetch worldtides: ' + res.statusText);

        const data = await res.json() as WorldTidesPredictionApiResponse;
        app.debug(JSON.stringify(data, null, 2));

        if (data.status != 200) throw new Error("worldtides data: " + data.error ? data.error : "none");

        return {
          station: {
            name: "WorldTides",
            position: {
              latitude: data.responseLat,
              longitude: data.responseLon,
            },
          },
          extremes: data.extremes.map(({ type, dt, height}) => {
            return {
              type,
              value: height,
              time: new Date(dt * 1000).toISOString(),
            };
          }),
        };
      };

    }
  }
}
