/**
 * Module: Earthquake Visualization
 *
 * Manages per-earthquake GeoJSON point layers, depth-indicator cylinders,
 * DOM overlay labels, and back-face culling for cylinders.
 */
import ThreeView, { geodeticToVector3, degreeToRadian, northUpEastToFixedFrame } from "@navaramap/three";
import type { CylinderMeshDesc } from "@navaramap/three-default-descs";
import { OverlayPlugin, moveOverlayElement } from "@navaramap/three-plugins";
import type { DefaultDescriptions } from "@navaramap/three-default-plugin";
import type { Earthquake } from "../types/earthquake";
import { SeismicWaveDescriptor } from "../descriptors/SeismicWaveDescriptor";
import { createGeoJSON, getEarthquakeConfig, getWaveColor } from "./earthquakeData";

// ── Lookup maps ──────────────────────────────────────────────────────────────

type NavaraView = ThreeView<DefaultDescriptions>;

const earthquakeLayers = new Map<string, ReturnType<NavaraView["addLayer"]>>();
const depthIndicatorLines = new Map<string, ReturnType<NavaraView["addMesh"]>>();
const cylinderPositions = new Map<string, ReturnType<typeof geodeticToVector3>>();
const earthquakeOverlays = new Map<string, HTMLElement>();

// ── Wave pulse tracking ─────────────────────────────────────────────────────

export const lastWavePulse = new Map<string, number>();
export const WAVE_PULSE_INTERVAL = 8000;

// ── Initialization ───────────────────────────────────────────────────────────

/**
 * Creates the overlay container used for magnitude labels above
 * earthquake markers. Must be called once before any visualization.
 */
export function initOverlayContainer(mapContainer: HTMLElement): HTMLDivElement {
  const overlayContainer = document.createElement("div");
  overlayContainer.id = "earthquake-overlays";
  overlayContainer.style.position = "absolute";
  overlayContainer.style.top = "0";
  overlayContainer.style.left = "0";
  overlayContainer.style.pointerEvents = "none";
  overlayContainer.style.zIndex = "1000";
  mapContainer.appendChild(overlayContainer);
  return overlayContainer;
}

/**
 * Registers a delegated click handler on the overlay container so that
 * clicking an overlay label triggers earthquake selection.
 */
export function setupOverlayClickHandler(
  overlayContainer: HTMLElement,
  onSelect: (eqId: string) => void,
): void {
  overlayContainer.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest("[id^='eq-overlay-']");
    if (target) {
      const eqId = target.id.replace("eq-overlay-", "");
      onSelect(eqId);
    }
  });
}

/**
 * Wires the per-frame overlay update (label positions) and back-face
 * culling for depth-indicator cylinders.
 */
export function setupOverlayUpdater(
  overlayPlugin: OverlayPlugin,
  view: NavaraView,
): void {
  overlayPlugin.onUpdate(({ projected: proj }) => {
    const camPos = view.camera.raw.position;

    for (const [id, el] of earthquakeOverlays) {
      const pos = cylinderPositions.get(id);
      if (pos) {
        const toCam = camPos.clone().sub(pos).normalize();
        const outward = pos.clone().normalize();
        if (toCam.dot(outward) <= 0) { el.style.display = "none"; continue; }
      }
      const p = proj.get(id);
      if (p) {
        el.style.display = "";
        moveOverlayElement(el, p.x, p.y);
      } else {
        el.style.display = "none";
      }
    }

    for (const [id, handle] of depthIndicatorLines) {
      const pos = cylinderPositions.get(id);
      if (pos) {
        const toCam = camPos.clone().sub(pos).normalize();
        const outward = pos.clone().normalize();
        handle.visible = toCam.dot(outward) > 0;
      }
    }
  });
}

/**
 * Highlights the overlay label for a given earthquake, removing the highlight
 * from any previously highlighted label.
 */
export function highlightOverlay(eqId: string | null): void {
  // Remove existing highlight
  document.querySelectorAll(".eq-overlay-highlight").forEach((el) => {
    el.classList.remove("eq-overlay-highlight");
    (el as HTMLElement).style.fontSize = "";
    (el as HTMLElement).style.textShadow = "";
  });
  if (!eqId) return;
  const wrapper = document.getElementById(`eq-overlay-${eqId}`);
  if (!wrapper) return;
  const text = wrapper.firstElementChild as HTMLElement;
  if (text) {
    text.classList.add("eq-overlay-highlight");
    text.style.fontSize = "15px";
    text.style.textShadow = "0 0 6px rgba(255,255,255,0.4), 0 0 12px rgba(0,0,0,0.8)";
  }
}

/**
 * Synchronizes visible earthquake visualizations with the given list.
 * Adds or removes GeoJSON point layers, depth cylinders, overlay labels,
 * and triggers seismic wave rings for newly-visible earthquakes.
 */
