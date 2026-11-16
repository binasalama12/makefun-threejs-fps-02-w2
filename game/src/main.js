// Neon Dojo District — boot, the fixed-step loop and the whole match brain:
// buy phases, live rounds, the dojo capture ring, purses, grenades, tracers and
// bot-versus-bot crossfire all meet here. Rendering runs at display rate; the
// simulation always advances in 1/60 s slices so a slow frame never changes
// how a fight plays out. ?shot=start|play|end&seed=N freezes one deterministic
// scene for screenshots instead of starting a match.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, CAPTURE_POINT, CAPTURE_RADIUS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createLoadout } from './gun.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createObjective } from './objective.js';
import { WEAPONS, GRENADE, weaponById } from './weapons.js';

const FIXED = 1 / 60;
const ROUND_TIME = 75;
const BUY_TIME = 12;
const WIN_SCORE = 5;

const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed * 7919 + 13);
const audio = createAudio();
const soundOn = !shotMode;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0a0714');
scene.fog = new THREE.Fog(new THREE.Color('#0a0714'), 26, 62);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const objective = createObjective();
const bots = createBots(scene, world.colliders, random);
const player = createPlayer(world.colliders);
const loadout = createLoadout(camera);
const hud = createHud();
const input = createInput(renderer.domElement, onLockChange);
const body = player.state;

const raycaster = new THREE.Raycaster();
const losRay = new THREE.Raycaster();
const shootables = world.shootables;
const allHit = shootables.concat(bots.hitMeshes);
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpDir = new THREE.Vector3();

// Tracer pool: thin additive lines that live for a few frames, reused round-robin.
const tracers = [];
for (let i = 0; i < 28; i++) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, ttl: 0 });
}
let tracerIdx = 0;
function spawnTracer(from, to, color) {
  const t = tracers[tracerIdx++ % tracers.length];
  const pos = t.line.geometry.attributes.position;
  pos.setXYZ(0, from.x, from.y, from.z);
  pos.setXYZ(1, to.x, to.y, to.z);
  pos.needsUpdate = true;
  t.line.material.color.set(color);
  t.line.material.opacity = 0.9;
  t.line.visible = true;
  t.ttl = 0.07;
}

// Pulse orbs in flight.
const orbs = [];
const orbGeo = new THREE.SphereGeometry(0.13, 12, 10);
const orbMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.magentaDeep), emissive: new THREE.Color(PALETTE.magenta), emissiveIntensity: 2.6 });
const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.magenta), 0, 13, 1.6);
scene.add(boomLight);
let boomFlash = 0;

// ---- Match state, all in one place ----
const S = {
  phase: 'menu', // menu | buy | live | over
  round: 1, timer: BUY_TIME, liveElapsed: 0,
  money: 800, grenades: 0,
  scoreL: 0, scoreR: 0,
  kills: 0, deaths: 0,
  captureTeam: null, captureProg: 0,
  pendingEnd: 0, endInfo: null,
  started: false,
};

function enemiesAlive() { return bots.bots.filter((b) => b.team === 'ronin' && b.alive); }
function alliesAlive() { return bots.bots.filter((b) => b.team === 'lantern' && b.alive); }

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}
function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

// ---- Economy and buying ----
function buy(id) {
  if (S.phase !== 'buy') return;
  if (id === GRENADE.id) {
    if (S.money < GRENADE.price) { if (soundOn) audio.denied(); return; }
    S.money -= GRENADE.price; S.grenades += 1;
    if (soundOn) audio.buy();
  } else {
    const def = weaponById(id);
    if (loadout.owns(id)) { loadout.equip(id); return; }
    if (S.money < def.price) { if (soundOn) audio.denied(); return; }
    S.money -= def.price;
    loadout.give(id);
    loadout.equip(id);
    if (soundOn) audio.buy();
  }
  refreshHud();
  hud.showBuy(S.money, (wid) => loadout.owns(wid), buy);
  updateBuyPanel();
}
function updateBuyPanel() {
  const extra = document.getElementById('overlay-extra');
  if (extra && S.phase === 'buy') extra.textContent = `Cash $${S.money} · Orbs ◉ ${S.grenades} · Deploy in ${Math.ceil(S.timer)}s — click a shelf item or press 1-6`;
}

