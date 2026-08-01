# Digital Globe Implementation

## Overview

A point-based digital Earth rendered as glowing dots positioned at real geographic coordinates with real terrain height displacement. Built as a Navara `MeshDesc` and integrated into Earthquake Pulse's three-mode visual system (Grayscale / Realistic / Digital).

## Pipeline

```
Natural Earth land.geojson (1:110m)
        │
        ▼
generator (scripts/generate-land-points.ts)
   ├─ Point-in-polygon test (Turf.js)
   ├─ Web Mercator → tile coordinate mapping
   └─ Intra-tile bilinear elevation sampling (Mapzen terrarium tiles, zoom 4)
        │
        ▼
land_points_{sparse,medium,dense}.bin
  (quantized 8 bytes/pt: int16 x, int16 y, int16 z, uint16 height)
        │
        ▼
DigitalGlobeDescriptor (Navara MeshDesc)
   ├─ loadRawData(): decode int16/uint16 → unit-sphere XYZ + height
   ├─ createMesh(): dark sphere + lat/lng grid + THREE.Points per loaded LOD
   └─ update(): LOD switching, lazy dense load, exaggeration rebuild
```

## Point Generation

### Source Data

- **Land mask**: Natural Earth 1:110m `ne_110m_land.geojson` (127 polygon features)
- **Elevation**: Mapzen terrarium tiles at zoom 4 (16×16 tiles, 256×256px each, ～4.2M global samples)
- **Elevation decoding**: `height = R×256 + G + B/256 − 32768` meters
- **Interpolation**: intra-tile bilinear (no cross-tile blending — avoids tile-boundary seams)

### LOD Levels

| Level | Spacing | Points | Binary Size (quantized) |
|---|---|---|---|
| Sparse | 0.5° | ~48k | 0.4 MB |
| Medium | 0.2° | ~298k | 2.3 MB |
| Dense | 0.1° | ~1.19M | 9.1 MB |

### Binary Quantization

Each point is stored as **8 bytes** (down from 16 bytes for Float32×4):

| Field | Type | Encoding |
|---|---|---|
| x, y, z | int16 (little-endian) | `round(unit_component × 32767)` |
| height | uint16 | `round(height_m / 0.1)` — 0.1m resolution, max 6553m |

Decoded at runtime: `unit = q / 32767`, `height = qh × 0.1`.

### Coordinate System

Points are stored as unit-sphere XYZ (radius = 1.0) using Navara's ECEF convention:

```
x = cos(lat) × cos(lng)    → prime meridian
y = cos(lat) × sin(lng)    → 90°E
z = sin(lat)                → North Pole
```

At runtime, the descriptor scales each point along its surface normal:
```
world_pos = unit_pos × (EARTH_RADIUS + SURFACE_OFFSET + height_m × exaggeration)
```

The **exaggeration** factor is user-adjustable (1–100, default 30) via the Digital dropdown in the header.

### Height-based Coloring

Dots are colored by elevation via vertex colors (cyan → teal → emerald):

```
t = clamp(height_m / 6000, 0, 1)
r = 0
g = 0.9 − 0.12 × t
b = 1 − 0.67 × t
```

### Debug Heightmap

The generator outputs a debug PNG (`assets/debug_heightmap.png`) for visually verifying elevation sampling:

- **Size**: 2048×1024 pixels (equirectangular projection)
- **Color ramp**: midnight blue (ocean) → green → yellow → orange → red → white (high peaks)
- **Full range**: ~−10300m to ~6400m (ocean depths to mountain peaks)
- **Land points**: clamped to ≥ 0m before storing

Implementation in `scripts/generate-land-points.ts`, function `exportDebugHeightmap()`:

1. First pass: sample all pixels to find min/max elevation
2. Second pass: fill pixels with color-encoded heights
3. Output: `PNG.sync.write()` → `assets/debug_heightmap.png`

The heightmap runs between `preloadTiles()` and `generateLevel()` — after all 256 tiles are loaded but before point generation begins.

## DigitalGlobeDescriptor

**File**: `src/descriptors/DigitalGlobeDescriptor.ts`

### Scene Composition

1. **Dark sphere** (`MeshBasicMaterial`, `0x0a0a0a`) — depth occlusion + visual base
2. **Lat/lng grid lines** (every 10°, `LineBasicMaterial`, 25% opacity, `#333333`)
3. **THREE.Points per LOD level** (`PointsMaterial`, size 1px, vertex-colored, depth tested)

