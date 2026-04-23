import { useState, useEffect, useMemo } from 'react';
import type { Marker, Category, Annotation } from '../types';
import { createMarkerService } from '../services/markerService';

export function useLabs() {
  const [labs, setLabs] = useState<string[]>([]);

  useEffect(() => {
    const service = createMarkerService();
    service.getLabs().then(data => setLabs(data ?? [])).catch(console.error);
  }, []);

  return labs;
}

export function useMarkerData(selectedLab = 'all', reloadSignal = 0) {
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
        setMarkers(m ?? []);
        setCategories(c ?? {});
        setAnnotations(a ?? []);
      })
      .catch(err => {
        setError(err.message);
        console.error('Failed to load marker data:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [reloadSignal]); // re-fetch when reloadSignal changes

  // Apply lab filter client-side so we don't re-fetch on every switch
  const filteredMarkers = useMemo(() => {
    if (selectedLab === 'all') return markers;

    return markers
      .map(m => {
        const values = m.values.filter(v => v.lab === selectedLab);
        if (values.length === 0) return null;
        // Derive ref range from the last data point of this lab
        const last = values[values.length - 1];
        return { ...m, values, refLow: last.refLow, refHigh: last.refHigh };
      })
      .filter((m): m is Marker => m !== null);
  }, [markers, selectedLab]);

  return { markers: filteredMarkers, categories, annotations, loading, error };
}
