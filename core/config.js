/**
 * CONFIG — Runtime config + Utils.
 * Optimized: bit tricks, flattened dirs, precomputed neighbor indices, SplitMix32 RNG.
 */
'use strict';

var CONFIG = {
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
    
    // ---- Stuck Resolver (speed-aware, zero-cost saat speed normal) ----
    STUCK_RESOLVER: {
        // === Aktifasi ===
        ENABLE_AT_SPEED: 32, // Monitor mulai aktif di speed ini
        SOFT_AT_SPEED: 32,
        ACTIVE_AT_SPEED: 64,
        URGENT_AT_SPEED: 128,
        CRITICAL_AT_SPEED: 256,
        MAX_SPEEDUP_LEVEL: 999999,
        
        // === Deteksi stagnasi ===
        CHANGE_THRESHOLD: 3, // < 3 cells berubah/tick = suspicious
        STAGNATION_MILD: 20, // 20 tick stagnant → score +1
        STAGNATION_SEVERE: 60, // 60 tick stagnant → score +1
        
        // === Dominasi ===
        DOMINANCE_MILD_AGE: 60, // Dominasi statis 60 tick → score +1
        DOMINANCE_SEVERE_AGE: 150, // 150 tick → score +1
        
        // === Escalation ===
        // Score mapping (0-8):
        //   0     → level 0 (normal)
        //   1-2   → level 1 (mild — log + small nudge)
        //   3-4   → level 2 (moderate — force decay)
        //   5+    → level 3 (severe — force end)
        SCORE_TO_LEVEL_MILD: 1,
        SCORE_TO_LEVEL_MODERATE: 3,
        SCORE_TO_LEVEL_SEVERE: 5,
        
        // === Intervensi mild (level 1) ===
        MILD_DECAY_BOOST: 2.0, // Layer decay × 2
        MILD_RNG_VARIANCE_BOOST: 2.0, // RNG variance × 2
        MILD_DURATION_TICKS: 20,
        
        // === Intervensi moderate (level 2) ===
        MODERATE_FORCE_DECAY_THRESHOLD: 50, // Layer > 50 di-force decay
        MODERATE_FORCE_DECAY_FACTOR: 0.3, // Sisakan 30%
        MODERATE_RANDOM_CAPTURE_CHANCE: 0.02, // 2% chance capture ke dominan
        MODERATE_DURATION_TICKS: 30,
        
        // === Intervensi severe (level 3) ===
        SEVERE_FORCE_CONVERT: true, // Force semua cell ke dominan
        SEVERE_TRIGGER_LAST_ONE: true, // Tampilkan "LAST ONE!"
        
        // === Logging ===
        LOG_LEVEL: 'off', // 'off' | 'info' | 'verbose'
        LOG_THROTTLE_TICKS: 30
    },
    
    // ---- Power calculation system (data-driven) ----
    POWER: {
        // Formula base power (bisa di-override per faction)
        BASE_FORMULA: {
            attWeight: 1.0,
            resWeight: 1.0,
            sprWeight: 0.5
        },
        
        // RNG variance (dari maxStat)
        RNG_VARIANCE: 0.1,
        
        // Crit
        CRIT_CHANCE: 0.15,
        CRIT_MULTIPLIER: 1.5,
        
        // Default hazard multiplier (kalau faction tidak set)
        DEFAULT_HAZARD_MULT: 0.6,
        
        // Power modifier resolvers (registry)
        MODIFIERS: {
            /**
             * Hazard resolver.
             * ctx = { ws, idx, fac, modifier, isDefending }
             * modifier = { type: 'hazard', key: 'poison', multiplier: 0.6 }
             */
            hazard: function(ctx) {
                var layer = ctx.ws.layers[ctx.modifier.key];
                if (!layer || layer[ctx.idx] <= 0) return 1.0;
                return ctx.modifier.multiplier;
            }
        },
        
        // Auto-populated: daftar hazard keys (dari faction dengan isHazard: true)
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

    // ---- Batch 2: Flattened directions (faster than array-of-array) ----
    DIR_X: new Int8Array([0, 1, 0, -1]),
    DIR_Y: new Int8Array([-1, 0, 1, 0]),
    DIAG_X: new Int8Array([-1, 1, -1, 1]),
    DIAG_Y: new Int8Array([-1, -1, 1, 1]),

    // ---- Batch 4: Flattened square patterns ----
    // Each pattern: [dx0,dy0, dx1,dy1, dx2,dy2, dx3,dy3]
    SQUARE_PATTERNS_FLAT: new Int8Array([
        0, 0,  -1, 0,   0, -1,  -1, -1,   // pattern 0 (top-left)
        0, 0,   1, 0,   0, -1,   1, -1,   // pattern 1 (top-right)
        0, 0,  -1, 0,   0,  1,  -1,  1,   // pattern 2 (bottom-left)
        0, 0,   1, 0,   0,  1,   1,  1    // pattern 3 (bottom-right)
    ]),

    HAZARD_KEYS: ['inferno', 'ices', 'toxic', 'sickening'],
    BLOCKER_KEYS: ['nature', 'mecha', 'bastion', 'storm'],

    // ---- Precomputed runtime registries (populated at boot) ----
    ACTIVE_ABILITY_KEYS: [],
    ACTIVE_VFX_KEYS: [],
    ACTIVE_TILE_KEYS: [],
    DECAY_LAYERS: [],
    NEIGHBOR_IDX: null,      // Int16Array [TOTAL * 4]
    HAZARD_LAYERS: [],       // Array of Int16Array references

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
        SPEEDUP_OVERLAY: 'speedup-overlay'
    },

    FPS: {
        ENABLED: false,
        SAMPLE_INTERVAL_MS: 1000,
        LOG_TAG: '[FPS]'
    }
};

