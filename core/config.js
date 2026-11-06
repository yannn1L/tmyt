/**
 * CONFIG — Runtime configuration, precomputed spatial TypedArray lookup tables, and SplitMix32 RNG Utils.
 * Optimized: O(1) CELL_X/CELL_Y, NEIGHBOR_IDX, DIAG_NEIGHBOR_IDX, and JUMP2_NEIGHBOR_IDX tables.
 */

import { UI_CONFIG } from '../data/ui-config.js';
import { SFX_DATA, SFX_COMPOSITE } from '../data/sfx-data.js';

export const CONFIG = {
    LAYOUT: UI_CONFIG.LAYOUT,
    CRT: UI_CONFIG.CRT,
    BACKGROUND: UI_CONFIG.BACKGROUND,
    ANIMATION: UI_CONFIG.ANIMATION,

    GRID: {
        SIZE: 16,
        COLS: 0,
        ROWS: 0,
        TOTAL: 0,
        HALF_SIZE: 0
    },

    SIMULATION: {
        BASE_TICK_MS: 150,
        MIN_TICK_MS: 20,
        SPEEDUP_INTERVAL_MS: 7500,
        BLOCK_CHANCE: 0.10,
        START_FACTION_MIN: 2,
        PLACEMENT_MAX_ATTEMPTS: 1000
    },

    STUCK_RESOLVER: {
        ENABLE_AT_SPEED: 32,
        SOFT_AT_SPEED: 32,
        ACTIVE_AT_SPEED: 64,
        URGENT_AT_SPEED: 128,
        CRITICAL_AT_SPEED: 256,
        MAX_SPEEDUP_LEVEL: 999999,

        CHANGE_THRESHOLD: 3,
        STAGNATION_MILD: 20,
        STAGNATION_SEVERE: 60,

        DOMINANCE_MILD_AGE: 60,
        DOMINANCE_SEVERE_AGE: 150,

        SCORE_TO_LEVEL_MILD: 1,
        SCORE_TO_LEVEL_MODERATE: 3,
        SCORE_TO_LEVEL_SEVERE: 5,

        MILD_DECAY_BOOST: 2.0,
        MILD_RNG_VARIANCE_BOOST: 2.0,
        MILD_DURATION_TICKS: 20,

        MODERATE_FORCE_DECAY_THRESHOLD: 50,
        MODERATE_FORCE_DECAY_FACTOR: 0.3,
        MODERATE_RANDOM_CAPTURE_CHANCE: 0.02,
        MODERATE_DURATION_TICKS: 30,

        SEVERE_FORCE_CONVERT: true,
        SEVERE_TRIGGER_LAST_ONE: true,

        LOG_LEVEL: 'off',
        LOG_THROTTLE_TICKS: 30
    },

    POWER: {
        BASE_FORMULA: {
            attWeight: 1.0,
            resWeight: 1.0,
            sprWeight: 0.5
        },
        RNG_VARIANCE: 0.1,
        CRIT_CHANCE: 0.15,
        CRIT_MULTIPLIER: 1.5,
        DEFAULT_HAZARD_MULT: 0.6,

        MODIFIERS: {
            hazard: function(ctx) {
                var layer = ctx.ws.layers[ctx.modifier.key];
                if (!layer || layer[ctx.idx] <= 0) return 1.0;
                return ctx.modifier.multiplier;
            }
        },

        HAZARD_KEYS: []
    },

    VFX: {
        BOUNDS_PADDING_MIN: 30,
        BOUNDS_PADDING_MAX: 10,
        POOL_SIZE: 400,
        SHOCKWAVE_POOL: 25,
        LASER_POOL: 20,
        MAX_TEXT_POPUPS: 8,
        TEXT_FONT_SIZE: 8,
        TEXT_STROKE_THICKNESS: 2,
        SPRITE_BASE_SIZE: 4,
        SHAKE_ENABLED: true,
        SHAKE: { CAPTURE: 0.5, SPEEDUP: 6, LAST_ONE: 8, BOMB: 4, CRIT: 3, THUD: 4 },
        BOUNCE: { DURATION: 1.0, DECAY: 0.1, MULTIPLIER: 0.5, ELASTICITY: 3 },
        COLORS: {
            TEXT_CRIT: '#FFD700', TEXT_FIRE: '#ff2a2a', PARTICLE_FIRE: '#ff8800',
            TEXT_ICE: '#00ffff', PARTICLE_ICE: '#00ffff',
            TEXT_BLOCK: '#ffffff', PARTICLE_BLOCK: '#ffffff', TEXT_LAST: '#ffff00',
            VOLT: '#ffff00', ZOMBIE: '#39ff14', AERO: '#e0ffff', HOLY: '#ffd700',
            VOID: '#8a2be2', SNIPE: '#ff0044', BOMB: '#ff5500', CHRONO: '#00bfff',
            GLITCH: '#ff00ff', PLAGUE: '#a3cc29', CULT: '#cc00ff', SHIELD: '#8b4513',
            SQUARE: '#00ffcc', STORM: '#4444ff'
        },
        PHYSICS: {
            normal:   { speedRnd: 6,   lifeDecay: 0.05, drag: 0.85 },
            fire:     { speedX: 4, speedYBase: -1, speedYRnd: -4, lifeDecay: 0.05, drag: 1 },
            ice:      { speedRnd: 8,   lifeDecay: 0.05, drag: 0.85 },
            trail:    { speedRnd: 2,   lifeDecay: 0.1,  drag: 0.8 },
            text:     { speedX: 1.5, speedY: -2.5, lifeDecay: 0.04, dragX: 0.9, dragY: 0.95 },
            textCrit: { speedX: 2.5, speedY: -4.0, lifeDecay: 0.03, dragX: 0.85, dragY: 0.9 },
            fall:     { vy: 10, lifeDecay: 0.1, groundYOffset: 80 }
        },
        BOUNCE_PHASE_EARLY: 0.2,
        BOUNCE_PHASE_EARLY_MULT: 5,
        BOUNCE_PHASE_LATE_SPEED: 3,
        BOUNCE_PHASE_LATE_AMP: 0.3,
        TEXT_ALPHA_THRESHOLD: 0.2,
        TEXT_ALPHA_MULT: 5,
        SPRITE_SIZE_MAX: 4
    },

    RENDER: { USE_PARTICLE_CONTAINER: true },
    PROFILE: { ENABLED: false, SAMPLE_FRAMES: 60 },

    AUDIO: SFX_DATA,
    SFX_COMPOSITE: SFX_COMPOSITE,

    DIRECTIONS: [[0, -1], [1, 0], [0, 1], [-1, 0]],
    DIAG_DIRECTIONS: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    DIRS_2: [[0, -2], [2, 0], [0, 2], [-2, 0]],

    DIR_X: new Int8Array([0, 1, 0, -1]),
    DIR_Y: new Int8Array([-1, 0, 1, 0]),
    DIAG_X: new Int8Array([-1, 1, -1, 1]),
    DIAG_Y: new Int8Array([-1, -1, 1, 1]),
    JUMP2_X: new Int8Array([0, 2, 0, -2]),
    JUMP2_Y: new Int8Array([-2, 0, 2, 0]),

    SQUARE_PATTERNS_FLAT: new Int8Array([
        0, 0,  -1, 0,   0, -1,  -1, -1,
        0, 0,   1, 0,   0, -1,   1, -1,
        0, 0,  -1, 0,   0,  1,  -1,  1,
        0, 0,   1, 0,   0,  1,   1,  1
    ]),

    HAZARD_KEYS: ['inferno', 'ices', 'toxic', 'sickening'],
    BLOCKER_KEYS: ['nature', 'mecha', 'bastion', 'storm'],

    // Precomputed spatial lookup tables (populated below)
    CELL_X: null,            // Uint8Array [TOTAL]
    CELL_Y: null,            // Uint8Array [TOTAL]
    NEIGHBOR_IDX: null,      // Int16Array [TOTAL * 4]
    DIAG_NEIGHBOR_IDX: null, // Int16Array [TOTAL * 4]
    JUMP2_NEIGHBOR_IDX: null,// Int16Array [TOTAL * 4]

    // Precomputed runtime registries (populated at boot / match start)
    ACTIVE_ABILITY_KEYS: [],
    ACTIVE_VFX_KEYS: [],
    ACTIVE_TILE_KEYS: [],
    ACTIVE_HOOKS: {},
    DECAY_LAYERS: [],
    HAZARD_LAYERS: [],

    UI: {
        SCENE_LOADING: 'scene-loading',
        SCENE_EDITOR: 'scene-editor',
        SCENE_SIMULATION: 'scene-simulation',
        GAME_CONTAINER: 'game-container',
        UNIT_SELECTION: 'unit-selection',
        BTN_START: 'btn-start',
        SIM_FOOTER: 'sim-footer',
        PIXI_CONTAINER: 'pixi-container',
        LOADING_FILL: 'loading-fill',
        WINNER_OVERLAY: 'winner-overlay',
        WINNER_TEXT: 'winner-text',
        SPEEDUP_OVERLAY: 'speedup-overlay',
        DEBUG_OVERLAY: 'sim-debug-overlay'
    },

    DEV_MODE: {
        enabled: false,
        debugOverlay: false
    },

    FPS: {
        ENABLED: false,
        SAMPLE_INTERVAL_MS: 500,
        LOG_TAG: '[FPS]',
        currentFps: 60.0,
        frameMs: 16.7
    },

    setGridDimensions: null
};

