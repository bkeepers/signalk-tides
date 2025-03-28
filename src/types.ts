import { ServerAPI } from '@signalk/server-api';
// FIXME: remove these dependencies
import { WithConfig } from 'signalk-server/lib/app.js';
import { SignalKServer } from 'signalk-server/lib/types.js';

// FIXME: Fix this in the upstream types
export type SignalKApp = ServerAPI & SignalKServer & WithConfig;

export type OptionalPromise<T> = T | Promise<T>;

export type TideExtremeType = "High" | "Low";

export interface TideForecastParams {
  date?: string;
}

export interface TideForecastResult {
  station: {
    name: string;
    position: {
      latitude: number;
      longitude: number;
    };
  }
  extremes: { time: string; value: number; type: TideExtremeType; }[];
}

export type TideForecastFunction = (params?: TideForecastParams) => OptionalPromise<TideForecastResult>;

export interface TideSource {
  id: string;
  title: string;
  start: (props: any) => OptionalPromise<TideForecastFunction>;
  properties?: any; // TODO: use schema?
}

export type Config = {
  source?: string;
  period?: number;
};