function startMatch() {
  S.round = 1; S.scoreL = 0; S.scoreR = 0; S.money = 800; S.grenades = 0;
  S.kills = 0; S.deaths = 0;
  loadout.resetToSidearm();
  startBuyPhase();
}
function startBuyPhase() {
  S.phase = 'buy';
  S.timer = BUY_TIME;
  S.captureTeam = null; S.captureProg = 0; S.pendingEnd = 0;
  objective.reset();
  player.resetSpawn();
  bots.reset();
  loadout.refillAll();
  hud.showOverlay('start', {});
  document.getElementById('overlay-title').textContent = `ROUND ${S.round} — BUY PHASE`;
  document.getElementById('overlay-copy').textContent = 'Spend the crew purse. Your sidearm is free forever; everything heavier is a decision. Accuracy gear pays for itself: still, crouched shots fly true, running sprays do not.';
  document.getElementById('play').textContent = 'DEPLOY ▸';
  hud.showBuy(S.money, (wid) => loadout.owns(wid), buy);
  updateBuyPanel();
  refreshHud();
}
function deploy() {
  S.phase = 'live';
  S.timer = ROUND_TIME;
  S.liveElapsed = 0;
  hud.hideBuy();
  hud.hideOverlay();
  if (!shotMode) input.requestLock();
  hud.banner(S.round === 1 ? 'TAKE THE DOJO' : `ROUND ${S.round}`, 1400);
  refreshHud();
}
function endRound(lanternWon, reason) {
  if (S.phase !== 'live') return;
  S.phase = 'over';
  if (lanternWon) { S.scoreL += 1; S.money += 1400; } else { S.scoreR += 1; S.money += 900; }
  if (reason.includes('dojo ring')) S.money += lanternWon ? 600 : 0;
  if (soundOn) lanternWon ? audio.roundWin() : audio.roundLose();
  if (document.pointerLockElement) document.exitPointerLock();
  const matchOver = S.scoreL >= WIN_SCORE || S.scoreR >= WIN_SCORE;
  setTimeout(() => {
    if (matchOver) {
      hud.showOverlay('matchEnd', {
        won: S.scoreL > S.scoreR, lantern: S.scoreL, ronin: S.scoreR,
        stats: `Your tally: ${S.kills} eliminations · ${S.deaths} falls · Cash on hand $${S.money}`,
      });
    } else {
      hud.showOverlay('roundEnd', { won: lanternWon, reason, lantern: S.scoreL, ronin: S.scoreR, money: S.money });
    }
    refreshHud();
  }, 650);
}

// ---- Shooting ----
function losClear(from, to) {
  tmpDir.copy(to).sub(from);
  const dist = tmpDir.length();
  if (dist < 0.01) return true;
  losRay.set(from, tmpDir.normalize());
  losRay.far = dist - 0.3;
  return losRay.intersectObjects(shootables, false).length === 0;
}
function botEye(bot, out) { return out.set(bot.position.x, 1.5, bot.position.z); }
function chestOf(pos, out) { return out.set(pos.x, (pos.y ?? 0) + 1.15, pos.z); }

function playerShoot(forceSpread = null) {
  const c = loadout.cur();
  if (!c) return;
  if (!loadout.takeRound()) { if (soundOn) audio.dry(); loadout.pullTrigger(); return; }
  loadout.pullTrigger();
  if (soundOn) audio.shot(c.def.slot);
  bots.hearShot(body.position);
  const spread = forceSpread !== null ? forceSpread : loadout.spread(player.groundSpeed(), body.crouching);
  camera.getWorldDirection(tmpDir);
  const origin = tmpV.copy(camera.position).clone();
  for (let p = 0; p < c.def.pellets; p++) {
    const dir = tmpDir.clone();
    dir.x += (random() * 2 - 1) * spread;
    dir.y += (random() * 2 - 1) * spread;
    dir.z += (random() * 2 - 1) * spread;
    dir.normalize();
    raycaster.set(origin, dir);
    raycaster.far = c.def.range;
    const hit = raycaster.intersectObjects(allHit, false)[0];
    const end = hit ? hit.point : origin.clone().add(dir.clone().multiplyScalar(c.def.range));
    spawnTracer(origin.clone().add(dir.clone().multiplyScalar(0.7)).add(new THREE.Vector3(0, -0.12, 0)), end, c.def.tracer);
    if (hit && hit.object.userData.bot) {
      const target = hit.object.userData.bot;
      if (target.team === 'ronin' && target.alive) {
        const head = hit.object.userData.part === 'head';
        const fall = Math.max(0.45, 1 - hit.distance / (c.def.range * 1.6));
        const dmg = c.def.damage * (head ? c.def.headMult : 1) * fall;
        const killed = bots.damage(target, dmg);
        hud.hitMarker(killed, shotMode ? 4000 : 110, head);
        if (soundOn) head ? audio.headshot() : audio.hit();
        if (killed) {
          S.kills += 1; S.money += 300;
          hud.feed(`<b>You</b> ▸ ${target.name}${head ? ' · <span class="hs">HEADSHOT</span>' : ''} · +$300`);
          if (soundOn) audio.kill();
        }
      }
    }
  }
  player.recoil(c.def.recoil * (0.7 + random() * 0.6), (random() * 2 - 1) * c.def.recoil * 0.4);
  refreshHud();
}

