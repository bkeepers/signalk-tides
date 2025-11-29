import path from "path";
import { unlink } from "fs/promises";
import { getDistance } from "geolib";
import moment from "moment";
import FileCache from "../cache.js";
import type {
  SignalKApp,
  TideForecastParams,
  TideForecastResult,
  TideSource,
} from "../types.js";
import type {
  NoaaPredictionApiResponse,
  NoaaStation,
  NoaaStationsApiResponse,
  NoaaTidePrediction,
} from "../types/noaa.js";

const stationsUrl = `https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions`;
const dataGetterUrl =
  "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

const datum = "MLLW";

export default function (app: SignalKApp): TideSource {
  return {
    id: "noaa",
    title: "NOAA (US only)",
    async start() {
      const cache = new FileCache(path.join(app.getDataDirPath(), "noaa"));
      const stations = await StationList.load(cache, app);

      // Remove old cache file
      // @ts-expect-error: configPath exists, just not part of the types
      unlink(path.join(app.config.configPath, "noaastations.json")).catch(
        () => {
          /* ignore */
        }
      );

      return async (
        params: TideForecastParams
      ): Promise<TideForecastResult> => {
        const { position, date = moment().subtract(1, "days") } = params;
        const station = stations.closestTo(position);

        const endpoint = new URL(dataGetterUrl);
        endpoint.search = new URLSearchParams({
          product: "predictions",
          application: "signalk.org/node-server",
          begin_date: moment(date).format("YYYYMMDD"),
          end_date: moment(date).add(7, "days").format("YYYYMMDD"),
          datum,
          station: station.id,
          time_zone: "gmt",
          units: "metric",
          interval: "hilo",
          format: "json",
        }).toString();

        app.debug(`Fetching tides from NOAA: ${endpoint}`);

        try {
          const res = await fetch(endpoint.toString());
          if (!res.ok)
            throw new Error("Failed to fetch NOAA tides: " + res.statusText);
          const body = (await res.json()) as NoaaPredictionApiResponse;
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
            extremes: body.predictions.map(
              ({ t, v, type }: NoaaTidePrediction) => ({
                type: type === "H" ? "High" : "Low",
                value: Number(v),
                time: new Date(`${t}Z`).toISOString(),
              })
            ),
          };
        } catch (err) {
          app.setPluginError(`Failed to fetch NOAA tides: ${err}`);
          // @ts-expect-error: app.error should accept more than just a string
          app.error(err);
          throw err;
        }
      };
    },
  };
}

class StationList extends Map<string, NoaaStation> {
  static async load(cache: FileCache, app: SignalKApp): Promise<StationList> {
    let data: NoaaStationsApiResponse = (await cache.get(
      "stations"
    )) as NoaaStationsApiResponse;

    if (data) {
      app.debug("NOAA: Loaded cached tide stations");
    } else {
      app.debug("NOAA: Downloading tide stations");
      const res = await fetch(stationsUrl);
      if (!res.ok)
        throw new Error(`Failed to download stations: ${res.statusText}`);
      data = (await res.json()) as NoaaStationsApiResponse;
      await cache.set("stations", data);
    }

    return new this(data.stations);
  }

  constructor(data: NoaaStation[]) {
    super(data.map((station) => [station.id, station]));
  }

  closestTo(position: { latitude: number; longitude: number }): NoaaStation {
    return this.near(position, 1)[0];
  }

  near(
    position: { latitude: number; longitude: number },
    limit = 10
  ): NoaaStation[] {
    const stationsWithDistances = Array.from(this.values()).map((station) => ({
      ...station,
      distance: getDistance(position, {
        latitude: station.lat,
        longitude: station.lng,
      }),
    }));

    return stationsWithDistances
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);
  }
}