### LOD Switching & Deferred Loading

Evaluated every frame in `update()`:

| Camera Height | Active LOD |
|---|---|
| > 5,000 km | Sparse (~48k pts) |
| 1,000–5,000 km | Medium (~298k pts) |
| < 1,000 km | Dense (~1.19M pts) |

Only one LOD renders at a time; others are `visible = false`.

**Sparse + medium** load eagerly at startup. **Dense** is deferred — it loads lazily when the camera drops below the dense threshold (+2,000 km margin) to keep the initial load small (~2.7 MB vs ~12 MB).

### Exaggeration Control

`DigitalGlobeDescriptor.exaggeration` is a static property (1–100, default 30) adjustable from the UI. When it changes, `update()` rebuilds all LOD position buffers (vertex colors are unaffected — they depend only on raw height).

## Visual Mode Integration

The digital globe is toggled via the header `ToggleGroup`:

```
Mode selector: Grayscale / Realistic / Digital
```

| Mode | Basemap | Sky/Atmo | Terrain | Digital Globe |
|---|---|---|---|---|
| Grayscale | ✅ | ❌ | ✅ | ❌ |
| Realistic | ✅ | ✅ | ✅ | ❌ |
| Digital | ❌ | ❌ | ❌ | ✅ |

Implemented in `toggleVisualMode(mode: VisualMode)`:
- Digital: hide basemap layer, sky, atmosphere; show digital globe; remove terrain
- Grayscale: show grayscale basemap + terrain; no atmosphere
- Realistic: show BlueMarble + terrain + atmosphere

## File Structure

```
project/
├── assets/land.geojson                          # Natural Earth land polygons
├── assets/debug_heightmap.png                    # Debug elevation heatmap (generated)
├── public/
│   ├── land_points_sparse.bin                   # 0.4 MB (quantized)
│   ├── land_points_medium.bin                   # 2.3 MB (quantized)
│   └── land_points_dense.bin                    # 9.1 MB (quantized)
├── scripts/generate-land-points.ts              # Offline point generator
├── src/
│   ├── descriptors/DigitalGlobeDescriptor.ts    # Navara MeshDesc
│   └── modules/viewSetup.ts                     # Registration + toggle
└── docs/navara-coordinates.md                   # ECEF coordinate reference
```

## Usage

### Regenerate Binaries

```bash
pnpm generate:land
```

Downloads 256 Mapzen elevation tiles, runs point-in-polygon tests, and writes quantized binaries to `public/`. Takes 2–5 minutes depending on network.

### Modify LOD Spacing

Edit `LOD_LEVELS` in `scripts/generate-land-points.ts`:

```ts
const LOD_LEVELS = [
  { spacing: 0.5, name: "sparse" },
  { spacing: 0.2, name: "medium" },
  { spacing: 0.1, name: "dense" },
];
```

### Adjust Terrain Exaggeration

`SURFACE_OFFSET` (base offset) and the exaggeration multiplier live in `src/descriptors/DigitalGlobeDescriptor.ts`:

```ts
const SURFACE_OFFSET = 0;  // meters above sphere
const r = EARTH_RADIUS + SURFACE_OFFSET + data.heights[i] * exaggeration;  // exaggeration: 1–100
```

Users adjust exaggeration via the Digital dropdown slider in the header.

### Change Colors

Edit constants in `DigitalGlobeDescriptor.ts`:

```ts
const DARK_GLOBE = 0x0a0a0a;  // base sphere color
const GRID_COLOR = 0x333333;  // lat/lng grid lines
// Dot colors are height-based — edit heightColor() for the gradient
```

## Known Limitations

1. **Elevation resolution**: Zoom 4 tiles give ~20km/pixel at equator. Max sampled height ~5150m (highest peaks are smoothed).
2. **Coastal points**: Point-in-polygon includes some small coastal lakes/bays; their height may be incorrectly sampled from adjacent ocean pixels (clamped to 0).
3. **Tone mapping**: Navara's ACES tone mapping affects all materials. The globe may appear slightly grey even when set to pure white.
4. **No polar coverage**: Mapzen terrarium tiles clip at ~85.05° latitude (Web Mercator limit). Points near poles use edge values.
