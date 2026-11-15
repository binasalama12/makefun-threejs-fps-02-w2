// The player's body: ground acceleration with real friction, a weaker air
// control, crouch that lowers both eye and profile, and axis-by-axis box
// collision so sliding along a stall or a dojo wall feels clean, never sticky.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.58;
const CROUCH_EYE = 1.0;
const WALK_SPEED = 5.1;
const CROUCH_SPEED = 2.3;
const GROUND_ACCEL = 40;
const AIR_ACCEL = 8;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.0;

export function createPlayer(colliders) {
  const state = {
    position: new THREE.Vector3(0, 0, 16),
    velocity: new THREE.Vector3(),
    yaw: 0, pitch: 0, eye: STAND_EYE,
    onGround: true, crouching: false, height: STAND_HEIGHT, hp: 100, alive: true,
  };
  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();

  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const c of colliders) if (probe.intersectsBox(c)) return c;
    return null;
  }

  function look(dx, dy, sens = 0.0021) {
    state.yaw -= dx * sens;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * sens));
  }
  function recoil(up, side) {
    state.pitch = Math.min(1.45, state.pitch + up);
    state.yaw += side;
  }

  function step(dt, keys) {
    const wantCrouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (wantCrouch && !state.crouching) { state.crouching = true; state.height = CROUCH_HEIGHT; }
    else if (!wantCrouch && state.crouching && !overlaps(state.position.x, state.position.y, state.position.z, STAND_HEIGHT, 0.02)) {
      state.crouching = false; state.height = STAND_HEIGHT;
    }
    const eyeTarget = state.crouching ? CROUCH_EYE : STAND_EYE;
    state.eye += (eyeTarget - state.eye) * Math.min(1, dt * 12);

    const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const str = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (fwd || str) {
      const s = Math.sin(state.yaw), c = Math.cos(state.yaw);
      wish.set(-s * fwd + c * str, 0, -c * fwd - s * str).normalize();
    }
    const speed = state.crouching ? CROUCH_SPEED : WALK_SPEED;
    const blend = Math.min(1, (state.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    state.velocity.x += (wish.x * speed - state.velocity.x) * blend;
    state.velocity.z += (wish.z * speed - state.velocity.z) * blend;
    if (state.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      state.velocity.x *= damp; state.velocity.z *= damp;
    }
    if (keys.has('Space') && state.onGround) { state.velocity.y = JUMP_SPEED; state.onGround = false; }
    state.velocity.y -= GRAVITY * dt;

    const nx = state.position.x + state.velocity.x * dt;
    if (!overlaps(nx, state.position.y, state.position.z, state.height, 0.04)) state.position.x = nx; else state.velocity.x = 0;
    const nz = state.position.z + state.velocity.z * dt;
    if (!overlaps(state.position.x, state.position.y, nz, state.height, 0.04)) state.position.z = nz; else state.velocity.z = 0;

    state.position.y += state.velocity.y * dt;
    state.onGround = false;
    const hit = overlaps(state.position.x, state.position.y, state.position.z, state.height, 0);
    if (hit && state.velocity.y <= 0) { state.position.y = hit.max.y; state.velocity.y = 0; state.onGround = true; }
    else if (hit) { state.position.y = hit.min.y - state.height; state.velocity.y = 0; }
    if (state.position.y < 0) { state.position.y = 0; state.velocity.y = 0; state.onGround = true; }
    state.velocity.y = Math.max(-30, state.velocity.y);
  }

  return {
    state, step, look, recoil,
    groundSpeed() { return Math.hypot(state.velocity.x, state.velocity.z); },
    resetSpawn() {
      state.position.set(0, 0, 16);
      state.velocity.set(0, 0, 0);
      state.yaw = 0; state.pitch = 0;
      state.hp = 100; state.alive = true; state.crouching = false; state.height = STAND_HEIGHT;
    },
  };
}
