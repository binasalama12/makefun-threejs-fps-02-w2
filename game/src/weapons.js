// The armoury of the district. Five invented firearms plus a throwable orb, each with
// its own price, damage, cadence and handling. Spread numbers are radians of cone:
// the still/crouch values are tiny on purpose, because in this game a planted,
// crouched shot lands and a running spray mostly paints the lanterns.
export const WEAPONS = [
  {
    id: 'koi9', name: 'Koi-9 Sidearm', slot: 'sidearm', price: 350,
    damage: 26, headMult: 2.4, pellets: 1, rpm: 330, mag: 12, reserve: 60,
    reloadTime: 1.15, range: 55, spreadStill: 0.004, spreadMove: 0.020,
    recoil: 0.010, kick: 0.035, auto: false, tracer: '#ffd9a0',
  },
  {
    id: 'lantern9', name: 'Lantern-9', slot: 'smg', price: 1000,
    damage: 19, headMult: 2.0, pellets: 1, rpm: 780, mag: 28, reserve: 112,
    reloadTime: 1.7, range: 48, spreadStill: 0.008, spreadMove: 0.034,
    recoil: 0.007, kick: 0.028, auto: true, tracer: '#22e6ff',
  },
  {
    id: 'petal', name: 'Scatter Petal', slot: 'scatter', price: 1450,
    damage: 11, headMult: 1.6, pellets: 7, rpm: 68, mag: 6, reserve: 30,
    reloadTime: 2.4, range: 26, spreadStill: 0.030, spreadMove: 0.048,
    recoil: 0.030, kick: 0.11, auto: false, tracer: '#ff9ecb',
  },
  {
    id: 'repeater', name: 'Bamboo Repeater', slot: 'rifle', price: 2250,
    damage: 34, headMult: 2.6, pellets: 1, rpm: 540, mag: 25, reserve: 100,
    reloadTime: 1.9, range: 80, spreadStill: 0.0025, spreadMove: 0.030,
    recoil: 0.011, kick: 0.05, auto: true, tracer: '#ffe27a',
  },
  {
    id: 'moonpiercer', name: 'Moonpiercer', slot: 'precision', price: 3450,
    damage: 96, headMult: 2.0, pellets: 1, rpm: 44, mag: 5, reserve: 25,
    reloadTime: 2.6, range: 120, spreadStill: 0.0006, spreadMove: 0.045,
    recoil: 0.045, kick: 0.16, auto: false, tracer: '#c8f6ff',
  },
];

export const GRENADE = { id: 'pulseorb', name: 'Pulse Orb', price: 300, damage: 85, radius: 4.6, fuse: 1.15 };

export function weaponById(id) {
  return WEAPONS.find((w) => w.id === id) || WEAPONS[0];
}
