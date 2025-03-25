import path from 'path';
import fs from 'fs/promises';
import geolib from 'geolib';
import moment from 'moment';
import type { SignalKApp, TideForecastParams, TideForecastResult, TideSource } from '../types.js';
import type { NoaaPredictionApiResponse, NoaaStation, NoaaStationsApiResponse, NoaaTidePrediction } from '../types/noaa.js';

const stationsUrl = `https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions`;
const dataGetterUrl = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';

const datum = 'MLLW';

export default function (app: SignalKApp): TideSource {
  return {
    id: 'noaa',
    title: 'NOAA (US only)',
    async start() {
      const stations = await StationList.load(app);

      return async ({ date }: TideForecastParams = {}): Promise<TideForecastResult> => {
        const position = app.getSelfPath("navigation.position.value");
        if (!position) throw new Error("no position");

        const station = stations.closestTo(position);

        const endpoint = new URL(dataGetterUrl);
        endpoint.search = new URLSearchParams({
          product: "predictions",
          application: "signalk.org/node-server",
          begin_date: moment(date).format("YYYYMMDD"),
          end_date: moment(date).add(7, "days").format("YYYYMMDD"),
          datum,
          station: station.reference_id,
          time_zone: "gmt",
          units: "metric",
          interval: "hilo",
          format: "json",
        }).toString();

        app.debug(`Fetching tides from NOAA: ${endpoint}`);

        try {
          const res = await fetch(endpoint.toString());
          if (!res.ok) throw new Error("Failed to fetch NOAA tides: " + res.statusText);
          const body = await res.json() as NoaaPredictionApiResponse;
          app.debug("NOAA response: \n" + JSON.stringify(body, null, 2));

          if (body.error) throw new Error(body.error.message);

          return {
            station: {
              name: station.name,
              position: {
                latitude: station.lat,
                longitude: station.lng,
              },
            },
            extremes: body.predictions.map(({ t, v, type }: NoaaTidePrediction) => ({
              type: type === "H" ? "High" : "Low",
              value: Number(v),
              time: new Date(`${t}Z`).toISOString(),
            })),
          };
        } catch (error) {
          app.debug(`Error fetching tides: ${error}`);
          throw error;
        }
      }
    }
  };
};

class StationList extends Map<string, NoaaStation> {
  static async load(app: SignalKApp): Promise<StationList> {
    const filename = path.join(app.config.configPath, "noaastations.json");
    let data: NoaaStationsApiResponse;

    try {
      data = JSON.parse(await fs.readFile(filename, 'utf-8'));
      app.debug("NOAA: Loaded cached tide stations from " + filename);
    } catch (_) {
      app.debug('NOAA: Downloading tide stations');
      const res = await fetch(stationsUrl);
      if (!res.ok) throw new Error(`Failed to download stations: ${res.statusText}`);
      data = await res.json() as NoaaStationsApiResponse;
      await fs.writeFile(filename, JSON.stringify(data));
    }

    return new this(data.stations);
  }

  constructor(data: NoaaStation[]) {
    super(data.map((station) => [station.id, station]));
  }

  closestTo(position: { latitude: number; longitude: number }): NoaaStation {
    return this.near(position, 1)[0];
  }

  near(position: { latitude: number; longitude: number }, limit = 10): NoaaStation[] {
    const stationsWithDistances = Array.from(this.values()).map((station) => ({
      ...station,
      distance: geolib.getDistance(position, { latitude: station.lat, longitude: station.lng })
    }));

    return stationsWithDistances.sort((a, b) => a.distance - b.distance).slice(0, limit);
  }
}
