// The district itself: a night-market rectangle wrapped around a small dojo.
// West and east alleys run past food stalls, a central lane cuts straight to the
// dojo doors, and low rooftops with awnings close the sky down so fights stay
// close. Every solid box registers a collider for movement and a shootable
// surface for bullets; glowing trim is decoration only and never blocks a shot.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const CAPTURE_POINT = new THREE.Vector3(0, 0, -2);
export const CAPTURE_RADIUS = 3.6;

export const WAYPOINTS = [
  new THREE.Vector3(-14, 0, 14), new THREE.Vector3(14, 0, 14),
  new THREE.Vector3(-14, 0, 2), new THREE.Vector3(14, 0, 2),
  new THREE.Vector3(-6, 0, 6), new THREE.Vector3(6, 0, 6),
  new THREE.Vector3(0, 0, 8), new THREE.Vector3(0, 0, -2),
  new THREE.Vector3(-6, 0, -8), new THREE.Vector3(6, 0, -8),
  new THREE.Vector3(-14, 0, -10), new THREE.Vector3(14, 0, -10),
  new THREE.Vector3(-4, 0, -14), new THREE.Vector3(4, 0, -14),
  new THREE.Vector3(0, 0, -13), new THREE.Vector3(-11, 0, -3),
  new THREE.Vector3(11, 0, -3),
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  const mat = (color, rough = 0.9, metal = 0.05, emissive = null, ei = 0) => new THREE.MeshStandardMaterial({
    color: new THREE.Color(color), roughness: rough, metalness: metal,
    emissive: emissive ? new THREE.Color(emissive) : new THREE.Color('#000000'), emissiveIntensity: ei,
  });
  const M = {
    floor: mat(PALETTE.asphalt, 0.95),
    wall: mat('#1b1626', 0.92),
    wood: mat(PALETTE.stallWood, 0.85),
    roof: mat('#2a1030', 0.8),
    crate: mat('#33241c', 0.88),
    dojo: mat('#201428', 0.85),
    magentaGlow: mat(PALETTE.magentaDeep, 0.4, 0.1, PALETTE.magenta, 2.4),
    cyanGlow: mat(PALETTE.cyanDeep, 0.4, 0.1, PALETTE.cyan, 2.4),
    goldGlow: mat('#6b4a08', 0.4, 0.1, PALETTE.gold, 1.8),
    paperGlow: mat('#4a4234', 0.6, 0.0, PALETTE.paper, 0.55),
  };

  function box(w, h, d, x, y, z, material, solid = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }
  // Thin neon trim: pretty, non-solid, never stops a bullet or a body.
  function trim(w, h, d, x, y, z, material) { return box(w, h, d, x, y, z, material, false); }

  // Ground slab and the four district walls (46 x 40 m playfield).
  box(46.4, 0.4, 40.4, 0, -0.2, 0, M.floor);
  box(0.5, 5.2, 40.4, -23, 2.6, 0, M.wall);
  box(0.5, 5.2, 40.4, 23, 2.6, 0, M.wall);
  box(46.4, 5.2, 0.5, 0, 2.6, -20, M.wall);
  box(46.4, 5.2, 0.5, 0, 2.6, 20, M.wall);
  trim(46.4, 0.14, 0.14, 0, 5.28, -19.7, M.magentaGlow);
  trim(46.4, 0.14, 0.14, 0, 5.28, 19.7, M.cyanGlow);
  trim(0.14, 0.14, 40.4, -22.7, 5.28, 0, M.cyanGlow);
  trim(0.14, 0.14, 40.4, 22.7, 5.28, 0, M.magentaGlow);

  // The dojo: a raised hall at the centre-north with two door gaps in its south
  // wall, side walls, a tiled roof slab and the capture ring glowing on its floor.
  box(13, 0.36, 10, 0, 0.18, -2, M.dojo);
  box(0.5, 3.6, 10, -6.5, 1.8, -2, M.dojo);
  box(0.5, 3.6, 10, 6.5, 1.8, -2, M.dojo);
  box(13, 3.6, 0.5, 0, 1.8, -7, M.dojo);
  box(4.2, 3.6, 0.5, -4.4, 1.8, 3, M.dojo);
  box(4.2, 3.6, 0.5, 4.4, 1.8, 3, M.dojo);
  box(14.6, 0.4, 11.6, 0, 3.85, -2, M.roof);
  trim(14.6, 0.16, 0.16, 0, 3.6, 3.6, M.magentaGlow);
  trim(0.16, 0.16, 11.6, -7.2, 3.6, -2, M.cyanGlow);
  trim(0.16, 0.16, 11.6, 7.2, 3.6, -2, M.cyanGlow);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(CAPTURE_RADIUS - 0.35, CAPTURE_RADIUS, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.gold), transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(CAPTURE_POINT.x, 0.39, CAPTURE_POINT.z);
  group.add(ring);
  const ringCore = new THREE.Mesh(
    new THREE.CircleGeometry(CAPTURE_RADIUS - 0.35, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.gold), transparent: true, opacity: 0.10, side: THREE.DoubleSide }),
  );
  ringCore.rotation.x = -Math.PI / 2;
  ringCore.position.copy(ring.position);
  group.add(ringCore);

  // Market stalls: counter-height boxes with striped awnings on posts, mirrored
  // down both alleys so neither lane is ever a bare corridor.
  function stall(x, z, glowMat) {
    box(3.4, 1.05, 1.6, x, 0.52, z, M.wood);
    box(0.12, 2.5, 0.12, x - 1.6, 1.25, z - 0.7, M.wood);
    box(0.12, 2.5, 0.12, x + 1.6, 1.25, z - 0.7, M.wood);
    box(0.12, 2.5, 0.12, x - 1.6, 1.25, z + 0.7, M.wood);
    box(0.12, 2.5, 0.12, x + 1.6, 1.25, z + 0.7, M.wood);
    const awning = box(3.9, 0.1, 2.2, x, 2.55, z, M.roof);
    awning.rotation.z = 0.06;
    trim(3.9, 0.12, 0.12, x, 2.28, z + (z > 0 ? -1.05 : 1.05), glowMat);
  }
  stall(-14, 8, M.cyanGlow); stall(14, 8, M.magentaGlow);
  stall(-14, -6, M.magentaGlow); stall(14, -6, M.cyanGlow);
  stall(-9, 15.5, M.goldGlow); stall(9, 15.5, M.goldGlow);
  stall(-9, -14.5, M.cyanGlow); stall(9, -14.5, M.magentaGlow);

  // Crates, drums and low walls scattered as crouch cover on every lane.
  const cover = [
    [2.2, 1.1, 1.4, -3.5, 10.5], [1.4, 1.4, 1.4, 4.2, 11.5], [2.6, 0.8, 1.2, 0, 13.5],
    [1.4, 1.4, 1.4, -18, 2], [1.4, 1.4, 1.4, 18, -2], [2.2, 1.1, 1.4, -18.5, -12],
    [2.2, 1.1, 1.4, 18.5, 12], [1.6, 0.9, 1.6, -8, -1], [1.6, 0.9, 1.6, 8, -3],
    [2.8, 1.2, 1.0, -3, -11], [2.8, 1.2, 1.0, 3.5, -12.5], [1.3, 1.3, 1.3, 0, -17],
    [1.3, 1.3, 1.3, -19, 16], [1.3, 1.3, 1.3, 19, -16], [2.0, 0.75, 2.0, 11, 15],
    [2.0, 0.75, 2.0, -11, -17.5],
  ];
  for (const [w, h, d, x, z] of cover) box(w, h, d, x, h / 2, z, M.crate);

  // Hanging lantern strings over the central lane: glowing paper orbs on catenary-ish rows.
  const orbGeo = new THREE.SphereGeometry(0.22, 10, 8);
  for (let lane = -1; lane <= 1; lane++) {
    for (let i = 0; i < 7; i++) {
      const z = 14 - i * 4.4;
      const orb = new THREE.Mesh(orbGeo, i % 2 ? M.paperGlow : (lane === 0 ? M.goldGlow : M.magentaGlow));
      orb.position.set(lane * 9 + Math.sin(i * 1.3 + lane) * 0.5, 4.1 - Math.abs(i - 3) * 0.12, z);
      group.add(orb);
    }
  }

  // Light: dim blue night ambient, one moon key with shadows, magenta wash from
  // the north end and cyan wash from the south end so spawns read instantly.
  scene.add(new THREE.HemisphereLight(new THREE.Color('#3a3260'), new THREE.Color(PALETTE.inkBlack), 1.55));
  const moon = new THREE.DirectionalLight(new THREE.Color('#cfd8ff'), 2.1);
  moon.position.set(12, 20, 9);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -26; moon.shadow.camera.right = 26;
  moon.shadow.camera.top = 24; moon.shadow.camera.bottom = -24;
  moon.shadow.camera.far = 60; moon.shadow.bias = -0.0006;
  scene.add(moon);
  const northWash = new THREE.PointLight(new THREE.Color(PALETTE.magenta), 60, 30, 1.6);
  northWash.position.set(0, 3.4, -15);
  scene.add(northWash);
  const southWash = new THREE.PointLight(new THREE.Color(PALETTE.cyan), 60, 30, 1.6);
  southWash.position.set(0, 3.4, 15);
  scene.add(southWash);
  const dojoGlow = new THREE.PointLight(new THREE.Color(PALETTE.gold), 26, 14, 1.7);
  dojoGlow.position.set(0, 2.6, -2);
  scene.add(dojoGlow);

  return { colliders, shootables, group, captureRing: ring, captureCore: ringCore };
}
