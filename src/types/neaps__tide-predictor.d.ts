declare module '@neaps/tide-predictor' {
  interface TideConstituent {
    name: string;
    amplitude: number;
    [phaseKey: string]: number | string;
  }

  interface TidePredictionOptions {
    phaseKey?: string;
    offset?: number;
  }

  interface TideExtreme {
    time: Date;
    level: number;
    high: boolean;
    low: boolean;
    label: string;
  }

  interface ExtremesOptions {
    start: Date;
    end: Date;
    timeFidelity?: number;
    labels?: {
      high?: string;
      low?: string;
    };
  }

  interface WaterLevelResult {
    time: Date;
    level: number;
  }

  interface TidePredictionInstance {
    getExtremesPrediction(options: ExtremesOptions): TideExtreme[];
    getWaterLevelAtTime(options: { time: Date }): WaterLevelResult;
  }

  function TidePrediction(
    constituents: TideConstituent[],
    options?: TidePredictionOptions
  ): TidePredictionInstance;

  export default TidePrediction;
}
