# Digital Globe Implementation

## Overview

A point-based digital Earth rendered as ~4.76M glowing dots positioned at real geographic coordinates with real terrain height displacement. Built as a Navara `MeshDesc` and integrated into Earthquake Pulse's three-mode visual system.

## Pipeline

```
Natural Earth land.geojson (1:110m)
        │
        ▼
generator (scripts/generate-land-points.ts)
   ├─ Point-in-polygon test (Turf.js)
   ├─ Web Mercator → tile coordinate mapping
   └─ Bilinear elevation sampling (Mapzen terrarium tiles, zoom 4)
        │
        ▼
land_points_{sparse,medium,dense}.bin (4 floats: x y z height_m)
        │
        ▼
DigitalGlobeDescriptor (Navara MeshDesc)
   ├─ loadPositions(): scale unit-sphere XYZ by (R + offset + height×100) along normal
   ├─ createMesh(): dark sphere + lat/lng grid lines + THREE.Points per LOD
   └─ update(): LOD switching by camera height, theme-aware color
```

## Point Generation

### Source Data

- **Land mask**: Natural Earth 1:110m `ne_110m_land.geojson` (127 polygon features)
- **Elevation**: Mapzen terrarium tiles at zoom 4 (16×16 tiles, 256×256px each, ～4.2M global samples)
- **Elevation decoding**: `height = R×256 + G + B/256 − 32768` meters
- **Bilinear interpolation**: correct pixel offset per neighbor tile at boundaries

### LOD Levels

| Level | Spacing | Points | Binary Size |
|---|---|---|---|
| Sparse | 0.5° | ~48k | 0.7 MB |
| Medium | 0.2° | ~298k | 4.5 MB |
| Dense | 0.1° | ~1.19M | 18.2 MB |

### Coordinate System

Points are stored as unit-sphere XYZ (radius = 1.0) using Navara's ECEF convention:

```
x = cos(lat) × cos(lng)    → prime meridian
y = cos(lat) × sin(lng)    → 90°E
z = sin(lat)                → North Pole
```

Each point also stores a `height_m` field sampled from the Mapzen elevation tiles.

At runtime, the descriptor scales each point along its surface normal:
```
world_pos = unit_pos × (EARTH_RADIUS + SURFACE_OFFSET + height_m × 100)
```

The `×100` exaggeration factor makes terrain variation visually apparent.

### Debug Heightmap

The generator outputs a debug PNG (`assets/debug_heightmap.png`) for visually verifying elevation sampling:

- **Size**: 2048×1024 pixels (equirectangular projection)
- **Color ramp**: midnight blue (ocean) → green → yellow → orange → red → white (high peaks)
- **Full range**: ~−8800m to ~5100m (ocean depths to mountain peaks)
- **Land points**: clamped to ≥ 0m before storing

Implementation in `scripts/generate-land-points.ts`, function `exportDebugHeightmap()`:

1. First pass: sample all pixels to find min/max elevation
2. Second pass: fill pixels with color-encoded heights
3. Output: `PNG.sync.write()` → `assets/debug_heightmap.png`

The heightmap runs between `preloadTiles()` and `generateLevel()` — after all 256 tiles are loaded but before point generation begins.

## DigitalGlobeDescriptor

**File**: `src/descriptors/DigitalGlobeDescriptor.ts`

### Scene Composition

1. **Dark sphere** (`MeshBasicMaterial`, `toneMapped: false`) — depth occlusion + visual base
2. **Lat/lng grid lines** (every 10°, `LineBasicMaterial`, 25% opacity, `#333333`)
3. **THREE.Points per LOD level** (`PointsMaterial`, size 5px, depth tested)

### LOD Switching

Evaluated every frame in `update()`:

| Camera Height | Active LOD |
|---|---|
| > 5,000 km | Sparse (~48k pts) |
| 1,000–5,000 km | Medium (~298k pts) |
| < 1,000 km | Dense (~1.19M pts) |

Only one LOD renders at a time; others are `visible = false`.

### Theme Adaptation

| Theme | Globe Color | Point Color |
|---|---|---|
| Dark | `#0a0a0a` | `#57c8ff` (cyan) |
| Light | `#0a0a0a` | `#aaaaaa` (light grey) |

The globe stays dark in both themes for depth occlusion. Only dots change.

## Visual Mode Integration

The digital globe is toggleable via `viewSetup.ts`:

```
Mode selector: Grayscale / Realistic / Digital
```

| Mode | Basemap | Sky/Atmo | Terrain | Digital Globe |
|---|---|---|---|
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
│   ├── land_points_sparse.bin                   # 0.7 MB
│   ├── land_points_medium.bin                   # 4.5 MB
│   └── land_points_dense.bin                    # 18.2 MB
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

Downloads 256 Mapzen elevation tiles, runs point-in-polygon tests, and writes binaries to `public/`. Takes 2–5 minutes depending on network.

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

Edit `SURFACE_OFFSET` and the height multiplier in `src/descriptors/DigitalGlobeDescriptor.ts`:

```ts
const SURFACE_OFFSET = 500;  // base offset above sphere
const r = EARTH_RADIUS + SURFACE_OFFSET + h * 100;  // ×100 exaggeration
```

### Change Colors

Edit constants in `DigitalGlobeDescriptor.ts`:

```ts
const DARK_GLOBE = 0x0a0a0a;
const DARK_POINTS = 0x57c8ff;
const LIGHT_POINTS = 0xaaaaaa;
```

## Known Limitations

1. **Elevation resolution**: Zoom 4 tiles give ~20km/pixel at equator. Max sampled height ~5150m (highest peaks are smoothed).
2. **Coastal points**: Point-in-polygon includes some small coastal lakes/bays; their height may be incorrectly sampled from adjacent ocean pixels (clamped to 0).
3. **Tone mapping**: Navara's ACES tone mapping affects all materials. The globe appears slightly grey even when set to pure white.
4. **No polar coverage**: Mapzen terrarium tiles clip at ~85.05° latitude (Web Mercator limit). Points near poles use edge values.
