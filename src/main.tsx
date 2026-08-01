/**
 * main.tsx — Earthquake Pulse Showcase entry point
 *
 * Orchestrates view setup, data loading, visualization, and React UI mount.
 * Business logic is delegated to modules under `src/modules/`.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { Earthquake } from "./types/earthquake";
import { App } from "./App";
import { setupView } from "./modules/viewSetup";
import type { VisualMode } from "./modules/viewSetup";
import { loadEarthquakeData, setTimeRange, getVisibleEarthquakes } from "./modules/earthquakeData";
import {
  initOverlayContainer,
  setupOverlayUpdater,
  updateEarthquakeVisualization,
  setupOverlayClickHandler,
  highlightOverlay,
} from "./modules/earthquakeVisualization";
import { setupWaveAnimation } from "./modules/waveSetup";
import { DigitalGlobeDescriptor } from "./descriptors/DigitalGlobeDescriptor";
import "./i18n";
import "./index.css";

// ── Loading progress ─────────────────────────────────────────────────────────

const isJa = typeof localStorage !== "undefined" && localStorage.getItem("lang") === "ja";

const progressLabels: Record<string, [string, string]> = {
  init: ["Initializing 3D engine…", "3Dエンジンを初期化中…"],
  data: ["Fetching earthquake data…", "地震データを取得中…"],
  viz: ["Setting up visualization…", "可視化を設定中…"],
  terrain: ["Loading terrain data…", "地形データを読み込み中…"],
  ui: ["Preparing UI…", "UIを準備中…"],
  render: ["Rendering…", "レンダリング中…"],
  ready: ["Ready", "準備完了"],
};

function setLoadingProgress(pct: number, key: string): void {
  const bar = document.getElementById("loading-progress");
  const label = document.getElementById("loading-text");
  if (bar) bar.style.width = `${pct}%`;
  if (label) label.textContent = progressLabels[key]?.[isJa ? 1 : 0] ?? "";
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

setLoadingProgress(5, "init");

// Parse exaggeration from URL early (used by DigitalGlobeDescriptor during setup)
try {
  const exg = new URLSearchParams(window.location.hash.slice(1)).get("exg");
  if (exg) DigitalGlobeDescriptor.exaggeration = parseFloat(exg);
} catch { /* ignore */ }

const { view, overlayPlugin, toggleVisualMode, togglePlateBoundaries, setBackgroundColor } = await setupView();

setLoadingProgress(15, "data");

const HOURS_24 = 86400000;
const HOURS_1 = 3600000;

function getDefaultWindow(min: number, max: number): number {
  return (max - min) <= HOURS_24 * 2 ? HOURS_1 : HOURS_24;
}
let earthquakes: Earthquake[];
let dataMinTime = 0;
let dataMaxTime = 0;
let dataLoading = false;
let overlayContainer: HTMLElement;
let currentVisibleEarthquakes: Earthquake[] = [];
let selectedEq: Earthquake | null = null;

// ── Initial data load ────────────────────────────────────────────────────────

let loadStartTime: number | undefined;
let loadEndTime: number | undefined;
let sharedMinTime: number | undefined;
let sharedMaxTime: number | undefined;

if (window.location.hash) {
  try {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const dmin = params.get("dmin");
    const dmax = params.get("dmax");
    const hasRange = params.has("range");
    if (dmin && dmax) {
      loadStartTime = parseInt(dmin, 10);
      loadEndTime = parseInt(dmax, 10);
      if (!hasRange) {
        sharedMinTime = loadStartTime;
        sharedMaxTime = loadEndTime;
      }
    }
  } catch { /* ignore */ }
}

earthquakes = await loadEarthquakeData(loadStartTime, loadEndTime);

setLoadingProgress(45, "viz");
{
  const times = earthquakes.map((eq) => eq.time.getTime());
  dataMinTime = times.length ? Math.min(...times) : 0;
  dataMaxTime = times.length ? Math.max(...times) : 0;
}
const sortedByTime = [...earthquakes].sort((a, b) => b.time.getTime() - a.time.getTime());

