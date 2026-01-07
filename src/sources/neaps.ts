import type { SignalKApp, TideForecastParams, TideForecastResult, TideSource } from "../types.js";
import { getExtremesPrediction } from "neaps";
import moment from 'moment';

export default function (app: SignalKApp): TideSource {
  return {
    id: 'neaps',
    title: 'Neaps',
    properties: {},

    start() {
      app.debug("Using Neaps");

      return async ({ position, date = moment().subtract(1, "days").toISOString() }: TideForecastParams): Promise<TideForecastResult> => {
        const { station, extremes } = getExtremesPrediction({
          ...position,
          start: new Date(date),
          end: moment(date).add(7, "days").toDate(),
          labels: {
            high: "High",
            low: "Low"
          }
        });

        return {
          station: {
            name: station.name,
            position: {
              latitude: station.latitude,
              longitude: station.longitude,
            },
          },
          extremes: extremes.map(({ time, level, label }) => {
            return {
              type: label as "High" | "Low",
              value: level,
              time: time.toISOString(),
            };
          }),
        };
      };
    }
  }
}
