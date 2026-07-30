/**
 * Module: View Setup
 *
 * Creates and configures the Navara ThreeView instance, registers plugins,
 * initializes the scene (photoreal, lighting), sets up terrain, basemap,
 * and attribution.
 */
import ThreeView, { Color } from "@navaramap/three";
import type { AttributionItem } from "@navaramap/three";
import { DefaultDescriptions, DefaultPlugin } from "@navaramap/three-default-plugin";
import type { AmbientLightDesc } from "@navaramap/three-default-descs";
import { TileJsonPlugin, OverlayPlugin } from "@navaramap/three-plugins";
import { DigitalGlobeDescriptor } from "../descriptors/DigitalGlobeDescriptor";

export type VisualMode = "grayscale" | "realistic" | "digital";

// ── Basemap descriptors ──────────────────────────────────────────────────────

const BASEMAP_GRAYSCALE = {
  key: "grayscale" as const,
  url: "https://papers.reearth.land/styles/black/tilejson.json",
  label: "Re:Earth Grayscale Imagery",
};
const BASEMAP_BLUEMARBLE = {
  key: "bluemarble" as const,
  url: "https://papers.reearth.land/bluemarble/tilejson.json",
  label: "Re:Earth Blue Marble Imagery",
};

type BasemapDescriptor = typeof BASEMAP_GRAYSCALE | typeof BASEMAP_BLUEMARBLE;

// ── Public API ────────────────────────────────────────────────────────────────

export interface ViewContext {
  view: ThreeView<DefaultDescriptions>;
  tilejson: TileJsonPlugin;
  overlayPlugin: OverlayPlugin;
  setBasemap: (basemap: BasemapDescriptor) => Promise<void>;
  toggleVisualMode: (mode: VisualMode) => void;
  togglePlateBoundaries: (visible: boolean) => void;
  setBackgroundColor: (hex: number) => void;
}

/**
 * Creates the Navara view, registers plugins, initializes the scene,
 * terrain, basemap, and attribution. Returns all objects needed downstream.
 */
