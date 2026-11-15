[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/binasalama12/makefun-threejs-fps-02-w2/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/binasalama12/makefun-threejs-fps-02-w2/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

# Neon Dojo District

A round-based tactical FPS in the browser, built on three.js. A neon night
market wraps around one small dojo, and two invented crews fight over it:
**Lantern Watch** (cyan — your side) against the **Magenta Ronin**. You play
the Watch captain alongside two bot teammates, against three Ronin bots.

First crew to **5 rounds** takes the district.

## How a round works

1. **Buy phase (12 s)** — spend the crew purse on the shelf: five invented
   firearms from the cheap Koi-9 Sidearm up to the Moonpiercer precision
   rifle, plus Pulse Orb grenades. Click an item or press `1`–`6`, then
   deploy. Unspent cash carries over; kills pay $300, round wins pay more.
2. **Live round (75 s)** — win by eliminating every Ronin, or by holding the
   glowing **dojo ring** alone for five seconds for an objective win and a
   cash bonus. If the clock dies, the crew with more fighters standing wins.
3. Cash up, re-buy, go again. Lose your captain and the round is on your
   bots' shoulders — if they all fall, the round is gone.

## Gunplay rules of the district

Accuracy beats spraying, three ways at once: spread blooms while you hold
the trigger, movement blows the cone wide open, and a **crouched, planted**
shot gets the cone cut nearly in half. Headshots pay bonus damage on every
weapon. Bots patrol waypoints down both market alleys, react to gunfire they
hear, check line of sight before engaging, strafe between bursts, and push
the dojo ring once a round matures.

## Controls

| Input | Action |
| --- | --- |
| `W A S D` | Move |
| Mouse | Aim (pointer lock) |
| Left click | Fire |
| `Ctrl` or `C` | Crouch |
| `Space` | Jump |
| `R` | Reload |
| `1`–`5` | Switch weapon |
| `G` | Throw a Pulse Orb |
| `1`–`6` (buy phase) | Buy the shelf item |

## Features

- Original market-and-dojo map: two stall alleys, a central lantern lane,
  crouch cover everywhere, and a capture ring inside the dojo hall.
- Five-weapon economy plus a throwable area-damage grenade, all with distinct
  price, damage, cadence, range and handling.
- Bot teammates and opponents with waypoint patrols, hearing, line-of-sight
  checks, burst discipline and an objective push.
- Full HUD: health, cash, orbs, magazine and reserve, weapon name, round,
  clock, team score, kill feed, hit markers and capture progress.
- Every sound is synthesised live with WebAudio — oscillators and filtered
  noise, no audio files. The whole game is static files with no build step
  and no network requests; three.js is vendored under `game/vendor/`.

## Run it

Serve `game/` with any static file server and open `index.html` in desktop
Chrome, e.g. `python3 -m http.server` inside `game/`. Deterministic
screenshot scenes live at `?shot=start|play|end&seed=1`.
