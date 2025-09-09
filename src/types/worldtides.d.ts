export interface WorldTidesPredictionApiResponse {
  status: number;
  error?: string;
  callCount: number;
  copyright: string;
  requestLat: number;
  requestLon: number;
  responseLat: number;
  responseLon: number;
  station: string;
  atlas: string;
  extremes: Extreme[];
}

export interface WorldTidesExtreme {
  dt: number;
  date: string;
  height: number;
  type: string;
}
