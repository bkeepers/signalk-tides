import { SignalKApp, TideSource } from "../types.js";
import neaps from "./neaps.js";
import noaa from "./noaa.js";
import stormglass from "./stormglass.js";
import worldtides from "./worldtides.js";

export default function createSources(app: SignalKApp): TideSource[] {
  return [neaps, noaa, stormglass, worldtides].map(s => s(app));
}
