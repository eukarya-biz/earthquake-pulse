/**
 * SeismicWaveDescriptor - Navara MeshDesc for animated seismic wave rings
 *
 * Creates expanding ring animations from earthquake epicenters on the Earth's
 * surface. Rings expand outward tangent to the globe and fade as they propagate.
 */
import type { MeshConfig, ViewContext } from "@navaramap/three";
import ThreeView, { MeshDesc, geodeticToVector3, degreeToRadian } from "@navaramap/three";
import {
  RingGeometry,
  MeshBasicMaterial,
  Mesh,
  Group,
  DoubleSide,
  Color as ThreeColor,
  Vector3,
} from "three";

export interface SeismicWaveParams {
  lat: number;
  lng: number;
  magnitude: number;
  color?: number;
  duration?: number;
  eqId?: string;
}

interface WaveRing {
  mesh: Mesh;
  startTime: number;
  maxRadius: number;
  duration: number;
  initialColor: ThreeColor;
  eqId?: string;
  fastFadeStart?: number;
}

let singleton: SeismicWaveDescriptor | null = null;

export class SeismicWaveDescriptor extends MeshDesc<MeshConfig> {
  private group!: Group;
  private waves: WaveRing[] = [];
  private _cameraPos = new Vector3();

  constructor(view: ThreeView, ctx: ViewContext, config: MeshConfig) {
    super(view, ctx, config);
    singleton = this;
  }

  createMesh(): Group {
    this.group = new Group();
    this.group.name = "seismic-waves";
    this.group.renderOrder = 1;
    return this.group;
  }

  update(_time: number): void {
    const now = Date.now();
    this._cameraPos.copy(this.view.camera.raw.position);

    for (let i = this.waves.length - 1; i >= 0; i--) {
      const wave = this.waves[i];
      const elapsed = now - wave.startTime;
      const material = wave.mesh.material as MeshBasicMaterial;

      // Hide rings on the far side of the globe
      const toCamera = this._cameraPos.clone().sub(wave.mesh.position).normalize();
      const outward = wave.mesh.position.clone().normalize();
      const isFrontSide = toCamera.dot(outward) > 0;
      wave.mesh.visible = isFrontSide;

      // Handle fast fade (earthquake filtered out)
      if (wave.fastFadeStart !== undefined) {
        const fadeElapsed = now - wave.fastFadeStart;
        const fadeProgress = Math.min(fadeElapsed / 400, 1);
        material.opacity = Math.max(0, 1.0 - fadeProgress);

        if (fadeProgress >= 1) {
          this.removeWave(i, wave);
        }
        continue;
      }

      if (elapsed > wave.duration + 1000) {
        this.removeWave(i, wave);
        continue;
      }

      if (!isFrontSide) continue;

      const progress = Math.min(elapsed / wave.duration, 1);

      const currentRadius = progress * wave.maxRadius;
      const ringThickness = Math.max(
        wave.maxRadius * 0.02,
        wave.maxRadius * (0.25 - progress * 0.23)
      );
      const innerRadius = Math.max(0, currentRadius - ringThickness);

      wave.mesh.geometry.dispose();
      wave.mesh.geometry = new RingGeometry(innerRadius, currentRadius, 64, 1);

      material.opacity = Math.max(0, 0.5 * (1.0 - progress * progress));
    }
  }

  addWave(params: SeismicWaveParams): void {
    const color = new ThreeColor(params.color ?? 0xff4444);
    const duration = params.duration ?? 30000;
    const maxRadius = this.getMagnitudeRadius(params.magnitude);

    const geometry = new RingGeometry(0, 100, 64, 1);
    const material = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1.0,
      side: DoubleSide,
      depthWrite: false,
      depthTest: false,
    });

    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = 1;

    const pos = geodeticToVector3({
      lat: degreeToRadian(params.lat),
      lng: degreeToRadian(params.lng),
      height: 500,
    });
    mesh.position.copy(pos);

    const normal = pos.clone().normalize();
    mesh.lookAt(pos.clone().add(normal));

    this.group.add(mesh);

    this.waves.push({
      mesh,
      startTime: Date.now(),
      maxRadius,
      duration,
      initialColor: color.clone(),
      eqId: params.eqId,
    });
  }

  fadeOut(eqId: string): void {
    const now = Date.now();
    for (const wave of this.waves) {
      if (wave.eqId === eqId && wave.fastFadeStart === undefined) {
        wave.fastFadeStart = now;
      }
    }
  }

  hasRing(eqId: string): boolean {
    return this.waves.some((w) => w.eqId === eqId);
  }

  private removeWave(index: number, wave: WaveRing): void {
    this.group.remove(wave.mesh);
    wave.mesh.geometry.dispose();
    (wave.mesh.material as MeshBasicMaterial).dispose();
    this.waves.splice(index, 1);
  }

  private getMagnitudeRadius(magnitude: number): number {
    return Math.pow(2, magnitude - 4) * 150000;
  }

  clear(): void {
    for (const wave of this.waves) {
      this.group.remove(wave.mesh);
      wave.mesh.geometry.dispose();
      (wave.mesh.material as MeshBasicMaterial).dispose();
    }
    this.waves = [];
  }

  static add(params: SeismicWaveParams): void {
    singleton?.addWave(params);
  }

  static fadeOut(eqId: string): void {
    singleton?.fadeOut(eqId);
  }

  static hasRing(eqId: string): boolean {
    return singleton?.hasRing(eqId) ?? false;
  }

  static clearAll(): void {
    singleton?.clear();
  }

  onDestroy(): void {
    this.clear();
    singleton = null;
  }
}
