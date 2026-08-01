# Custom Navara MeshDesc Patterns

A practical guide to building custom 3D objects that integrate with Navara's rendering pipeline, based on the two descriptors in Earthquake Pulse:

- `SeismicWaveDescriptor` — animated earthquake wave rings (dynamic per-frame geometry)
- `DigitalGlobeDescriptor` — point-based digital globe (large data, LOD, runtime config)

## What is a MeshDesc?

A `MeshDesc` is Navara's way to let you inject raw THREE.js objects into the scene while staying in Navara's coordinate system and render loop. You register a descriptor class, then instantiate it via `view.addMesh()`.

The THREE.js objects you return from `createMesh()` are placed in **ECEF world space** (see [navara-coordinates.md](navara-coordinates.md)) — no automatic rotation or tangent frame is applied unless you provide `matrixWorld`.

## Lifecycle

A descriptor goes through three stages, all of which we use in both examples:

| Hook | When | Purpose |
|---|---|---|
| `constructor(view, ctx, config)` | at `addMesh()` | capture references, set up singleton |
| `createMesh()` | once, after construction | build and return the root `Object3D` |
| `update(time)` | every render frame | animate, LOD, theme, reactive config |
| `onDestroy()` | when mesh is deleted | dispose GPU resources, clear singleton |

### 1. createMesh() — build the object graph

Return a `THREE.Group` (or any `Object3D`). Everything you add becomes part of the Navara scene at ECEF coordinates.

**SeismicWaveDescriptor** returns an empty group that rings are added to later:
```ts
createMesh(): Group {
  this.group = new Group();
  this.group.name = "seismic-waves";
  this.group.renderOrder = 1;
  return this.group;
}
```

**DigitalGlobeDescriptor** builds the full scene (dark sphere + grid lines + one `THREE.Points` per loaded LOD):
```ts
createMesh(): Group {
  const group = new Group();
  const globe = new Mesh(new SphereGeometry(EARTH_RADIUS, 64, 32),
    new MeshBasicMaterial({ color: DARK_GLOBE }));
  group.add(globe);
  // ... lat/lng grid lines, Points per LOD ...
  return group;
}
```

### 2. update() — per-frame work

Runs every frame. Both descriptors use it for different kinds of reactive logic.

**Camera-driven LOD switching** (DigitalGlobe):
```ts
update(): void {
  const height = this.view.camera.positionGeographic?.height ?? 0;
  let targetLod = LOD_LEVELS.length - 1;
  for (let i = 0; i < LOD_LEVELS.length; i++) {
    if (height > LOD_LEVELS[i].threshold) { targetLod = i; break; }
  }
  if (targetLod !== this.currentLod) this.setLod(targetLod);
}
```

**Per-frame animation** (SeismicWave): reads `this.view.camera.raw.position` to cull back-side rings, rebuilds geometry each frame for expansion:
```ts
update(): void {
  this._cameraPos.copy(this.view.camera.raw.position);
  for (const wave of this.waves) {
    const toCamera = this._cameraPos.clone().sub(wave.mesh.position).normalize();
    const outward = wave.mesh.position.clone().normalize();
    wave.mesh.visible = toCamera.dot(outward) > 0;   // front-side only
    // ... grow radius, rebuild RingGeometry, fade opacity ...
  }
}
```

### 3. onDestroy() — clean up

Navara calls this when the mesh is deleted. Always dispose GPU resources to avoid leaks:
```ts
onDestroy(): void {
  this.group?.traverse((child) => {
    if (child instanceof Mesh || child instanceof Points) {
      child.geometry.dispose();
      (child.material as Material).dispose();
    }
  });
  this.group = null;
}
```

## Pattern: Singleton + Static API

The most reusable pattern we use. App code calls static methods without holding the mesh handle:

```ts
let singleton: SeismicWaveDescriptor | null = null;

export class SeismicWaveDescriptor extends MeshDesc<MeshConfig> {
  constructor(view, ctx, config) {
    super(view, ctx, config);
    singleton = this;                 // capture the live instance
  }
  onDestroy(): void {
    this.clear();
    singleton = null;                 // release on teardown
  }

  // static API
  static add(params: SeismicWaveParams): void { singleton?.addWave(params); }
  static fadeOut(eqId: string): void { singleton?.fadeOut(eqId); }
  static clearAll(): void { singleton?.clear(); }
}
```

