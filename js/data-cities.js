/* Kaiju Brawl - arena city layouts, building archetypes, and palettes (M1: Pinebrook). */
(function () {
  'use strict';
  window.KB = window.KB || {};

  /* Building archetype baseline stats from PLAN.md §6.3 */
  const ARCHETYPES = {
    house:       { w: 1.5, h: 1.5, maxHp: 120, climbTier: 0, zHeight: 54,  lootRolls: 1 },
    shop:        { w: 2.0, h: 1.5, maxHp: 180, climbTier: 0, zHeight: 66,  lootRolls: 2 },
    diner:       { w: 2.0, h: 1.5, maxHp: 180, climbTier: 0, zHeight: 60,  lootRolls: 2 },
    office:      { w: 2.0, h: 2.0, maxHp: 300, climbTier: 1, zHeight: 112, lootRolls: 3 },
    theater:     { w: 2.0, h: 2.0, maxHp: 300, climbTier: 1, zHeight: 98,  lootRolls: 3 },
    tower:       { w: 2.0, h: 2.0, maxHp: 480, climbTier: 2, zHeight: 164, lootRolls: 4, guaranteedGirder: true },
    gas_station: { w: 1.5, h: 1.5, maxHp: 160, climbTier: 0, zHeight: 52,  lootRolls: 1, explodes: true },
    water_tower: { w: 1.0, h: 1.0, maxHp: 200, climbTier: 1, zHeight: 124, lootRolls: 1, floods: true },
    landmark:    { w: 3.0, h: 3.0, maxHp: 700, climbTier: 2, zHeight: 132, lootRolls: 3, guaranteedHealth: 2 }
  };

  /*
   * Pinebrook, U.S.A. (20x20 tiles, 18 buildings):
   * - 2-tile central fighting lanes: x in [9, 11] and y in [9, 11]
   * - Player spawn SW: (2.2, 17.8), Challenger spawn NE: (17.8, 2.2) — >= 1.5 tiles clear
   */
  const PINEBROOK_BUILDINGS = [
    { id: 1,  type: 'house',       x: 1.5,  y: 1.5,  label: 'Maple St. House',    color: '#e8d7b8', roof: '#c45b4a' },
    { id: 2,  type: 'house',       x: 3.8,  y: 1.5,  label: 'Elm St. Bungalow',   color: '#cde3d8', roof: '#4e788a' },
    { id: 3,  type: 'house',       x: 1.5,  y: 4.0,  label: 'Oak Ave. Cottage',   color: '#f2dec0', roof: '#b56e3f' },
    { id: 4,  type: 'office',      x: 6.0,  y: 3.0,  label: 'Pinebrook Town Hall',color: '#d8cfb8', roof: '#5e6b78' },
    { id: 5,  type: 'shop',        x: 3.5,  y: 6.5,  label: 'Main St. Hardware',  color: '#d98a5b', roof: '#484f59' },
    { id: 6,  type: 'diner',       x: 6.0,  y: 7.0,  label: "Eat at Joe's Diner", color: '#cfd8df', roof: '#c1272d' },
    { id: 7,  type: 'shop',        x: 12.0, y: 3.5,  label: 'Pinebrook Pharmacy', color: '#e6c28b', roof: '#4a6b5e' },
    { id: 8,  type: 'house',       x: 14.3, y: 1.5,  label: 'Cedar Ln. Ranch',    color: '#e5d4c0', roof: '#7c5540' },
    { id: 9,  type: 'theater',     x: 12.0, y: 6.5,  label: 'Starlight Cinema',   color: '#c46c5c', roof: '#3c3a4f' },
    { id: 10, type: 'shop',        x: 15.0, y: 6.5,  label: 'Soda Fountain',      color: '#8bc4c9', roof: '#3e5d70' },
    { id: 11, type: 'house',       x: 1.2,  y: 11.5, label: 'Westside Cottage',   color: '#f2e3b9', roof: '#6e7e53' },
    { id: 12, type: 'gas_station', x: 6.5,  y: 11.5, label: 'Pinebrook Gas',      color: '#f5f2e8', roof: '#d6453a' },
    { id: 13, type: 'house',       x: 4.5,  y: 14.5, label: 'Birch St. Home',     color: '#d2deea', roof: '#506480' },
    { id: 14, type: 'house',       x: 6.8,  y: 16.5, label: 'South Ave. House',   color: '#ead0a8', roof: '#a84a40' },
    { id: 15, type: 'water_tower', x: 12.0, y: 12.0, label: 'Municipal Tank',     color: '#b8c4ce', roof: '#4a7a99' },
    { id: 16, type: 'house',       x: 16.5, y: 11.8, label: 'Eastbrook House',    color: '#e6d8be', roof: '#85583c' },
    { id: 17, type: 'office',      x: 12.0, y: 15.0, label: 'County Bank',        color: '#c9c4b5', roof: '#525861' },
    { id: 18, type: 'landmark',    x: 15.5, y: 15.5, label: 'Bijou Drive-In',     color: '#e8e0cc', roof: '#c1272d', isLandmark: true, collBox: { x0: 15.5, y0: 15.5, x1: 18.35, y1: 16.5 } }
  ];

  function buildCity(def) {
    const buildings = def.buildings.map(function (b) {
      const arch = ARCHETYPES[b.type] || ARCHETYPES.house;
      const collBox = b.collBox ? {
        x0: b.collBox.x0,
        y0: b.collBox.y0,
        x1: b.collBox.x1,
        y1: b.collBox.y1
      } : null;
      return {
        id: b.id,
        kind: 'building',
        type: b.type,
        label: b.label,
        isLandmark: !!b.isLandmark,
        fx0: b.x,
        fy0: b.y,
        fx1: b.x + arch.w,
        fy1: b.y + arch.h,
        collBox: collBox,
        w: arch.w,
        h: arch.h,
        zBase: 0,
        zTop: arch.zHeight,
        maxZTop: arch.zHeight,
        maxHp: arch.maxHp,
        hp: arch.maxHp,
        climbTier: arch.climbTier,
        lootRolls: arch.lootRolls || 1,
        guaranteedGirder: !!arch.guaranteedGirder,
        guaranteedHealth: arch.guaranteedHealth || 0,
        explodes: !!arch.explodes,
        floods: !!arch.floods,
        state: 'intact',
        color: b.color,
        roof: b.roof,
        hitFlash: 0,
        shakeT: 0,
        crackTicks: 0,
        collapseTick: 0,
        collapseStartZ: arch.zHeight,
        seed: b.id * 97 + 13,
        screenPad: 14
      };
    });

    return {
      id: def.id,
      name: def.name,
      subtitle: def.subtitle,
      cols: def.cols,
      rows: def.rows,
      spawns: def.spawns,
      roads: def.roads,
      palette: def.palette,
      buildings: buildings,
      startProps: def.startProps || [
        { type: 'car',    x: 3.2,  y: 15.8 },
        { type: 'girder', x: 10.2, y: 15.0 },
        { type: 'tanker', x: 8.5,  y: 12.3 },
        { type: 'lamp',   x: 9.2,  y: 14.0 }
      ],
      slowZones: []
    };
  }

  const CITY_DEFS = {
    pinebrook: {
      id: 'pinebrook',
      name: 'PINEBROOK, U.S.A.',
      subtitle: 'Sunny Suburban Main Street',
      cols: 20,
      rows: 20,
      spawns: {
        player: { x: 2.2, y: 17.8 },
        enemy: { x: 17.8, y: 2.2 }
      },
      roads: {
        vertical: [{ x0: 9, x1: 11 }],
        horizontal: [{ y0: 9, y1: 11 }]
      },
      palette: {
        skyTop: '#4ea2dc',
        skyMid: '#7fc8f8',
        skyBot: '#d9f0ff',
        hillFar: '#4c8a6e',
        hillNear: '#3b7359',
        grassA: '#6fbf5a',
        grassB: '#66b452',
        sidewalk: '#b5b1a1',
        road: '#52565e',
        roadEdge: '#3e4249',
        lane: '#ffd23f',
        curb: '#2d3f33'
      },
      startProps: [
        { type: 'car',    x: 3.1,  y: 15.6 },
        { type: 'girder', x: 10.2, y: 15.2 },
        { type: 'tanker', x: 8.6,  y: 12.2 },
        { type: 'lamp',   x: 9.2,  y: 13.8 }
      ],
      buildings: PINEBROOK_BUILDINGS
    },
    atom_city: {
      id: 'atom_city',
      name: 'ATOM CITY, NEVADA',
      subtitle: 'Test Range Boomtown (M9)',
      cols: 20,
      rows: 20,
      spawns: { player: { x: 2.2, y: 17.8 }, enemy: { x: 17.8, y: 2.2 } },
      roads: { vertical: [{ x0: 9, x1: 11 }], horizontal: [{ y0: 9, y1: 11 }] },
      palette: {
        skyTop: '#c1553a',
        skyMid: '#ffb36b',
        skyBot: '#ffe2ad',
        hillFar: '#944a38',
        hillNear: '#75392c',
        grassA: '#e5c07b',
        grassB: '#dab36d',
        sidewalk: '#c7b89c',
        road: '#5c5550',
        roadEdge: '#47403b',
        lane: '#f4d694',
        curb: '#694e36'
      },
      buildings: PINEBROOK_BUILDINGS
    },
    metro_heights: {
      id: 'metro_heights',
      name: 'METRO HEIGHTS',
      subtitle: 'Neon Skyline at Midnight (M9)',
      cols: 22,
      rows: 18,
      spawns: { player: { x: 2.2, y: 15.8 }, enemy: { x: 19.8, y: 2.2 } },
      roads: { vertical: [{ x0: 10, x1: 12 }], horizontal: [{ y0: 8, y1: 10 }] },
      palette: {
        skyTop: '#070c22',
        skyMid: '#0b1230',
        skyBot: '#1c244f',
        hillFar: '#11193b',
        hillNear: '#19224d',
        grassA: '#2a3342',
        grassB: '#252d3b',
        sidewalk: '#586375',
        road: '#202631',
        roadEdge: '#151921',
        lane: '#5ee6ff',
        curb: '#131924'
      },
      buildings: PINEBROOK_BUILDINGS
    }
  };

  KB.CITIES = {
    ARCHETYPES: ARCHETYPES,
    DEFS: CITY_DEFS,
    create: function (cityId) {
      return buildCity(CITY_DEFS[cityId] || CITY_DEFS.pinebrook);
    }
  };
})();
