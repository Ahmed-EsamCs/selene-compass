import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TerrainData } from "@/lib/lunar/analysis";
import { ephemerisResponseSchema, liveSky, type EphemerisResponse } from "@/lib/lunar/ephemeris";
import { kmToLatLon } from "@/lib/lunar/terrain";

async function fetchEphemeris(lat: number, lon: number, altKm: number, signal: AbortSignal): Promise<EphemerisResponse> {
  const qs = new URLSearchParams({ lat: lat.toFixed(3), lon: lon.toFixed(3), alt: altKm.toFixed(2) });
  const res = await fetch(`/api/ephemeris?${qs}`, { signal });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body as { error?: string } | null)?.error ?? `Ephemeris request failed (HTTP ${res.status})`);
  return ephemerisResponseSchema.parse(body);
}

/** Ticks every minute so "now" readouts stay current without refetching. */
function useNow(periodMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), periodMs);
    return () => clearInterval(id);
  }, [periodMs]);
  return now;
}

/**
 * Real Sun/Earth positions (NASA JPL Horizons, via /api/ephemeris) for the map point (x, y),
 * judged against the loaded terrain's horizon. `null` point → idle.
 */
export function useLiveSky(t: TerrainData | null, point: { x: number; y: number } | null) {
  // Snap to 0.5 km so nearby probes share a request. The same snapped point is used for the
  // query *and* the horizon test: Horizons azimuths are relative to that site's local north.
  const key = point ? { x: Math.round(point.x * 2) / 2, y: Math.round(point.y * 2) / 2 } : null;
  const ll = key ? kmToLatLon(key.x, key.y) : null;
  const alt = t && key ? t.heightAt(key.x, key.y) : 0;
  const hour = Math.floor(Date.now() / 3_600_000);

  const query = useQuery({
    queryKey: ["ephemeris", key?.x, key?.y, hour],
    queryFn: ({ signal }) => fetchEphemeris(ll!.lat, ll!.lon, alt, signal),
    enabled: !!ll && !!t,
    staleTime: 60 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const now = useNow();
  const kx = key?.x;
  const ky = key?.y;
  const sky = useMemo(
    () => (t && kx !== undefined && ky !== undefined && query.data ? liveSky(t, kx, ky, query.data, now) : null),
    [t, kx, ky, query.data, now],
  );
  return { sky, data: query.data, lonDeg: ll?.lon ?? 0, isLoading: query.isLoading, error: query.error as Error | null, refetch: query.refetch };
}