const botCtx = {
  acquireTarget(bot, range, viewCos) {
    let best = null, bestD = range;
    const facing = tmpV2.set(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    const eye = botEye(bot, new THREE.Vector3());
    const consider = (pos, ref) => {
      const d = bot.position.distanceTo(pos);
      if (d > range || d > bestD) return;
      tmpDir.set(pos.x - bot.position.x, 0, pos.z - bot.position.z).normalize();
      if (d > 4 && tmpDir.dot(facing) < viewCos) return;
      if (!losClear(eye, chestOf(pos, new THREE.Vector3()))) return;
      best = ref; bestD = d;
    };
    for (const other of bots.bots) {
      if (!other.alive || other.team === bot.team) continue;
      consider(other.position, { kind: 'bot', bot: other, position: other.position });
    }
    if (bot.team === 'ronin' && body.alive && S.phase === 'live') {
      consider(body.position, { kind: 'player', position: body.position });
    }
    return best;
  },
  objectiveBias(bot) { return S.liveElapsed > 22; },
  defendObjective(bot) { return objective.defendUrgency(bot.team); },
  botShoot(bot, target) {
    const def = weaponById(bot.weaponId);
    bot.cooldown = 60 / def.rpm * (0.9 + random() * 0.3);
    if (soundOn && bot.position.distanceTo(body.position) < 26) audio.enemyShot();
    const from = botEye(bot, new THREE.Vector3()).add(new THREE.Vector3(0, -0.2, 0));
    const targetPos = target.kind === 'player' ? body.position : target.bot.position;
    const to = chestOf(targetPos, new THREE.Vector3());
    if (target.kind === 'player' && body.crouching) to.y -= 0.35;
    spawnTracer(from, to.clone().add(new THREE.Vector3((random() - 0.5) * 1.4, (random() - 0.5) * 0.9, (random() - 0.5) * 1.4)), def.tracer);
    const dist = bot.position.distanceTo(targetPos);
    const speed = target.kind === 'player' ? player.groundSpeed() : 3;
    let p = 0.60 - dist * 0.009 - speed * 0.028;
    if (target.kind === 'player' && body.crouching) p *= 0.78;
    p = Math.max(0.10, Math.min(0.58, p));
    if (random() > p) return;
    const head = random() < 0.12;
    const dmg = def.damage * (head ? def.headMult : 1) * Math.max(0.5, 1 - dist / 90);
    if (target.kind === 'player') {
      body.hp -= dmg;
      hud.hurtFlash();
      // Point the damage arc toward the shooter relative to facing:
      // rel = atan2(d·right, d·forward), forward = (-sin yaw, -cos yaw),
      // right = (cos yaw, -sin yaw) in xz.
      const dx = bot.position.x - body.position.x, dz = bot.position.z - body.position.z;
      const dotR = dx * Math.cos(body.yaw) - dz * Math.sin(body.yaw);
      const dotF = -dx * Math.sin(body.yaw) - dz * Math.cos(body.yaw);
      hud.hurtDirection(Math.atan2(dotR, dotF));
      if (soundOn) audio.hurt();
      if (body.hp <= 0 && body.alive) {
        body.alive = false; body.hp = 0; S.deaths += 1;
        hud.feed(`<b>${bot.name}</b> ▸ You`);
        S.pendingEnd = 1.0;
        S.endInfo = { won: false, reason: `${bot.name} put you down. The Watch falls with its captain.` };
      }
    } else {
      const killed = bots.damage(target.bot, dmg);
      if (killed) hud.feed(`<b>${bot.name}</b> ▸ ${target.bot.name}${head ? ' · <span class="hs">HEADSHOT</span>' : ''}`);
    }
    refreshHud();
  },
};

function throwOrb() {
  if (S.grenades <= 0 || S.phase !== 'live') return;
  S.grenades -= 1;
  if (soundOn) audio.orbThrow();
  camera.getWorldDirection(tmpDir);
  const mesh = new THREE.Mesh(orbGeo, orbMat);
  mesh.position.copy(camera.position).add(tmpDir.clone().multiplyScalar(0.6));
  scene.add(mesh);
  orbs.push({ mesh, vel: tmpDir.clone().multiplyScalar(13).add(new THREE.Vector3(0, 3.4, 0)), fuse: GRENADE.fuse });
  refreshHud();
}
function explodeOrb(orb) {
  scene.remove(orb.mesh);
  boomLight.position.copy(orb.mesh.position);
  boomFlash = 0.22;
  if (soundOn) audio.orbBoom();
  spawnTracer(orb.mesh.position.clone(), orb.mesh.position.clone().add(new THREE.Vector3(0, 2.2, 0)), PALETTE.magenta);
  for (const b of bots.bots) {
    if (!b.alive) continue;
    const d = b.position.distanceTo(orb.mesh.position);
    if (d < GRENADE.radius) {
      const killed = bots.damage(b, GRENADE.damage * (1 - d / (GRENADE.radius * 1.5)));
      if (killed && b.team === 'ronin') { S.kills += 1; S.money += 300; hud.feed(`<b>Your Pulse Orb</b> ▸ ${b.name} · +$300`); }
      if (killed && b.team === 'lantern') hud.feed(`<b>Pulse Orb</b> ▸ ${b.name} (friendly fire!)`);
    }
  }
  const dp = body.position.distanceTo(orb.mesh.position);
  if (dp < GRENADE.radius && body.alive) {
    body.hp -= 34 * (1 - dp / (GRENADE.radius * 1.6));
    hud.hurtFlash();
    if (body.hp <= 0) { body.alive = false; body.hp = 0; S.deaths += 1; S.pendingEnd = 1.0; S.endInfo = { won: false, reason: 'Your own Pulse Orb sang too close.' }; }
  }
}

// ---- HUD refresh ----
function refreshHud() {
  const c = loadout.cur();
  hud.setHp(body.hp);
  hud.setMoney(S.money);
  hud.setGrenades(S.grenades);
  if (c) hud.setAmmo(c.mag, c.reserve, c.def.name.toUpperCase());
  hud.setScore(S.scoreL, S.scoreR);
  hud.setRound(S.round, S.phase === 'buy' ? 'BUY' : S.phase === 'live' ? 'LIVE' : '—', S.timer);
  const spreadPx = c ? 6 + loadout.spread(player.groundSpeed(), body.crouching) * 900 : 7;
  hud.setCrosshairSpread(spreadPx);
}

// ---- Round logic per fixed step ----
function stepLive(dt) {
  S.liveElapsed += dt;
  S.timer -= dt;
  player.step(dt, input.state.keys);
  loadout.step(dt);
  bots.update(dt, botCtx);
  // Orbs fly and blow.
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    o.fuse -= dt;
    o.vel.y -= 16 * dt;
    o.mesh.position.addScaledVector(o.vel, dt);
    if (o.mesh.position.y < 0.13) { o.mesh.position.y = 0.13; o.vel.y *= -0.35; o.vel.x *= 0.7; o.vel.z *= 0.7; }
    if (o.fuse <= 0) { explodeOrb(o); orbs.splice(i, 1); }
  }
  boomFlash = Math.max(0, boomFlash - dt);
  boomLight.intensity = boomFlash > 0 ? 90 : 0;
  // Capture ring: headcounts go into the objective machine (objective.js),
  // which owns progress, the contested freeze and the defender reclaim —
  // this mode's defuse: a defender alone on the ring rewinds enemy progress
  // fast, and wiping it to zero announces the reclaim in the feed.
  let lIn = 0, rIn = 0;
  if (body.alive && body.position.distanceTo(CAPTURE_POINT) < CAPTURE_RADIUS && body.position.y < 1) lIn += 1;
  for (const b of bots.bots) {
    if (!b.alive || b.position.distanceTo(CAPTURE_POINT) >= CAPTURE_RADIUS) continue;
    if (b.team === 'lantern') lIn += 1; else rIn += 1;
  }
  const objEvent = objective.update(dt, lIn, rIn);
  S.captureTeam = objective.team; S.captureProg = objective.prog;
  if (objEvent === 'reclaimed') {
    hud.feed('<b>Objective reclaimed</b> — ring progress wiped');
    hud.banner('DOJO RECLAIMED', 1100);
    if (soundOn) audio.reclaimDone();
  }
  if (S.captureProg > 0 && Math.floor(S.liveElapsed * 2) !== Math.floor((S.liveElapsed - dt) * 2) && soundOn) audio.captureTick();
  const capLabel = objective.reclaiming
    ? (S.captureTeam === 'ronin' ? 'LANTERN RECLAIMING THE DOJO' : 'RONIN RECLAIMING THE DOJO')
    : (S.captureTeam === 'ronin' ? 'RONIN SECURING THE DOJO' : 'SECURING THE DOJO');
  hud.setCapture(S.captureProg, capLabel);
  world.captureRing.material.opacity = 0.45 + S.captureProg * 0.55;
  world.captureRing.material.color.set(S.captureTeam === 'ronin' ? PALETTE.magenta : PALETTE.gold);

  if (S.pendingEnd > 0) {
    S.pendingEnd -= dt;
    if (S.pendingEnd <= 0 && S.endInfo) { endRound(S.endInfo.won, S.endInfo.reason); return; }
  }
  if (enemiesAlive().length === 0) { endRound(true, 'Every Ronin is down. Elimination.'); return; }
  if (!body.alive && alliesAlive().length === 0) { endRound(false, 'Lantern Watch wiped out.'); return; }
  if (objEvent === 'lantern' || objEvent === 'ronin') {
    if (objEvent === 'lantern') endRound(true, 'Your crew held the dojo ring. Objective taken.');
    else endRound(false, 'The Ronin held the dojo ring. Objective lost.');
    return;
  }
  if (S.timer <= 0) {
    const l = alliesAlive().length + (body.alive ? 1 : 0);
    const r = enemiesAlive().length;
    endRound(l >= r, l >= r ? 'Time. The Watch still stands in greater number.' : 'Time. The Ronin outnumber the Watch.');
  }
}

