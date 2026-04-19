import { api } from '../lib/api';
import type { Marker, Category, Annotation } from '../types';
import type { IMarkerService } from './markerService';

export class MarkerServiceApi implements IMarkerService {
  async getMarkers(): Promise<Marker[]> {
    return api.get<Marker[]>('/api/markers');
  }

  async getCategories(): Promise<Record<string, Category>> {
    return api.get<Record<string, Category>>('/api/categories');
  }

  async getAnnotations(): Promise<Annotation[]> {
    return api.get<Annotation[]>('/api/annotations');
  }
}
