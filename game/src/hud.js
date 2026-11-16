// Everything flat: crosshair, hit marker, health, cash, ammo, round clock,
// team score, kill feed, capture progress, the buy shelf and the scoreboard.
// The simulation pushes plain values in; the HUD never reaches back into it
// except through the two callbacks the overlays expose (play and buy).
import { WEAPONS, GRENADE } from './weapons.js';

export function createHud() {
  const el = (id) => document.getElementById(id);
  const hpBar = el('hp-bar'), hpText = el('hp-text'), moneyEl = el('money');
  const ammoMag = el('ammo-mag'), ammoReserve = el('ammo-reserve'), weaponName = el('weapon-name');
  const roundEl = el('round-label'), timerEl = el('timer'), scoreEl = el('team-score');
  const feedEl = el('feed'), bannerEl = el('banner'), captureWrap = el('capture-wrap'), captureBar = el('capture-bar');
  const hitmarker = el('hitmarker'), crosshair = el('crosshair'), hurtEl = el('hurt');
  const overlay = el('overlay'), ovTitle = el('overlay-title'), ovCopy = el('overlay-copy'), ovExtra = el('overlay-extra');
  const playBtn = el('play'), buyShelf = el('buy-shelf');
  let hitTimer = 0, last = {};

  function set(key, node, value) { if (last[key] !== value) { last[key] = value; node.textContent = value; } }

  return {
    setHp(hp) {
      const v = Math.max(0, Math.round(hp));
      set('hp', hpText, `${v}`);
      hpBar.style.width = `${v}%`;
      hpBar.style.background = v > 55 ? 'var(--cyan)' : v > 25 ? 'var(--gold)' : 'var(--blood)';
    },
    setMoney(m) { set('money', moneyEl, `$${m}`); },
    setAmmo(mag, reserve, name) {
      set('mag', ammoMag, `${mag}`);
      set('res', ammoReserve, `/ ${reserve}`);
      set('wname', weaponName, name || '');
      el('ammo').classList.toggle('empty', mag === 0);
    },
    setGrenades(n) { set('orb', el('orb-count'), `◉ ${n}`); },
    setRound(round, phase, timeLeft) {
      set('round', roundEl, `ROUND ${round} · ${phase}`);
      const t = Math.max(0, Math.ceil(timeLeft));
      set('timer', timerEl, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
      timerEl.classList.toggle('low', t <= 10 && phase === 'LIVE');
    },
    setScore(lantern, ronin) { set('score', scoreEl, `LANTERN ${lantern} — ${ronin} RONIN`); },
    banner(text, holdMs = 1600) {
      bannerEl.textContent = text;
      bannerEl.classList.add('on');
      clearTimeout(bannerEl._t);
      bannerEl._t = setTimeout(() => bannerEl.classList.remove('on'), holdMs);
    },
    // Callers pass small trusted markup (<b> names, a HEADSHOT tag) built from
    // the fixed bot roster — never player-typed text — so innerHTML is the
    // correct sink here; textContent used to print the tags literally.
    feed(html, cls = '') {
      const row = document.createElement('div');
      if (cls) row.className = cls;
      row.innerHTML = html;
      feedEl.appendChild(row);
      while (feedEl.children.length > 5) feedEl.removeChild(feedEl.firstChild);
      setTimeout(() => { row.classList.add('fade'); setTimeout(() => row.remove(), 600); }, 3400);
    },
    hitMarker(killed, holdMs = 110, headshot = false) {
      hitmarker.classList.add('on');
      // Gold means the head: a headshot hit or kill reads instantly apart
      // from a magenta body kill and a paper body hit.
      hitmarker.style.setProperty('--hm', headshot ? 'var(--gold)' : killed ? 'var(--magenta)' : 'var(--paper)');
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on'), headshot ? Math.max(holdMs, 170) : holdMs);
    },
    // Directional damage cue: rotate the arc so its notch points toward the
    // shooter relative to where the player is facing (0 = dead ahead).
    hurtDirection(relAngle) {
      const arc = el('hurt-dir');
      if (!arc) return;
      arc.style.transform = `translate(-50%, -50%) rotate(${relAngle}rad)`;
      arc.classList.add('on');
      clearTimeout(arc._t);
      arc._t = setTimeout(() => arc.classList.remove('on'), 650);
    },
    hurtFlash() { hurtEl.classList.add('on'); setTimeout(() => hurtEl.classList.remove('on'), 130); },
    setCapture(frac, label) {
      captureWrap.style.display = frac > 0 ? 'block' : 'none';
      captureBar.style.width = `${Math.round(frac * 100)}%`;
      set('cap', el('capture-label'), label || 'SECURING THE DOJO');
    },
    setCrosshairSpread(px) { crosshair.style.setProperty('--gap', `${Math.round(px)}px`); },
    showBuy(money, owns, onBuy) {
      buyShelf.innerHTML = '';
      buyShelf.style.display = 'grid';
      const items = [...WEAPONS.map((w) => ({ ...w, key: '' })), { ...GRENADE, key: 'orb' }];
      items.forEach((w, i) => {
        const ownedAlready = w.key === 'orb' ? false : owns(w.id);
        const btn = document.createElement('button');
        btn.className = 'buy-item';
        btn.disabled = ownedAlready || money < w.price;
        btn.innerHTML = `<b>${i + 1}</b> ${w.name}<span>$${w.price}${ownedAlready ? ' · OWNED' : ''}</span>`;
        btn.addEventListener('click', () => onBuy(w.id));
        buyShelf.appendChild(btn);
      });
    },
    hideBuy() { buyShelf.style.display = 'none'; },
    showOverlay(mode, data = {}) {
      overlay.hidden = false;
      if (mode === 'start') {
        ovTitle.textContent = 'NEON DOJO DISTRICT';
        ovCopy.textContent = 'Night market, one dojo, two crews. Lantern Watch (cyan, yours) against the Magenta Ronin. Win rounds by wiping the Ronin or holding the dojo ring. If the Ronin are securing the ring, clear it and stand in it alone to reclaim — their progress rewinds fast while you hold it. First crew to 5 rounds takes the district.';
        ovExtra.textContent = 'Click PLAY, spend your cash on the buy shelf, then deploy. WASD move · mouse aim · Ctrl crouch · R reload · G Pulse Orb · keys 1-5 switch weapons.';
        playBtn.textContent = 'PLAY';
      } else if (mode === 'paused') {
        ovTitle.textContent = 'Paused';
        ovCopy.textContent = 'The market holds its breath.';
        ovExtra.textContent = '';
        playBtn.textContent = 'RESUME';
      } else if (mode === 'matchEnd') {
        ovTitle.textContent = data.won ? 'DISTRICT HELD' : 'DISTRICT LOST';
        ovCopy.textContent = data.won
          ? `Lantern Watch keeps the night market, ${data.lantern} — ${data.ronin}.`
          : `The Ronin paint the market magenta, ${data.lantern} — ${data.ronin}.`;
        ovExtra.textContent = data.stats || '';
        playBtn.textContent = 'PLAY AGAIN';
      } else if (mode === 'roundEnd') {
        ovTitle.textContent = data.won ? 'ROUND WON' : 'ROUND LOST';
        ovCopy.textContent = data.reason || '';
        ovExtra.textContent = `Lantern ${data.lantern} — ${data.ronin} Ronin · Cash $${data.money}`;
        playBtn.textContent = 'NEXT ROUND';
      }
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(fn) { playBtn.addEventListener('click', fn); },
  };
}
