import { useTideData } from "../hooks/useTideData";
import { Position } from '../components/Position';
import { TideChart } from '../components/TideChart'

export function TidesView() {
  const data = useTideData();

  return (
    <>
      <header>
        <h1>{data?.station?.name}</h1>
        {data?.station?.position && <Position {...data?.station?.position} />}
      </header>
      <TideChart data={data?.extremes ?? []} units="ft" timeFormat="h:mm a" />
    </>
  )
}

export function LoadingTidesView() {
  return (
    <div>
      <h1>Loading...</h1>
    </div>
  )
}
