# Navara Coordinate System Guide

## ECEF Axis Convention

Navara uses the **standard WGS84 ECEF right-handed coordinate system**, mapped 1:1 to Three.js world axes:

| Axis | Real-world location | Formula |
|---|---|---|
| **+X** | Prime meridian (0° lon), Equator (0° lat) | `R × cos(lat) × cos(lng)` |
| **+Y** | 90°E longitude, Equator | `R × cos(lat) × sin(lng)` |
| **+Z** | North Pole (90°N) | `R × (1 − e²) × sin(lat)` ≈ `R × sin(lat)` |

For a perfect-sphere approximation (which is close enough for visual point/sphere placement), use `R = 6_378_137` (WGS84 semi-major axis) and omit the eccentricity term:

```ts
const EARTH_RADIUS = 6378137;

function toECEF(latDeg: number, lngDeg: number, heightM: number = 0): [number, number, number] {
  const lat = (latDeg * Math.PI) / 180;
  const lng = (lngDeg * Math.PI) / 180;
  const r = EARTH_RADIUS + heightM;
  const x = r * Math.cos(lat) * Math.cos(lng);  // prime meridian
  const y = r * Math.cos(lat) * Math.sin(lng);  // 90°E
  const z = r * Math.sin(lat);                   // North Pole
  return [x, y, z];
}
```

The exact WGS84 ellipsoid conversion is available via Navara's public API:

```ts
import { geodeticToVector3, degreeToRadian } from "@navaramap/three";

const pos = geodeticToVector3({
  lat: degreeToRadian(latDeg),
  lng: degreeToRadian(lngDeg),
  height: heightM,
});
// pos.x, pos.y, pos.z are ECEF meters
```

## Common Mistakes

### Mistake 1: Y = North Pole

Many 3D frameworks use Y-up. In Navara, **Z is the polar axis** (North Pole), not Y. 
Swapping Y↔Z will rotate the globe 90°, putting continents on the wrong faces.

```ts
// WRONG
const y = r * Math.sin(lat);   // This would put North Pole on Y axis
const z = r * Math.cos(lat) * Math.sin(lng);

// CORRECT (Navara ECEF)
const y = r * Math.cos(lat) * Math.sin(lng);  // 90°E on Y
const z = r * Math.sin(lat);                   // North Pole on Z
```

### Mistake 2: X/Z swap

Some renderers define the prime meridian on the Z axis. Navara uses the standard convention:
**+X = prime meridian**. Don't swap X and Z.

### Mistake 3: Degrees vs Radians

- `geodeticToVector3` expects **radians** (use `degreeToRadian()`)
- GLSL shaders convert degrees to radians with `DEG_TO_RAD` before calling `lonLatToEllipsoid()`
- Custom math: always convert to radians before `sin`/`cos`

### Mistake 4: Longitude sign / range

Navara uses longitude `-180°` to `+180°` (east-positive). GeoJSON uses the same convention.
Internally `0°` to `360°` works equivalently since `sin`/`cos` are periodic.

## Mesh Placement

### ECEF placement (default)

Mesh descriptors place objects in ECEF world space by default. No tangent frame or automatic rotation is applied.

```ts
// Object at Tokyo in ECEF — identity rotation, no alignment to surface normal
view.addMesh({
  box: { width: 100, height: 100, depth: 100 },
  position: geodeticToVector3({ lat: degToRad(35.68), lng: degToRad(139.77), height: 500 }),
});
```

### Tangent-frame placement (upright at surface)

For objects that should stand upright at a geographic location, use a tangent-frame matrix:

```ts
import { eastNorthUpToFixedFrame, geodeticToVector3, degreeToRadian } from "@navaramap/three";

const origin = geodeticToVector3({
  lat: degreeToRadian(35.68),
  lng: degreeToRadian(139.77),
  height: 0,
});
const frame = eastNorthUpToFixedFrame(origin);

view.addMesh({
  box: { width: 100, height: 200, depth: 100 },
  matrixWorld: frame,
  position: { x: 0, y: 0, z: 100 },  // 100m above surface, upright (Z=up in ENU)
});
```

Available frames:

| Function | X axis | Y axis | Z axis |
|---|---|---|---|
| `eastNorthUpToFixedFrame` | East | North | Up (normal) |
| `northEastDownToFixedFrame` | North | East | Down |
| `northUpEastToFixedFrame` | North | Up (normal) | East |
| `northWestUpToFixedFrame` | North | West | Up (normal) |

## GLSL Shader Reference

Navara's shader-side conversion (for custom shaders):

```glsl
#define WGS84_A 6378137.0
#define WGS84_E2 0.00669438
#define DEG_TO_RAD 0.017453292519943295

vec3 lonLatToEllipsoid(float lon, float lat) {
  float lonR = lon * DEG_TO_RAD;
  float latR = lat * DEG_TO_RAD;
  float sinLat = sin(latR);
  float cosLat = cos(latR);
  float N = WGS84_A / sqrt(1.0 - WGS84_E2 * sinLat * sinLat);
  float x = N * cosLat * cos(lonR);
  float y = N * cosLat * sin(lonR);
  float z = N * (1.0 - WGS84_E2) * sinLat;
  return vec3(x, y, z);
}
```

## Verification

At runtime, verify coordinates with a known location:

```ts
const tokyo = geodeticToVector3({
  lat: degreeToRadian(35.68),
  lng: degreeToRadian(139.77),
  height: 0,
});
// Should be roughly: x ≈ −3.96M, y ≈ 3.35M, z ≈ 3.70M
```

And via the camera getter:

```ts
view.camera.positionGeographic  // { lat, lng, height } — degrees, meters
view.camera.positionECEF        // { x, y, z } — ECEF meters
```
