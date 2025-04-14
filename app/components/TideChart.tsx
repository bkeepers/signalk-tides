import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { TideExtreme } from "../hooks/useTideData";
import moment from "moment";
import { useContainerDimensions } from "../hooks/useContainerDimensions";

type TideChartProps = {
  width?: number;
  height?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  units?: "m" | "ft";
  timeFormat?: string;
  data: TideExtreme[];
};

export function TideChart({
  data,
  marginTop = 20,
  marginRight = 6,
  marginBottom = 30,
  marginLeft = 6,
  units = "m",
  timeFormat = "HH:mm",
}: TideChartProps) {
  const container = useRef<HTMLDivElement>(null);
  const now = useRef<SVGLineElement>(null);
  const { height = 0 } = useContainerDimensions(container) || {};
  const [width, setWidth] = useState(0)
  const gx = useRef<SVGGElement>(null);
  const x = useRef<d3.ScaleTime<number, number, never>>(null);
  const y = useRef<d3.ScaleLinear<number, number, never>>(null);
  const area = useRef<d3.Area<TideExtreme>>(null);
  const line = useRef<d3.Line<TideExtreme>>(null);
  const textPadding = 25;
  const yPadding = 0.3; // meters

  // Adjust width relative to height and number of forecasts
  useEffect(() => {
    setWidth(height / 4 * data.length)
  }, [height, data])

  function displayDepth(value: number) {
    return units === "m" ? `${value.toFixed(2)} m` : `${(value * 3.28084).toFixed(1)} ft`;
  }

  function displayTime(value: string) {
    return moment(value).format(timeFormat);
  }

  useEffect(() => {
    const [min = 0, max = 0] = d3.extent(data, d => new Date(d.time));

    x.current = d3.scaleTime()
      .domain([min, max])
      .range([marginLeft, width - marginRight]);

    const [yMin = 0, yMax = 0] = d3.extent(data, d => d.value)
    const yPad = (yMax - yMin) * .3;

    // Declare the y (vertical position) scale.
    y.current = d3.scaleLinear()
      .domain([yMin - yPad, yMax + yPad])
      .range([height - marginBottom, marginTop]);

    // Declare the area generator.
    area.current = d3.area<TideExtreme>()
      .curve(d3.curveMonotoneX)
      .x(d => x.current!(new Date(d.time)))
      .y0(y.current!(d3.min(data, d => d.value - yPadding) ?? 0))
      .y1(d => y.current!(d.value));

    line.current = d3.line<TideExtreme>()
      .curve(d3.curveMonotoneX)
      .x(d => x.current!(new Date(d.time)))
      .y(d => y.current!(d.value))

    if (gx.current) d3.select(gx.current).call(d3.axisBottom(x.current));
  }, [data, height, width, marginBottom, marginLeft, marginRight, marginTop])

  useEffect(() => {
    now.current?.scrollIntoView({ block: 'center', inline: 'center' })
  }, [data, now, width])

  return (
    <div className="TideChart" ref={container}>
      <svg width={width} height={height}>
        <defs>
          <linearGradient id="gradient" gradientTransform="rotate(90)">
            <stop className="TideChart__Gradient--stop1" offset="0" />
            <stop className="TideChart__Gradient--stop2" offset="100%" />
          </linearGradient>
        </defs>
        <g className="TideChart__XAxis" ref={gx} transform={`translate(0,${height - marginBottom})`} />

        <line
          className="TideChart__LowWater"
          x1={marginLeft}
          x2={width - marginRight}
          y1={y.current?.(0)}
          y2={y.current?.(0)}
        />

        <path fill="url(#gradient)" d={area.current?.(data) || ''} />
        <path className="TideChart__Line" d={line.current?.(data) || ''} />

        <line
          ref={now}
          className="TideChart__Now"
          x1={x.current?.(new Date())}
          x2={x.current?.(new Date())}
          y1={marginTop}
          y2={height - marginTop}
        />

        <g>
          {
            data.map((d, i) => (
              <g key={i}>
                <circle
                  className="TideChart__DataPoint"
                  cx={x.current?.(new Date(d.time))}
                  cy={y.current?.(d.value)}
                  r={5}
                />
                {
                  (i !== 0 && i !== data.length - 1) &&
                  <text
                    className={["TideChart__Text", `TideChart__Text--${d.type}`].join(" ")}
                    y={d.type === "High" ? marginTop + textPadding : height - marginBottom - textPadding}
                  >
                    <tspan className="TideChart__Depth" x={x.current?.(new Date(d.time))} dy={d.type === "High" ? "1.5em" : "-1.5em"}>
                      {displayDepth(d.value)}
                    </tspan>
                    <tspan className="TideChart__Time" x={x.current?.(new Date(d.time))} dy={d.type === "High" ? "-1.5em" : "1.5em"}>
                      {displayTime(d.time)}
                    </tspan>
                  </text>
                }
              </g>
            ))
          }
        </g>
      </svg>
    </div>
  );
}
