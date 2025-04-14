import { ServerAPI } from '@signalk/server-api';
// TODO[TS]: remove these once @signalk/server-api has all the types needed.
import { WithConfig } from 'signalk-server/lib/app.js';
import { SignalKServer } from 'signalk-server/lib/types.js';

// TODO[TS]: Fix this in the upstream types
export type SignalKApp = ServerAPI & SignalKServer & WithConfig;

export type OptionalPromise<T> = T | Promise<T>;

export type TideExtremeType = "High" | "Low";

export interface TideForecastParams {
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
}

export type TideForecastFunction = (params?: TideForecastParams) => OptionalPromise<TideForecastResult>;

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
};
