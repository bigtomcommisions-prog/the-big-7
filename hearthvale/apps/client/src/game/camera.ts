import * as THREE from 'three';
import type { CollisionWorld } from './collision.ts';
import type { Input } from './input.ts';

/**
 * Third-person orbit camera. Yaw/pitch from mouse drag, zoom from the wheel, smoothed follow,
 * and pulls in when a wall is between the camera and the player.
 */
export class ThirdPersonCamera {
  yaw = Math.PI;
  pitch = 0.38;
  private distance = 7.5;
  targetDistance = 7.5;
  private current = new THREE.Vector3();
  private focus = new THREE.Vector3();
  private initialised = false;
  sensitivity = 1;

  constructor(private camera: THREE.PerspectiveCamera) {}

  update(dt: number, target: THREE.Vector3, input: Input, collision: CollisionWorld | null, indoors: boolean) {
    const s = 0.0045 * this.sensitivity;
    this.yaw -= input.lookDX * s;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.lookDY * s, -0.25, 1.25);
    if (input.wheel) this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + input.wheel * 0.9, 2.5, 18);
    const maxDist = indoors ? Math.min(this.targetDistance, 5.5) : this.targetDistance;
    this.distance += (maxDist - this.distance) * Math.min(1, dt * 6);

    // Smooth the focus point (slight lag feels nicer than rigid follow)
    const focusTarget = new THREE.Vector3(target.x, target.y + 1.5, target.z);
    if (!this.initialised) {
      this.focus.copy(focusTarget);
      this.initialised = true;
    }
    this.focus.lerp(focusTarget, Math.min(1, dt * 12));

    const cp = Math.cos(this.pitch);
    const desired = new THREE.Vector3(
      this.focus.x + Math.sin(this.yaw) * cp * this.distance,
      this.focus.y + Math.sin(this.pitch) * this.distance,
      this.focus.z + Math.cos(this.yaw) * cp * this.distance,
    );
    if (desired.y < 0.4) desired.y = 0.4;

    let dist = this.distance;
    if (collision) {
      const frac = collision.raycastCamera(this.focus.x, this.focus.y, this.focus.z, desired.x, desired.y, desired.z);
      if (frac < 1) {
        dist = Math.max(0.8, this.distance * frac - 0.2);
        desired.set(
          this.focus.x + Math.sin(this.yaw) * cp * dist,
          this.focus.y + Math.sin(this.pitch) * dist,
          this.focus.z + Math.cos(this.yaw) * cp * dist,
        );
      }
    }
    if (this.current.lengthSq() === 0) this.current.copy(desired);
    // Snap in quickly (avoid clipping), ease out slowly.
    const k = dist < this.distance ? 25 : 8;
    this.current.lerp(desired, Math.min(1, dt * k));
    this.camera.position.copy(this.current);
    this.camera.lookAt(this.focus);
  }

  /** Horizontal forward direction (camera → player). */
  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
}
