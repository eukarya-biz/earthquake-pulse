/**
 * Helper utilities for earthquake visualization
 */

import type { Earthquake, EarthquakeStats } from "../types/earthquake";
import { Color } from "three";

/**
 * Calculate statistics from earthquake data
 */
export function calculateStats(earthquakes: Earthquake[]): EarthquakeStats {
  if (earthquakes.length === 0) {
    return {
      total: 0,
      maxMagnitude: 0,
      minMagnitude: 0,
      averageMagnitude: 0,
      maxDepth: 0,
      minDepth: 0,
      averageDepth: 0,
    };
  }

  const magnitudes = earthquakes.map((eq) => eq.magnitude);
  const depths = earthquakes.map((eq) => eq.depth);

  return {
    total: earthquakes.length,
    maxMagnitude: Math.max(...magnitudes),
    minMagnitude: Math.min(...magnitudes),
    averageMagnitude: magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length,
    maxDepth: Math.max(...depths),
    minDepth: Math.min(...depths),
    averageDepth: depths.reduce((a, b) => a + b, 0) / depths.length,
  };
}

/**
 * Get color based on magnitude
 * Uses a gradient: green (small) -> yellow -> orange -> red -> purple (large)
 */
export function getMagnitudeColor(magnitude: number): Color {
  // Clamp magnitude to reasonable range
  const mag = Math.max(0, Math.min(9, magnitude));

  if (mag < 3) {
    // Very small: green to light green
    return new Color().setHSL(0.33, 0.8, 0.4 + mag * 0.1);
  } else if (mag < 5) {
    // Small to medium: yellow to orange
    const t = (mag - 3) / 2;
    return new Color().lerpColors(
      new Color(0xffff00), // yellow
      new Color(0xff8800), // orange
      t
    );
  } else if (mag < 6.5) {
    // Medium to large: orange to red
    const t = (mag - 5) / 1.5;
    return new Color().lerpColors(
      new Color(0xff8800), // orange
      new Color(0xff0000), // red
      t
    );
  } else {
    // Very large: red to purple
    const t = Math.min(1, (mag - 6.5) / 2.5);
    return new Color().lerpColors(
      new Color(0xff0000), // red
      new Color(0xff00ff), // magenta/purple
      t
    );
  }
}

/**
 * Get size scale based on magnitude
 */
export function getMagnitudeSize(magnitude: number): number {
  // Exponential scale: mag 3 = 1x, mag 5 = 3x, mag 7 = 10x
  return Math.pow(2, magnitude - 3);
}

/**
 * Get depth color (shallow = red, deep = blue)
 */
export function getDepthColor(depthMeters: number): Color {
  const depthKm = depthMeters / 1000;
  const t = Math.min(1, depthKm / 200); // Normalize 0-200km

  return new Color().lerpColors(
    new Color(0xff4444), // shallow: red-orange
    new Color(0x4444ff), // deep: blue
    t
  );
}

/**
 * Format depth for display
 */
export function formatDepth(depthMeters: number): string {
  const km = depthMeters / 1000;
  return km.toFixed(1) + " km";
}

/**
 * Format magnitude for display
 */
export function formatMagnitude(magnitude: number): string {
  return "M " + magnitude.toFixed(1);
}

/**
 * Format date for display
 */
export function formatDate(date: Date): string {
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Get Richter scale description
 */
export function getMagnitudeDescription(magnitude: number): string {
  if (magnitude < 3) return "Micro";
  if (magnitude < 4) return "Minor";
  if (magnitude < 5) return "Light";
  if (magnitude < 6) return "Moderate";
  if (magnitude < 7) return "Strong";
  if (magnitude < 8) return "Major";
  return "Great";
}
