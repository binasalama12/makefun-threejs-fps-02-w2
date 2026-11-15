// The player's hands: a view-model per weapon family, magazine bookkeeping for
// everything owned, reloads, muzzle flash and the accuracy model. Spread grows
// with movement, shrinks to its floor when crouched and still, and blooms while
// a trigger is held down — three separate reasons to stop, plant and tap fire.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS, weaponById } from './weapons.js';

export function createLoadout(camera) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#191922'), roughness: 0.5, metalness: 0.45 });
  const cyanTrim = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.cyanDeep), emissive: new THREE.Color(PALETTE.cyan), emissiveIntensity: 1.1, roughness: 0.4 });
  const magentaTrim = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.magentaDeep), emissive: new THREE.Color(PALETTE.magenta), emissiveIntensity: 1.1, roughness: 0.4 });
  const goldTrim = new THREE.MeshStandardMaterial({ color: new THREE.Color('#6b4a08'), emissive: new THREE.Color(PALETTE.gold), emissiveIntensity: 0.9, roughness: 0.4 });

  const holder = new THREE.Group();
  holder.position.set(0.25, -0.22, -0.45);
  camera.add(holder);
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0'), transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color('#ffb35c'), 0, 6);
  camera.add(flashLight);

  const owned = new Map(); // id -> { def, mag, reserve }
  let currentId = null;
  let model = null;
  let cooldown = 0, reloadLeft = 0, flashTime = 0, kick = 0, bloom = 0, bloomDecay = 0;

  function buildModel(def) {
    if (model) holder.remove(model);
    model = new THREE.Group();
    const trimMat = def.slot === 'precision' ? goldTrim : def.slot === 'scatter' ? magentaTrim : cyanTrim;
    const add = (w, h, d, x, y, z, m = dark) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      model.add(mesh);
      return mesh;
    };
    if (def.slot === 'sidearm') {
      add(0.07, 0.11, 0.24, 0, 0, -0.05);
      add(0.05, 0.05, 0.14, 0, 0.02, -0.22, trimMat);
      flash.position.set(0.25, -0.2, -0.85);
    } else if (def.slot === 'scatter') {
      add(0.1, 0.12, 0.4, 0, 0, -0.08);
      add(0.07, 0.07, 0.42, 0, 0.03, -0.42);
      add(0.09, 0.09, 0.2, 0, -0.03, -0.3, trimMat);
      flash.position.set(0.25, -0.19, -1.1);
    } else if (def.slot === 'precision') {
      add(0.07, 0.09, 0.55, 0, 0, -0.15);
      add(0.03, 0.03, 0.5, 0, 0.02, -0.6);
      add(0.05, 0.07, 0.16, 0, 0.09, -0.2, trimMat);
      flash.position.set(0.25, -0.2, -1.35);
    } else {
      add(0.09, 0.11, 0.44, 0, 0, -0.1);
      add(0.045, 0.045, 0.4, 0, 0.03, -0.45);
      add(0.08, 0.16, 0.06, 0, -0.12, 0.02, trimMat);
      add(0.07, 0.08, 0.2, 0, -0.02, 0.3);
      flash.position.set(0.25, -0.19, -1.05);
    }
    flashLight.position.copy(flash.position);
    holder.add(model);
  }

  function give(id, fresh = true) {
    const def = weaponById(id);
    if (!owned.has(id) || fresh) owned.set(id, { def, mag: def.mag, reserve: def.reserve });
    return owned.get(id);
  }
  function equip(id) {
    if (!owned.has(id)) return false;
    currentId = id;
    reloadLeft = 0; cooldown = Math.max(cooldown, 0.25); bloom = 0;
    buildModel(owned.get(id).def);
    return true;
  }
  function cur() { return currentId ? owned.get(currentId) : null; }

  function step(dt) {
    cooldown = Math.max(0, cooldown - dt);
    flashTime = Math.max(0, flashTime - dt);
    bloom = Math.max(0, bloom - dt * 2.6);
    kick += (0 - kick) * Math.min(1, dt * 13);
    if (model) {
      holder.position.z = -0.45 + kick;
      holder.rotation.x = kick * 2.4 - (reloadLeft > 0 ? 0.5 * Math.min(1, (cur().def.reloadTime - reloadLeft) * 2.4) : 0);
    }
    flash.visible = flashTime > 0;
    if (flashTime > 0) flash.rotation.z = flashTime * 34;
    flashLight.intensity = flashTime > 0 ? 16 : 0;
    if (reloadLeft > 0) {
      reloadLeft = Math.max(0, reloadLeft - dt);
      if (reloadLeft === 0) {
        const c = cur();
        const take = Math.min(c.def.mag - c.mag, c.reserve);
        c.mag += take; c.reserve -= take;
      }
    }
  }

  return {
    give, equip, cur,
    owns: (id) => owned.has(id),
    ownedList: () => [...owned.keys()],
    step,
    ready() { const c = cur(); return c && c.mag > 0 && cooldown <= 0 && reloadLeft <= 0; },
    reloading: () => reloadLeft > 0,
    pullTrigger() {
      const c = cur(); if (!c) return;
      cooldown = 60 / c.def.rpm;
      flashTime = 0.055;
      kick = c.def.kick;
      bloom = Math.min(0.02, bloom + 0.0045);
    },
    takeRound() { const c = cur(); if (!c || c.mag <= 0) return false; c.mag -= 1; return true; },
    reload() {
      const c = cur();
      if (!c || reloadLeft > 0 || c.mag >= c.def.mag || c.reserve <= 0) return false;
      reloadLeft = c.def.reloadTime;
      return true;
    },
    // The whole accuracy story in one number, radians of cone.
    spread(speed, crouching) {
      const c = cur(); if (!c) return 0.01;
      const moveT = Math.min(1, speed / 5.1);
      let s = c.def.spreadStill + (c.def.spreadMove - c.def.spreadStill) * moveT + bloom;
      if (crouching && speed < 0.6) s *= 0.55;
      return s;
    },
    refillAll() { for (const c of owned.values()) { c.mag = c.def.mag; c.reserve = c.def.reserve; } },
    resetToSidearm() {
      owned.clear();
      give('koi9');
      equip('koi9');
    },
    starterKit() { for (const w of WEAPONS) give(w.id); },
  };
}
