// District fighters: blocky neon-trimmed figures with a head hitbox that pays
// bonus damage and a torso hitbox. Their brains are deliberately simple and
// readable: patrol between waypoints, push toward the dojo ring when the round
// matures, and when a target is inside view range with a clear line of sight,
// stop, strafe in short bursts and fire controlled bursts back. They hear
// gunfire too: a shot fired nearby turns a patrolling bot toward the noise.
import * as THREE from 'three';
import { TEAM_COLORS } from './palette.js';
import { WAYPOINTS, CAPTURE_POINT } from './world.js';

const BOT_RADIUS = 0.36;
const VIEW_RANGE = 30;
const VIEW_COS = Math.cos(1.15); // roughly a 132-degree vision cone

const ROSTER = [
  { name: 'Aiko', team: 'lantern', weapon: 'repeater', spawn: [-3.5, 15] },
  { name: 'Ren', team: 'lantern', weapon: 'lantern9', spawn: [3.5, 15.5] },
  { name: 'Vex', team: 'ronin', weapon: 'repeater', spawn: [-3.5, -16] },
  { name: 'Momo-9', team: 'ronin', weapon: 'lantern9', spawn: [3.5, -16.5] },
  { name: 'Juno', team: 'ronin', weapon: 'petal', spawn: [0, -18] },
];

