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
import { loadEarthquakeData, setTimeRange, getVisibleEarthquakes } from "./modules/earthquakeData";
import {
  initOverlayContainer,
  setupOverlayUpdater,
  updateEarthquakeVisualization,
  setupOverlayClickHandler,
  highlightOverlay,
} from "./modules/earthquakeVisualization";
import { setupWaveAnimation } from "./modules/waveSetup";
import "./i18n";
import "./index.css";

// ── Bootstrap ────────────────────────────────────────────────────────────────

const { view, overlayPlugin, toggleVisualMode, togglePlateBoundaries, setBackgroundColor } = await setupView();

const earthquakes = await loadEarthquakeData();
const HOURS_24 = 86400000;
const sortedByTime = [...earthquakes].sort((a, b) => b.time.getTime() - a.time.getTime());
if (sortedByTime.length > 0) {
  const times = earthquakes.map((eq) => eq.time.getTime());
  const maxTime = Math.max(...times);
  const minTime = Math.min(...times);
  const defaultStart = Math.max(minTime, maxTime - HOURS_24);
  setTimeRange(defaultStart, maxTime);
  view.atmosphere.date = new Date(sortedByTime[0].time);
}

// ── Overlay & visualization ──────────────────────────────────────────────────

const mapContainer = document.getElementById("map-container")!;
const overlayContainer = initOverlayContainer(mapContainer);
setupOverlayUpdater(overlayPlugin, view);
setupOverlayClickHandler(overlayContainer, (eqId) => {
  const eq = earthquakes.find((e) => e.id === eqId);
  if (eq) selectEarthquake(eq);
});

// ── Seismic wave animation ──────────────────────────────────────────────────

setupWaveAnimation(view, () => earthquakes);

// ── Initial render ───────────────────────────────────────────────────────────

let visible = getVisibleEarthquakes(earthquakes);
updateEarthquakeVisualization(view, overlayPlugin, overlayContainer, visible);

// ── React UI mount ───────────────────────────────────────────────────────────

const rootElement = document.createElement("div");
rootElement.id = "ui-root";
document.body.appendChild(rootElement);
const root = createRoot(rootElement);

let currentVisibleEarthquakes = visible;
let showPlates = true;
let selectedEq: Earthquake | null = null;

function selectEarthquake(eq: Earthquake | null): void {
  selectedEq = eq;
  highlightOverlay(eq?.id ?? null);
  renderApp();
}
let currentTheme: "dark" | "light" = "dark";

function updateTheme(): void {
  setBackgroundColor(currentTheme === "light" ? 0xffffff : 0x000000);
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
    { lng: earthquake.longitude, lat: earthquake.latitude, height: earthquake.depth + 500_000 },
    1000,
  );
}

function handleToggleVisualMode(realistic: boolean): void {
  toggleVisualMode(realistic);
}

// ── Render ───────────────────────────────────────────────────────────────────

renderApp();

// ── Remove loading screen ────────────────────────────────────────────────────

const loading = document.getElementById("loading-screen");
if (loading) {
  loading.style.transition = "opacity 0.4s";
  loading.style.opacity = "0";
  setTimeout(() => loading.remove(), 500);
}

// ── Auto-select most recent earthquake ────────────────────────────────────────

const latest = [...earthquakes].sort((a, b) => b.time.getTime() - a.time.getTime())[0];
if (latest) {
  selectEarthquake(latest);
  view.flyTo(
    { lng: latest.longitude, lat: latest.latitude, height: latest.depth + 500_000 },
    1000,
  );
}


