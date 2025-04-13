import { Coordinate } from "../coordinate";

export function Position({ latitude, longitude }: { latitude: number, longitude: number }) {
  const lat = Coordinate.lat(latitude);
  const lon = Coordinate.lon(longitude);
  return (
    <div className="Position">
      <div className="Position__Coordinate">
        <span>{lat.format('DD mm')}</span>
        <span className="Position__Direction">{lat.format('X')}</span>
      </div>
      <div className="Position__Coordinate">
        <span>{lon.format('DD mm')}</span>
        <span className="Position__Direction">{lon.format('X')}</span>
      </div>
    </div>
  );
}