if (typeof document !== 'undefined' && document.documentElement && typeof window !== 'undefined') {
    var vw = window.innerWidth || 1024;
    var vh = window.innerHeight || 768;
    var simScale = Math.max(0.85, Math.min((vw - 48) / 340, (vh - 48) / 510, CONFIG.LAYOUT.SIM_SCALE));
    var editorScale = Math.max(0.95, Math.min((vw - 48) / 340, (vh - 48) / 340, 2.2));
    document.documentElement.style.setProperty(CONFIG.LAYOUT.CSS_VAR_SIM_SCALE, simScale.toFixed(3));
    document.documentElement.style.setProperty('--editor-scale', editorScale.toFixed(3));
}

/**
 * Dynamically configures the arena grid columns & rows while keeping the simulation
 * canvas fixed at CONFIG.LAYOUT.CANVAS_SIZE (320x320).
 * Recomputes all O(1) spatial coordinate & neighbor TypedArray lookup tables.
 */
export function setGridDimensions(cols, rows) {
    var c = Math.max(4, Math.min(64, (cols | 0) || 20));
    var r = Math.max(4, Math.min(64, (rows | 0) || 20));
    var canvasSize = CONFIG.LAYOUT.CANVAS_SIZE;

    var cellW = canvasSize / c;
    var cellH = canvasSize / r;
    var baseSize = Math.min(cellW, cellH);

    CONFIG.GRID.COLS = c;
    CONFIG.GRID.ROWS = r;
    CONFIG.GRID.TOTAL = c * r;
    CONFIG.GRID.CELL_W = cellW;
    CONFIG.GRID.CELL_H = cellH;
    CONFIG.GRID.HALF_W = cellW * 0.5;
    CONFIG.GRID.HALF_H = cellH * 0.5;
    CONFIG.GRID.PIXEL_SIZE = baseSize;
    CONFIG.GRID.SIZE = 16;
    CONFIG.GRID.HALF_SIZE = 8;

    var TOTAL = CONFIG.GRID.TOTAL;
    var DIR_X = CONFIG.DIR_X, DIR_Y = CONFIG.DIR_Y;
    var DIAG_X = CONFIG.DIAG_X, DIAG_Y = CONFIG.DIAG_Y;
    var JUMP2_X = CONFIG.JUMP2_X, JUMP2_Y = CONFIG.JUMP2_Y;

    var cellX = new Uint8Array(TOTAL);
    var cellY = new Uint8Array(TOTAL);
    var neigh = new Int16Array(TOTAL * 4).fill(-1);
    var diagNeigh = new Int16Array(TOTAL * 4).fill(-1);
    var jump2Neigh = new Int16Array(TOTAL * 4).fill(-1);

    for (var i = 0; i < TOTAL; i++) {
        var cx = i % c;
        var cy = (i / c) | 0;
        cellX[i] = cx;
        cellY[i] = cy;

        var base = i * 4;
        for (var d = 0; d < 4; d++) {
            var nx = cx + DIR_X[d], ny = cy + DIR_Y[d];
            if (nx >= 0 && nx < c && ny >= 0 && ny < r) {
                neigh[base + d] = ny * c + nx;
            }
            var dnx = cx + DIAG_X[d], dny = cy + DIAG_Y[d];
            if (dnx >= 0 && dnx < c && dny >= 0 && dny < r) {
                diagNeigh[base + d] = dny * c + dnx;
            }
            var jnx = cx + JUMP2_X[d], jny = cy + JUMP2_Y[d];
            if (jnx >= 0 && jnx < c && jny >= 0 && jny < r) {
                jump2Neigh[base + d] = jny * c + jnx;
            }
        }
    }

    CONFIG.CELL_X = cellX;
    CONFIG.CELL_Y = cellY;
    CONFIG.NEIGHBOR_IDX = neigh;
    CONFIG.DIAG_NEIGHBOR_IDX = diagNeigh;
    CONFIG.JUMP2_NEIGHBOR_IDX = jump2Neigh;
    return CONFIG.GRID;
}