hud.onPlay(() => {
  if (shotMode) return;
  if (soundOn) audio.unlock();
  if (S.phase === 'buy') { deploy(); return; }
  if (S.phase === 'over') {
    if (S.scoreL >= WIN_SCORE || S.scoreR >= WIN_SCORE) { startMatch(); return; }
    S.round += 1;
    startBuyPhase();
    return;
  }
  if (S.phase === 'menu') { S.started = true; startMatch(); return; }
  if (!input.state.locked) input.requestLock();
});
function onLockChange(locked) {
  if (shotMode) return;
  if (locked) hud.hideOverlay();
  else if (S.phase === 'live') {
    hud.showOverlay('paused', {});
    document.getElementById('play').textContent = 'RESUME';
  }
}

window.addEventListener('keydown', (e) => {
  if (S.phase === 'buy' && !shotMode) {
    const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(e.code);
    if (idx >= 0) buy(idx < 5 ? WEAPONS[idx].id : GRENADE.id);
  }
});

// ---- Main loop ----
let accumulator = 0, lastTime = performance.now(), frozen = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    for (const t of tracers) {
      if (t.ttl > 0) { t.ttl -= dt; t.line.material.opacity = Math.max(0, t.ttl / 0.07) * 0.9; if (t.ttl <= 0) t.line.visible = false; }
    }
    if (S.phase === 'live' && input.state.locked) {
      const look = input.takeLook();
      player.look(look.x, look.y);
      const c = loadout.cur();
      if (input.state.firing && loadout.ready()) playerShoot();
      else if (input.state.firing && c && c.mag === 0 && loadout.ready() === false && !loadout.reloading()) loadout.reload();
      if (input.consume('KeyR')) { if (loadout.reload() && soundOn) audio.reload(); }
      if (input.consume('KeyG')) throwOrb();
      for (let i = 0; i < WEAPONS.length; i++) {
        if (input.consume(`Digit${i + 1}`) && loadout.owns(WEAPONS[i].id)) { loadout.equip(WEAPONS[i].id); refreshHud(); }
      }
      accumulator += dt;
      let n = 0;
      while (accumulator >= FIXED && n < 5) { stepLive(FIXED); accumulator -= FIXED; n += 1; }
      if (accumulator > FIXED * 5) accumulator = 0;
      refreshHud();
    } else if (S.phase === 'buy') {
      S.timer -= dt;
      updateBuyPanel();
      hud.setRound(S.round, 'BUY', S.timer);
      if (S.timer <= 0) deploy();
    } else if (S.phase === 'live' && shotMode) {
      // Shot mode never reaches here; scenes are staged below.
    }
    syncCamera();
  }
  renderer.render(scene, camera);
}

