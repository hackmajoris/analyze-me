import { useState, useEffect } from 'react';
import type { Marker, Category, Annotation } from '../types';
import { createMarkerService } from '../services/markerService';

export function useMarkerData() {
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [categories, setCategories] = useState<Record<string, Category>>({});
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const service = createMarkerService();

    Promise.all([
      service.getMarkers(),
      service.getCategories(),
      service.getAnnotations(),
    ])
      .then(([m, c, a]) => {
        setMarkers(m);
        setCategories(c);
        setAnnotations(a);
      })
      .catch(err => {
        setError(err.message);
        console.error('Failed to load marker data:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return { markers, categories, annotations, loading, error };
}