This lets modules like `waveSetup.ts` and `earthquakeVisualization.ts` trigger rings from anywhere:
```ts
SeismicWaveDescriptor.add({ lat, lng, magnitude, color, eqId });
```
without importing a mesh handle. The optional chaining (`singleton?.`) makes it safe before/after the mesh exists.

## Pattern: Static Runtime Configuration

For user-adjustable settings, expose a static property with a clamped setter, and read it inside `update()`:

```ts
private static _exaggeration = 30;

static get exaggeration(): number { return DigitalGlobeDescriptor._exaggeration; }
static set exaggeration(v: number) {
  DigitalGlobeDescriptor._exaggeration = Math.max(1, Math.min(100, v));
}
```

`update()` diffs the value against the last-applied one, and rebuilds only when it changes:
```ts
const exaggeration = DigitalGlobeDescriptor._exaggeration;
if (exaggeration !== this.lastExaggeration) {
  this.lastExaggeration = exaggeration;
  for (const entry of this.lodEntries) {
    const data = rawDataCache.get(entry.file);
    entry.points.geometry.setAttribute("position",
      new BufferAttribute(buildPositions(data, exaggeration), 3));
    entry.points.geometry.attributes.position.needsUpdate = true;
  }
}
```

The UI writes the same static property, so the descriptor and React stay in sync without prop drilling:
```tsx
<Slider
  value={[exaggeration]}
  min={1} max={100} step={1}
  onValueChange={([v]) => { setExaggeration(v); DigitalGlobeDescriptor.exaggeration = v; }}
/>
```

## Pattern: Async Preload + Lazy Loading

`createMesh()` is synchronous, so anything asynchronous (network fetches) must happen *before* it, or be handled by `update()`.

**Preload before addMesh** (eager assets):
```ts
static async preload(): Promise<void> {
  if (DigitalGlobeDescriptor.preloaded) return;
  await Promise.all([loadRawData(LOD_LEVELS[0].file), loadRawData(LOD_LEVELS[1].file)]);
  DigitalGlobeDescriptor.preloaded = true;
}
```
Called in `viewSetup.ts` before `addMesh()`, so `createMesh()` can read from the cache synchronously.

**Lazy load from update()** (deferred dense LOD — kept small on first load):
```ts
if (!DigitalGlobeDescriptor.denseLoaded && !this.denseLoading) {
  if (height < denseThreshold + 2_000_000) {
    this.denseLoading = true;
    loadRawData(denseFile).then(() => {
      DigitalGlobeDescriptor.denseLoaded = true;
      this.addLodPoints(denseIndex);   // create the Points now that data exists
      this.denseLoading = false;
    });
  }
}
```
The `addLodPoints` helper mirrors the `createMesh()` construction, so the mesh graph can grow at runtime.

## Pattern: Type Casting for Dynamic Registration

Navara's `DefaultDescriptions` type doesn't know about custom mesh keys. Register and add via a cast:

```ts
(view as ThreeView<Record<string, unknown>>)
  .registerMesh("digitalGlobe", DigitalGlobeDescriptor);
(view as ThreeView<Record<string, unknown>>)
  .addMesh({ digitalGlobe: {} });
```

The `seismicWave` registration uses the same trick in `waveSetup.ts`.

## Key Takeaways

1. **Return `Object3D` from `createMesh()`** — it lives in ECEF world space; place children at ECEF coordinates (via `geodeticToVector3`).
2. **Use `update()` for per-frame logic** — camera queries, animation, LOD, reactive config.
3. **Singleton + static methods** — cleanest way to let app code drive the mesh.
4. **Static setter + diff in update()** — runtime config without prop drilling; rebuild only on change.
5. **Preload async before createMesh; lazy-load later from update()** — keeps `createMesh()` synchronous and initial load small.
6. **Always dispose in `onDestroy()`** — geometry + material, or you'll leak GPU memory.
7. **Cast the view** for custom mesh keys — `DefaultDescriptions` won't type-check dynamic registration.

## See Also

- [navara-coordinates.md](navara-coordinates.md) — ECEF axis conventions, placement, tangent frames
- [seismic-wave-animation.md](seismic-wave-animation.md) — the ring animation in detail
- [digital-globe.md](digital-globe.md) — the point-globe descriptor in detail
