/**
 * Earthquake data fetcher
 * Fetches earthquake data from USGS API (reliable and CORS-friendly)
 * Formats:
 *   Summary feed: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
 *   FDSN query:   https://earthquake.usgs.gov/fdsnws/event/1/query
 */

import type { Earthquake } from "../types/earthquake";

interface USGSFeature {
  id: string;
  properties: {
    mag: number;
    place: string;
    time: number;
    type: string;
  };
  geometry: {
    coordinates: [number, number, number]; // [lng, lat, depth in km]
  };
}

interface USGSResponse {
  features: USGSFeature[];
}

function mapFeatures(features: USGSFeature[]): Earthquake[] {
  return features.map((feature) => ({
    id: feature.id,
    latitude: feature.geometry.coordinates[1],
    longitude: feature.geometry.coordinates[0],
    depth: feature.geometry.coordinates[2] * 1000, // Convert km to meters
    magnitude: feature.properties.mag,
    time: new Date(feature.properties.time),
    place: feature.properties.place,
    type: feature.properties.type,
  }));
}

function toISODate(ts: number): string {
  return new Date(ts).toISOString().split(".")[0];
}

/**
 * Fetch earthquakes from USGS summary feed (fixed time ranges).
 * @param timeRange - 'hour', 'day', 'week', 'month'
 * @param minMagnitude - 'significant', '4.5', '2.5', '1.0', 'all'
 */
export async function fetchEarthquakes(
  timeRange: 'hour' | 'day' | 'week' | 'month' = 'week',
  minMagnitude: 'significant' | '4.5' | '2.5' | '1.0' | 'all' = '4.5'
): Promise<Earthquake[]> {
  const url = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${minMagnitude}_${timeRange}.geojson`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: USGSResponse = await response.json();
    return mapFeatures(data.features);
  } catch (error) {
    console.error('Error fetching earthquake data:', error);
    throw error;
  }
}

/**
 * Fetch earthquakes from USGS FDSN query API for an arbitrary time range.
 * Pads the range by 2 hours on each side and uses chronological order.
 * Max 20000 results per query.
 */
export async function fetchEarthquakesByTimeRange(
  startTime: number,
  endTime: number,
): Promise<Earthquake[]> {
  const buffer = 2 * 3600000; // 2-hour buffer
  const start = toISODate(startTime - buffer);
  const end = toISODate(endTime + buffer);
  const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${encodeURIComponent(start)}&endtime=${encodeURIComponent(end)}&minmagnitude=0&limit=20000&orderby=time-asc`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: USGSResponse = await response.json();
    return mapFeatures(data.features);
  } catch (error) {
    console.error('Error fetching earthquake data by time range:', error);
    throw error;
  }
}

/**
 * Fetch Japan-specific earthquakes (filter by bounding box)
 */
export async function fetchJapanEarthquakes(
  timeRange: 'hour' | 'day' | 'week' | 'month' = 'week',
  minMagnitude: 'significant' | '4.5' | '2.5' | '1.0' | 'all' = '2.5'
): Promise<Earthquake[]> {
  const allEarthquakes = await fetchEarthquakes(timeRange, minMagnitude);

  // Japan bounding box (approximate)
  const japanBounds = {
    minLat: 24,
    maxLat: 46,
    minLng: 123,
    maxLng: 146,
  };

  return allEarthquakes.filter(
    (eq) =>
      eq.latitude >= japanBounds.minLat &&
      eq.latitude <= japanBounds.maxLat &&
      eq.longitude >= japanBounds.minLng &&
      eq.longitude <= japanBounds.maxLng
  );
}

/**
 * Generate mock earthquake data for testing
 */
export function generateMockEarthquakes(count: number = 50): Earthquake[] {
  const earthquakes: Earthquake[] = [];
  const now = Date.now();

  // Focus on Japan region
  const japanCenter = { lat: 36.5, lng: 138.5 };

  for (let i = 0; i < count; i++) {
    // Random position around Japan
    const lat = japanCenter.lat + (Math.random() - 0.5) * 20;
    const lng = japanCenter.lng + (Math.random() - 0.5) * 20;

    // Random magnitude (mostly small, few large)
    const rand = Math.random();
    let magnitude: number;
    if (rand > 0.95) magnitude = 6 + Math.random() * 2; // 5% large (6-8)
    else if (rand > 0.7) magnitude = 5 + Math.random(); // 25% medium (5-6)
    else magnitude = 3 + Math.random() * 2; // 70% small (3-5)

    // Random depth (shallow to deep)
    const depth = Math.random() * 200000; // 0-200km in meters

    // Random time in the past week
    const time = new Date(now - Math.random() * 7 * 24 * 60 * 60 * 1000);

    earthquakes.push({
      id: `mock-${i}`,
      latitude: lat,
      longitude: lng,
      depth,
      magnitude,
      time,
      place: `Mock location ${i}`,
      type: 'earthquake',
    });
  }

  // Sort by time (oldest first)
  return earthquakes.sort((a, b) => a.time.getTime() - b.time.getTime());
}
