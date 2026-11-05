/**
 * WORLD STATE — Flat TypedArray grid, layer activity tracking, zero-GC power calculation,
 * and speed-aware stuck resolver.
 */

import { CONFIG, Utils } from './config.js';
import { FACTIONS, FACTION_COUNT } from '../data/factions.js';
import { VFX } from './vfx.js';
import { AudioService } from './audio.js';

// Pre-allocated modifier context to avoid per-calcPower object allocations
var _modCtx = {
    ws: null,
    idx: 0,
    fac: null,
    isDefending: false,
    modifier: null
};

export const WorldState = {
    factions: {},
    activeFactions: [],
    grid: new Int8Array(CONFIG.GRID.TOTAL).fill(-1),
    nextGrid: new Int8Array(CONFIG.GRID.TOTAL).fill(-1),
    changes: 0,
    layers: {},
    layerHasActiveCells: Object.create(null),
    layerActiveList: Object.create(null),
    layerActiveCount: Object.create(null),
    layerInActiveSet: Object.create(null),
    winPending: false,
    lastOneTriggered: false,
    domCache: {},
    domValues: {},
    lastCounts: new Int32Array(FACTION_COUNT),
    soundQueue: {},

    _layerKeys: [],
    _sfxKeys: [],
    _sfxKeysInitialized: false,

    // Power cache (key = facId * TOTAL + idx)
    _powerTick: 0,
    _powerCacheAtk: new Float32Array(CONFIG.GRID.TOTAL * FACTION_COUNT),
    _powerCacheDef: new Float32Array(CONFIG.GRID.TOTAL * FACTION_COUNT),
    _powerCacheCritAtk: new Uint8Array(CONFIG.GRID.TOTAL * FACTION_COUNT),
    _powerCacheTickAtk: new Int32Array(CONFIG.GRID.TOTAL * FACTION_COUNT).fill(-1),
    _powerCacheTickDef: new Int32Array(CONFIG.GRID.TOTAL * FACTION_COUNT).fill(-1),

    // Captured-this-tick tracking
    capturedThisTick: new Uint8Array(CONFIG.GRID.TOTAL),

    // Reusable output buffers
    _bufAtk: { power: 0, isCrit: false },
    _bufDef: { power: 0, isCrit: false },

    _pendingShake: 0,

    // Stuck Monitor State
    _stuck: {
        counter: 0,
        dominantFaction: -1,
        dominanceAge: 0,
        level: 0,
        lastSpeedLevel: 1,
        lastLogTick: 0,
        nudgeEndTick: 0,
        currentNudge: null,
        decayBoost: 1.0,
        rngVarianceBoost: 1.0
    },

    requestShake: function(amount) {
        if (amount > this._pendingShake) this._pendingShake = amount;
    },

    consumeShake: function() {
        var v = this._pendingShake;
        this._pendingShake = 0;
        return v;
    },

    playSound: function(sfxName) {
        if (!sfxName) return;
        this.soundQueue[sfxName] = 1;
    },

    ensureLayerBuffers: function(layerKey) {
        var total = CONFIG.GRID.TOTAL;
        if (!this.layers[layerKey] || this.layers[layerKey].length !== total) {
            this.layers[layerKey] = new Int16Array(total);
            this.layerActiveList[layerKey] = new Uint16Array(total);
            this.layerInActiveSet[layerKey] = new Uint8Array(total);
            this.layerActiveCount[layerKey] = 0;
            this.layerHasActiveCells[layerKey] = false;
            if (this._layerKeys.indexOf(layerKey) === -1) {
                this._layerKeys.push(layerKey);
            }
        }
        return this.layers[layerKey];
    },

    trackActiveLayerCell: function(layerKey, idx) {
        var inSet = this.layerInActiveSet[layerKey];
        if (!inSet) {
            this.ensureLayerBuffers(layerKey);
            inSet = this.layerInActiveSet[layerKey];
        }
        if (inSet[idx] === 0) {
            inSet[idx] = 1;
            var c = this.layerActiveCount[layerKey] | 0;
            this.layerActiveList[layerKey][c] = idx;
            this.layerActiveCount[layerKey] = c + 1;
        }
        this.layerHasActiveCells[layerKey] = true;
    },

    setLayerValue: function(layerKey, idx, val) {
        var layer = this.ensureLayerBuffers(layerKey);
        var nv = val > 0 ? (val | 0) : 0;
        layer[idx] = nv;
        if (nv > 0) {
            var inSet = this.layerInActiveSet[layerKey];
            if (inSet[idx] === 0) {
                inSet[idx] = 1;
                var c = this.layerActiveCount[layerKey] | 0;
                this.layerActiveList[layerKey][c] = idx;
                this.layerActiveCount[layerKey] = c + 1;
            }
            this.layerHasActiveCells[layerKey] = true;
        }
        return nv;
    },

    addLayerValue: function(layerKey, idx, delta, maxVal) {
        var layer = this.ensureLayerBuffers(layerKey);
        var cap = maxVal !== undefined ? maxVal : 100;
        var next = layer[idx] + delta;
        if (next > cap) next = cap;
        if (next < 0) next = 0;
        layer[idx] = next;
        if (next > 0) {
            var inSet = this.layerInActiveSet[layerKey];
            if (inSet[idx] === 0) {
                inSet[idx] = 1;
                var c = this.layerActiveCount[layerKey] | 0;
                this.layerActiveList[layerKey][c] = idx;
                this.layerActiveCount[layerKey] = c + 1;
            }
            this.layerHasActiveCells[layerKey] = true;
        }
        return next;
    },

    clearLayer: function(layerKey) {
        var arr = this.layers[layerKey];
        if (!arr) return;
        var list = this.layerActiveList[layerKey];
        var inSet = this.layerInActiveSet[layerKey];
        var count = this.layerActiveCount[layerKey] | 0;
        if (list && inSet && count > 0) {
            for (var i = 0; i < count; i++) {
                var idx = list[i];
                arr[idx] = 0;
                inSet[idx] = 0;
            }
        } else {
            arr.fill(0);
            if (inSet) inSet.fill(0);
        }
        this.layerActiveCount[layerKey] = 0;
        this.layerHasActiveCells[layerKey] = false;
    },

    syncLayerActiveList: function(layerKey) {
        var arr = this.layers[layerKey];
        if (!arr) return 0;
        var list = this.layerActiveList[layerKey];
        var inSet = this.layerInActiveSet[layerKey];
        if (!list || !inSet) {
            this.ensureLayerBuffers(layerKey);
            list = this.layerActiveList[layerKey];
            inSet = this.layerInActiveSet[layerKey];
        }
        inSet.fill(0);
        var count = 0;
        var len = arr.length;
        for (var i = 0; i < len; i++) {
            if (arr[i] > 0) {
                inSet[i] = 1;
                list[count++] = i;
            }
        }
        this.layerActiveCount[layerKey] = count;
        this.layerHasActiveCells[layerKey] = count > 0;
        return count;
    },

    markLayerActive: function(layerKey, idx) {
        this.layerHasActiveCells[layerKey] = true;
        if (idx !== undefined) {
            this.trackActiveLayerCell(layerKey, idx);
        } else if ((this.layerActiveCount[layerKey] | 0) === 0 && this.layers[layerKey]) {
            this.syncLayerActiveList(layerKey);
        }
    },

    initLayers: function() {
        var total = CONFIG.GRID.TOTAL;
        var fCount = FACTIONS.length;
        for (var i = 0; i < fCount; i++) {
            var f = FACTIONS[i];
            this.factions[f.id] = f;
            this.ensureLayerBuffers(f.key);
            if (f.params && f.params.extraLayers) {
                for (var j = 0; j < f.params.extraLayers.length; j++) {
                    this.ensureLayerBuffers(f.params.extraLayers[j]);
                }
            }
        }
        // Reallocate existing dynamic custom layers if total changed
        var existingKeys = Object.keys(this.layers);
        for (var k = 0; k < existingKeys.length; k++) {
            this.ensureLayerBuffers(existingKeys[k]);
        }
        this._layerKeys = Object.keys(this.layers);

        var hazardLayers = [];
        var hazardKeys = CONFIG.POWER.HAZARD_KEYS;
        for (var h = 0; h < hazardKeys.length; h++) {
            var hLayer = this.layers[hazardKeys[h]];
            if (hLayer) hazardLayers.push(hLayer);
        }
        CONFIG.HAZARD_LAYERS = hazardLayers;
    },

    syncBuffers: function() {
        var total = CONFIG.GRID.TOTAL;
        var fCount = Math.max(FACTIONS.length, 16);

        if (this.grid.length !== total) {
            this.grid = new Int8Array(total).fill(-1);
            this.nextGrid = new Int8Array(total).fill(-1);
            this.capturedThisTick = new Uint8Array(total);
        }
        if (this.lastCounts.length < FACTIONS.length) {
            this.lastCounts = new Int32Array(fCount);
        }

        var cacheLen = total * fCount;
        if (this._powerCacheAtk.length < cacheLen) {
            this._powerCacheAtk = new Float32Array(cacheLen);
            this._powerCacheDef = new Float32Array(cacheLen);
            this._powerCacheCritAtk = new Uint8Array(cacheLen);
            this._powerCacheTickAtk = new Int32Array(cacheLen).fill(-1);
            this._powerCacheTickDef = new Int32Array(cacheLen).fill(-1);
        }

        this.initLayers();
    },

    resize: function(cols, rows) {
        if (cols !== undefined && rows !== undefined) {
            CONFIG.setGridDimensions(cols, rows);
        }
        this.syncBuffers();
        this.reset();
    },

    refreshLayerKeys: function() {
        this._layerKeys = Object.keys(this.layers);
    },

    beginTick: function() {
        this._powerTick++;
        if (this._powerTick < 0) {
            this._powerTick = 1;
            this._powerCacheTickAtk.fill(-1);
            this._powerCacheTickDef.fill(-1);
        }
    },

    /**
     * Compute power with zero-allocation modifier resolution and O(1) TypedArray caching.
     */
    calcPower: function(facId, idx, isDefending, out) {
        var TOTAL = CONFIG.GRID.TOTAL;
        var cacheKey = facId * TOTAL + idx;

        var cacheTick = isDefending ? this._powerCacheTickDef : this._powerCacheTickAtk;
        if (cacheTick[cacheKey] === this._powerTick) {
            if (!out) out = isDefending ? this._bufDef : this._bufAtk;
            if (isDefending) {
                out.power = this._powerCacheDef[cacheKey];
                out.isCrit = false;
            } else {
                out.power = this._powerCacheAtk[cacheKey];
                out.isCrit = this._powerCacheCritAtk[cacheKey] === 1;
            }
            return out;
        }

        var fac = this.factions[facId];
        if (!fac) {
            if (!out) out = isDefending ? this._bufDef : this._bufAtk;
            out.power = 0;
            out.isCrit = false;
            return out;
        }

        var stats = fac.baseStats;

        // 1. Base formula (precomputed on faction)
        var pow = fac._basePower;
        if (pow === undefined) {
            var formula = fac.powerFormula || CONFIG.POWER.BASE_FORMULA;
            pow = stats.att * formula.attWeight
                + stats.res * formula.resWeight
                + stats.spr * formula.sprWeight
                + (stats.att + stats.res) * (formula.balancedBonus || 0);
            fac._basePower = pow;
        }

        // 2. Hook onPowerCalc
        var compiled = fac._compiled;
        if (compiled && compiled.onPowerCalc) {
            pow = compiled.onPowerCalc(this, idx, pow, fac);
        }

        // 3. Power modifiers (zero-allocation shared context)
        var mods = fac.powerModifiers;
        if (mods && mods.length > 0) {
            var registry = CONFIG.POWER.MODIFIERS;
            _modCtx.ws = this;
            _modCtx.idx = idx;
            _modCtx.fac = fac;
            _modCtx.isDefending = isDefending;
            for (var m = 0; m < mods.length; m++) {
                var mod = mods[m];
                var resolver = registry[mod.type];
                if (resolver) {
                    _modCtx.modifier = mod;
                    pow *= resolver(_modCtx);
                }
            }
        }

        // 4. Hook onDefendCalc
        if (compiled && compiled.onDefendCalc && isDefending) {
            pow = compiled.onDefendCalc(this, idx, pow, fac);
        }

        // 5. RNG variance (with stuck boost)
        var maxStat = fac._maxStat !== undefined
            ? fac._maxStat
            : Math.max(stats.spr, stats.res, stats.att);
        var rngBoost = this._stuck.rngVarianceBoost;
        pow += Utils.fastRNG() * (maxStat * CONFIG.POWER.RNG_VARIANCE * rngBoost);

        // 6. Crit
        var isCrit = false;
        if (!isDefending && Utils.fastRNG() < CONFIG.POWER.CRIT_CHANCE) {
            pow *= CONFIG.POWER.CRIT_MULTIPLIER;
            isCrit = true;
        }

        var fpow = Math.fround(pow);
        if (isDefending) {
            this._powerCacheDef[cacheKey] = fpow;
            this._powerCacheTickDef[cacheKey] = this._powerTick;
        } else {
            this._powerCacheAtk[cacheKey] = fpow;
            this._powerCacheCritAtk[cacheKey] = isCrit ? 1 : 0;
            this._powerCacheTickAtk[cacheKey] = this._powerTick;
        }

        if (!out) out = isDefending ? this._bufDef : this._bufAtk;
        out.power = fpow;
        out.isCrit = isCrit;
        return out;
    },

    isUniformFromCounts: function(cellCounts) {
        var fCount = Math.min(cellCounts.length, FACTIONS.length);
        for (var i = 0; i < fCount; i++) {
            if (cellCounts[i] === CONFIG.GRID.TOTAL) return i;
        }
        return -1;
    },

    updateStuckMonitor: function(cellsChanged, speedLevel, dominantFaction, currentTick) {
        var cfg = CONFIG.STUCK_RESOLVER;
        var s = this._stuck;

        if (speedLevel < cfg.ENABLE_AT_SPEED) {
            if (s.lastSpeedLevel >= cfg.ENABLE_AT_SPEED) {
                s.counter = 0;
                s.dominanceAge = 0;
                s.level = 0;
                s.currentNudge = null;
                s.decayBoost = 1.0;
                s.rngVarianceBoost = 1.0;
            }
            s.lastSpeedLevel = speedLevel;
            return 0;
        }

        s.lastSpeedLevel = speedLevel;

        if (cellsChanged >= cfg.CHANGE_THRESHOLD) {
            s.counter = 0;
            s.dominanceAge = 0;
            s.level = 0;
            return 0;
        }
        s.counter++;

        if (dominantFaction === s.dominantFaction) {
            s.dominanceAge++;
        } else {
            s.dominantFaction = dominantFaction;
            s.dominanceAge = 0;
        }

        var score = 0;
        if (speedLevel >= cfg.SOFT_AT_SPEED)     score += 1;
        if (speedLevel >= cfg.ACTIVE_AT_SPEED)   score += 1;
        if (speedLevel >= cfg.URGENT_AT_SPEED)   score += 1;
        if (speedLevel >= cfg.CRITICAL_AT_SPEED) score += 1;
        if (s.counter > cfg.STAGNATION_MILD)     score += 1;
        if (s.counter > cfg.STAGNATION_SEVERE)   score += 1;
        if (s.dominanceAge > cfg.DOMINANCE_MILD_AGE)   score += 1;
        if (s.dominanceAge > cfg.DOMINANCE_SEVERE_AGE) score += 1;

        var level = 0;
        if (score >= cfg.SCORE_TO_LEVEL_SEVERE)        level = 3;
        else if (score >= cfg.SCORE_TO_LEVEL_MODERATE) level = 2;
        else if (score >= cfg.SCORE_TO_LEVEL_MILD)     level = 1;

        if (level !== s.level && cfg.LOG_LEVEL !== 'off' &&
            currentTick - s.lastLogTick > cfg.LOG_THROTTLE_TICKS) {
            console.log('[STUCK] level=' + level +
                        ' speed=' + speedLevel + 'x' +
                        ' stagnant=' + s.counter +
                        ' dominance=' + s.dominanceAge +
                        ' score=' + score);
            s.lastLogTick = currentTick;
        }

        s.level = level;
        return level;
    },

    applyStuckResolver: function(level, cellCounts, currentTick) {
        if (level <= 0) return;

        var cfg = CONFIG.STUCK_RESOLVER;
        var s = this._stuck;

        if (currentTick < s.nudgeEndTick) return;

        if (level === 1) {
            s.decayBoost = cfg.MILD_DECAY_BOOST;
            s.rngVarianceBoost = cfg.MILD_RNG_VARIANCE_BOOST;
            s.nudgeEndTick = currentTick + cfg.MILD_DURATION_TICKS;
            s.currentNudge = 'mild';
        } else if (level === 2) {
            var threshold = cfg.MODERATE_FORCE_DECAY_THRESHOLD;
            var factor = cfg.MODERATE_FORCE_DECAY_FACTOR;
            var keys = this._layerKeys;
            for (var k = 0; k < keys.length; k++) {
                var lKey = keys[k];
                if (!this.layerHasActiveCells[lKey]) continue;
                var arr = this.layers[lKey];
                if (!arr) continue;
                var actList = this.layerActiveList[lKey];
                var actCount = this.layerActiveCount[lKey] | 0;
                for (var i = 0; i < actCount; i++) {
                    var idx = actList[i];
                    if (arr[idx] > threshold) {
                        arr[idx] = (arr[idx] * factor) | 0;
                    }
                }
            }

            var dom = s.dominantFaction;
            if (dom !== -1 && dom < FACTIONS.length) {
                var chance = cfg.MODERATE_RANDOM_CAPTURE_CHANCE;
                for (var c = 0; c < CONFIG.GRID.TOTAL; c++) {
                    var owner = this.grid[c];
                    if (owner === -1 || owner === dom) continue;
                    if (this.capturedThisTick[c]) continue;
                    if (Utils.fastRNG() >= chance) continue;

                    this.nextGrid[c] = dom;
                    this.capturedThisTick[c] = 1;
                    this.changes++;
                }
            }

            s.nudgeEndTick = currentTick + cfg.MODERATE_DURATION_TICKS;
            s.currentNudge = 'moderate';
        } else if (level >= 3) {
            if (cfg.SEVERE_FORCE_CONVERT) {
                var domSev = s.dominantFaction;
                if (domSev === -1 || domSev >= FACTIONS.length) {
                    var maxCount = 0;
                    for (var f = 0; f < FACTIONS.length; f++) {
                        if (cellCounts[f] > maxCount) {
                            maxCount = cellCounts[f];
                            domSev = f;
                        }
                    }
                }

                if (domSev !== -1) {
                    for (var cc = 0; cc < CONFIG.GRID.TOTAL; cc++) {
                        this.nextGrid[cc] = domSev;
                        this.capturedThisTick[cc] = 1;
                    }
                    for (var kk = 0; kk < this._layerKeys.length; kk++) {
                        this.clearLayer(this._layerKeys[kk]);
                    }

                    if (cfg.SEVERE_TRIGGER_LAST_ONE) {
                        var winnerFac = this.factions[domSev];
                        if (winnerFac && winnerFac.icon) {
                            var cx = CONFIG.LAYOUT.CANVAS_SIZE * 0.5;
                            var cy = CONFIG.LAYOUT.CANVAS_SIZE * 0.5;
                            VFX.spawnShockwave(cx, cy, winnerFac.icon.color, 300, 12, 6);
                            VFX.spawn(cx, cy, winnerFac.icon.color, 30, 'normal');
                            VFX.spawn(cx, cy - 20, CONFIG.VFX.COLORS.TEXT_LAST, 1, 'textCrit', 'FORCED END');
                            AudioService.sfx.lastone();
                            this.requestShake(CONFIG.VFX.SHAKE.LAST_ONE);
                        }
                    }
                }
            }
            s.currentNudge = 'severe';
        }
    },

    getDecayBoost: function() {
        return this._stuck.decayBoost;
    },

    reset: function() {
        if (this.grid.length !== CONFIG.GRID.TOTAL || this.lastCounts.length < FACTIONS.length) {
            this.syncBuffers();
        }
        this.grid.fill(-1);
        this.nextGrid.fill(-1);
        this.capturedThisTick.fill(0);

        for (var i = 0; i < this._layerKeys.length; i++) {
            this.clearLayer(this._layerKeys[i]);
        }

        this.winPending = false;
        this.lastOneTriggered = false;
        this.lastCounts.fill(0);
        this.domCache = {};
        this.domValues = {};
        this._pendingShake = 0;

        if (!this._sfxKeysInitialized) {
            this._sfxKeys = Object.keys(this.soundQueue);
            this._sfxKeysInitialized = true;
        }
        for (var k = 0; k < this._sfxKeys.length; k++) {
            this.soundQueue[this._sfxKeys[k]] = 0;
        }

        this._powerTick = 0;
        this._powerCacheTickAtk.fill(-1);
        this._powerCacheTickDef.fill(-1);

        var s = this._stuck;
        s.counter = 0;
        s.dominantFaction = -1;
        s.dominanceAge = 0;
        s.level = 0;
        s.lastSpeedLevel = 1;
        s.lastLogTick = 0;
        s.nudgeEndTick = 0;
        s.currentNudge = null;
        s.decayBoost = 1.0;
        s.rngVarianceBoost = 1.0;

        VFX.reset();
    }
};

if (typeof window !== 'undefined') {
    window.WorldState = WorldState;
}