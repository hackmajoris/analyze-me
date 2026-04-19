import type { Marker, Category, Annotation } from '../types';
import { MarkerServiceMock } from './markerServiceMock';
import { MarkerServiceApi } from './markerServiceApi';

/**
 * MarkerService handles fetching marker, category, and annotation data.
 * Can use live API or mock data for development.
 */
export interface IMarkerService {
  /**
   * Fetch all markers (lab values)
   */
  getMarkers(): Promise<Marker[]>;

  /**
   * Fetch the list of distinct lab names
   */
  getLabs(): Promise<string[]>;

  /**
   * Fetch all categories (lab test groupings)
   */
  getCategories(): Promise<Record<string, Category>>;

  /**
   * Fetch all annotations (timeline events)
   */
  getAnnotations(): Promise<Annotation[]>;
}

export interface MarkerServiceOptions {
  /**
   * Use mock data (default: false)
   */
  useMock?: boolean;
}

/**
 * Factory function to create a marker service instance.
 * Defaults to live API; pass { useMock: true } for mock data.
 */
export function createMarkerService(options: MarkerServiceOptions = {}): IMarkerService {
  if (options.useMock) {
    return new MarkerServiceMock();
  }
  return new MarkerServiceApi();
}