CONFIG.setGridDimensions = setGridDimensions;
setGridDimensions(20, 20);

/**
 * UTILS — Fast math, SplitMix32 RNG, O(1) grid helpers.
 */
export const Utils = {
    seed: 1337,

    fastRNG: function() {
        this.seed = (this.seed + 0x9e3779b9) | 0;
        var t = this.seed ^ (this.seed >>> 16);
        t = Math.imul(t, 0x21f0aaad);
        t = t ^ (t >>> 15);
        t = Math.imul(t, 0x735a2d97);
        return ((t = t ^ (t >>> 15)) >>> 0) / 4294967296;
    },

    sinTbl: null,
    initSinTable: function() {
        this.sinTbl = new Float32Array(512);
        for (var i = 0; i < 512; i++) {
            this.sinTbl[i] = Math.sin((i * Math.PI) / 256);
        }
    },
    fastSin: function(deg) {
        return this.sinTbl[(deg | 0) & 511];
    },
    fastCos: function(deg) {
        return this.sinTbl[((deg | 0) + 128) & 511];
    },

    getIndex: function(x, y) { return y * CONFIG.GRID.COLS + x; },
    getX: function(idx) { return CONFIG.CELL_X[idx]; },
    getY: function(idx) { return CONFIG.CELL_Y[idx]; },
    isValid: function(x, y) {
        return x >= 0 && x < CONFIG.GRID.COLS && y >= 0 && y < CONFIG.GRID.ROWS;
    },

    getRandomDirIdx: function() {
        return (this.fastRNG() * 4) | 0;
    },
    getRandomDir: function() {
        return CONFIG.DIRECTIONS[(this.fastRNG() * 4) | 0];
    },

    shuffleArray: function(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = (this.fastRNG() * (i + 1)) | 0;
            var temp = arr[i]; arr[i] = arr[j]; arr[j] = temp;
        }
    }
};
Utils.initSinTable();

export const DIRS = CONFIG.DIRECTIONS;
export const DIAG_DIRS = CONFIG.DIAG_DIRECTIONS;

if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
    window.Utils = Utils;
    window.DIRS = DIRS;
    window.DIAG_DIRS = DIAG_DIRS;
}