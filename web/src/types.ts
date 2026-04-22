export interface DataPoint {
  date: string;
  value: number;
  lab: string;
  refLow: number | null;
  refHigh: number | null;
  label?: string; // for qualitative results e.g. "< 75"
  expectedText?: string; // for text results e.g. "Negativ"
  flagged?: boolean; // whether result is outside normal range
}

export interface Marker {
  id: string;
  name: string;
  short: string;
  unit: string;
  category: string;
  refLow: number | null;
  refHigh: number | null;
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