export function createBots(scene, colliders, random) {
  const group = new THREE.Group();
  scene.add(group);
  const hitMeshes = [];
  const bots = [];
  const probe = new THREE.Box3();
  const tmpDir = new THREE.Vector3();

  function blocked(x, z, self) {
    probe.min.set(x - BOT_RADIUS, 0.15, z - BOT_RADIUS);
    probe.max.set(x + BOT_RADIUS, 1.6, z + BOT_RADIUS);
    for (const c of colliders) if (probe.intersectsBox(c)) return true;
    return false;
  }

  function buildFigure(bot) {
    const color = new THREE.Color(TEAM_COLORS[bot.team]);
    const suit = new THREE.MeshStandardMaterial({ color: new THREE.Color(bot.team === 'lantern' ? '#12333d' : '#3d1226'), roughness: 0.8 });
    const trim = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.4 });
    const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#caa27e'), roughness: 0.7 });
    const root = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), suit);
    torso.position.y = 1.05;
    torso.castShadow = true;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.09, 0.32), trim);
    stripe.position.y = 1.18;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), skin);
    head.position.y = 1.56;
    head.castShadow = true;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.07, 0.32), trim);
    band.position.y = 1.62;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.72, 0.2), suit);
    legL.position.set(-0.14, 0.36, 0);
    const legR = legL.clone(); legR.position.x = 0.14;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#191922'), roughness: 0.5, metalness: 0.4 }));
    gun.position.set(0.3, 1.12, -0.3);
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0'), transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
    flash.position.set(0.3, 1.12, -0.62);
    flash.visible = false;
    root.add(torso, stripe, head, band, legL, legR, gun, flash);
    group.add(root);
    torso.userData = { bot, part: 'body' };
    head.userData = { bot, part: 'head' };
    hitMeshes.push(torso, head);
    return { root, torso, head, legL, legR, flash };
  }

  for (const def of ROSTER) {
    const bot = {
      name: def.name, team: def.team, weaponId: def.weapon,
      spawn: new THREE.Vector3(def.spawn[0], 0, def.spawn[1]),
      position: new THREE.Vector3(def.spawn[0], 0, def.spawn[1]),
      yaw: def.team === 'lantern' ? 0 : Math.PI,
      hp: 100, alive: true,
      waypoint: 0, state: 'patrol', target: null,
      burstLeft: 0, burstWait: 0.4 + random() * 0.6, cooldown: 0,
      strafeDir: 1, strafeTime: 0, thinkTime: random() * 0.2,
      walkPhase: random() * 6, flashTime: 0, lastHeard: null, reactTime: 0,
    };
    bot.fig = buildFigure(bot);
    bot.fig.root.position.copy(bot.position);
    bots.push(bot);
  }

  function nearestWaypointIndex(pos) {
    let best = 0, bestD = Infinity;
    WAYPOINTS.forEach((w, i) => { const d = w.distanceToSquared(pos); if (d < bestD) { bestD = d; best = i; } });
    return best;
  }

  function reset() {
    for (const bot of bots) {
      bot.position.copy(bot.spawn);
      bot.yaw = bot.team === 'lantern' ? 0 : Math.PI;
      bot.hp = 100; bot.alive = true; bot.state = 'patrol'; bot.target = null;
      bot.waypoint = nearestWaypointIndex(bot.spawn);
      bot.burstLeft = 0; bot.cooldown = 0; bot.flashTime = 0; bot.reactTime = 0;
      bot.fig.root.visible = true;
      bot.fig.root.rotation.set(0, bot.yaw, 0);
      bot.fig.root.position.copy(bot.position);
    }
  }

  function damage(bot, amount) {
    if (!bot.alive) return false;
    bot.hp -= amount;
    if (bot.hp <= 0) {
      bot.alive = false;
      bot.fig.root.rotation.z = Math.PI / 2;
      bot.fig.root.position.y = 0.25;
      return true;
    }
    return false;
  }

  // Line of sight: the caller hands us a predicate so bots.js stays free of
  // raycaster ownership; main.js wires it to the world's shootable surfaces.
  function update(dt, ctx) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      bot.cooldown = Math.max(0, bot.cooldown - dt);
      bot.flashTime = Math.max(0, bot.flashTime - dt);
      bot.fig.flash.visible = bot.flashTime > 0;
      bot.thinkTime -= dt;

      if (bot.thinkTime <= 0) {
        bot.thinkTime = 0.12;
        const fresh = ctx.acquireTarget(bot, VIEW_RANGE, VIEW_COS);
        // Reaction beat: a bot that has just spotted someone needs a third of a
        // second to shoulder its weapon before the first burst. Snapshots of an
        // already-tracked target cost nothing, so holding an angle stays strong
        // while sprinting round a corner into a patrol is no longer instant death.
        if (fresh && !bot.target) bot.reactTime = 0.3 + random() * 0.18;
        bot.target = fresh;
        bot.state = bot.target ? 'engage' : (bot.lastHeard ? 'hunt' : 'patrol');
      }
      bot.reactTime = Math.max(0, bot.reactTime - dt);

      let moveX = 0, moveZ = 0, speed = 0;
      if (bot.state === 'engage' && bot.target) {
        const tp = bot.target.position;
        tmpDir.set(tp.x - bot.position.x, 0, tp.z - bot.position.z);
        const dist = tmpDir.length() || 1;
        bot.yaw = Math.atan2(-tmpDir.x, -tmpDir.z);
        // Hold a fighting distance: close scatter fighters push in, others keep 7-13 m.
        const want = bot.weaponId === 'petal' ? 5 : 10;
        bot.strafeTime -= dt;
        if (bot.strafeTime <= 0) { bot.strafeTime = 0.7 + random() * 0.9; bot.strafeDir = random() < 0.5 ? -1 : 1; }
        const sideX = -tmpDir.z / dist * bot.strafeDir, sideZ = tmpDir.x / dist * bot.strafeDir;
        let toward = 0;
        if (dist > want + 2) toward = 1; else if (dist < want - 2) toward = -0.7;
        moveX = (tmpDir.x / dist) * toward + sideX * 0.5;
        moveZ = (tmpDir.z / dist) * toward + sideZ * 0.5;
        speed = 3.1;
        // Burst discipline: 3-5 shots, then a beat to re-aim; nothing at all
        // leaves the barrel while the reaction beat above is still running.
        if (bot.burstWait > 0) bot.burstWait -= dt;
        else if (bot.burstLeft <= 0) { bot.burstLeft = 3 + Math.floor(random() * 3); }
        if (bot.reactTime <= 0 && bot.burstLeft > 0 && bot.cooldown <= 0) {
          ctx.botShoot(bot, bot.target);
          bot.burstLeft -= 1;
          bot.flashTime = 0.05;
          if (bot.burstLeft <= 0) bot.burstWait = 0.55 + random() * 0.5;
        }
      } else {
        // Defuse run: if the enemy owns visible progress on the ring and no
        // target is in sight, drop everything and get to the ring — standing
        // there alone is what rewinds (reclaims) their progress.
        const defend = ctx.defendObjective ? ctx.defendObjective(bot) : false;
        const goal = defend ? CAPTURE_POINT
          : bot.state === 'hunt' && bot.lastHeard ? bot.lastHeard
          : (ctx.objectiveBias(bot) ? CAPTURE_POINT : WAYPOINTS[bot.waypoint]);
        tmpDir.set(goal.x - bot.position.x, 0, goal.z - bot.position.z);
        const dist = tmpDir.length();
        if (dist < 1.4) {
          if (bot.state === 'hunt' && !defend) bot.lastHeard = null;
          else if (!defend && !ctx.objectiveBias(bot)) bot.waypoint = Math.floor(random() * WAYPOINTS.length);
          // While defending, arriving means holding the ring, not moving on.
        } else {
          bot.yaw = Math.atan2(-tmpDir.x, -tmpDir.z);
          moveX = tmpDir.x / dist; moveZ = tmpDir.z / dist;
          speed = bot.state === 'hunt' || defend ? 3.9 : 3.2;
        }
      }

      if (speed > 0 && (moveX || moveZ)) {
        const len = Math.hypot(moveX, moveZ) || 1;
        const dx = (moveX / len) * speed * dt, dz = (moveZ / len) * speed * dt;
        if (!blocked(bot.position.x + dx, bot.position.z, bot)) bot.position.x += dx;
        if (!blocked(bot.position.x, bot.position.z + dz, bot)) bot.position.z += dz;
        bot.position.x = Math.max(-22, Math.min(22, bot.position.x));
        bot.position.z = Math.max(-19, Math.min(19, bot.position.z));
        bot.walkPhase += dt * speed * 2.4;
      }
      bot.fig.root.position.set(bot.position.x, 0, bot.position.z);
      bot.fig.root.rotation.y = bot.yaw;
      const swing = Math.sin(bot.walkPhase) * 0.4;
      bot.fig.legL.rotation.x = swing;
      bot.fig.legR.rotation.x = -swing;
    }
  }

  function hearShot(pos) {
    for (const bot of bots) {
      if (!bot.alive || bot.state === 'engage') continue;
      if (bot.position.distanceTo(pos) < 17) bot.lastHeard = pos.clone();
    }
  }

  return { bots, hitMeshes, reset, damage, update, hearShot };
}
