# signalk-tides

A SignalK plugin that provides tidal predictions for the vessel's position from various online sources.

## Installation

1. Install `signalk-tides` from the SignalK Appstore or manually by running `npm install signalk-tides` in the SignalK server directory (`~/.signalk`).

2. Optionally go to the plugin settings in "Server => Plugin Config => Tides" and configure which source to use.

## Usage

This plugin depends on `navigation.position`.

It publishes the following [tide data](https://signalk.org/specification/1.7.0/doc/vesselsBranch.html#vesselsregexpenvironmenttide):

* `environment.tide.heightHigh`
* `environment.tide.timeHigh`
* `environment.tide.heightLow`
* `environment.tide.timeLow`

### Tides resource

It also registers a `tides` resource, which returns tide predictions for yesterday and the next 6 days for the vessel's position.

```
$ curl http://localhost:3000/signalk/v2/api/resources/tides
```

##### Request Parameters

* `date` (optional) - the date for which to get the tide predictions in the format `YYYY-MM-DD`. Default: yesterday's date.

##### Response

```json
{
   "id" : "9710441",
   "name" : "Nurse Channel",
   "position" : {
      "latitude" : 22.516666666667,
      "longitude" : -75.85
   },
   "extremes" : [
      {
         "time" : "2025-03-16T01:51:00.000Z",
         "type" : "High",
         "value" : 0.836
      },
      {
         "time" : "2025-03-16T08:03:00.000Z",
         "type" : "Low",
         "value" : -0.016
      },
      {
         "time" : "2025-03-16T14:05:00.000Z",
         "type" : "High",
         "value" : 0.77
      },
      {
         "time" : "2025-03-16T20:11:00.000Z",
         "type" : "Low",
         "value" : -0.028
      },
      {
         "time" : "2025-03-17T02:26:00.000Z",
         "type" : "High",
         "value" : 0.83
      },
      {
         "time" : "2025-03-17T08:40:00.000Z",
         "type" : "Low",
         "value" : 0.004
      },
      {
         "time" : "2025-03-17T14:39:00.000Z",
         "type" : "High",
         "value" : 0.723
      },
      {
         "time" : "2025-03-17T20:43:00.000Z",
         "type" : "Low",
         "value" : -0.01
      },
      {
         "time" : "2025-03-18T03:02:00.000Z",
         "type" : "High",
         "value" : 0.813
      },
      {
         "time" : "2025-03-18T09:19:00.000Z",
         "type" : "Low",
         "value" : 0.033
      },
      {
         "time" : "2025-03-18T15:15:00.000Z",
         "type" : "High",
         "value" : 0.675
      },
      {
         "time" : "2025-03-18T21:16:00.000Z",
         "type" : "Low",
         "value" : 0.014
      }
   ]
}
```



## Sources

- [NOAA](https://tidesandcurrents.noaa.gov/web_services_info.html) (US only)
- [WorldTides API](https://www.worldtides.info/) (requires an API key)
- [StormGlass.io](https://www.stormglass.io/) (requires an API key)

## License

This plugin is a fork of the [signalk-tides-api](https://github.com/joabakk/signalk-tides-api) plugin (which is no longer working) and is licensed under the [Apache License 2.0](LICENSE). Kudos to @joabakk and @sbender9 for the original work.
