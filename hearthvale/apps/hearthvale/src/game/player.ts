import * as THREE from 'three';
import { WORLD, type AnimState, type Appearance } from '@hearthvale/shared';
import { VoxelCharacter } from './assets/character.ts';
import type { CollisionWorld } from './collision.ts';
import type { Input } from './input.ts';

/** The locally-controlled player: input → velocity → collision → animation. */
export class LocalPlayer {
  readonly character: VoxelCharacter;
  readonly position = new THREE.Vector3();
  private velocity = new THREE.Vector3();
  ry = 0;
  anim: AnimState = 'idle';
  private grounded = true;
  private coyote = 0;
  speed = 0;

  constructor(appearance: Appearance) {
    this.character = new VoxelCharacter(appearance);
  }

  teleport(x: number, y: number, z: number) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.sync();
  }

  update(dt: number, input: Input, camYaw: number, collision: CollisionWorld | null, frozen: boolean) {
    const fwd = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
    const strafe = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
    const running = input.down('ShiftLeft') || input.down('ShiftRight');

    // Camera-relative movement
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let mx = fx * fwd + rx * strafe;
    let mz = fz * fwd + rz * strafe;
    const len = Math.hypot(mx, mz);
    if (frozen || len < 0.01) {
      mx = mz = 0;
    } else {
      mx /= len;
      mz /= len;
    }
    const target = running ? WORLD.RUN_SPEED : WORLD.WALK_SPEED;
    const accel = this.grounded ? 14 : 4;
    this.velocity.x += (mx * target - this.velocity.x) * Math.min(1, dt * accel);
    this.velocity.z += (mz * target - this.velocity.z) * Math.min(1, dt * accel);

    if (len > 0.01 && !frozen) {
      const want = Math.atan2(mx, mz);
      let d = want - this.ry;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.ry += d * Math.min(1, dt * 12);
    }

    this.coyote = this.grounded ? 0.1 : Math.max(0, this.coyote - dt);
    if (!frozen && input.consumePress('Space') && this.coyote > 0) {
      this.velocity.y = WORLD.JUMP_VELOCITY;
      this.grounded = false;
      this.coyote = 0;
    }
    this.velocity.y -= WORLD.GRAVITY * dt;

    this.position.addScaledVector(this.velocity, dt);
    let ground = 0;
    if (collision) ground = collision.resolve(this.position, WORLD.PLAYER_RADIUS, WORLD.PLAYER_HEIGHT).ground;
    if (this.position.y <= ground) {
      this.position.y = ground;
      if (this.velocity.y < 0) this.velocity.y = 0;
      this.grounded = true;
    } else if (this.grounded && this.position.y - ground < 0.3 && this.velocity.y <= 0) {
      // Walk smoothly down small steps instead of "falling" off them.
      this.position.y = ground;
      this.velocity.y = 0;
    } else {
      this.grounded = false;
    }

    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (!this.grounded) this.anim = this.velocity.y > 0 ? 'jump' : 'fall';
    else if (this.speed > 0.6) this.anim = running && this.speed > WORLD.WALK_SPEED + 0.5 ? 'run' : 'walk';
    else this.anim = 'idle';

    this.character.animate(this.anim, dt, this.speed);
    this.sync();
  }

  private sync() {
    this.character.root.position.copy(this.position);
    this.character.root.rotation.y = this.ry;
  }
}