export function updateEarthquakeVisualization(
  view: NavaraView,
  overlayPlugin: OverlayPlugin,
  overlayContainer: HTMLElement,
  visibleQuakes: Earthquake[],
): void {
  const visibleIds = new Set(visibleQuakes.map((eq) => eq.id));
  const currentVisibleIds = new Set(earthquakeLayers.keys());

  // ── Remove earthquakes no longer visible ────────────────────────────────
  for (const id of currentVisibleIds) {
    if (!visibleIds.has(id)) {
      earthquakeLayers.get(id)?.delete();
      earthquakeLayers.delete(id);

      const line = depthIndicatorLines.get(id);
      if (line) { try { line.delete(); } catch { /* ignore */ } }
      depthIndicatorLines.delete(id);

      cylinderPositions.delete(id);

      earthquakeOverlays.get(id)?.remove();
      earthquakeOverlays.delete(id);

      SeismicWaveDescriptor.fadeOut(id);
      lastWavePulse.delete(id);
    }
  }

  // ── Add newly visible earthquakes ───────────────────────────────────────
  for (const eq of visibleQuakes) {
    if (earthquakeLayers.has(eq.id)) continue;

    const config = getEarthquakeConfig(eq.magnitude);
    try {
      // GeoJSON point layer (underground sphere)
      const layer = view.addLayer({
        type: "geojson",
        data: createGeoJSON([eq]),
        point: {
          size: config.size,
          sizeInMeters: true,
          clampToGround: false,
          color: config.color,
          opacity: config.opacity,
        },
      });
      earthquakeLayers.set(eq.id, layer);

      // Seismic wave ring
      SeismicWaveDescriptor.add({
        lat: eq.latitude,
        lng: eq.longitude,
        magnitude: eq.magnitude,
        color: getWaveColor(eq.magnitude),
        duration: 5500 + Math.random() * 2000,
        eqId: eq.id,
      });
      lastWavePulse.set(eq.id, Date.now() - Math.random() * WAVE_PULSE_INTERVAL * 0.5);

      // Depth indicator cylinder
      const aboveGroundHeight = eq.magnitude * 50_000;
      const frame = northUpEastToFixedFrame(
        geodeticToVector3({
          lat: degreeToRadian(eq.latitude),
          lng: degreeToRadian(eq.longitude),
          height: aboveGroundHeight,
        }),
      );

      const totalHeight = aboveGroundHeight + eq.depth;
      const depthLine = view.addMesh<CylinderMeshDesc>({
        cylinder: {
          radiusTop: Math.max(300, eq.magnitude * 100),
          radiusBottom: Math.max(300, eq.magnitude * 100),
          height: totalHeight,
          color: config.color,
          emissiveColor: config.color,
          emissiveIntensity: 1.5,
          opacity: 0.8,
          castShadow: false,
          receiveShadow: false,
        },
        matrixWorld: frame,
        position: { x: 0, y: -totalHeight / 2, z: 0 },
      });
      depthIndicatorLines.set(eq.id, depthLine);

      // Store ECEF position for back-face culling
      cylinderPositions.set(
        eq.id,
        geodeticToVector3({
          lat: degreeToRadian(eq.latitude),
          lng: degreeToRadian(eq.longitude),
          height: 0,
        }).clone(),
      );

      // Overlay label (magnitude always visible, place on hover)
      const wrapper = document.createElement("div");
      wrapper.id = `eq-overlay-${eq.id}`;
      wrapper.style.position = "absolute";
      wrapper.style.pointerEvents = "auto";
      wrapper.style.cursor = "pointer";

      const text = document.createElement("div");
      text.style.cssText =
        "position:relative;color:" + config.hexColor +
        ";font-size:14px;font-weight:bold;text-align:center;line-height:1.2;white-space:nowrap;user-select:none;" +
        "text-shadow:0 0 4px rgba(0,0,0,0.8),0 0 8px rgba(0,0,0,0.6);" +
        "transform:translate(-50%,-50%)";

      const place = (eq.place || "").split(",")[0].trim();
      text.innerHTML = `<div>M${eq.magnitude.toFixed(1)}</div><div style="position:absolute;font-size:10px;opacity:0;max-width:120px;overflow:hidden;text-overflow:ellipsis;transition:opacity 0.15s">${place}</div>`;
      wrapper.addEventListener("mouseenter", () => {
        (text.children[1] as HTMLElement).style.opacity = "0.7";
      });
      wrapper.addEventListener("mouseleave", () => {
        (text.children[1] as HTMLElement).style.opacity = "0";
      });

      wrapper.appendChild(text);
      overlayContainer.appendChild(wrapper);
      earthquakeOverlays.set(eq.id, wrapper);
    } catch (e) {
      console.warn(`Failed to add visualization for earthquake ${eq.id}:`, e);
    }
  }

  // ── Update overlay positions ────────────────────────────────────────────
  overlayPlugin.setPositions(
    visibleQuakes.map((eq) => ({
      id: eq.id,
      lng: eq.longitude,
      lat: eq.latitude,
      alt: eq.magnitude * 50_000,
    })),
  );


}
