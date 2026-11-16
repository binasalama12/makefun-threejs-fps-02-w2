// The dojo ring objective as its own little state machine, so main.js only
// feeds it headcounts and reads back who is winning. One crew alone on the
// ring bends progress toward itself; both crews together freeze it; nobody
// on it lets it bleed away slowly. The counter-play is the reclaim: when the
// crew that does NOT own the progress stands alone on the ring, the other
// crew's progress is rewound at RECLAIM_RATE — much faster than the passive
// bleed — which is this mode's defuse: get to the ring, clear it, undo the
// plant before it completes. Reaching either end fires exactly one event.
export const CAPTURE_TIME = 5;
const BLEED_RATE = 1 / (CAPTURE_TIME * 2.4); // empty ring: slow decay
const RECLAIM_RATE = 2.2 / CAPTURE_TIME;     // defender alone: active rewind

export function createObjective() {
  let team = null;   // 'lantern' | 'ronin' | null — who owns the progress
  let prog = 0;      // 0..1 toward that team's win
  let reclaiming = false;

  return {
    get team() { return team; },
    get prog() { return prog; },
    get reclaiming() { return reclaiming; },
    // Direct set for the deterministic screenshot scenes.
    set(t, p) { team = t; prog = p; reclaiming = false; },
    reset() { team = null; prog = 0; reclaiming = false; },
    // Advance one fixed step. Returns 'lantern' | 'ronin' when that crew
    // completes the objective this step, 'reclaimed' when a defender just
    // wiped the attacker's progress back to zero, otherwise null.
    update(dt, lanternIn, roninIn) {
      reclaiming = false;
      const lOnly = lanternIn > 0 && roninIn === 0;
      const rOnly = roninIn > 0 && lanternIn === 0;
      if (lOnly || rOnly) {
        const present = lOnly ? 'lantern' : 'ronin';
        if (team === null || team === present) {
          team = present;
          prog += dt / CAPTURE_TIME;
        } else {
          // Defender alone against the owner's progress: active reclaim.
          reclaiming = true;
          prog -= dt * RECLAIM_RATE;
          if (prog <= 0) { prog = 0; team = null; return 'reclaimed'; }
        }
      } else if (lanternIn === 0 && roninIn === 0 && prog > 0) {
        prog = Math.max(0, prog - dt * BLEED_RATE);
        if (prog === 0) team = null;
      }
      // Both crews present: contested, progress frozen.
      if (prog >= 1) { prog = 1; return team; }
      return null;
    },
    // Should a bot of `botTeam` drop its patrol and rush the ring? Yes when
    // the enemy owns visible progress on it — the defuse run.
    defendUrgency(botTeam) {
      return team !== null && team !== botTeam && prog > 0.2;
    },
  };
}
