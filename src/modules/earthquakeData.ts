/**
 * Module: Earthquake Data
 *
 * Fetches earthquake data from USGS, generates mock data as fallback,
 * provides magnitude-based config helpers, and builds GeoJSON features.
 */
import { Color } from "@navaramap/three";
import { fetchEarthquakes, fetchEarthquakesByTimeRange, generateMockEarthquakes } from "../utils/earthquakeDataFetcher";
import { classifyMagnitude } from "../utils/magnitudeClassification";
import type { Earthquake } from "../types/earthquake";

// ── Data loading ─────────────────────────────────────────────────────────────

export async function loadEarthquakeData(startTime?: number, endTime?: number): Promise<Earthquake[]> {
  let earthquakes: Earthquake[];
  try {
    if (startTime !== undefined && endTime !== undefined) {
      earthquakes = await fetchEarthquakesByTimeRange(startTime, endTime);
    } else {
      earthquakes = await fetchEarthquakes("week", "all");
      earthquakes = earthquakes.filter((eq) => eq.magnitude >= 0);
    }
  } catch (error) {
    console.warn("⚠️ Failed to fetch real data, using mock data", error);
    earthquakes = generateMockEarthquakes(50);
  }

  return earthquakes;
}

// ── GeoJSON factory ──────────────────────────────────────────────────────────

export function createGeoJSON(eqs: Earthquake[]) {
  return {
    type: "FeatureCollection" as const,
    features: eqs.map((eq) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [eq.longitude, eq.latitude, -eq.depth],
      },
      properties: {
        id: eq.id,
        magnitude: eq.magnitude,
        depth: eq.depth,
        time: eq.time.toISOString(),
        place: eq.place || "Unknown location",
      },
    })),
  };
}

// ── Magnitude-based config ──────────────────────────────────────────────────

export interface EarthquakeConfig {
  size: number;
  color: Color;
  hexColor: string;
  opacity: number;
}

/** Returns visualization config (sphere size, color) for an earthquake. */
export function getEarthquakeConfig(magnitude: number): EarthquakeConfig {
  const cls = classifyMagnitude(magnitude);
  const sizes: Record<string, number> = {
    Major: 150_000, Strong: 100_000, Moderate: 60_000,
    Light: 40_000, Minor: 25_000, Micro: 15_000,
  };
  return {
    size: sizes[cls.name] ?? 40_000,
    color: new Color().setHex(cls.hex),
    hexColor: cls.color,
    opacity: 0.25,
  };
}

/** Returns hex color for wave ring animation. */
export function getWaveColor(magnitude: number): number {
  return classifyMagnitude(magnitude).hex;
}

// ── Visibility filtering ────────────────────────────────────────────────────

let rangeStartTime: number | null = null;
let rangeEndTime: number | null = null;

/** Updates the active time range. Called from the timeline handler. */
export function setTimeRange(start: number, end: number): void {
  rangeStartTime = start;
  rangeEndTime = end;
}

/**
 * Returns earthquakes whose occurrence time falls within the currently
 * selected time range.
 */
export function getVisibleEarthquakes(earthquakes: Earthquake[]): Earthquake[] {
  if (rangeStartTime === null || rangeEndTime === null) return earthquakes;
  return earthquakes.filter((eq) => {
    const t = eq.time.getTime();
    return t >= rangeStartTime! && t <= rangeEndTime!;
  });
}
