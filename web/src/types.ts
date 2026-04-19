export interface DataPoint {
  date: string;
  value: number;
}

export interface Marker {
  id: string;
  name: string;
  short: string;
  unit: string;
  category: string;
  refLow: number;
  refHigh: number;
  description: string;
  values: DataPoint[];
}

export interface Category {
  label: string;
  color: string;
  tint: string;
}

export interface Annotation {
  date: string;
  title: string;
  body: string;
}

export type RangeStatus = 'ok' | 'warn' | 'high';
export type ChartType = 'line' | 'bar' | 'dots';
export type Density = 'comfortable' | 'compact';