export async function setupView(): Promise<ViewContext> {
  // Container for the Three.js canvas
  const mapContainer = document.createElement("div");
  mapContainer.id = "map-container";
  document.body.appendChild(mapContainer);

  const view = new ThreeView<DefaultDescriptions>({ container: mapContainer });

  const defaultPlugin = new DefaultPlugin();
  view.addPlugin(defaultPlugin);

  const tilejson = new TileJsonPlugin();
  view.addPlugin(tilejson);

  const overlayPlugin = new OverlayPlugin({ maxDistance: 10_000_000 });
  view.addPlugin(overlayPlugin);

  await view.init();

  view.animation = true;

  // Photoreal scene + ambient light
  const defaultScene = defaultPlugin.addDefaultPhotorealScene();
  const ambientLightHandle = view.addLight<AmbientLightDesc>({
    ambient: { intensity: 0.15 },
  });

  // ── Terrain ──────────────────────────────────────────────────────────────

  const terrainSource = view.addSource({
    type: "quantized-mesh",
    url: "https://terrain.reearth.land/cesium-mesh/ellipsoid/{z}/{x}/{y}.terrain",
    maxZoom: 18,
    requestVertexNormals: true,
    requestWaterMask: true,
  });
  let terrainLayer: ReturnType<typeof view.addLayer> | undefined;
  terrainLayer = view.addLayer({ type: "terrain", source: terrainSource, terrain: {} });

  // ── Digital globe ────────────────────────────────────────────────────────

  const loadingLabel = document.getElementById("loading-text");
  const isJa = typeof localStorage !== "undefined" && localStorage.getItem("lang") === "ja";
  if (loadingLabel) loadingLabel.textContent = isJa ? "地形データを読み込み中…" : "Loading terrain data…";
  await DigitalGlobeDescriptor.preload();
  (view as ThreeView<Record<string, unknown>>).registerMesh("digitalGlobe", DigitalGlobeDescriptor);
  const digitalGlobeHandle = (view as ThreeView<Record<string, unknown>>).addMesh({ digitalGlobe: {} });
  (digitalGlobeHandle as { visible: boolean }).visible = false;

  // ── Tectonic plate boundaries ────────────────────────────────────────────

  const plateSource = view.addSource({
    type: "geojson",
    url: `${import.meta.env.BASE_URL}plate_boundaries.geojson`,
  });

  let plateLayer: ReturnType<typeof view.addLayer> | undefined;

  function togglePlateBoundaries(visible: boolean): void {
    if (visible && !plateLayer) {
      plateLayer = view.addLayer({
        type: "vector",
        source: plateSource,
        polyline: {
          color: new Color().setStyle("#f59e0b"),
          width: 1,
          opacity: 1,
        },
      });
    } else if (!visible && plateLayer) {
      plateLayer.delete();
      plateLayer = undefined;
    }
  }

  togglePlateBoundaries(true);

  // ── Basemap management ───────────────────────────────────────────────────

  let basemapSource: Awaited<ReturnType<typeof tilejson.addSource>> | undefined;
  let basemapLayer: ReturnType<typeof view.addLayer> | undefined;
  let basemapAttr: AttributionItem[] | undefined;
  let currentKey: string | undefined;

  async function setBasemap(basemap: BasemapDescriptor): Promise<void> {
    if (currentKey === basemap.key) return;
    currentKey = basemap.key;

    basemapLayer?.delete();
    basemapSource?.delete();
    if (basemapAttr) { view.attribution?.remove(basemapAttr); basemapAttr = undefined; }

    basemapSource = await tilejson.addSource({
      type: "raster-tile",
      url: basemap.url,
    });
    basemapLayer = view.addLayer({ type: "raster", source: basemapSource });
    basemapAttr = [{ attribution: `© ${basemap.label}`, attributionUrl: "https://papers.reearth.land/" }];
    view.attribution?.add(basemapAttr);
  }

  await setBasemap(BASEMAP_GRAYSCALE);

  // ── Attribution ──────────────────────────────────────────────────────────

  view.attribution?.add([
    { attribution: "© Re:Earth Terrain", attributionUrl: "https://terrain.reearth.land/" },
    { attribution: "Earthquake data: USGS", attributionUrl: "https://earthquake.usgs.gov/" },
    { attribution: "Plate Boundaries: USGS — Bird, P. (2003)", attributionUrl: "https://www.usgs.gov/" },
    { attribution: "Land data: Natural Earth", attributionUrl: "https://www.naturalearthdata.com/" },
    { attribution: "Elevation: Mapzen Terrain Tiles", attributionUrl: "https://github.com/tilezen/joerd" },
  ]);

  // ── Visual mode toggler ──────────────────────────────────────────────────

  let currentMode: VisualMode = "grayscale";

  async function toggleVisualMode(mode: VisualMode): Promise<void> {
    if (mode === currentMode) return;
    currentMode = mode;

    const isRealistic = mode === "realistic";
    const isDigital = mode === "digital";

    // Sky & atmosphere
    defaultScene.aerialPerspective.update({ visible: isRealistic });
    defaultScene.sky.update({ visible: isRealistic });

    // Digital globe points
    (digitalGlobeHandle as { visible: boolean }).visible = isDigital;

    // Terrain — hide in digital mode
    if (isDigital) {
      terrainLayer?.delete();
      terrainLayer = undefined;
    } else if (!terrainLayer) {
      terrainLayer = view.addLayer({ type: "terrain", source: terrainSource, terrain: {} });
    }

    // Basemap
    if (isDigital) {
      basemapLayer?.delete();
      basemapSource?.delete();
      if (basemapAttr) { view.attribution?.remove(basemapAttr); basemapAttr = undefined; }
      currentKey = undefined;
      view.toneMappingExposure = 3;
      ambientLightHandle.update({ ambient: { intensity: 0.3 } });
      view.globe.hideUnderground = false;
    } else if (isRealistic) {
      view.globe.hideUnderground = true;
      view.toneMappingExposure = 12;
      ambientLightHandle.update({ ambient: { intensity: 0.06 } });
      await setBasemap(BASEMAP_BLUEMARBLE);
    } else {
      view.globe.hideUnderground = false;
      view.toneMappingExposure = 6;
      ambientLightHandle.update({ ambient: { intensity: 0.4 } });
      await setBasemap(BASEMAP_GRAYSCALE);
    }
  }

  // Start in digital mode
  await toggleVisualMode("digital");

  function setBackgroundColor(hex: number): void {
    const renderer = (view as unknown as { _renderer: { setClearColor: (c: number) => void } })._renderer;
    renderer.setClearColor(hex);
  }

  return { view, tilejson, overlayPlugin, setBasemap, toggleVisualMode, togglePlateBoundaries, setBackgroundColor };
}
