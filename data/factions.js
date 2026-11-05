/**
 * FACTIONS — Pure data. 10 faction.
 * 
 * FIX v4: Data-driven power modifiers.
 *   - powerFormula: null = pakai CONFIG.POWER.BASE_FORMULA
 *   - powerModifiers: array of { type, key, multiplier }
 */
'use strict';

var FACTIONS = [

    /* ==================================================================== */
    /* 0. INFERNO                                                           */
    /* ==================================================================== */
    {
        id: 0,
        name: "Inferno",
        key: "inferno",
        icon: { glyph: '\ue010', unicode: '🔥', color: '#ff2a2a' },
        baseStats: { att: 80, res: 30, spr: 40 },
        powerFormula: null,
        powerModifiers: [
            // Immune ke hazard sendiri
            { type: 'hazard', key: 'inferno',   multiplier: 1.0 },
            // Penalti standar ke hazard lain
            { type: 'hazard', key: 'ices',      multiplier: 0.6 },
            { type: 'hazard', key: 'poison',    multiplier: 0.6 },
            { type: 'hazard', key: 'sickening', multiplier: 0.6 }
        ],
        ability: {
            onTick: ['infernoBurnTick'],
            onAttackSuccess: ['infernoIgnite'],
            onRenderVFX: ['infernoFireVisual']
        },
        partData: {
            infernoBurnTick: { spreadChance: 0.5, diminishRate: 15 }
        },
        params: {
            isHazard: true,
            layerMax: 100,
            decay: 10,
            vfx: {
                c1: 0xff2a2a, c2: 0xff8800, c3: 0xffcc00,
                spd1: 15, spd2: 20, spd3: 10,
                sz1: 0.5, sz2: 0.6, sz3: 0.4
            }
        },
        maxBudget: 10,
        rarity: 'starter',
        descShort: "Wildfire spread",
        descLong: "Attacks ignite enemies. Fire burns over time."
    },

    /* ==================================================================== */
    /* 1. ICES                                                              */
    /* ==================================================================== */
    {
        id: 1,
        name: "Ices",
        key: "ices",
        icon: { glyph: '\ue011', unicode: '❄️', color: '#2a9dff' },
        baseStats: { att: 30, res: 80, spr: 40 },
        powerFormula: null,
        powerModifiers: [
            { type: 'hazard', key: 'ices',      multiplier: 1.0 },
            { type: 'hazard', key: 'inferno',   multiplier: 0.6 },
            { type: 'hazard', key: 'poison',    multiplier: 0.6 },
            { type: 'hazard', key: 'sickening', multiplier: 0.6 }
        ],
        ability: {
            onAttackSuccess: ['icesFrostNova'],
            onDefendCalc: ['icesColdAura'],
            onRenderVFX: ['icesFrostVisual']
        },
        partData: {
            icesColdAura: { allyDefBonus: 10 }
        },
        params: {
            isHazard: true,
            layerMax: 100,
            decay: 15,
            vfx: { cFill: 0x00ffff, aFill: 300, shockC: '#00ffff' }
        },
        maxBudget: 10,
        rarity: 'starter',
        descShort: "Frost Nova",
        descLong: "Releases chilling nova. Boosts defense when grouped."
    },

    /* ==================================================================== */
    /* 2. MECHA                                                             */
    /* ==================================================================== */
    {
        id: 2,
        name: "Mecha",
        key: "mecha",
        icon: { glyph: '\ue012', unicode: '🤖', color: '#aaaaaa' },
        baseStats: { att: 60, res: 60, spr: 30 },
        powerFormula: null,
        powerModifiers: [
            // Non-hazard faction — kena semua hazard 0.6
            { type: 'hazard', key: 'inferno',   multiplier: 0.6 },
            { type: 'hazard', key: 'ices',      multiplier: 0.6 },
            { type: 'hazard', key: 'poison',    multiplier: 0.6 },
            { type: 'hazard', key: 'sickening', multiplier: 0.6 }
        ],
        ability: {
            onDefendCalc: ['mechaPhalanxDef'],
            onRenderTileLogic: ['mechaGridVisual']
        },
        partData: {
            mechaPhalanxDef: { allyDefBonus: 10 }
        },
        params: {
            vfx: { cOut: 0x00ffff, spd: 5, aBase: 0.3, aRnd: 0.5, pad: 2 }
        },
        maxBudget: 10,
        rarity: 'starter',
        descShort: "Phalanx Grid",
        descLong: "Gains defensive power for every adjacent Mecha ally."
    },

    /* ==================================================================== */
    /* 3. BASTION                                                           */
    /* ==================================================================== */
    {
        id: 3,
        name: "Bastion",
        key: "bastion",
        icon: { glyph: '\ue013', unicode: '🏰', color: '#8b4513' },
        baseStats: { att: 40, res: 80, spr: 20 },
        powerFormula: null,
        powerModifiers: [
            { type: 'hazard', key: 'inferno',   multiplier: 0.6 },
            { type: 'hazard', key: 'ices',      multiplier: 0.6 },
            { type: 'hazard', key: 'poison',    multiplier: 0.6 },
            { type: 'hazard', key: 'sickening', multiplier: 0.6 }
        ],
        ability: {
            onTick: ['bastionShieldBuild'],
            onDefendCalc: ['bastionShieldDef'],
            onRenderTileLogic: ['bastionShieldVisual']
        },
        partData: {
            bastionShieldBuild: { buildRate: 15, maxShield: 100 }
        },
        params: {
            vfx: { cBase: 0x8b4513, cLine: 0xffaa00 }
        },
        maxBudget: 10,
        rarity: 'starter',
        descShort: "Fortification",
        descLong: "Generates hard-light shields. Shield adds to defense."
    },

    /* ==================================================================== */
    /* 4. CUBE                                                              */
    /* ==================================================================== */
    {
        id: 4,
        name: "Cube",
        key: "cube",
        icon: { glyph: '\ue014', unicode: '⬛', color: '#00ffcc' },
        baseStats: { att: 60, res: 40, spr: 50 },
        powerFormula: null,
        powerModifiers: [
            { type: 'hazard', key: 'inferno',   multiplier: 0.6 },
            { type: 'hazard', key: 'ices',      multiplier: 0.6 },
            { type: 'hazard', key: 'poison',    multiplier: 0.8 },
            { type: 'hazard', key: 'sickening', multiplier: 0.6 }
        ],
        ability: {
            onAttackSuccess: ['cubeFormationDetect'],
            onRenderTileLogic: ['cubeCornerMark']
        },
        partData: {},
        params: {
            vfx: { shockC: '#00ffcc' }
        },
        maxBudget: 10,
        rarity: 'starter',
        descShort: "2x2 Sky Drop",
        descLong: "2x2 formation drops a monolith, causing 3x3 shockwave."
    },

    /* ==================================================================== */
    /* 5. GLITCH                                                            */
    /* ==================================================================== */
    {
        id: 5,
        name: "Glitch",
        key: "glitch",
        icon: { glyph: '\ue015', unicode: '👾', color: '#ff00ff' },
        baseStats: { att: 60, res: 40, spr: 60 },
        powerFormula: null,
        powerModifiers: [
            { type: 'hazard', key: 'inferno',   multiplier: 0.6 },
            { type: 'hazard', key: 'ices',      multiplier: 0.6 },
            { type: 'hazard', key: 'poison',    multiplier: 0.6 },
            { type: 'hazard', key: 'sickening', multiplier: 0.6 }
        ],
        ability: {
            onTick: ['glitchDiagSpread'],
            onRenderTileLogic: ['glitchPixelVisual']
        },
        partData: {
            glitchDiagSpread: { anomalyChance: 0.01 }
        },
        params: {
            vfx: { c1: 0xff00ff, c2: 0x00ffff, rate: 0.1, off: 4 }
        },
        maxBudget: 10,
        rarity: 'starter',
        descShort: "Diag. Spread",
        descLong: "Spreads DIAGONALLY. Chance to shift orthogonally (anomaly)."
    },

    /* ==================================================================== */
    /* 6. SICKENING                                                         */
    /* ==================================================================== */
    {
        id: 6,
        name: "Sickening",
        key: "sickening",
        icon: { glyph: '\ue016', unicode: '🤢', color: '#a3cc29' },
        baseStats: { att: 30, res: 50, spr: 60 },
        powerFormula: null,
        powerModifiers: [
            { type: 'hazard', key: 'sickening', multiplier: 1.0 },
            { type: 'hazard', key: 'inferno',   multiplier: 0.6 },
            { type: 'hazard', key: 'ices',      multiplier: 0.6 },
            { type: 'hazard', key: 'poison',    multiplier: 0.6 }
        ],
        ability: {
            onTick: ['sickeningContagion'],
            onBeforeAttack: ['sickeningWeakness', 'sickeningAutoCapture'],
            onRenderVFX: ['sickeningPukeVisual']
        },
        partData: {
            sickeningContagion: { diminishRate: 5 },
            sickeningAutoCapture: { autoCap: 0.2 }
        },
        params: {
            isHazard: true,
            layerMax: 100,
            decay: 5,
            vfx: { cBase: 0xa3cc29, cBub: 0x66ff00, bubSpd: 2, bubSz: 3 }
        },
        maxBudget: 10,
        rarity: 'starter',
        descShort: "Disease Vector",
        descLong: "Spreads sickness that weakens enemies. Chance to auto-capture."
    },

    /* ==================================================================== */
    /* 7. POISON                                                            */
    /* ==================================================================== */
    {
        id: 7,
        name: "Poison",
        key: "poison",
        icon: { glyph: '\ue017', unicode: '☠️', color: '#a020f0' },
        baseStats: { att: 50, res: 40, spr: 50 },
        powerFormula: null,
        powerModifiers: [
            { type: 'hazard', key: 'poison',    multiplier: 1.0 },
            { type: 'hazard', key: 'inferno',   multiplier: 0.6 },
            { type: 'hazard', key: 'ices',      multiplier: 0.6 },
            { type: 'hazard', key: 'sickening', multiplier: 0.6 }
        ],
        ability: {
            onBeforeAttack: ['poisonStackApply'],
            onTick: ['poisonDamageTick'],
            onPowerCalc: ['poisonPenalty'],
            onRenderVFX: ['poisonLiquidVisual']
        },
        partData: {
            poisonStackApply: { stackPerHit: 8, maxStack: 999 },
            poisonDamageTick: { tickDecay: 5 },
            poisonPenalty: { powerPenalty: 0.2 }
        },
        params: {
            isHazard: true,
            layerMax: 100,
            decay: 2,
            vfx: { cBase: 0xa020f0, cDrop: 0x6600cc }
        },
        maxBudget: 15,
        rarity: 'starter',
        descShort: "Stacking DoT",
        descLong: "Each hit stacks poison. Poison deals damage over time and weakens enemies."
    },

    /* ==================================================================== */
    /* 8. BOMBER                                                            */
    /* ==================================================================== */
    {
        id: 8,
        name: "Bomber",
        key: "bomber",
        icon: { glyph: '\ue018', unicode: '💣', color: '#ff5500' },
        baseStats: { att: 50, res: 5, spr: 80 },
        powerFormula: null,
        powerModifiers: [
            { type: 'hazard', key: 'inferno',   multiplier: 0.6 },
            { type: 'hazard', key: 'ices',      multiplier: 0.6 },
            { type: 'hazard', key: 'poison',    multiplier: 0.6 },
            { type: 'hazard', key: 'sickening', multiplier: 0.6 }
        ],
        ability: {
            onDefendFail: ['bomberDetonate']
        },
        partData: {
            bomberDetonate: { shockC: '#ff5500', rMax: 60, spd: 5, w: 4 }
        },
        params: {},
        maxBudget: 10,
        rarity: 'starter',
        descShort: "Martyrdom",
        descLong: "Violently detonates when losing defense, clearing a 3x3 area."
    },

    /* ==================================================================== */
    /* 9. NATURE                                                            */
    /* ==================================================================== */
    {
        id: 9,
        name: "Nature",
        key: "nature",
        icon: { glyph: '\ue019', unicode: '🌵', color: '#2aff2a' },
        baseStats: { att: 40, res: 40, spr: 80 },
        powerFormula: null,
        powerModifiers: [
            { type: 'hazard', key: 'inferno',   multiplier: 0.6 },
            { type: 'hazard', key: 'ices',      multiplier: 0.6 },
            { type: 'hazard', key: 'poison',    multiplier: 0.6 },
            { type: 'hazard', key: 'sickening', multiplier: 0.6 }
        ],
        ability: {
            onTick: ['natureGrowRoots', 'natureSporeBurst'],
            onDefendCalc: ['natureRootDefense'],
            onDefendFail: ['natureRootReset'],
            onRenderVFX: ['natureRootVisual']
        },
        partData: {
            natureGrowRoots: { layerMax: 100, rate: 10 },
            natureRootDefense: { defMultiplier: 0.6 },
            natureSporeBurst: { sporeChance: 0.09 }
        },
        params: {
            vfx: { cRoot: 0xa0703a, w: 3, alpha: 1.0 }
        },
        maxBudget: 15,
        rarity: 'starter',
        descShort: "Root & Spores",
        descLong: "Grows roots for defense. At max growth, launches spores."
    },

{
    id: 10,
    name: "Multi",
    key: "multi",
    icon: { glyph: '\ue01a', unicode: '🎭', color: '#ff69b4' },
    baseStats: { att: 50, res: 50, spr: 50 },
    powerFormula: null,
    powerModifiers: [
        { type: 'hazard', key: 'inferno', multiplier: 0.6 },
        { type: 'hazard', key: 'ices', multiplier: 0.6 },
        { type: 'hazard', key: 'poison', multiplier: 0.6 },
        { type: 'hazard', key: 'sickening', multiplier: 0.6 }
    ],
    ability: {
        // OnTick: assign ability ke cell baru
        onTick: ['multiAssignAbility'],
        // On capture: assign ability random
        onAttackSuccess: ['multiRandomAbility'],
        // On render: tampilkan badge ability
        onRenderTileLogic: ['multiAbilityBadge'],
        // On defend: tergantung ability yang di-assign
        onDefendCalc: ['multiSoulDefense']
    },
    partData: {
        multiAssignAbility: {
            // Pool ability yang bisa di-assign
            abilityPool: [
                'bastionShieldBuild',
                'natureGrowRoots',
                'infernoBurnTick',
                'sickeningContagion',
                'glitchDiagSpread',
                'poisonDamageTick',
                'mechaPhalanxDef',
                'icesColdAura'
            ],
            assignChance: 0.5 // 50% chance assign saat tick (kalau belum ada soul)
        },
        multiRandomAbility: {
            // Assign saat capture (100% pasti)
            forceAssignOnCapture: true
        },
        multiSoulDefense: {
            // Bonus defense kalau punya soul
            baseDefenseBonus: 15
        }
    },
    params: {
        // Layer khusus untuk simpan soul ID per cell
        // Kita pakai layer existing? Atau bikin layer baru?
        // Solusi: pakai `extraLayers: ['multiSoul']`
        extraLayers: ['multiSoul'],
        vfx: {
            cBadge: 0xff69b4,
            cGlow: 0xffb6c1
        }
    },
    maxBudget: 12,
    rarity: 'epic',
    descShort: "Chaotic Echo",
    descLong: "Each territory has a random ability from all known territories."
},

{
    id: 11,
    name: "Mimic",
    key: "mimic",
    icon: { glyph: '\ue01b', unicode: '🦎', color: '#00ddcc' },
    baseStats: { att: 50, res: 50, spr: 50 },
    powerFormula: null,
    powerModifiers: [
        { type: 'hazard', key: 'inferno', multiplier: 0.6 },
        { type: 'hazard', key: 'ices', multiplier: 0.6 },
        { type: 'hazard', key: 'poison', multiplier: 0.6 },
        { type: 'hazard', key: 'sickening', multiplier: 0.6 }
    ],
    ability: {
        // Setiap tick: hitung ability mana yang harus dipakai
        onTick: ['mimicAdaptTick'],
        // Saat capture: rekam ability target
        onAttackSuccess: ['mimicStealAbility'],
        // On render: tampilkan icon ability yang dicuri
        onRenderTileLogic: ['mimicAbilityIndicator'],
        // Defense bonus sesuai ability
        onDefendCalc: ['mimicAdaptiveDefense']
    },
    partData: {
        mimicStealAbility: {
            // Ability yang bisa dicuri (subset dari semua ability)
            stealablePool: [
                'bastionShieldBuild',
                'natureGrowRoots',
                'infernoBurnTick',
                'icesFrostNova',
                'poisonStackApply',
                'glitchDiagSpread'
            ],
            stealChance: 0.4 // 40% chance steal saat capture
        },
        mimicAdaptTick: {
            // Cooldown adaptasi
            adaptCooldown: 5
        },
        mimicAdaptiveDefense: {
            baseDefenseBonus: 10
        }
    },
    params: {
        // Layer untuk simpan stolen ability ID (global — sama untuk semua cell)
        extraLayers: ['mimicStolen'],
        vfx: {
            cGlow: 0x00ddcc,
            cTrace: 0x66ffee
        }
    },
    maxBudget: 12,
    rarity: 'epic',
    descShort: "Adaptive Thief",
    descLong: "Steals abilities from defeated enemies. Adapts to any strategy."
},

{
    id: 12,
    name: "Fractal",
    key: "fractal",
    icon: { glyph: '\ue01c', unicode: '🔷', color: '#8844ff' },
    baseStats: { att: 40, res: 60, spr: 70 },
    powerFormula: null,
    powerModifiers: [
        { type: 'hazard', key: 'inferno', multiplier: 0.6 },
        { type: 'hazard', key: 'ices', multiplier: 0.6 },
        { type: 'hazard', key: 'poison', multiplier: 0.6 },
        { type: 'hazard', key: 'sickening', multiplier: 0.6 }
    ],
    ability: {
        onTick: ['fractalMirrorTick'],
        onDefendCalc: ['fractalMirrorDefense'],
        onRenderTileLogic: ['fractalMirrorVisual']
    },
    partData: {
        fractalMirrorTick: {
            mirrorChance: 0.3, // 30% chance mirror tetangga
            mirrorRadius: 1 // Radius mirror (1 = adjacent)
        },
        fractalMirrorDefense: {
            baseDefenseBonus: 5, // Bonus kecil per mirrored neighbor
            maxBonus: 30 // Cap
        }
    },
    params: {
        extraLayers: ['fractalMirror'],
        vfx: {
            cMirror: 0x8844ff,
            cEdge: 0xcc88ff
        }
    },
    maxBudget: 12,
    rarity: 'epic',
    descShort: "Neighbor Mirror",
    descLong: "Copies abilities from adjacent territories. Chaotic synergy."
}

];

