/* Kaiju Brawl - arena city layouts, building archetypes, palettes, and hazard configs. */
(function () {
  'use strict';
  window.KB = window.KB || {};

  /* Building archetype baseline stats from PLAN.md §6.3 */
  const ARCHETYPES = {
    house:       { w: 1.5, h: 1.5, maxHp: 120, climbTier: 0, zHeight: 54,  lootRolls: 1 },
    shop:        { w: 2.0, h: 1.5, maxHp: 180, climbTier: 0, zHeight: 66,  lootRolls: 2 },
    diner:       { w: 2.0, h: 1.5, maxHp: 180, climbTier: 0, zHeight: 60,  lootRolls: 2 },
    motel:       { w: 2.0, h: 1.5, maxHp: 180, climbTier: 0, zHeight: 62,  lootRolls: 2 },
    bunker:      { w: 2.0, h: 2.0, maxHp: 320, climbTier: 1, zHeight: 74,  lootRolls: 2 },
    radar_dish:  { w: 1.5, h: 1.5, maxHp: 180, climbTier: 1, zHeight: 108, lootRolls: 2 },
    silo:        { w: 1.5, h: 1.5, maxHp: 220, climbTier: 1, zHeight: 118, lootRolls: 2 },
    office:      { w: 2.0, h: 2.0, maxHp: 300, climbTier: 1, zHeight: 112, lootRolls: 3 },
    theater:     { w: 2.0, h: 2.0, maxHp: 300, climbTier: 1, zHeight: 98,  lootRolls: 3 },
    tower:       { w: 2.0, h: 2.0, maxHp: 480, climbTier: 2, zHeight: 164, lootRolls: 4, guaranteedGirder: true },
    gas_station: { w: 1.5, h: 1.5, maxHp: 160, climbTier: 0, zHeight: 52,  lootRolls: 1, explodes: true },
    water_tower: { w: 1.0, h: 1.0, maxHp: 200, climbTier: 1, zHeight: 124, lootRolls: 1, floods: true },
    landmark:    { w: 3.0, h: 3.0, maxHp: 700, climbTier: 2, zHeight: 148, lootRolls: 3 }
  };

  /*
   * Pinebrook, U.S.A. (20x20 tiles, 18 buildings):
   * - 2-tile central fighting lanes: x in [9, 11] and y in [9, 11]
   * - Player spawn SW: (2.2, 17.8), Challenger spawn NE: (17.8, 2.2) — >= 1.5 tiles clear
   */
  const PINEBROOK_BUILDINGS = [
    { id: 1,  type: 'house',       x: 1.5,  y: 1.5,  label: 'Maple St. House',     color: '#e8d7b8', roof: '#c45b4a' },
    { id: 2,  type: 'house',       x: 3.8,  y: 1.5,  label: 'Elm St. Bungalow',    color: '#cde3d8', roof: '#4e788a' },
    { id: 3,  type: 'house',       x: 1.5,  y: 4.0,  label: 'Oak Ave. Cottage',    color: '#f2dec0', roof: '#b56e3f' },
    { id: 4,  type: 'office',      x: 6.0,  y: 3.0,  label: 'Pinebrook Town Hall', color: '#d8cfb8', roof: '#5e6b78' },
    { id: 5,  type: 'shop',        x: 3.5,  y: 6.5,  label: 'Main St. Hardware',   color: '#d98a5b', roof: '#484f59' },
    { id: 6,  type: 'diner',       x: 6.0,  y: 7.0,  label: "Eat at Joe's Diner",  color: '#cfd8df', roof: '#c1272d' },
    { id: 7,  type: 'shop',        x: 12.0, y: 3.5,  label: 'Pinebrook Pharmacy',  color: '#e6c28b', roof: '#4a6b5e' },
    { id: 8,  type: 'house',       x: 14.3, y: 1.5,  label: 'Cedar Ln. Ranch',     color: '#e5d4c0', roof: '#7c5540' },
    { id: 9,  type: 'theater',     x: 12.0, y: 6.5,  label: 'Starlight Cinema',    color: '#c46c5c', roof: '#3c3a4f' },
    { id: 10, type: 'shop',        x: 15.0, y: 6.5,  label: 'Soda Fountain',       color: '#8bc4c9', roof: '#3e5d70' },
    { id: 11, type: 'house',       x: 1.2,  y: 11.5, label: 'Westside Cottage',    color: '#f2e3b9', roof: '#6e7e53' },
    { id: 12, type: 'gas_station', x: 6.5,  y: 11.5, label: 'Pinebrook Gas',       color: '#f5f2e8', roof: '#d6453a' },
    { id: 13, type: 'house',       x: 4.5,  y: 14.5, label: 'Birch St. Home',      color: '#d2deea', roof: '#506480' },
    { id: 14, type: 'house',       x: 6.8,  y: 16.5, label: 'South Ave. House',    color: '#ead0a8', roof: '#a84a40' },
    { id: 15, type: 'water_tower', x: 12.0, y: 12.0, label: 'Municipal Tank',      color: '#b8c4ce', roof: '#4a7a99' },
    { id: 16, type: 'house',       x: 16.5, y: 11.8, label: 'Eastbrook House',     color: '#e6d8be', roof: '#85583c' },
    { id: 17, type: 'office',      x: 12.0, y: 15.0, label: 'County Bank',         color: '#c9c4b5', roof: '#525861' },
    { id: 18, type: 'landmark',    x: 15.5, y: 15.5, label: 'Bijou Drive-In',      color: '#e8e0cc', roof: '#c1272d', isLandmark: true, landmarkKind: 'bijou_drive_in', guaranteedHealth: 2, scatterCars: true, collBox: { x0: 15.5, y0: 15.5, x1: 18.35, y1: 16.5 } }
  ];

  /*
   * Atom City, Nevada (20x20 tiles, 16 buildings):
   * - 2-tile central fighting lanes: x in [9, 11] and y in [9, 11]
   * - Rail spur along NW edge y in [0.9, 1.7], x in [1.0, 8.6]
   * - Player spawn SW: (2.2, 17.8), Challenger spawn NE: (17.8, 2.2) — >= 1.5 tiles clear
   */
  const ATOM_CITY_BUILDINGS = [
    { id: 1,  type: 'house',       x: 1.2,  y: 2.4,  label: 'Tract Pod A-1',     color: '#f4c7ab', roof: '#d97b59', style: 'tract' },
    { id: 2,  type: 'house',       x: 3.4,  y: 2.4,  label: 'Tract Pod A-2',     color: '#b8e0d2', roof: '#5b8e7d', style: 'tract' },
    { id: 3,  type: 'house',       x: 5.6,  y: 2.4,  label: 'Tract Pod A-3',     color: '#f7e1a0', roof: '#c48f3b', style: 'tract' },
    { id: 4,  type: 'motel',       x: 1.5,  y: 5.2,  label: 'Mushroom Motel',    color: '#f3d5b5', roof: '#d1495b' },
    { id: 5,  type: 'bunker',      x: 5.2,  y: 5.0,  label: 'Control Bunker',    color: '#a8a298', roof: '#6b665d' },
    { id: 6,  type: 'gas_station', x: 7.3,  y: 7.3,  label: 'Atomic Gas',        color: '#f5ebd6', roof: '#e05a47' },
    { id: 7,  type: 'radar_dish',  x: 11.8, y: 1.6,  label: 'Range Radar',       color: '#c4ccd4', roof: '#5a6b7c' },
    { id: 8,  type: 'office',      x: 13.8, y: 1.8,  label: 'Test Lab Beta',     color: '#d8ceb8', roof: '#6d5d4f' },
    { id: 9,  type: 'silo',        x: 16.4, y: 4.5,  label: 'Fuel Silo 7',       color: '#cfd4d8', roof: '#c45b4a' },
    { id: 10, type: 'shop',        x: 12.0, y: 5.5,  label: 'Range Commissary',  color: '#e6b89c', roof: '#7d4e57' },
    { id: 11, type: 'house',       x: 1.4,  y: 11.8, label: 'Tract Pod B-1',     color: '#c5d9e8', roof: '#4e788a', style: 'tract' },
    { id: 12, type: 'house',       x: 4.2,  y: 11.8, label: 'Tract Pod B-2',     color: '#f2d0d8', roof: '#a84a5c', style: 'tract' },
    { id: 13, type: 'radar_dish',  x: 6.8,  y: 12.2, label: 'Telemetry Dish',    color: '#bcc4cc', roof: '#5a6b7c' },
    { id: 14, type: 'bunker',      x: 5.5,  y: 15.6, label: 'Fallout Shelter',   color: '#9e978e', roof: '#5d574f' },
    { id: 15, type: 'silo',        x: 12.0, y: 12.2, label: 'Isotope Silo',      color: '#c9d0d6', roof: '#d17b3b' },
    { id: 16, type: 'landmark',    x: 15.2, y: 14.8, label: 'Observation Tower', color: '#d9d2c5', roof: '#ff9a2e', zHeight: 156, isLandmark: true, landmarkKind: 'observation_tower', guaranteedFuel: 2, overchargeAuraSec: 10 }
  ];

  /*
   * Metro Heights (22x18 tiles, 14 buildings):
   * - 2-tile central fighting lanes: x in [10, 12] and y in [8, 10]
   * - Elevated train track along north edge y in [0.35, 1.45] (clips north-edge towers at fy0=1.15)
   * - Player spawn SW: (2.2, 15.8), Challenger spawn NE: (19.8, 2.2) — >= 1.5 tiles clear
   */
  const METRO_HEIGHTS_BUILDINGS = [
    { id: 1,  type: 'tower',    x: 1.5,  y: 1.15, label: 'Midtown Exchange', color: '#5b6c85', roof: '#344154', artDeco: true },
    { id: 2,  type: 'office',   x: 4.4,  y: 1.8,  label: 'Metro Crane Site', color: '#6b7785', roof: '#454e59', hasCrane: true },
    { id: 3,  type: 'tower',    x: 7.2,  y: 1.15, label: 'Lexington Tower',  color: '#536278', roof: '#2d3748', artDeco: true },
    { id: 4,  type: 'shop',     x: 1.6,  y: 5.0,  label: 'Neon Bodega',      color: '#4c5870', roof: '#ff4f8b' },
    { id: 5,  type: 'office',   x: 6.2,  y: 4.8,  label: 'Daily Bugle Bldg', color: '#787e8a', roof: '#3e4451' },
    { id: 6,  type: 'tower',    x: 12.6, y: 1.8,  label: 'Chrysler Annex',   color: '#64758c', roof: '#98a9bf', artDeco: true },
    { id: 7,  type: 'office',   x: 15.4, y: 2.0,  label: 'Harbor Authority', color: '#566475', roof: '#36414f' },
    { id: 8,  type: 'diner',    x: 13.0, y: 5.2,  label: 'Midnight Diner',   color: '#455166', roof: '#5ee6ff' },
    { id: 9,  type: 'tower',    x: 18.2, y: 4.8,  label: 'Pier 9 Plaza',     color: '#5f6f85', roof: '#374457', artDeco: true },
    { id: 10, type: 'office',   x: 1.6,  y: 10.6, label: 'Westside Loft',    color: '#616d80', roof: '#3b4352' },
    { id: 11, type: 'tower',    x: 5.8,  y: 10.8, label: 'Gilded Tower',     color: '#6a7587', roof: '#c9a24b', artDeco: true },
    { id: 12, type: 'office',   x: 5.6,  y: 14.2, label: 'Metro Power',      color: '#525e70', roof: '#ff9a2e', hasCrane: true },
    { id: 13, type: 'tower',    x: 13.0, y: 11.2, label: 'Neon Plaza',       color: '#4e5c73', roof: '#5ee6ff', artDeco: true },
    { id: 14, type: 'landmark', x: 16.8, y: 13.4, label: 'Empire Spire',     color: '#6d7a8c', roof: '#ffd23f', zHeight: 186, isLandmark: true, landmarkKind: 'empire_spire', artDeco: true, meltdownFuelBoost: 50 }
  ];

  /*
   * Caldera Island (22x22 octagonal arena, bevel: 5.2, 14 buildings):
   * - 2-tile central fighting lanes: x in [10, 12] and y in [10, 12]
   * - Player spawn SW: (4.2, 17.8), Challenger spawn NE: (17.8, 4.2) — inside bevel & >= 12 tiles apart
   */
  const CALDERA_ISLE_BUILDINGS = [
    { id: 1,  type: 'bunker',      x: 6.2,  y: 2.2,  label: 'North Rim Bunker',        color: '#8e867c', roof: '#58524a' },
    { id: 2,  type: 'radar_dish',  x: 12.6, y: 2.2,  label: 'Caldera Telemetry',       color: '#bcc4cc', roof: '#c45b4a' },
    { id: 3,  type: 'silo',        x: 3.4,  y: 5.5,  label: 'Geothermal Silo A',       color: '#c7b8a1', roof: '#d17b3b' },
    { id: 4,  type: 'office',      x: 6.8,  y: 5.8,  label: 'Basalt Lab North',        color: '#c9c1b4', roof: '#5a6670' },
    { id: 5,  type: 'bunker',      x: 12.6, y: 5.6,  label: 'Magma Core Shield',       color: '#9a9186', roof: '#645c53' },
    { id: 6,  type: 'gas_station', x: 16.0, y: 6.8,  label: 'Heli-Fuel Depot',         color: '#f2e8d5', roof: '#d6453a' },
    { id: 7,  type: 'house',       x: 2.4,  y: 8.2,  label: 'Field Barracks 1',        color: '#d9c5a0', roof: '#6b7d5c', style: 'tract' },
    { id: 8,  type: 'motel',       x: 6.2,  y: 8.2,  label: 'Tiki Lava Lodge',         color: '#e3b778', roof: '#b54a35' },
    { id: 9,  type: 'shop',        x: 16.2, y: 12.4, label: 'Supply Quonset',          color: '#b8c4bc', roof: '#4e6358' },
    { id: 10, type: 'radar_dish',  x: 2.4,  y: 12.4, label: 'Seismic Dish West',       color: '#c4ccd4', roof: '#5a6b7c' },
    { id: 11, type: 'office',      x: 6.8,  y: 12.6, label: 'Thermal Plant',           color: '#b5ada2', roof: '#ff9a2e' },
    { id: 12, type: 'silo',        x: 12.6, y: 12.8, label: 'Geothermal Silo B',       color: '#c9d0d6', roof: '#c45b4a' },
    { id: 13, type: 'bunker',      x: 7.4,  y: 16.4, label: 'South Rim Outpost',       color: '#968e84', roof: '#5b554d' },
    { id: 14, type: 'landmark',    x: 12.6, y: 15.6, label: 'Volcano Seismograph Lab', color: '#dcd4c6', roof: '#ff6b57', zHeight: 154, isLandmark: true, landmarkKind: 'seismograph_lab', guaranteedFuel: 2, guaranteedHealth: 1 }
  ];

  /*
   * Harbor Pier 54 (24x16 waterfront strip, bevel: 1.2, 15 buildings):
   * - 2-tile central fighting lanes: x in [11, 13] and y in [7, 9]
   * - Player spawn SW: (2.5, 13.5), Challenger spawn NE: (21.5, 2.5)
   */
  const HARBOR_PIER_BUILDINGS = [
    { id: 1,  type: 'office',      x: 1.6,  y: 1.6,  label: 'Pier 54 Customs',       color: '#6e7f91', roof: '#3d4a59', hasCrane: true },
    { id: 2,  type: 'shop',        x: 4.8,  y: 1.6,  label: 'Dockworker Diner',      color: '#c97b63', roof: '#47525e' },
    { id: 3,  type: 'bunker',      x: 8.0,  y: 1.6,  label: 'Cold Storage A',        color: '#a3b1bf', roof: '#546575' },
    { id: 4,  type: 'office',      x: 1.6,  y: 4.5,  label: 'Stevedore Union',       color: '#8c7a6b', roof: '#4a433d' },
    { id: 5,  type: 'tower',       x: 5.2,  y: 4.5,  label: 'Harbor Control Tower',  color: '#5f738a', roof: '#2e3c4d', artDeco: true },
    { id: 6,  type: 'gas_station', x: 8.6,  y: 4.8,  label: 'Marine Fuel Dock',      color: '#f0ead8', roof: '#d6453a' },
    { id: 7,  type: 'office',      x: 13.8, y: 1.6,  label: 'Cargo Terminal 1',      color: '#63768a', roof: '#ff9a2e', hasCrane: true },
    { id: 8,  type: 'bunker',      x: 17.2, y: 1.6,  label: 'Bonded Warehouse',      color: '#87939e', roof: '#49545e' },
    { id: 9,  type: 'diner',       x: 13.8, y: 4.8,  label: 'Barnacle Galley',       color: '#7aa6b8', roof: '#c1272d' },
    { id: 10, type: 'office',      x: 17.2, y: 4.6,  label: 'Gantry Crane Hub',      color: '#58697a', roof: '#ffd23f', hasCrane: true },
    { id: 11, type: 'shop',        x: 2.0,  y: 9.6,  label: 'Bait & Tackle Co.',     color: '#6b9080', roof: '#3b5249' },
    { id: 12, type: 'office',      x: 5.4,  y: 9.6,  label: 'Drydock Machine Shop',  color: '#7d8590', roof: '#424952', hasCrane: true },
    { id: 13, type: 'water_tower', x: 8.8,  y: 9.8,  label: 'Ballast Water Tank',    color: '#9eb3c2', roof: '#3d6b88' },
    { id: 14, type: 'tower',       x: 14.0, y: 9.8,  label: 'Maritime Exchange',     color: '#52657a', roof: '#5ee6ff', artDeco: true },
    { id: 15, type: 'landmark',    x: 18.2, y: 10.6, label: 'Harbor Lighthouse',     color: '#f2ece1', roof: '#c1272d', zHeight: 168, isLandmark: true, landmarkKind: 'harbor_lighthouse', guaranteedHealth: 2, overchargeAuraSec: 10 }
  ];

  function createHazardState(def) {
    if (def.id === 'atom_city') {
      return {
        kind: 'siren',
        interval: 25.0,
        warnLead: 2.5,
        timer: 0,
        telegraphed: false,
        boostTimer: 0,
        flashTimer: 0,
        waveTimer: 0,
        pulseCount: 0
      };
    }
    if (def.id === 'metro_heights') {
      return {
        kind: 'train',
        interval: 30.0,
        warnLead: 3.0,
        timer: 0,
        state: 'idle', // 'idle' | 'warning' | 'crossing'
        trackY0: 0.35,
        trackY1: 1.45,
        trainX: -4.0,
        trainLen: 5.2,
        trainSpeed: 18.0,
        passCount: 0,
        hitIds: []
      };
    }
    if (def.id === 'caldera_isle') {
      return {
        kind: 'fissure',
        interval: 28.0,
        warnLead: 2.8,
        timer: 0,
        telegraphed: false,
        activeTimer: 0,
        eruptCount: 0,
        vents: [
          { x: 11.0, y: 2.6 },
          { x: 19.2, y: 11.0 },
          { x: 11.0, y: 19.2 }
        ]
      };
    }
    if (def.id === 'harbor_pier') {
      return {
        kind: 'broadside',
        interval: 30.0,
        warnLead: 3.0,
        timer: 0,
        telegraphed: false,
        activeTimer: 0,
        salvoCount: 0,
        targets: [
          { x: 6.5,  y: 13.8 },
          { x: 12.0, y: 13.8 },
          { x: 17.2, y: 13.8 }
        ]
      };
    }
    return { kind: 'none' };
  }

  function buildCity(def) {
    const buildings = def.buildings.map(function (b) {
      const arch = ARCHETYPES[b.type] || ARCHETYPES.house;
      const zH = b.zHeight || arch.zHeight;
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
        style: b.style || null,
        artDeco: !!b.artDeco,
        hasCrane: !!b.hasCrane,
        isLandmark: !!b.isLandmark,
        landmarkKind: b.landmarkKind || null,
        fx0: b.x,
        fy0: b.y,
        fx1: b.x + arch.w,
        fy1: b.y + arch.h,
        collBox: collBox,
        w: arch.w,
        h: arch.h,
        zBase: 0,
        zTop: zH,
        maxZTop: zH,
        maxHp: arch.maxHp,
        hp: arch.maxHp,
        climbTier: arch.climbTier,
        lootRolls: arch.lootRolls || 1,
        guaranteedGirder: !!arch.guaranteedGirder,
        guaranteedHealth: b.guaranteedHealth || 0,
        guaranteedFuel: b.guaranteedFuel || 0,
        overchargeAuraSec: b.overchargeAuraSec || 0,
        meltdownFuelBoost: b.meltdownFuelBoost || 0,
        scatterCars: !!b.scatterCars,
        explodes: !!arch.explodes,
        floods: !!arch.floods,
        state: 'intact',
        color: b.color,
        roof: b.roof,
        hitFlash: 0,
        shakeT: 0,
        crackTicks: 0,
        collapseTick: 0,
        collapseStartZ: zH,
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
      bevel: def.bevel || 1.2,
      spawns: def.spawns,
      roads: def.roads,
      railSpur: def.railSpur ? { x0: def.railSpur.x0, y0: def.railSpur.y0, x1: def.railSpur.x1, y1: def.railSpur.y1 } : null,
      elevatedTrack: def.elevatedTrack ? { y0: def.elevatedTrack.y0, y1: def.elevatedTrack.y1 } : null,
      palette: def.palette,
      buildings: buildings,
      startProps: (def.startProps || []).map(function (p) { return { type: p.type, x: p.x, y: p.y }; }),
      slowZones: [],
      hazard: createHazardState(def),
      sirenBoostTimer: 0
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
        player: { x: 2.5, y: 17.5 },
        enemy: { x: 17.5, y: 2.5 }
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
        { type: 'lamp',   x: 9.2,  y: 13.8 },
        { type: 'car',    x: 9.8,  y: 5.2 },
        { type: 'bus',    x: 14.2, y: 9.8 },
        { type: 'lamp',   x: 5.2,  y: 9.8 },
        { type: 'girder', x: 10.2, y: 2.4 }
      ],
      buildings: PINEBROOK_BUILDINGS
    },
    atom_city: {
      id: 'atom_city',
      name: 'ATOM CITY, NEVADA',
      subtitle: 'Atomic Test Range & Siren',
      cols: 20,
      rows: 20,
      spawns: { player: { x: 2.5, y: 17.5 }, enemy: { x: 17.5, y: 2.5 } },
      roads: { vertical: [{ x0: 9, x1: 11 }], horizontal: [{ y0: 9, y1: 11 }] },
      railSpur: { x0: 0.8, y0: 0.9, x1: 8.8, y1: 1.7 },
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
      startProps: [
        { type: 'boxcar',  x: 4.5,  y: 1.3 },
        { type: 'tanker',  x: 15.2, y: 7.6 },
        { type: 'girder',  x: 10.2, y: 14.5 },
        { type: 'jeep',    x: 8.4,  y: 12.6 },
        { type: 'lamp',    x: 9.3,  y: 6.2 },
        { type: 'boulder', x: 3.6,  y: 9.8 },
        { type: 'jeep',    x: 14.6, y: 9.8 }
      ],
      buildings: ATOM_CITY_BUILDINGS
    },
    metro_heights: {
      id: 'metro_heights',
      name: 'METRO HEIGHTS',
      subtitle: 'Neon Skyline & Elevated Train',
      cols: 22,
      rows: 18,
      spawns: { player: { x: 2.5, y: 15.5 }, enemy: { x: 19.5, y: 2.5 } },
      roads: { vertical: [{ x0: 10, x1: 12 }], horizontal: [{ y0: 8, y1: 10 }] },
      elevatedTrack: { y0: 0.35, y1: 1.45 },
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
      startProps: [
        { type: 'container', x: 19.6, y: 7.4 },
        { type: 'bus',       x: 10.6, y: 13.6 },
        { type: 'taxi',      x: 8.6,  y: 8.8 },
        { type: 'girder',    x: 4.8,  y: 4.4 },
        { type: 'tanker',    x: 11.2, y: 4.2 },
        { type: 'taxi',      x: 15.4, y: 8.8 },
        { type: 'lamp',      x: 10.8, y: 8.8 },
        { type: 'container', x: 4.2,  y: 8.8 }
      ],
      buildings: METRO_HEIGHTS_BUILDINGS
    },
    caldera_isle: {
      id: 'caldera_isle',
      name: 'CALDERA ISLAND',
      subtitle: 'Octagonal Volcano & Magma Ring',
      cols: 22,
      rows: 22,
      bevel: 5.2,
      spawns: { player: { x: 4.2, y: 17.8 }, enemy: { x: 17.8, y: 4.2 } },
      roads: { vertical: [{ x0: 10, x1: 12 }], horizontal: [{ y0: 10, y1: 12 }] },
      palette: {
        skyTop: '#4a1818',
        skyMid: '#9e3828',
        skyBot: '#ff9a4f',
        hillFar: '#3d1d1a',
        hillNear: '#2b1412',
        grassA: '#544a43',
        grassB: '#494039',
        sidewalk: '#8a7f74',
        road: '#36302c',
        roadEdge: '#26211e',
        lane: '#ff9a2e',
        curb: '#6e2b1c'
      },
      startProps: [
        { type: 'boulder', x: 11.0, y: 6.5 },
        { type: 'boulder', x: 6.5,  y: 11.0 },
        { type: 'tanker',  x: 11.0, y: 14.8 },
        { type: 'girder',  x: 14.8, y: 11.0 },
        { type: 'jeep',    x: 5.5,  y: 15.2 },
        { type: 'boulder', x: 15.2, y: 5.2 },
        { type: 'jeep',    x: 10.6, y: 10.6 }
      ],
      buildings: CALDERA_ISLE_BUILDINGS
    },
    harbor_pier: {
      id: 'harbor_pier',
      name: 'HARBOR PIER 54',
      subtitle: 'Waterfront Docks & Destroyer Fleet',
      cols: 24,
      rows: 16,
      bevel: 1.2,
      spawns: { player: { x: 2.5, y: 13.5 }, enemy: { x: 21.5, y: 2.5 } },
      roads: { vertical: [{ x0: 11, x1: 13 }], horizontal: [{ y0: 7, y1: 9 }] },
      palette: {
        skyTop: '#1c3b57',
        skyMid: '#3d6e8f',
        skyBot: '#a9cce3',
        hillFar: '#284b63',
        hillNear: '#1d3549',
        grassA: '#6c757d',
        grassB: '#5f676e',
        sidewalk: '#9ba3ab',
        road: '#383e45',
        roadEdge: '#262b30',
        lane: '#ffd23f',
        curb: '#1f3a4d'
      },
      startProps: [
        { type: 'container', x: 4.5,  y: 8.0 },
        { type: 'container', x: 19.8, y: 6.8 },
        { type: 'tanker',    x: 10.2, y: 5.6 },
        { type: 'girder',    x: 12.0, y: 11.8 },
        { type: 'bus',       x: 7.6,  y: 13.2 },
        { type: 'container', x: 16.6, y: 8.2 },
        { type: 'girder',    x: 11.8, y: 3.6 },
        { type: 'taxi',      x: 15.2, y: 13.4 }
      ],
      buildings: HARBOR_PIER_BUILDINGS
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
