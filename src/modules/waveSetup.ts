/**
 * Module: Seismic Wave Animation Setup
 *
 * Registers the SeismicWaveDescriptor on the Navara view and starts a
 * periodic pulse that triggers new wave rings for visible earthquakes.
 */
import { SeismicWaveDescriptor } from "../descriptors/SeismicWaveDescriptor";
import { getVisibleEarthquakes, getWaveColor } from "./earthquakeData";
import { lastWavePulse, WAVE_PULSE_INTERVAL } from "./earthquakeVisualization";
import type { Earthquake } from "../types/earthquake";
import type ThreeView from "@navaramap/three";
import type { DefaultDescriptions } from "@navaramap/three-default-plugin";

type NavaraView = ThreeView<DefaultDescriptions>;

/**
 * Registers the wave descriptor and starts the periodic wave-pulse
 * interval. `getEarthquakes` should return the current full dataset.
 */
export function setupWaveAnimation(
  view: NavaraView,
  getEarthquakes: () => Earthquake[],
): void {
  view.registerMesh("seismicWave", SeismicWaveDescriptor as Parameters<NavaraView["registerMesh"]>[1]);
  view.addMesh({ seismicWave: {} } as Parameters<NavaraView["addMesh"]>[0]);

  setInterval(() => {
    const visible = getVisibleEarthquakes(getEarthquakes());
    const now = Date.now();

    for (const eq of visible) {
      const lastTime = lastWavePulse.get(eq.id) || 0;
      if (now - lastTime >= WAVE_PULSE_INTERVAL) {
        SeismicWaveDescriptor.add({
          lat: eq.latitude,
          lng: eq.longitude,
          magnitude: eq.magnitude,
          color: getWaveColor(eq.magnitude),
          duration: 5500 + Math.random() * 2000,
          eqId: eq.id,
        });
        lastWavePulse.set(eq.id, now);
      }
    }
  }, 1000);
}
