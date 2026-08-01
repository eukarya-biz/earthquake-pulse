# Seismic Wave Ring Animation

## Overview

Earthquake events pulse with expanding ring animations emanating from their epicenters on the globe surface. Rings grow outward tangent to the Earth, fade as they propagate, and are hidden on the far side of the globe.

The feature is implemented as a **custom Navara `MeshDesc`** (`SeismicWaveDescriptor`) plus a **periodic pulse loop** (`waveSetup.ts`) that triggers new rings for currently-visible earthquakes.

## Files

| File | Role |
|---|---|
| `src/descriptors/SeismicWaveDescriptor.ts` | Custom `MeshDesc` that owns and animates all wave rings |
| `src/modules/waveSetup.ts` | Registers the descriptor, runs the periodic pulse loop |
| `src/modules/earthquakeVisualization.ts` | Exports `lastWavePulse` map + `WAVE_PULSE_INTERVAL`; triggers `fadeOut` when events leave the visible set |

## Pipeline

```
view.registerMesh("seismicWave", SeismicWaveDescriptor)   // register descriptor
view.addMesh({ seismicWave: {} })                          // instantiate mesh → createMesh()
        │
        ▼
setInterval every 1s (waveSetup.ts)
   ├─ getVisibleEarthquakes(getEarthquakes())   // quakes within current timeline range
   └─ for each quake, if now - lastPulse ≥ 8s:
        SeismicWaveDescriptor.add({ lat, lng, magnitude, color, eqId })
        │
        ▼
addWave(): creates THREE.Mesh(RingGeometry) at epicenter ECEF position
        │
        ▼
Navara render loop calls descriptor.update() each frame
   └─ for each active ring:
        ├─ front-side culling (hide on far side of globe)
        ├─ grow radius over time
        ├─ shrink ring thickness
        ├─ fade opacity
        └─ dispose when duration elapses (or fast-fade when event hidden)
```

## SeismicWaveDescriptor

**File**: `src/descriptors/SeismicWaveDescriptor.ts`

### Registration & Singleton

The descriptor uses a module-level `singleton` pattern so application code can call static methods without holding a mesh handle:

```ts
let singleton: SeismicWaveDescriptor | null = null;

export class SeismicWaveDescriptor extends MeshDesc<MeshConfig> {
  constructor(view, ctx, config) {
    super(view, ctx, config);
    singleton = this;
  }
  onDestroy(): void {
    this.clear();
    singleton = null;
  }
}
```

Static helpers expose the API: `add()`, `fadeOut()`, `hasRing()`, `clearAll()`.

### createMesh()

Returns an empty `THREE.Group` (`name = "seismic-waves"`, `renderOrder = 1`). All rings are added as children of this group by `addWave()`.

### addWave() — Ring creation

```ts
const maxRadius = Math.pow(2, magnitude - 4) * 150000;   // magnitude-scaled radius (m)

const geometry = new RingGeometry(0, 100, 64, 1);        // placeholder geometry
const material = new MeshBasicMaterial({
  color, transparent: true, opacity: 1.0,
  side: DoubleSide, depthWrite: false, depthTest: false,
});
const mesh = new Mesh(geometry, material);
mesh.renderOrder = 1;
```

Positioned at the epicenter via Navara's ECEF conversion:

```ts
const pos = geodeticToVector3({
  lat: degreeToRadian(params.lat),   // radians in
  lng: degreeToRadian(params.lng),
  height: 500,                        // meters above ellipsoid
});
mesh.position.copy(pos);
```

The ring is oriented tangent to the globe surface by pointing its local +Z along the surface normal:

```ts
const normal = pos.clone().normalize();
mesh.lookAt(pos.clone().add(normal));
```

### update() — Per-frame animation

Called by Navara's render loop each frame.

1. **Front-side culling** — hide rings on the far side of the globe:
   ```ts
   const toCamera = cameraPos.clone().sub(mesh.position).normalize();
   const outward = mesh.position.clone().normalize();
   const isFrontSide = toCamera.dot(outward) > 0;   // dot > 0 → facing camera
   mesh.visible = isFrontSide;
   ```
   Rings on the far side (where `outward` points away from the camera) are skipped entirely.

2. **Fast fade** — when an earthquake leaves the visible set (timeline range change), `fadeOut(eqId)` sets `fastFadeStart`; the ring fades over 400ms then is removed:
   ```ts
   fadeProgress = (now - fastFadeStart) / 400;
   material.opacity = 1.0 - fadeProgress;
   ```

3. **Expansion** — radius grows linearly with progress:
   ```ts
   progress = elapsed / duration;                    // 0 → 1
   currentRadius = progress * maxRadius;
   ```

4. **Thickness shrink** — the ring band narrows as it expands:
   ```ts
   ringThickness = max(0.02 * maxRadius, maxRadius * (0.25 - 0.23 * progress));
   innerRadius = max(0, currentRadius - ringThickness);
   ```

5. **Geometry rebuild** — a fresh `RingGeometry(innerRadius, currentRadius, 64, 1)` replaces the old one each frame (old geometry disposed). Note: this allocates a new geometry every frame per ring — acceptable for the modest ring counts here.

6. **Fade out** — opacity follows a quadratic falloff:
   ```ts
   material.opacity = max(0, 0.5 * (1.0 - progress * progress));
   ```

7. **Lifetime** — rings are removed once `elapsed > duration + 1000`.

### Magnitude → radius

```ts
private getMagnitudeRadius(magnitude: number): number {
  return Math.pow(2, magnitude - 4) * 150000;
}
```

| Magnitude | Max Radius |
|---|---|
| M4 | 150 km |
| M5 | 300 km |
| M6 | 600 km |
| M7 | 1,200 km |

## Wave Pulse Loop (waveSetup.ts)

**File**: `src/modules/waveSetup.ts`

```ts
export function setupWaveAnimation(view, getEarthquakes): void {
  view.registerMesh("seismicWave", SeismicWaveDescriptor);
  view.addMesh({ seismicWave: {} });

  setInterval(() => {
    const visible = getVisibleEarthquakes(getEarthquakes());
    const now = Date.now();

    for (const eq of visible) {
      const lastTime = lastWavePulse.get(eq.id) || 0;
      if (now - lastTime >= WAVE_PULSE_INTERVAL) {
        SeismicWaveDescriptor.add({ lat, lng, magnitude, color, eqId });
        lastWavePulse.set(eq.id, now);
      }
    }
  }, 1000);
}
```

- Runs every **1 second**.
- Only pulses quakes currently in the timeline range (`getVisibleEarthquakes`).
- Each quake pulses at most every **8 seconds** (`WAVE_PULSE_INTERVAL`), tracked in the `lastWavePulse` map exported from `earthquakeVisualization.ts`.
- Ring color comes from magnitude classification (`getWaveColor`).
- Duration is randomized: `5500 + random × 2000` ms.

## Interaction with Timeline Filtering

When an earthquake leaves the visible range, `updateEarthquakeVisualization` calls `SeismicWaveDescriptor.fadeOut(eqId)` (see `earthquakeVisualization.ts`), so its ring fades out quickly instead of continuing to grow. When it re-enters the range, `lastWavePulse` has a stale timestamp, so the next pulse fires almost immediately.

## Coordinate Notes

- Positions use Navara's ECEF convention (`geodeticToVector3` expects **radians**; use `degreeToRadian`). See [navara-coordinates.md](navara-coordinates.md).
- Rings sit 500m above the ellipsoid to avoid z-fighting with the surface.
- `depthWrite: false` / `depthTest: false` ensure rings render over terrain and earthquake markers.
