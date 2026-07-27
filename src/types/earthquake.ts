/**
 * Earthquake data types for the showcase
 */

export interface Earthquake {
  id: string;
  latitude: number;
  longitude: number;
  depth: number; // meters below surface
  magnitude: number;
  time: Date;
  place?: string;
  type?: string; // e.g., "earthquake", "aftershock"
}

export interface EarthquakeStats {
  total: number;
  maxMagnitude: number;
  minMagnitude: number;
  averageMagnitude: number;
  maxDepth: number;
  minDepth: number;
  averageDepth: number;
}