function getCameraState() {
  try {
    const pos = view.camera.positionGeographic as Record<string, number> | null;
    const ori = view.camera.orientation as Record<string, number> | null;
    if (!pos) return null;
    return {
      lng: pos.lng ?? 0,
      lat: pos.lat ?? 0,
      height: pos.height ?? 0,
      heading: ori?.heading ?? 0,
      pitch: ori?.pitch ?? 0,
      roll: ori?.roll ?? 0,
    };
  } catch {
    return null;
  }
}

// ── Parse shared state from URL hash ─────────────────────────────────────────

let initialRangeStart: number | null = null;
let initialRangeEnd: number | null = null;
let showPlates = true;
let initialVisualMode: VisualMode = "digital";
let initialSelectedEqId: string | null = null;

if (window.location.hash) {
  try {
    const params = new URLSearchParams(window.location.hash.slice(1));

    if (params.get("pl") === "0") {
      showPlates = false;
      togglePlateBoundaries(false);
    }

    if (params.get("rl") === "1") {
      initialVisualMode = "realistic";
      toggleVisualMode("realistic");
    }
    if (params.get("dm") === "1") {
      initialVisualMode = "digital";
      toggleVisualMode("digital");
    }

    const rs = params.get("rs");
    const re = params.get("re");
    if (rs && re) {
      initialRangeStart = parseInt(rs, 10);
      initialRangeEnd = parseInt(re, 10);
    }

    if (params.has("eq")) {
      initialSelectedEqId = params.get("eq");
    }
  } catch { /* ignore bad hash */ }
}

// Apply hash camera via setCamera (no animation) if present
let hasHashCamera = false;
if (window.location.hash) {
  try {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const camLng = params.get("lng");
    const camLat = params.get("lat");
    const camH = params.get("h");
    if (camLng && camLat && camH) {
      hasHashCamera = true;
      view.setCamera({
        lng: parseFloat(camLng),
        lat: parseFloat(camLat),
        height: parseFloat(camH),
        heading: params.get("hd") ? parseFloat(params.get("hd")!) : 0,
        pitch: params.get("p") ? parseFloat(params.get("p")!) : -30,
        roll: params.get("r") ? parseFloat(params.get("r")!) : 0,
      });
    }
  } catch { /* ignore */ }
}

if (sortedByTime.length > 0) {
  const defaultStart = initialRangeStart ?? Math.max(dataMinTime, dataMaxTime - getDefaultWindow(dataMinTime, dataMaxTime));
  const defaultEnd = initialRangeEnd ?? dataMaxTime;
  setTimeRange(defaultStart, defaultEnd);
  view.atmosphere.date = new Date(sortedByTime[0].time);
}

// ── Overlay & visualization ──────────────────────────────────────────────────

const mapContainer = document.getElementById("map-container")!;
overlayContainer = initOverlayContainer(mapContainer);
setupOverlayUpdater(overlayPlugin, view);
setupOverlayClickHandler(overlayContainer, (eqId) => {
  const eq = earthquakes.find((e) => e.id === eqId);
  if (eq) selectEarthquake(eq);
});

// ── Seismic wave animation ──────────────────────────────────────────────────

setupWaveAnimation(view, () => earthquakes);

setLoadingProgress(70, "ui");

// ── Initial render ───────────────────────────────────────────────────────────

const visible = getVisibleEarthquakes(earthquakes);
currentVisibleEarthquakes = visible;
updateEarthquakeVisualization(view, overlayPlugin, overlayContainer, visible);

// ── React UI mount ───────────────────────────────────────────────────────────

const rootElement = document.createElement("div");
rootElement.id = "ui-root";
document.body.appendChild(rootElement);
const root = createRoot(rootElement);

function selectEarthquake(eq: Earthquake | null): void {
  selectedEq = eq;
  highlightOverlay(eq?.id ?? null);
  renderApp();
}
let currentTheme: "dark" | "light" = "dark";

function updateTheme(): void {
  setBackgroundColor(currentTheme === "light" ? 0xffffff : 0x000000);
}

// ── Dynamic data reload ──────────────────────────────────────────────────────

