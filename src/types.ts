import { Position, ServerAPI } from '@signalk/server-api';
// TODO[TS]: remove these once @signalk/server-api has all the types needed.
// @ts-expect-error - signalk-server internal types not properly exported
import { WithConfig } from 'signalk-server/lib/app.js';
// @ts-expect-error - signalk-server internal types not properly exported
import { SignalKServer } from 'signalk-server/lib/types.js';

// TODO[TS]: Fix this in the upstream types
export type SignalKApp = ServerAPI & SignalKServer & WithConfig;

export type OptionalPromise<T> = T | Promise<T>;

export type TideExtremeType = "High" | "Low";

export interface TideForecastParams {
  position: Omit<Position, "altitude">;
  date?: string;
}

export interface TideExtreme {
  time: string;
  value: number;
  type: TideExtremeType;
}

export interface TideForecastResult {
  station: {
    name: string;
    position: {
      latitude: number;
      longitude: number;
    };
  }
  extremes: TideExtreme[];
  datum?: {
    source: 'MSL' | 'MLLW';  // What datum the source data is in
    mllwToMslOffset?: number;  // Offset in meters (MLLW + offset = MSL)
  };
}

export type TideForecastFunction = (params: TideForecastParams) => OptionalPromise<TideForecastResult>;

export interface TideSource {
  id: string;
  title: string;
  start: (props: Config) => OptionalPromise<TideForecastFunction>;
  properties?: unknown; // TODO: use schema?
}

export type Config = {
  source?: string;
  period?: number;
  worldtidesApiKey?: string;
  stormglassApiKey?: string;
  stationSwitchThreshold?: number;
  enableOfflineFallback?: boolean;
  offlineMode?: 'auto' | 'always';
  showOfflineWarning?: boolean;
};
