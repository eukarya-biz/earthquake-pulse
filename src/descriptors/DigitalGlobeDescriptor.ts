/**
 * DigitalGlobeDescriptor — Navara MeshDesc for point-based digital globe
 *
 * Renders continents as uniformly distributed glowing points on a dark globe.
 * Points are pre-generated as unit-sphere XYZ + height and scaled at runtime.
 * Supports 3 LOD levels and runtime-adjustable terrain exaggeration.
 */
import type { MeshConfig, ViewContext } from "@navaramap/three";
import { MeshDesc } from "@navaramap/three";
import {
  BufferGeometry,
  BufferAttribute,
  Points,
  PointsMaterial,
  SphereGeometry,
  Mesh,
  MeshBasicMaterial,
  Group,
  LineBasicMaterial,
  Line,
} from "three";

const POINT_SIZE = 1;
const SURFACE_OFFSET = 0;
const DARK_GLOBE = 0x0a0a0a;
const EARTH_RADIUS = 6378137;

const GRID_COLOR = 0x333333;
const GRID_OPACITY = 0.25;
const GRID_SEGMENTS = 120;

const LOD_LEVELS = [
  { name: "sparse", file: "land_points_sparse.bin", threshold: 5_000_000 },
  { name: "medium", file: "land_points_medium.bin", threshold: 1_000_000 },
  { name: "dense", file: "land_points_dense.bin", threshold: 0 },
] as const;

type RawLodData = { unitPositions: Float32Array; heights: Float32Array };

const rawDataCache = new Map<string, RawLodData>();

async function loadRawData(file: string): Promise<RawLodData> {
  if (rawDataCache.has(file)) return rawDataCache.get(file)!;
  const response = await fetch(`${import.meta.env.BASE_URL}${file}`);
  const buffer = await response.arrayBuffer();
  const dv = new DataView(buffer);
  const count = Math.floor(buffer.byteLength / 8);
  const unitPositions = new Float32Array(count * 3);
  const heights = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const base = i * 8;
    const qx = dv.getInt16(base, true);
    const qy = dv.getInt16(base + 2, true);
    const qz = dv.getInt16(base + 4, true);
    const qh = dv.getUint16(base + 6, true);
    unitPositions[i * 3] = qx / 32767;
    unitPositions[i * 3 + 1] = qy / 32767;
    unitPositions[i * 3 + 2] = qz / 32767;
    heights[i] = qh * 0.1;
  }
  console.log(`[DigitalGlobe] ${file}: ${count} pts loaded`);
  const data: RawLodData = { unitPositions, heights };
  rawDataCache.set(file, data);
  return data;
}

function buildPositions(data: RawLodData, exaggeration: number): Float32Array {
  const count = data.heights.length;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const base = i * 3;
    const nx = data.unitPositions[base];
    const ny = data.unitPositions[base + 1];
    const nz = data.unitPositions[base + 2];
    const r = EARTH_RADIUS + SURFACE_OFFSET + data.heights[i] * exaggeration;
    positions[base] = nx * r;
    positions[base + 1] = ny * r;
    positions[base + 2] = nz * r;
  }
  return positions;
}

function heightColor(h: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, h / 6000));
  // cyan (#00e5ff) → teal → emerald (#00c853)
  const r = 0;
  const g = 0.9 - t * 0.12;
  const b = 1 - t * 0.67;
  return [r, Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b))];
}

function buildColors(data: RawLodData): Float32Array {
  const count = data.heights.length;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const [r, g, b] = heightColor(data.heights[i]);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  return colors;
}

export class DigitalGlobeDescriptor extends MeshDesc<MeshConfig> {
  private group: Group | null = null;
  private globeMat: MeshBasicMaterial | null = null;
  private lodEntries: { points: Points; material: PointsMaterial; level: number; file: string }[] = [];
  private currentLod = -1;
  private lastExaggeration = 0;
  private static _exaggeration = 30;
  private static preloaded = false;
  private static denseLoaded = false;
  private denseLoading = false;

  static get exaggeration(): number { return DigitalGlobeDescriptor._exaggeration; }
  static set exaggeration(v: number) {
    DigitalGlobeDescriptor._exaggeration = Math.max(1, Math.min(100, v));
  }

  static async preload(): Promise<void> {
    if (DigitalGlobeDescriptor.preloaded) return;
    // Load sparse + medium eagerly; dense is deferred until camera approaches.
    await Promise.all([
      loadRawData(LOD_LEVELS[0].file),
      loadRawData(LOD_LEVELS[1].file),
    ]);
    DigitalGlobeDescriptor.preloaded = true;
  }

  constructor(view: import("@navaramap/three").default, ctx: ViewContext, config: MeshConfig) {
    super(view, ctx, config);
  }

  createMesh(): Group {
    const group = new Group();
    this.group = group;

    const globeGeo = new SphereGeometry(EARTH_RADIUS, 64, 32);
    this.globeMat = new MeshBasicMaterial({ color: DARK_GLOBE });
    group.add(new Mesh(globeGeo, this.globeMat));

    const gridMat = new LineBasicMaterial({
      color: GRID_COLOR,
      transparent: true,
      opacity: GRID_OPACITY,
      depthTest: true,
    });
    group.add(this.createLatLines(gridMat));
    group.add(this.createLngLines(gridMat));

    const exaggeration = DigitalGlobeDescriptor._exaggeration;

    for (let i = 0; i < LOD_LEVELS.length; i++) {
      const level = LOD_LEVELS[i];
      const data = rawDataCache.get(level.file);
      if (!data) continue;

      const material = new PointsMaterial({
        size: POINT_SIZE,
        vertexColors: true,
        depthTest: true,
        depthWrite: true,
      });

      const positions = buildPositions(data, exaggeration);
      const colors = buildColors(data);
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(positions, 3));
      geometry.setAttribute("color", new BufferAttribute(colors, 3));
      const points = new Points(geometry, material);
      points.visible = false;
      group.add(points);
      this.lodEntries.push({ points, material, level: i, file: level.file });
    }