async function reloadData(startTime?: number, endTime?: number): Promise<void> {
  dataLoading = true;
  renderApp();

  try {
    earthquakes = await loadEarthquakeData(startTime, endTime);
  } catch {
    // keep existing data on error
  }

  const times = earthquakes.map((eq) => eq.time.getTime());
  dataMinTime = times.length ? Math.min(...times) : 0;
  dataMaxTime = times.length ? Math.max(...times) : 0;

  const sorted = [...earthquakes].sort((a, b) => b.time.getTime() - a.time.getTime());
  if (sorted.length > 0) {
    const defaultStart = Math.max(dataMinTime, dataMaxTime - getDefaultWindow(dataMinTime, dataMaxTime));
    setTimeRange(defaultStart, dataMaxTime);
    view.atmosphere.date = new Date(sorted[0].time);
  }

  selectedEq = null;
  highlightOverlay(null);
  const newVisible = getVisibleEarthquakes(earthquakes);
  currentVisibleEarthquakes = newVisible;
  updateEarthquakeVisualization(view, overlayPlugin, overlayContainer, newVisible);

  dataLoading = false;
  renderApp();
}

// ── Map pick events → select earthquake ───────────────────────────────────────

view.on("pick", (picked: { properties?: Record<string, unknown>; layerId?: string } | null | undefined) => {
  if (picked?.properties?.id) {
    const eq = earthquakes.find((e) => e.id === picked.properties!.id);
    if (eq) selectEarthquake(eq);
  } else {
    if (selectedEq) selectEarthquake(null);
  }
});

function renderApp(): void {
  root.render(
    <StrictMode>
      <App
        allEarthquakes={earthquakes}
        visibleEarthquakes={currentVisibleEarthquakes}
        onTimeChange={handleTimeChange}
        onEarthquakeClick={handleEarthquakeClick}
        onToggleVisualMode={handleToggleVisualMode}
        showPlates={showPlates}
        onTogglePlates={(v) => { showPlates = v; togglePlateBoundaries(v); renderApp(); }}
        onThemeChange={(dark) => { currentTheme = dark ? "dark" : "light"; updateTheme(); }}
        selectedEarthquake={selectedEq}
        onSelectEarthquake={(eq) => selectEarthquake(eq)}
        onDeselectEarthquake={() => selectEarthquake(null)}
        dataMinTime={dataMinTime}
        dataMaxTime={dataMaxTime}
        getCameraState={getCameraState}
        initialVisualMode={initialVisualMode}
        dataLoading={dataLoading}
        onReloadData={reloadData}
        sharedMinTime={sharedMinTime}
        sharedMaxTime={sharedMaxTime}
      />
    </StrictMode>,
  );
}

// ── Handlers ─────────────────────────────────────────────────────────────────

function handleTimeChange(currentTime: Date, rangeStart: Date, rangeEnd: Date): void {
  setTimeRange(rangeStart.getTime(), rangeEnd.getTime());
  view.atmosphere.date = new Date(currentTime);
  const visible = getVisibleEarthquakes(earthquakes);
  currentVisibleEarthquakes = visible;
  updateEarthquakeVisualization(view, overlayPlugin, overlayContainer, visible);
  renderApp();
}

function handleEarthquakeClick(earthquake: Earthquake): void {
  selectEarthquake(earthquake);
  view.flyTo(
    { lng: earthquake.longitude, lat: earthquake.latitude, height: earthquake.depth + 500_000, roll: 0 },
    1000,
  );
}

function handleToggleVisualMode(mode: VisualMode): void {
  toggleVisualMode(mode);
}

// ── Render ───────────────────────────────────────────────────────────────────

setLoadingProgress(90, "render");
renderApp();

// ── Remove loading screen ────────────────────────────────────────────────────

setLoadingProgress(100, "ready");
const loading = document.getElementById("loading-screen");
if (loading) {
  loading.style.transition = "opacity 0.4s";
  loading.style.opacity = "0";
  setTimeout(() => loading.remove(), 500);
}

// ── Auto-select earthquake ─────────────────────────────────────────────────────

if (initialSelectedEqId) {
  const eq = earthquakes.find((e) => e.id === initialSelectedEqId);
  if (eq) selectEarthquake(eq);
} else if (!hasHashCamera) {
  const latest = [...earthquakes].sort((a, b) => b.time.getTime() - a.time.getTime())[0];
  if (latest) {
    selectEarthquake(latest);
    view.flyTo(
      { lng: latest.longitude, lat: latest.latitude, height: latest.depth + 500_000, roll: 0 },
      1000,
    );
  }
}


