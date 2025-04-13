import { useEffect, useState } from "react";
import { TideForecastResult, TideExtreme } from "../../src/types";

const { VITE_SIGNALK_URL = window.location.toString() } = import.meta.env;
const TIDES_URL = new URL("/signalk/v2/api/resources/tides", VITE_SIGNALK_URL)

export type { TideForecastResult, TideExtreme }

export function useTideData() {
  const [data, setData] = useState<TideForecastResult>()

  useEffect(() => {
    (async () => {
      const res = await fetch(TIDES_URL)
      setData(await res.json())
    })()
  }, []);

  return data;
}
