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

export interface CreateMarkerRequest {
  code: string;
  name: string;
  unit: string;
  category: string;
  refMin: number | null;
  refMax: number | null;
  description: string;
  valueType: 'numeric' | 'text';
}

export type RangeStatus = 'ok' | 'warn' | 'high';
export type ChartType = 'line' | 'bar' | 'dots';
export type Density = 'comfortable' | 'compact';

// Injected by electron/preload.js — only present when running inside Electron.
declare global {
  interface Window {
    electronAPI?: {
      isElectron: true;
      pickDbFolder:  () => Promise<string | null>;
      pickDbFile:    () => Promise<string | null>;
      completeSetup: (data: { dbFolder?: string; dbPath?: string; encryptionKey: string }) => Promise<{ ok: boolean; error?: string }>;
      getConfig:     () => Promise<{ configured: boolean; dbPath: string | null; keySet: boolean }>;
      changeKey:     (newKey: string) => Promise<{ ok: boolean; error?: string }>;
      resetConfig:   () => Promise<void>;
    };
  }
}
