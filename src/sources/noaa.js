const path = require('path')
const fs = require('fs/promises')
const geolib = require('geolib')
const moment = require('moment');

const apiUrl = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi'
const stationsUrl = apiUrl + '/stations.json?type=tidepredictions'
const dataGetterUrl = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'

const datum = 'MLLW'

module.exports = function (app) {
  return {
    id: 'noaa',
    title: 'NOAA (US only)',
    async start(options) {
      const stations = await StationList.load(app);
      return new NoaaProvider(app, stations);
    }
  }
}

class StationList extends Map {
  static async load(app) {
    const filename = path.join(app.config.configPath, "noaastations.json");
    let data

    try {
      data = JSON.parse(await fs.readFile(filename))
      app.debug("NOAA: Loaded cached tide stations from " + filename)
    } catch(_) {
      app.debug('NOAA: Downloading tide stations')
      const res = await fetch(stationsUrl)
      if ( !res.ok ) throw new Error(`Failed to download stations: ${res.statusText}`)
      data = await res.json()
      await fs.writeFile(filename, JSON.stringify(data));
    }

    return new this(data)
  }

  constructor(data) {
    super(data.stations.map((station) => [station.id, station]))
  }

  closestTo(position) {
    return this.near(position, 1)[0];
  }

  near(position, limit = 10) {
    const stationsWithDistances = Array.from(this.values()).map((station) => ({
      ...station,
      distance: geolib.getDistance(position, {latitude: station.lat, longitude: station.lng})
    }));

    return stationsWithDistances.sort((a, b) => a.distance - b.distance).slice(0, limit);
  }
}

class NoaaProvider {
  constructor(app, stations) {
    this.app = app;
    this.stations = stations;
  }

  async listResources(params) {
    const position = this.app.getSelfPath("navigation.position.value");
    if (!position) throw new Error("no position");

    const station = this.stations.closestTo(position);

    // Use server date, or current date if not available
    const now = new Date(this.app.getSelfPath("navigation.datetime.value") ?? Date.now());

    const endpoint = new URL(dataGetterUrl);
    endpoint.search = new URLSearchParams({
      product: "predictions",
      application: "signalk.org/node-server",
      begin_date: moment(now).subtract(1, "day").format("YYYYMMDD"),
      end_date: moment(now).add(1, "day").format("YYYYMMDD"),
      datum,
      station: station.reference_id,
      time_zone: "gmt",
      units: "metric",
      interval: "hilo",
      format: "json",
    });

    this.app.debug(`Fetching tides from NOAA: ${endpoint}`);

    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error("Failed to fetch NOAA tides: " + res.statusText);
      const body = await res.json();
      this.app.debug("NOAA response: \n" + JSON.stringify(body, null, 2));

      if (body.error) throw new Error(body.error.message);

      let tides = {
        name: station.name,
        id: station.reference_id,
        position: {
          latitude: station.lat,
          longitude: station.lng,
        },
        extremes: body.predictions.map(({t, v, type}) => {
          return {
            type: type === "H" ? "High" : "Low",
            value: Number(v),
            time: new Date(`${t}Z`).toISOString(),
          };
        })
      };

      return tides;
    } catch (err) {
      reportError(error);
      res.status(404).send("error");
    }
  }

  getResource(id, property) {
    throw new Error("Not implemented");
  }

  setResource(id, value) {
    throw new Error("Not implemented");
  }

  deleteResource(id) {
    throw new Error("Not implemented");
  }
}
