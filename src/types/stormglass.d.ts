export interface StormGlassApiResponse {
  data: StormGlassExtreme[];
  meta: StormGlassMeta;
}

export interface StormGlassExtreme {
  height: number;
  time: Date;
  type: "high" | "low";
}

export interface StormGlassMeta {
  cost: number;
  dailyQuota: number;
  end: string;
  lat: number;
  lng: number;
  requestCount: number;
  start: string;
  station: StormGlassStation;
}

export interface StormGlassStation {
  distance: number;
  lat: number;
  lng: number;
  name: string;
  source: string;
}
