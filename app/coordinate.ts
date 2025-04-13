export type CoordinateFormatOptions = {
  precision: number,
  units: { degrees: string, minutes: string, seconds: string }
}

// Adapted from https://github.com/nerik/formatcoords
export class Coordinate {
  static lat(value: number) {
    return new Coordinate(value, ['N', 'S']);
  }

  static lon(value: number) {
    return new Coordinate(value, ['E', 'W']);
  }

  constructor(public value: number, public directions: [string, string]) {
  }

  get degrees() {
    return Math.abs(this.value);
  }

  get minutes() {
    return (this.degrees % 1) * 60;
  }

  get seconds() {
    return (this.minutes % 1) * 60;
  }

  get direction() {
    return this.directions[this.value > 0 ? 0 : 1];
  }

  format(format: string, options?: CoordinateFormatOptions) {
    if (isNaN(this.value)) return;

    const {
      precision = 3,
      units = { degrees: '°', minutes: '′', seconds: '″' }
    } = options ?? {};

    const formats: [RegExp, () => string][] = [
      [/DD/g, () => [Math.floor(this.degrees), units.degrees].join('')],
      [/dd/g, () => [this.degrees.toFixed(precision), units.degrees].join('')],
      [/D/g, () => Math.floor(this.degrees).toString()],
      [/d/g, () => this.degrees.toFixed(precision)],
      [/MM/g, () => [Math.floor(this.minutes), units.minutes].join('')],
      [/mm/g, () => [this.minutes.toFixed(precision), units.minutes].join('')],
      [/M/g, () => Math.floor(this.minutes).toString()],
      [/m/g, () => this.minutes.toFixed(precision)],
      [/ss/g, () => [this.seconds.toFixed(precision), units.seconds].join('')],
      [/s/g, () => this.seconds.toFixed(precision)],
      [/-/g, () => this.value < 0 ? '-' : ''],
      [/X/g, () => this.direction],
    ]

    return formats.reduce((result, [regex, replacer]) => {
      return result.replace(regex, replacer);
    }, format);
  }
}