    this.lastExaggeration = exaggeration;
    this.setLod(LOD_LEVELS.length - 1);
    return group;
  }

  update(): void {
    const height = this.view.camera.positionGeographic?.height ?? 0;

    // Lazily load dense LOD when camera approaches (< dense threshold + margin)
    if (!DigitalGlobeDescriptor.denseLoaded && !this.denseLoading) {
      const denseThreshold = LOD_LEVELS[LOD_LEVELS.length - 1].threshold;
      if (height < denseThreshold + 2_000_000) {
        this.denseLoading = true;
        loadRawData(LOD_LEVELS[LOD_LEVELS.length - 1].file).then(() => {
          DigitalGlobeDescriptor.denseLoaded = true;
          this.addLodPoints(LOD_LEVELS.length - 1);
          this.denseLoading = false;
        }).catch(() => { this.denseLoading = false; });
      }
    }

    let targetLod = LOD_LEVELS.length - 1;
    for (let i = 0; i < LOD_LEVELS.length; i++) {
      if (height > LOD_LEVELS[i].threshold) { targetLod = i; break; }
    }
    if (targetLod !== this.currentLod) this.setLod(targetLod);

    const exaggeration = DigitalGlobeDescriptor._exaggeration;
    if (exaggeration !== this.lastExaggeration) {
      this.lastExaggeration = exaggeration;
      for (const entry of this.lodEntries) {
        const data = rawDataCache.get(entry.file);
        if (!data) continue;
        const positions = buildPositions(data, exaggeration);
        entry.points.geometry.setAttribute("position", new BufferAttribute(positions, 3));
        entry.points.geometry.attributes.position.needsUpdate = true;
      }
    }
  }

  private addLodPoints(levelIndex: number): void {
    const level = LOD_LEVELS[levelIndex];
    const data = rawDataCache.get(level.file);
    if (!data || !this.group) return;

    // Avoid duplicate creation
    if (this.lodEntries.some((e) => e.level === levelIndex)) return;

    const material = new PointsMaterial({
      size: POINT_SIZE,
      vertexColors: true,
      depthTest: true,
      depthWrite: true,
    });
    const exaggeration = DigitalGlobeDescriptor._exaggeration;
    const positions = buildPositions(data, exaggeration);
    const colors = buildColors(data);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    const points = new Points(geometry, material);
    points.visible = false;
    this.group.add(points);
    this.lodEntries.push({ points, material, level: levelIndex, file: level.file });

    // If this is now the active LOD, show it
    if (levelIndex === this.currentLod) {
      points.visible = true;
    }
  }

  private setLod(index: number): void {
    for (const entry of this.lodEntries) {
      entry.points.visible = entry.level === index;
    }
    this.currentLod = index;
  }

  private createLatLines(material: LineBasicMaterial): Group {
    const group = new Group();
    const r = EARTH_RADIUS + SURFACE_OFFSET + 200;
    for (let lat = -90 + 10; lat < 90; lat += 10) {
      const latRad = (lat * Math.PI) / 180;
      const circleR = r * Math.cos(latRad);
      const z = r * Math.sin(latRad);
      const pts: number[] = [];
      for (let i = 0; i <= GRID_SEGMENTS; i++) {
        const angle = (i / GRID_SEGMENTS) * Math.PI * 2;
        pts.push(circleR * Math.cos(angle), circleR * Math.sin(angle), z);
      }
      const geo = new BufferGeometry();
      geo.setAttribute("position", new BufferAttribute(new Float32Array(pts), 3));
      group.add(new Line(geo, material));
    }
    return group;
  }

  private createLngLines(material: LineBasicMaterial): Group {
    const group = new Group();
    const r = EARTH_RADIUS + SURFACE_OFFSET + 200;
    for (let lng = 0; lng <= 180; lng += 10) {
      const lngRad = (lng * Math.PI) / 180;
      for (let sign = -1; sign <= 1; sign += 2) {
        const meridianLng = sign * lngRad;
        const pts: number[] = [];
        for (let i = 0; i <= GRID_SEGMENTS; i++) {
          const latRad = ((i / GRID_SEGMENTS) - 0.5) * Math.PI;
          pts.push(
            r * Math.cos(latRad) * Math.cos(meridianLng),
            r * Math.cos(latRad) * Math.sin(meridianLng),
            r * Math.sin(latRad),
          );
        }
        const geo = new BufferGeometry();
        geo.setAttribute("position", new BufferAttribute(new Float32Array(pts), 3));
        group.add(new Line(geo, material));
      }
    }
    return group;
  }

  onDestroy(): void {
    this.group?.traverse((child) => {
      if (child instanceof Mesh || child instanceof Points) {
        child.geometry.dispose();
        (child.material as MeshBasicMaterial | PointsMaterial).dispose();
      }
    });
    this.group = null;
    this.lodEntries = [];
  }
}
