/* Kaiju Brawl - starter kaiju roster stats, passives & moveset definitions (M7). */
(function () {
  'use strict';
  window.KB = window.KB || {};

  KB.MONSTER_ORDER = ['gorgantor', 'mongo', 'lepidora', 'tin_colossus'];
  KB.MONSTERS = {
    gorgantor: {
      id: 'gorgantor',
      name: 'GORGANTOR',
      title: 'The Atomic Saurian',
      archetype: 'All-rounder · Beam Zoner',
      blurb: 'Balanced atomic lizard. Lunges with a healing Atomic Chomp and sweeps cities with Atomic Breath.',
      hp: 935,
      speed: 3.0,
      jump: 1.0,
      power: 0.91,
      defense: 1.06,
      fuelMax: 100,
      fuelRegen: 1.4,
      guard: 100,
      weight: 1.0,
      lightSpeedMult: 0.96,
      maxClimbTier: 1,
      radius: 0.48,
      height: 110,
      heavyMove: {
        name: 'ATOMIC CHOMP',
        kind: 'chomp',
        lunge: 0.92,
        healOnHit: 4,
        dmg: 24
      },
      grabMove: {
        name: 'SHOULDER THROW',
        throwDmg: 18,
        slamDmg: 24
      },
      specials: {
        special: {
          id: 'atomic_breath',
          name: 'ATOMIC BREATH',
          kind: 'beam',
          cost: 35,
          cooldownTicks: 95,
          startupTicks: 10,
          durationTicks: 72,
          recoveryTicks: 16,
          tickInterval: 12,
          length: 6.0,
          halfWidth: 0.58,
          sweepMaxRad: (25 * Math.PI) / 180,
          sweepSpeed: 1.45,
          dmgPerTick: 5,
          buildingDmgPerTick: 20,
          ignites: true,
          cardText: 'ROAAAR!',
          color: '#7dff4f',
          coreColor: '#eaffdc'
        },
        ultimate: {
          id: 'meltdown_nova',
          name: 'MELTDOWN NOVA',
          kind: 'nova',
          cost: 100,
          chargeTicks: 40,
          recoveryTicks: 24,
          radius: 4.0,
          dmg: 90,
          instantFlattenTypes: ['house', 'shop'],
          cardText: 'KA-BOOM!',
          color: '#7dff4f',
          ringColor: '#ffd23f'
        }
      },
      colors: {
        body: '#5fbf6a',
        shade: '#3e8a47',
        belly: '#cfe8a8',
        accent: '#ff9a2e',
        eye: '#ffd23f'
      }
    },
    mongo: {
      id: 'mongo',
      name: 'MIGHTY MONGO',
      title: 'Eighth Wonder of the Wasteland',
      archetype: 'Grappler · Fast Climber',
      blurb: 'Climbs skyscrapers at 1.6x speed, hurls debris 1.3x farther, and crushes foes with Piledrivers.',
      hp: 1050,
      speed: 2.7,
      jump: 1.2,
      power: 1.0,
      defense: 1.0,
      fuelMax: 100,
      fuelRegen: 1.2,
      guard: 120,
      weight: 1.2,
      lightSpeedMult: 0.92,
      maxClimbTier: 2,
      climbSpeedMult: 1.6,
      throwMult: 1.3,
      radius: 0.64,
      height: 112,
      heavyMove: {
        name: 'CHEST-POUND SLAM',
        kind: 'slam',
        lunge: 0.35,
        radial: true,
        reach: 1.5,
        dmg: 20,
        stunTicks: 14
      },
      grabMove: {
        name: 'PILEDRIVER',
        throwDmg: 20,
        slamDmg: 28
      },
      specials: {
        special: {
          id: 'skyscraper_hurl',
          name: 'SKYSCRAPER HURL',
          kind: 'hurl',
          cost: 35,
          cooldownTicks: 92,
          startupTicks: 14,
          durationTicks: 16,
          recoveryTicks: 16,
          dmg: 54,
          pullRadius: 2.2,
          speed: 16.5,
          cardText: 'CRUNCH!',
          color: '#ff9a2e'
        },
        ultimate: {
          id: 'wasteland_rampage',
          name: 'WASTELAND RAMPAGE',
          kind: 'rush',
          cost: 100,
          chargeTicks: 16,
          durationTicks: 180,
          recoveryTicks: 18,
          dmg: 19,
          buildingMult: 2.0,
          speedMult: 1.65,
          hitCooldownTicks: 25,
          cardText: 'RAMPAGE!',
          color: '#ff6b57',
          ringColor: '#ff9a2e'
        }
      },
      colors: {
        body: '#9a6a3f',
        shade: '#6e4827',
        belly: '#d9b383',
        accent: '#a33333',
        eye: '#ffd23f'
      }
    },
    lepidora: {
      id: 'lepidora',
      name: 'LEPIDORA',
      title: 'Queen of the Night Skies',
      archetype: 'Speedy Glider · Zoner',
      blurb: 'Hold Space in mid-air to glide (+30% air attack dmg), blind foes with Scale Dust, or summon a Tornado.',
      hp: 930,
      speed: 4.1,
      jump: 1.0,
      power: 0.99,
      defense: 0.96,
      fuelMax: 100,
      fuelRegen: 2.6,
      guard: 88,
      weight: 0.7,
      lightSpeedMult: 1.16,
      maxClimbTier: 2,
      canGlide: true,
      glideMaxTicks: 90,
      glideFallMult: 0.25,
      glideSpeedMult: 1.2,
      glideAttackMult: 1.3,
      radius: 0.56,
      height: 104,
      heavyMove: {
        name: 'DIVE PECK',
        kind: 'dive_peck',
        lunge: 1.35,
        hopVz: 3.6,
        reach: 1.95,
        dmg: 27,
        recovery: 15
      },
      grabMove: {
        name: 'TALON SNATCH',
        aerialSnatch: true,
        throwDmg: 20,
        slamDmg: 24
      },
      specials: {
        special: {
          id: 'scale_dust',
          name: 'SCALE DUST CLOUD',
          kind: 'cloud',
          cost: 35,
          cooldownTicks: 90,
          startupTicks: 8,
          durationTicks: 240,
          recoveryTicks: 12,
          radius: 3.0,
          dmgPerSec: 4,
          slowMult: 0.65,
          cardText: 'FLUTTER!',
          color: '#d49eff'
        },
        ultimate: {
          id: 'moonlit_tornado',
          name: 'MOONLIT TORNADO',
          kind: 'vortex',
          cost: 100,
          chargeTicks: 18,
          durationTicks: 180,
          recoveryTicks: 20,
          radius: 3.0,
          pullRadius: 3.8,
          dmg: 70,
          tickDmg: 6,
          buildingTickDmg: 24,
          cardText: 'WHIRLWIND!',
          color: '#5ee6ff',
          ringColor: '#d49eff'
        }
      },
      colors: {
        body: '#9b6bd6',
        shade: '#68409e',
        belly: '#f6e8ff',
        accent: '#f2c14e',
        eye: '#5ee6ff'
      }
    },
    tin_colossus: {
      id: 'tin_colossus',
      name: 'TIN COLOSSUS',
      title: 'The Mechanical Menace',
      archetype: 'Armored Tank · Rocket Fist',
      blurb: 'Fire-immune powerhouse. Battery grants +10% dmg at >=50 fuel; Jet Hops onto roofs and fires Rocket Fist.',
      hp: 1090,
      speed: 2.0,
      jump: 0.7,
      power: 0.85,
      defense: 0.96,
      fuelMax: 100,
      fuelRegen: 1.0,
      guard: 145,
      weight: 1.6,
      lightSpeedMult: 0.72,
      maxClimbTier: 0,
      jetHop: true,
      batteryThreshold: 50,
      batteryDmgMult: 1.1,
      fireImmune: true,
      radius: 0.72,
      height: 120,
      heavyMove: {
        name: 'ROCKET FIST',
        kind: 'rocket_fist',
        range: 5.0,
        speed: 17.5,
        dmg: 30,
        startup: 18,
        recovery: 21
      },
      grabMove: {
        name: 'CRUSH HAMMER',
        throwDmg: 20,
        slamDmg: 26
      },
      specials: {
        special: {
          id: 'eye_ray',
          name: 'EYE RAY',
          kind: 'beam',
          twinBeam: true,
          setsFire: true,
          cost: 35,
          cooldownTicks: 90,
          startupTicks: 8,
          durationTicks: 54,
          recoveryTicks: 10,
          tickInterval: 9,
          length: 4.5,
          halfWidth: 0.72,
          sweepMaxRad: (32 * Math.PI) / 180,
          sweepSpeed: 1.8,
          dmgPerTick: 6,
          buildingDmgPerTick: 18,
          ignites: true,
          cardText: 'ZZAP!',
          color: '#ff3b3b',
          coreColor: '#ffe8a3'
        },
        ultimate: {
          id: 'overload_rampage',
          name: 'OVERLOAD',
          kind: 'nova',
          cost: 100,
          chargeTicks: 120,
          recoveryTicks: 24,
          radius: 3.5,
          dmg: 85,
          selfHpCostPct: 0.15,
          cardText: 'OVERLOAD!',
          color: '#ff4d5a',
          ringColor: '#5ee6ff'
        }
      },
      colors: {
        body: '#aab4be',
        shade: '#7e8a96',
        belly: '#ced6de',
        accent: '#c1272d',
        eye: '#ff3b3b'
      }
    }
  };
})();