// ---- Deterministic screenshot scenes ----
function stageShot(mode) {
  loadout.starterKit();
  loadout.equip('repeater');
  bots.reset();
  S.money = 2450; S.grenades = 1; S.round = 3; S.scoreL = 2; S.scoreR = 1;
  const byName = (n) => bots.bots.find((b) => b.name === n);
  if (mode === 'start') {
    S.phase = 'buy'; S.timer = BUY_TIME;
    body.position.set(0, 0, 15.5); body.yaw = 0; body.pitch = 0.02;
    hud.showOverlay('start', {});
    document.getElementById('overlay-title').textContent = 'ROUND 3 — BUY PHASE';
    document.getElementById('overlay-copy').textContent = 'Spend the crew purse. Your sidearm is free forever; everything heavier is a decision. Accuracy gear pays for itself: still, crouched shots fly true, running sprays do not.';
    document.getElementById('play').textContent = 'DEPLOY ▸';
    hud.showBuy(S.money, (wid) => loadout.owns(wid), () => {});
    updateBuyPanel();
  } else if (mode === 'play') {
    S.phase = 'live'; S.timer = 47; S.liveElapsed = 28;
    hud.hideOverlay();
    body.position.set(0.6, 0, 10.5); body.hp = 72;
    const vex = byName('Vex'); vex.position.set(0.2, 0, 1.1);
    const momo = byName('Momo-9'); momo.position.set(4.6, 0, 5.2);
    const juno = byName('Juno'); juno.position.set(11.5, 0, 4.5);
    const aiko = byName('Aiko'); aiko.position.set(-3.8, 0, 8.4);
    const ren = byName('Ren'); ren.position.set(-6.5, 0, 12.5);
    for (const b of bots.bots) {
      b.fig.root.position.copy(b.position);
      b.yaw = Math.atan2(-(body.position.x - b.position.x), -(body.position.z - b.position.z));
      b.fig.root.rotation.y = b.yaw;
    }
    const c = loadout.cur(); c.mag = 18; c.reserve = 75;
    aimAt(new THREE.Vector3(vex.position.x, 1.25, vex.position.z));
    playerShoot(0);
    c.mag = 17;
    S.captureProg = 0.45; S.captureTeam = 'lantern';
    objective.set('lantern', 0.45);
    hud.setCapture(0.45, 'SECURING THE DOJO');
    hud.feed('<b>You</b> ▸ Juno · +$300');
    hud.feed('<b>Aiko</b> ▸ Momo-9');
  } else {
    S.phase = 'over'; S.scoreL = 3; S.scoreR = 2; S.money = 3100;
    hud.hideOverlay();
    body.position.set(0, 0, 11); body.yaw = 0; body.pitch = 0.05;
    const vex = byName('Vex');
    vex.position.set(1.5, 0, -2);
    bots.damage(vex, 999);
    vex.fig.root.position.set(1.5, 0.25, -2);
    const momo = byName('Momo-9'); momo.position.set(-4, 0, -5); momo.fig.root.position.copy(momo.position);
    const aiko = byName('Aiko'); aiko.position.set(-2.5, 0, 2); aiko.fig.root.position.copy(aiko.position);
    hud.showOverlay('roundEnd', { won: true, reason: 'Every Ronin is down. Elimination — the dojo stays cyan.', lantern: 3, ronin: 2, money: 3100 });
  }
  refreshHud();
  if (mode === 'play') hud.setHp(72);
  syncCamera();
  renderer.render(scene, camera);
  window.__shotReady = true;
  frozen = true;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

loadout.resetToSidearm();
refreshHud();
if (shotMode) stageShot(shotMode);
else {
  hud.showOverlay('start', {});
  requestAnimationFrame(frame);
}