CONFIG.GRID.COLS = CONFIG.LAYOUT.CANVAS_SIZE / CONFIG.GRID.SIZE;
CONFIG.GRID.ROWS = CONFIG.LAYOUT.CANVAS_SIZE / CONFIG.GRID.SIZE;
CONFIG.GRID.TOTAL = CONFIG.GRID.COLS * CONFIG.GRID.ROWS;
CONFIG.GRID.HALF_SIZE = CONFIG.GRID.SIZE / 2;

document.documentElement.style.setProperty(CONFIG.LAYOUT.CSS_VAR_SIM_SCALE, CONFIG.LAYOUT.SIM_SCALE);

// ---- Batch 2: Precompute neighbor indices ----
(function precomputeNeighbors() {
    var TOTAL = CONFIG.GRID.TOTAL;
    var DIR_X = CONFIG.DIR_X, DIR_Y = CONFIG.DIR_Y;
    var neigh = new Int16Array(TOTAL * 4).fill(-1);
    var COLS = CONFIG.GRID.COLS, ROWS = CONFIG.GRID.ROWS;

    for (var i = 0; i < TOTAL; i++) {
        var cx = i % COLS;
        var cy = (i / COLS) | 0;
        var base = i * 4;
        for (var d = 0; d < 4; d++) {
            var nx = cx + DIR_X[d], ny = cy + DIR_Y[d];
            if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
                neigh[base + d] = ny * COLS + nx;
            }
        }
    }
    CONFIG.NEIGHBOR_IDX = neigh;
})();

/**
 * UTILS — Fast math, RNG, grid helpers.
 * Uses SplitMix32 (faster than LCG in modern JIT).
 * fastSin handles negative degrees.
 */
var Utils = {
    seed: 1337,

    // ---- Batch 5: SplitMix32 RNG (~15% faster in V8) ----
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
        // 512 entries (power of 2, allows bitmask, no modulo, no branch)
        this.sinTbl = new Float32Array(512);
        for (var i = 0; i < 512; i++) {
            this.sinTbl[i] = Math.sin((i * Math.PI) / 256);
        }
    },
    // ---- Batch 1: fastSin with bitmask (handles negative, 512 lookup) ----
    fastSin: function(deg) {
        return this.sinTbl[(deg | 0) & 511];
    },
    fastCos: function(deg) {
        return this.sinTbl[((deg | 0) + 128) & 511];
    },

    getIndex: function(x, y) { return y * CONFIG.GRID.COLS + x; },
    getX: function(idx) { return idx % CONFIG.GRID.COLS; },
    getY: function(idx) { return (idx / CONFIG.GRID.COLS) | 0; },
    isValid: function(x, y) {
        return x >= 0 && x < CONFIG.GRID.COLS && y >= 0 && y < CONFIG.GRID.ROWS;
    },

    // ---- Batch 5: Fast random direction (index only, no array alloc) ----
    getRandomDirIdx: function() {
        return (Utils.fastRNG() * 4) | 0;
    },
    getRandomDir: function() {
        return CONFIG.DIRECTIONS[Utils.getRandomDirIdx()];
    },

    shuffleArray: function(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = (Utils.fastRNG() * (i + 1)) | 0;
            var temp = arr[i]; arr[i] = arr[j]; arr[j] = temp;
        }
    }
};
Utils.initSinTable();

var DIRS = CONFIG.DIRECTIONS;
var DIAG_DIRS = CONFIG.DIAG_DIRECTIONS;

if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
    window.Utils = Utils;
    window.DIRS = DIRS;
    window.DIAG_DIRS = DIAG_DIRS;
}