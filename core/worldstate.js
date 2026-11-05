/**
 * WORLD STATE — Grid, layers, power, stuck monitor + resolver.
 * 
 * FIX v6:
 *   - applyStuckResolver level 2: guard capturedThisTick (cegah overwrite)
 *   - applyStuckResolver level 3: mark capturedThisTick di force convert
 *   - Robust power cache
 *   - Speed-aware stuck monitor (fast path < 32x)
 *   - Zero additional grid scan
 */
'use strict';

var WorldState = {
    factions: {},
    activeFactions: [],
    grid: new Int8Array(CONFIG.GRID.TOTAL).fill(-1),
    nextGrid: new Int8Array(CONFIG.GRID.TOTAL).fill(-1),
    changes: 0,
    layers: {},
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

    // ---- Stuck Monitor State ----
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

    // ========================================================================
    // SHARED UTILITIES
    // ========================================================================

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

    // ========================================================================
    // LAYER & POWER
    // ========================================================================

    initLayers: function() {
        for (var i = 0; i < FACTION_COUNT; i++) {
            var f = FACTIONS[i];
            this.layers[f.key] = new Int16Array(CONFIG.GRID.TOTAL);
            if (f.params && f.params.extraLayers) {
                for (var j = 0; j < f.params.extraLayers.length; j++) {
                    this.layers[f.params.extraLayers[j]] = new Int16Array(CONFIG.GRID.TOTAL);
                }
            }
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
     * Compute power dengan resolver-based modifiers.
     * Cache key = facId * TOTAL + idx (prevents cross-faction poisoning).
     */
    calcPower: function(facId, idx, isDefending, out) {
        var TOTAL = CONFIG.GRID.TOTAL;
        var cacheKey = facId * TOTAL + idx;

        // Cache hit
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

        // Guard: faction undefined
        var fac = this.factions[facId];
        if (!fac) {
            if (!out) out = isDefending ? this._bufDef : this._bufAtk;
            out.power = 0;
            out.isCrit = false;
            return out;
        }

        var stats = fac.baseStats;

        // 1. Base formula (precomputed atau fallback)
        var pow = fac._basePower;
        if (pow === undefined) {
            var formula = fac.powerFormula || CONFIG.POWER.BASE_FORMULA;
            pow = stats.att * formula.attWeight
                + stats.res * formula.resWeight
                + stats.spr * formula.sprWeight
                + (stats.att + stats.res) * (formula.balancedBonus || 0);
        }

        // 2. Hook onPowerCalc
        var compiled = fac._compiled;
        if (compiled && compiled.onPowerCalc) {
            pow = compiled.onPowerCalc(this, idx, pow, fac);
        }

        // 3. Power modifiers (resolver)
        var mods = fac.powerModifiers;
        if (mods && mods.length > 0) {
            var registry = CONFIG.POWER.MODIFIERS;
            var ctx = {
                ws: this, idx: idx, fac: fac,
                isDefending: isDefending, modifier: null
            };
            for (var m = 0; m < mods.length; m++) {
                var mod = mods[m];
                var resolver = registry[mod.type];
                if (resolver) {
                    ctx.modifier = mod;
                    pow *= resolver(ctx);
                }
            }
        }

        // 4. Hook onDefendCalc
        if (compiled && compiled.onDefendCalc && isDefending) {
            pow = compiled.onDefendCalc(this, idx, pow, fac);
        }

        // 5. RNG variance (dengan stuck boost)
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

        // Store cache
        if (isDefending) {
            this._powerCacheDef[cacheKey] = pow;
            this._powerCacheTickDef[cacheKey] = this._powerTick;
        } else {
            this._powerCacheAtk[cacheKey] = pow;
            this._powerCacheCritAtk[cacheKey] = isCrit ? 1 : 0;
            this._powerCacheTickAtk[cacheKey] = this._powerTick;
        }

        if (!out) out = isDefending ? this._bufDef : this._bufAtk;
        out.power = pow;
        out.isCrit = isCrit;
        return out;
    },

    isUniformFromCounts: function(cellCounts) {
        for (var i = 0; i < FACTION_COUNT; i++) {
            if (cellCounts[i] === CONFIG.GRID.TOTAL) return i;
        }
        return -1;
    },

    // ========================================================================
    // STUCK MONITOR — Speed-aware, zero-cost saat speed rendah
    // ========================================================================

    /**
     * Update stuck monitor.
     * 
     * FAST PATH: speed < ENABLE_AT_SPEED → ~3 ops → return 0
     * SLOW PATH: ~15 ops → score-based level detection
     * 
     * @param {number} cellsChanged - Dari Engine commit loop
     * @param {number} speedLevel   - Speed multiplier
     * @param {number} dominantFaction - Dari Engine centroid loop
     * @param {number} currentTick  - Tick counter
     * @returns {number} Stuck level (0-3)
     */
    updateStuckMonitor: function(cellsChanged, speedLevel, dominantFaction, currentTick) {
        var cfg = CONFIG.STUCK_RESOLVER;
        var s = this._stuck;

        // ===== FAST PATH =====
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

        // ===== SLOW PATH =====
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

        // ===== SCORE =====
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

        // Log on state change (throttled)
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

    /**
     * Apply stuck resolver berdasarkan level.
     * Idempotent — aman dipanggil berkali-kali.
     * 
     * FIX v6:
     *   - Level 2: guard capturedThisTick (cegah overwrite)
     *   - Level 3: mark capturedThisTick di force convert
     */
    applyStuckResolver: function(level, cellCounts, currentTick) {
        if (level <= 0) return;

        var cfg = CONFIG.STUCK_RESOLVER;
        var s = this._stuck;

        // Skip kalau masih dalam masa nudge sebelumnya
        if (currentTick < s.nudgeEndTick) return;

        if (level === 1) {
            // MILD: boost decay + RNG variance
            s.decayBoost = cfg.MILD_DECAY_BOOST;
            s.rngVarianceBoost = cfg.MILD_RNG_VARIANCE_BOOST;
            s.nudgeEndTick = currentTick + cfg.MILD_DURATION_TICKS;
            s.currentNudge = 'mild';

            if (cfg.LOG_LEVEL === 'verbose') {
                console.log('[RESOLVER] Mild applied (decay=' + s.decayBoost + 'x)');
            }
        } else if (level === 2) {
            // MODERATE: force decay layer tinggi + random capture
            var threshold = cfg.MODERATE_FORCE_DECAY_THRESHOLD;
            var factor = cfg.MODERATE_FORCE_DECAY_FACTOR;
            var keys = this._layerKeys;
            for (var k = 0; k < keys.length; k++) {
                var arr = this.layers[keys[k]];
                if (!arr) continue;
                for (var i = 0; i < arr.length; i++) {
                    if (arr[i] > threshold) {
                        arr[i] = Math.floor(arr[i] * factor);
                    }
                }
            }

            // Random capture ke dominant
            var dom = s.dominantFaction;
            if (dom !== -1 && dom < FACTION_COUNT) {
                var chance = cfg.MODERATE_RANDOM_CAPTURE_CHANCE;
                var captured = 0;
                for (var c = 0; c < CONFIG.GRID.TOTAL; c++) {
                    var owner = this.grid[c];
                    if (owner === -1 || owner === dom) continue;
                    // FIX v6: guard capturedThisTick
                    if (this.capturedThisTick[c]) continue;
                    if (Utils.fastRNG() >= chance) continue;

                    this.nextGrid[c] = dom;
                    this.capturedThisTick[c] = 1;   // ← mark
                    this.changes++;
                    captured++;
                }
                if (captured > 0 && cfg.LOG_LEVEL !== 'off') {
                    console.log('[RESOLVER] Moderate: force-captured ' + captured + ' cells');
                }
            }

            s.nudgeEndTick = currentTick + cfg.MODERATE_DURATION_TICKS;
            s.currentNudge = 'moderate';
        } else if (level >= 3) {
            // SEVERE: force convert semua cell ke dominant
            if (cfg.SEVERE_FORCE_CONVERT) {
                var domSev = s.dominantFaction;
                if (domSev === -1 || domSev >= FACTION_COUNT) {
                    // Fallback: cari dominant dari cellCounts
                    var maxCount = 0;
                    for (var f = 0; f < FACTION_COUNT; f++) {
                        if (cellCounts[f] > maxCount) {
                            maxCount = cellCounts[f];
                            domSev = f;
                        }
                    }
                }

                if (domSev !== -1) {
                    // FIX v6: mark capturedThisTick di force convert
                    for (var cc = 0; cc < CONFIG.GRID.TOTAL; cc++) {
                        this.nextGrid[cc] = domSev;
                        this.capturedThisTick[cc] = 1;
                    }
                    for (var kk = 0; kk < this._layerKeys.length; kk++) {
                        this.layers[this._layerKeys[kk]].fill(0);
                    }

                    if (cfg.LOG_LEVEL !== 'off') {
                        console.log('[RESOLVER] Severe: force victory to faction ' + domSev);
                    }

                    if (cfg.SEVERE_TRIGGER_LAST_ONE) {
                        var winnerFac = this.factions[domSev];
                        if (winnerFac && winnerFac.icon) {
                            var cx = (CONFIG.GRID.COLS / 2) * CONFIG.GRID.SIZE;
                            var cy = (CONFIG.GRID.ROWS / 2) * CONFIG.GRID.SIZE;
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

    /**
     * Get decay boost multiplier (dipakai di Engine decay loop).
     */
    getDecayBoost: function() {
        return this._stuck.decayBoost;
    },

    // ========================================================================
    // RESET
    // ========================================================================

    reset: function() {
        this.grid.fill(-1);
        this.nextGrid.fill(-1);
        this.capturedThisTick.fill(0);

        for (var i = 0; i < this._layerKeys.length; i++) {
            this.layers[this._layerKeys[i]].fill(0);
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

        // Reset stuck monitor
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

if (typeof window !== 'undefined') window.WorldState = WorldState;