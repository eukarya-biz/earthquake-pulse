/**
 * Generates binary point clouds for the digital globe LOD levels.
 *
 * Reads Natural Earth 1:110m land polygons, tests uniform lat/lng grids,
 * samples real terrain heights from Mapzen terrarium elevation tiles,
 * and writes unit-sphere XYZ + height (4 floats per point).
 *
 * Usage: pnpm generate:land
 */

import fs from "node:fs";
import path from "node:path";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import { PNG } from "pngjs";

const LOD_LEVELS = [
  { spacing: 0.5, name: "sparse" },
  { spacing: 0.2, name: "medium" },
  { spacing: 0.1, name: "dense" },
] as const;

const ZOOM = 4; // 16×16 tiles, 4.2M global samples
const TILE_COUNT = 1 << ZOOM;
const RADIUS = 1.0;

// ── Elevation tile cache ─────────────────────────────────────────────────────

interface ElevationTile {
  data: Float64Array; // 256×256 elevation values in meters
}
const tileCache = new Map<string, ElevationTile>();

function terrariumToHeight(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

async function fetchTile(x: number, y: number): Promise<ElevationTile> {
  const key = `${ZOOM}/${x}/${y}`;
  if (tileCache.has(key)) return tileCache.get(key)!;

  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${x}/${y}.png`;
  const res = await fetch(url);
  if (!res.ok) {
    // Ocean tiles return 404 — return tile of all 0 elevation
    const data = new Float64Array(256 * 256);
    const tile: ElevationTile = { data };
    tileCache.set(key, tile);
    return tile;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const png = PNG.sync.read(buf);
  const data = new Float64Array(256 * 256);
  for (let i = 0; i < 256 * 256; i++) {
    data[i] = terrariumToHeight(png.data[i * 4], png.data[i * 4 + 1], png.data[i * 4 + 2]);
  }

  const tile: ElevationTile = { data };
  tileCache.set(key, tile);
  return tile;
}

async function preloadTiles(): Promise<void> {
  const tasks: Promise<void>[] = [];
  let loaded = 0;
  const total = TILE_COUNT * TILE_COUNT;

  for (let x = 0; x < TILE_COUNT; x++) {
    for (let y = 0; y < TILE_COUNT; y++) {
      tasks.push(
        fetchTile(x, y).then(() => {
          loaded++;
          if (loaded % 32 === 0) process.stdout.write(`\r  Tiles: ${loaded}/${total}`);
        })
      );
    }
  }
  await Promise.all(tasks);
  console.log(`\r  Tiles: ${loaded}/${total} loaded`);
}

function latToMercatorY(lat: number): number {
  const latRad = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
}

function sampleElevation(lat: number, lng: number): number {
  const n = Math.pow(2, ZOOM);
  const tx = ((lng + 180) / 360) * n;
  const ty = Math.max(0, Math.min(1, latToMercatorY(lat))) * n;

  const ix = Math.floor(tx);
  const iy = Math.floor(ty);
  const fx = tx - ix;
  const fy = ty - iy;

  // Intra-tile bilinear interpolation (no cross-tile blending)
  const px = fx * 255; // 0..255 pixel coordinate within tile
  const py = fy * 255;

  const pxi = Math.floor(px);
  const pyi = Math.floor(py);
  const dx = px - pxi;
  const dy = py - pyi;

  let cxi = ix;
  while (cxi < 0) cxi += n;
  while (cxi >= n) cxi -= n;
  if (iy < 0 || iy >= n) return 0;

  const key = `${ZOOM}/${cxi}/${iy}`;
  const tile = tileCache.get(key);
  if (!tile) return 0;

  // 4 surrounding pixels, clamped to tile edges
  const x0 = Math.min(255, Math.max(0, pxi));
  const x1 = Math.min(255, Math.max(0, pxi + 1));
  const y0 = Math.min(255, Math.max(0, pyi));
  const y1 = Math.min(255, Math.max(0, pyi + 1));

  const h00 = tile.data[y0 * 256 + x0];
  const h10 = tile.data[y0 * 256 + x1];
  const h01 = tile.data[y1 * 256 + x0];
  const h11 = tile.data[y1 * 256 + x1];

  // Bilinear interpolation
  const h0 = h00 + (h10 - h00) * dx;
  const h1 = h01 + (h11 - h01) * dx;
  return h0 + (h1 - h0) * dy;
}

// ── Land mask ────────────────────────────────────────────────────────────────

interface LandData {
  type: "FeatureCollection";
  features: Feature<Polygon | MultiPolygon>[];
}

function loadLand(): LandData {
  const filePath = path.resolve(import.meta.dirname!, "../assets/land.geojson");
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as LandData;
}

function isLand(lat: number, lng: number, features: LandData["features"]): boolean {
  const pt = point([lng, lat]);
  for (const feature of features) {
    if (booleanPointInPolygon(pt, feature)) return true;
  }
  return false;
}

function latLngToUnitSphere(lat: number, lng: number): [number, number, number] {
  const phi = (lat * Math.PI) / 180;
  const theta = (lng * Math.PI) / 180;
  // Navara ECEF: +X = prime meridian, +Y = 90°E, +Z = North Pole
  const x = RADIUS * Math.cos(phi) * Math.cos(theta);
  const y = RADIUS * Math.cos(phi) * Math.sin(theta);
  const z = RADIUS * Math.sin(phi);
  return [x, y, z];
}

function generateLevel(spacing: number, name: string, features: LandData["features"]): void {
  const coords: number[] = [];
  let tested = 0;
  let landCount = 0;
  let minH = Infinity, maxH = -Infinity;

  for (let lat = -90; lat <= 90; lat += spacing) {
    const step = spacing / Math.cos((lat * Math.PI) / 180 + 1e-9);
    const actualStep = Math.max(step, spacing);

    for (let lng = -180; lng < 180; lng += actualStep) {
      tested++;
      if (isLand(lat + spacing / 2, lng + actualStep / 2, features)) {
        const [x, y, z] = latLngToUnitSphere(lat, lng);
        const h = Math.max(0, sampleElevation(lat, lng));
        coords.push(x, y, z, h);
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
        landCount++;
      }
    }
  }

  // Quantized layout per point (8 bytes):
  //   int16 x (unit -1..1), int16 y, int16 z, uint16 height (0.1m resolution)
  const buf = Buffer.alloc(landCount * 8);
  for (let i = 0; i < landCount; i++) {
    const base = i * 4;
    const qx = Math.round(coords[base] * 32767);
    const qy = Math.round(coords[base + 1] * 32767);
    const qz = Math.round(coords[base + 2] * 32767);
    const qh = Math.round(coords[base + 3] / 0.1);
    buf.writeInt16LE(qx, i * 8);
    buf.writeInt16LE(qy, i * 8 + 2);
    buf.writeInt16LE(qz, i * 8 + 4);
    buf.writeUInt16LE(qh, i * 8 + 6);
  }

  const outPath = path.resolve(import.meta.dirname!, `../public/land_points_${name}.bin`);
  fs.writeFileSync(outPath, buf);
  const sizeMB = (buf.byteLength / 1024 / 1024).toFixed(1);
  console.log(`[${name}] ${spacing}° → ${landCount.toLocaleString()} pts · ${sizeMB} MB · height ${minH.toFixed(0)}–${maxH.toFixed(0)}m`);
}

function heightToColor(h: number, minH: number, maxH: number): [number, number, number] {
  if (h <= 0) return [25, 25, 112]; // midnight blue for ocean
  const t = Math.min(1, Math.max(0, (h - minH) / (maxH - minH || 1)));
  // Green (low) → Yellow → Orange → Red → White (high)
  if (t < 0.25) {
    const s = t / 0.25;
    return [Math.round(34 + (255 - 34) * s), Math.round(139 + (255 - 139) * s), 34];
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    return [255, Math.round(255 - (255 - 165) * s), 0];
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    return [255, Math.round(165 - 165 * s), 0];
  } else {
    const s = (t - 0.75) / 0.25;
    return [255, Math.round(255 * s), Math.round(255 * s)];
  }
}

function exportDebugHeightmap(): void {
  const W = 2048;
  const H = 1024;
  const buf = Buffer.alloc(W * H * 4);

  let minH = Infinity, maxH = -Infinity;
  // First pass: find min/max
  for (let py = 0; py < H; py++) {
    const lat = 90 - (py / (H - 1)) * 180;
    for (let px = 0; px < W; px++) {
      const lng = (px / (W - 1)) * 360 - 180;
      const h = sampleElevation(lat, lng);
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
  }

  // Second pass: fill pixels
  for (let py = 0; py < H; py++) {
    const lat = 90 - (py / (H - 1)) * 180;
    for (let px = 0; px < W; px++) {
      const lng = (px / (W - 1)) * 360 - 180;
      const h = sampleElevation(lat, lng);
      const [r, g, b] = heightToColor(h, minH, maxH);
      const idx = (py * W + px) * 4;
      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = 255;
    }
  }

  const png = PNG.sync.write({ width: W, height: H, data: buf as any } as any, { colorType: 6 });
  const outPath = path.resolve(import.meta.dirname!, "../assets/debug_heightmap.png");
  fs.writeFileSync(outPath, png);
  console.log(`  Wrote ${W}×${H} heightmap to assets/debug_heightmap.png (range ${minH.toFixed(0)}–${maxH.toFixed(0)}m)`);
}

async function generate(): Promise<void> {
  const land = loadLand();
  const features = land.features;
  console.log(`Loaded ${features.length} land feature(s)\n`);

  console.log(`Loading elevation tiles (zoom ${ZOOM}, ${TILE_COUNT * TILE_COUNT} tiles)...`);
  await preloadTiles();
  console.log("");

  // Debug: export heightmap PNG
  console.log("Exporting debug heightmap...");
  exportDebugHeightmap();
  console.log("");

  for (const level of LOD_LEVELS) {
    generateLevel(level.spacing, level.name, features);
  }
}

generate().catch((e) => { console.error(e); process.exit(1); });
