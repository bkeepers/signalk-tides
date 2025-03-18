const moment = require('moment');

module.exports = function (app, plugin) {
  return {
    id: 'WorldTides.info',
    title: 'worldtides.info',
    properties: {
      worldtidesApiKey: {
        type: 'string',
        title: 'worldtides.info API key'
      }
    },

    start(options) {
      app.debug("Using WorldTides API");
      return {
        async listResources({ date = moment().subtract(1, "days") } = {}) {
          const endPoint = new URL("https://www.worldtides.info/api/v3");

          const position = app.getSelfPath("navigation.position.value");
          if (!position) throw new Error("no position");

          endPoint.search = new URLSearchParams({
            date: moment(date).format("YYYY-MM-DD"),
            datum: "CD",
            days: 7,
            extremes: true,
            key: options.worldtidesApiKey,
            lat: position.latitude,
            lon: position.longitude,
          });

          app.debug("Fetching worldtides", endPoint.toString());

          const res = await fetch(endPoint);
          if(!res.ok) throw new Error('Failed to fetch worldtides: ' + res.statusText);

          const data = await res.json();
          app.debug(JSON.stringify(data, null, 2));

          if (data.status != 200) throw new Error("worldtides data: " + data.error ? data.error : "none");

          return {
            name: "WorldTides",
            id: data.atlas,
            position: {
              latitude: data.responseLat,
              longitude: data.responseLon,
            },
            extremes: data.extremes.map(({ type, dt, height}) => {
              return {
                type,
                value: height,
                time: new Date(dt * 1000).toISOString(),
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
