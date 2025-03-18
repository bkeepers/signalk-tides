const moment = require('moment');

module.exports = function (app, plugin) {
  return {
    id: 'stormglass',
    title: 'StormGlass.io',
    properties: {
      stormglassApiKey: {
        type: 'string',
        title: 'StormGlass.io API key'
      }
    },

    start(options) {
      app.debug("Using StormGlass.io API");
      return {
        async listResources({ date = moment().subtract(1, "days") } = {}) {
          const endPoint = new URL("https://api.stormglass.io/v2/tide/extremes/point");

          const position = app.getSelfPath("navigation.position.value");
          if (!position) throw new Error("no position");

          endPoint.search = new URLSearchParams({
            start: moment(date).format("YYYY-MM-DD"),
            end: moment(date).add(7, "days").format("YYYY-MM-DD"),
            // datum: "CD",
            lat: position.latitude,
            lng: position.longitude,
          });

          app.debug("Fetching StormGlass.io", endPoint.toString());

          const res = await fetch(endPoint, {
            headers: { Authorization: options.stormglassApiKey },
          });

          if(!res.ok) throw new Error('Failed to fetch StormGlass.io: ' + res.statusText);

          const data = await res.json();
          app.debug(JSON.stringify(data, null, 2));

          return {
            name: data.meta.station.name,
            position: {
              latitude: data.meta.station.lat,
              longitude: data.meta.station.lng,
            },
            extremes: data.data.map(({ type, time, height}) => {
              return {
                type: type === "high" ? "High" : "Low",
                value: height,
                time: new Date(time).toISOString(),
              };
            }),
          };
        },
        getResource: (id, property) => {
          throw new Error("Not implemented");
        },
        setResource: (id, value) => {
          throw new Error("Not implemented");
        },
        deleteResource: (id) => {
          throw new Error("Not implemented");
        },
      };

    }
  }
}