/* ======================================================================== */
/* PRECOMPUTED REGISTRIES                                                    */
/* ======================================================================== */

var FACTIONS_BY_KEY = Object.create(null);
var FACTIONS_BY_ID = FACTIONS;
var FACTION_COUNT = FACTIONS.length;

for (var _i = 0; _i < FACTIONS.length; _i++) {
    var _f = FACTIONS[_i];
    if (!_f.key) _f.key = _f.name.toLowerCase();
    FACTIONS_BY_KEY[_f.key] = _f;
}

var FACTION_COLOR_HEX = new Int32Array(FACTION_COUNT);
for (var _c = 0; _c < FACTIONS.length; _c++) {
    FACTION_COLOR_HEX[_c] = parseInt(FACTIONS[_c].icon.color.slice(1), 16);
}

// Blocker flag
var BLOCKER_KEYS_SET = Object.create(null);
var _blockerKeysInit = ['nature', 'mecha', 'bastion'];
for (var _bi = 0; _bi < _blockerKeysInit.length; _bi++) {
    BLOCKER_KEYS_SET[_blockerKeysInit[_bi]] = true;
}
for (var _fi = 0; _fi < FACTIONS.length; _fi++) {
    FACTIONS[_fi].isBlocker = BLOCKER_KEYS_SET[FACTIONS[_fi].key] === true;
}

// Auto-detect hazard keys (dari faction dengan isHazard: true)
(function autoDetectHazardKeys() {
    var hazardKeys = [];
    for (var i = 0; i < FACTIONS.length; i++) {
        if (FACTIONS[i].params && FACTIONS[i].params.isHazard) {
            hazardKeys.push(FACTIONS[i].key);
        }
    }
    CONFIG.POWER.HAZARD_KEYS = hazardKeys;
    CONFIG.HAZARD_KEYS = hazardKeys;   // Backward compat
})();

if (typeof window !== 'undefined') {
    window.FACTIONS = FACTIONS;
    window.FACTIONS_BY_KEY = FACTIONS_BY_KEY;
    window.FACTIONS_BY_ID = FACTIONS_BY_ID;
    window.FACTION_COUNT = FACTION_COUNT;
    window.FACTION_COLOR_HEX = FACTION_COLOR_HEX;
    window.BLOCKER_KEYS_SET = BLOCKER_KEYS_SET;
}