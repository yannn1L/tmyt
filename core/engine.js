/**
 * ENGINE — Tick loop, speedup, win condition.
 * 
 * FIX v4:
 *   - Speedup selalu jalan sampai max (tidak block saat stuck)
 *   - Stuck monitor + resolver terintegrasi
 *   - Overlay freeze saat win (cegah VFX hilang)
 *   - cellsChanged tracking dari commit loop
 *   - Dominant faction detection (reuse loop centroid)
 */
'use strict';

var Engine = {
    loop: null,
    speedTimer: null,
    speedLevel: 1,
    currentTickRate: 150,
    indices: new Int32Array(CONFIG.GRID.TOTAL),
    cellCounts: new Int32Array(FACTION_COUNT),
    _tickCounter: 0,
    _cellsChanged: 0,
    _dominantFaction: -1,

    freeCells: [],
    freeCellCursor: 0,

    _lastCapX: -1,
    _lastCapY: -1,
    _lastCapFac: null,

    start: function() {
        WorldState.reset();

        for (var i = 0; i < CONFIG.GRID.TOTAL; i++) this.indices[i] = i;

        for (var a = 0; a < WorldState.activeFactions.length; a++) {
            var fac = WorldState.activeFactions[a];
            WorldState.domCache[fac.id] = document.getElementById('stat-val-' + fac.id);
            var placed = false;
            var attempts = 0;
            while (!placed && attempts++ < CONFIG.SIMULATION.PLACEMENT_MAX_ATTEMPTS) {
                var idx = Utils.getIndex(
                    (Utils.fastRNG() * CONFIG.GRID.COLS) | 0,
                    (Utils.fastRNG() * CONFIG.GRID.ROWS) | 0
                );
                if (WorldState.grid[idx] === -1) {
                    WorldState.grid[idx] = fac.id;
                    placed = true;
                }
            }
        }

        FactionRegistry.compileAll(WorldState.activeFactions);

        // Unfreeze overlay di awal battle baru
        if (typeof Renderer !== 'undefined' && Renderer.unfreezeOverlay) {
            Renderer.unfreezeOverlay();
        }
        Renderer.reset();

        this.speedLevel = 1;
        this.currentTickRate = CONFIG.SIMULATION.BASE_TICK_MS;
        this._tickCounter = 0;
        this._cellsChanged = 0;
        this._dominantFaction = -1;
        this.freeCells.length = 0;
        this.freeCellCursor = 0;

        var popup = document.getElementById(CONFIG.UI.SPEEDUP_OVERLAY);
        if (popup) popup.classList.remove('show');

        clearInterval(this.loop);
        clearInterval(this.speedTimer);
        var self = this;
        this.loop = setInterval(function() { self.tick(); }, this.currentTickRate);
        this.speedTimer = setInterval(function() { self.triggerSpeedUp(); }, CONFIG.SIMULATION.SPEEDUP_INTERVAL_MS);

        WorldState.playSound('start');
        Renderer.isRendering = true;

        console.log('[ENGINE] Started | speed=' + this.speedLevel + 'x');
    },

    stop: function() {
        clearInterval(this.loop);
        clearInterval(this.speedTimer);
        this.loop = null;
        this.speedTimer = null;
        WorldState.domCache = {};
        WorldState.domValues = {};
        FactionRegistry.clear();
    },

    /**
     * Speedup — SELALU jalan sampai max.
     * 
     * FIX v4: Hapus early return yang matikan speedup saat stuck.
     * Justru saat stuck kita butuh speedup untuk trigger resolver.
     */
    triggerSpeedUp: function() {
        // Guard: sudah max speed
        if (this.speedLevel >= CONFIG.STUCK_RESOLVER.CRITICAL_AT_SPEED) {
            return;
        }

        this.speedLevel *= 2;
        this.currentTickRate = Math.max(CONFIG.SIMULATION.MIN_TICK_MS, 
                                         Math.floor(this.currentTickRate / 2));

        clearInterval(this.loop);
        var self = this;
        this.loop = setInterval(function() { self.tick(); }, this.currentTickRate);

        var popup = document.getElementById(CONFIG.UI.SPEEDUP_OVERLAY);
        if (popup) {
            popup.innerText = 'SPEED ' + this.speedLevel + 'X!';
            popup.classList.remove('show');
            void popup.offsetWidth;
            popup.classList.add('show');
        }

        AudioService.sfx.speedup(this.speedLevel);
        WorldState.requestShake(CONFIG.VFX.SHAKE.SPEEDUP);

        // Log saat masuk threshold stuck monitor
        if (this.speedLevel === CONFIG.STUCK_RESOLVER.ENABLE_AT_SPEED) {
            console.log('[ENGINE] Stuck monitor enabled at ' + this.speedLevel + 'x');
        }
    },

    tick: function() {
        if (WorldState.winPending) return;

        this._tickCounter++;
        WorldState.beginTick();
        WorldState.capturedThisTick.fill(0);

        if (this._tickCounter % 4 === 1) {
            Utils.shuffleArray(this.indices);
        }

        WorldState.nextGrid.set(WorldState.grid);
        WorldState.changes = 0;
        this.cellCounts.fill(0);
        Renderer.sumX.fill(0);
        Renderer.sumY.fill(0);
        Renderer.count.fill(0);

        var freeCells = this.freeCells;
        freeCells.length = 0;
        for (var fc = 0; fc < CONFIG.GRID.TOTAL; fc++) {
            if (WorldState.grid[fc] === -1) freeCells.push(fc);
        }

        this._lastCapX = -1;
        this._lastCapY = -1;
        this._lastCapFac = null;

        var hooksMap = CONFIG.ACTIVE_HOOKS;
        var activeAbilityKeys = CONFIG.ACTIVE_ABILITY_KEYS;
        var abilityCount = activeAbilityKeys.length;
        var cols = CONFIG.GRID.COLS;
        var rows = CONFIG.GRID.ROWS;
        var DIR_X = CONFIG.DIR_X;
        var DIR_Y = CONFIG.DIR_Y;

        for (var i = 0; i < CONFIG.GRID.TOTAL; i++) {
            var idx = this.indices[i];
            var owner = WorldState.grid[idx];
            var ownerFac = owner !== -1 ? WorldState.factions[owner] : null;

            for (var ak = 0; ak < abilityCount; ak++) {
                var uid = activeAbilityKeys[ak];
                var hook = hooksMap[uid];
                if (hook && hook.onTick) {
                    hook.onTick(WorldState, idx, owner, ownerFac);
                }
            }

            if (owner === -1) continue;

            var fac = ownerFac;
            var compiled = fac._compiled;

            if (WorldState.layers.ices[idx] > 0 && fac.key !== 'ices') continue;

            var x = idx % cols;
            var y = (idx / cols) | 0;

            if (fac.key === 'glitch') continue;

            var di = (Utils.fastRNG() * 4) | 0;
            var nx = x + DIR_X[di];
            var ny = y + DIR_Y[di];

            if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;

            var nIdx = ny * cols + nx;
            var targetOwner = WorldState.grid[nIdx];

            if (targetOwner === owner) continue;

            if (compiled && compiled.onBeforeAttack) {
                compiled.onBeforeAttack(WorldState, nIdx, owner, fac);
            }

            if (targetOwner === -1) {
                if (WorldState.capturedThisTick[nIdx]) continue;

                WorldState.nextGrid[nIdx] = owner;
                WorldState.capturedThisTick[nIdx] = 1;
                WorldState.changes++;
                this._lastCapX = nx;
                this._lastCapY = ny;
                this._lastCapFac = fac;
                var sfxKey = (fac.params && fac.params.sfx && fac.params.sfx.trig) || 'spread';
                WorldState.playSound(sfxKey);
                continue;
            }

            this._resolveAttack(idx, owner, fac, nIdx, nx, ny, targetOwner);
        }

        // ---- Commit grid + decay ----
        var decayLayers = CONFIG.DECAY_LAYERS;
        var decayCount = decayLayers.length;
        var decayBoost = WorldState.getDecayBoost();

        var cellsChanged = 0;

        for (var ci = 0; ci < CONFIG.GRID.TOTAL; ci++) {
            var nextOwner = WorldState.nextGrid[ci];

            if (WorldState.grid[ci] !== nextOwner) {
                cellsChanged++;
                Renderer.dirtyCells[ci] = 1;
                var cx = ci % cols;
                var cy = (ci / cols) | 0;
                if (cy > 0) Renderer.dirtyCells[ci - cols] = 1;
                if (cy < rows - 1) Renderer.dirtyCells[ci + cols] = 1;
                if (cx > 0) Renderer.dirtyCells[ci - 1] = 1;
                if (cx < cols - 1) Renderer.dirtyCells[ci + 1] = 1;
            }
            WorldState.grid[ci] = nextOwner;

            if (nextOwner !== -1) {
                Renderer.sumX[nextOwner] += ci % cols;
                Renderer.sumY[nextOwner] += (ci / cols) | 0;
                Renderer.count[nextOwner]++;
                this.cellCounts[nextOwner]++;
            }

            for (var dl = 0; dl < decayCount; dl++) {
                var arr = WorldState.layers[decayLayers[dl].key];
                if (!arr) continue;
                var decay = decayLayers[dl].decay * decayBoost;
                var v = arr[ci] - decay;
                arr[ci] = v & ~(v >> 31);
            }
        }
        this._cellsChanged = cellsChanged;

        // ---- Wipe dead faction layers ----
        for (var f = 0; f < FACTION_COUNT; f++) {
            var facD = FACTIONS[f];
            if (this.cellCounts[facD.id] === 0) {
                var arrD = WorldState.layers[facD.key];
                if (arrD) arrD.fill(0);
                if (facD.params && facD.params.extraLayers) {
                    for (var el = 0; el < facD.params.extraLayers.length; el++) {
                        var ael = WorldState.layers[facD.params.extraLayers[el]];
                        if (ael) ael.fill(0);
                    }
                }
            }
        }

        // ---- Centroids + Dominant detection (reuse loop) ----
        var dominantFaction = -1;
        var dominantCount = 0;
        for (var cc = 0; cc < FACTION_COUNT; cc++) {
            var cen = Renderer.centroids[cc];
            if (Renderer.count[cc] > 0) {
                if (!cen.active) cen._emoteSet = false;
                cen.active = true;
                cen.emote = FACTIONS[cc].icon.unicode;
                cen.x = Math.round((Renderer.sumX[cc] / Renderer.count[cc]) * CONFIG.GRID.SIZE + CONFIG.GRID.HALF_SIZE);
                cen.y = Math.round((Renderer.sumY[cc] / Renderer.count[cc]) * CONFIG.GRID.SIZE + CONFIG.GRID.HALF_SIZE);
            } else {
                cen.active = false;
            }
            if (this.cellCounts[cc] > dominantCount) {
                dominantCount = this.cellCounts[cc];
                dominantFaction = cc;
            }
        }
        this._dominantFaction = dominantFaction;

        // ---- Sound queue ----
        for (var sk in WorldState.soundQueue) {
            if (WorldState.soundQueue.hasOwnProperty(sk) && WorldState.soundQueue[sk] === 1) {
                if (AudioService.sfx[sk]) AudioService.sfx[sk]();
                WorldState.soundQueue[sk] = 0;
            }
        }

        WorldState.lastCounts.set(this.cellCounts);

        // ---- DOM % ----
        for (var af = 0; af < WorldState.activeFactions.length; af++) {
            var facA = WorldState.activeFactions[af];
            var str = ((this.cellCounts[facA.id] / CONFIG.GRID.TOTAL) * 100).toFixed(1) + '%';
            if (WorldState.domValues[facA.id] !== str) {
                WorldState.domValues[facA.id] = str;
                var elDom = WorldState.domCache[facA.id];
                if (elDom) elDom.innerText = str;
            }
        }

        // ---- Stuck Monitor (speed-aware) ----
        var stuckLevel = WorldState.updateStuckMonitor(
            cellsChanged,
            this.speedLevel,
            dominantFaction,
            this._tickCounter
        );

        if (stuckLevel > 0 && !WorldState.winPending) {
            WorldState.applyStuckResolver(stuckLevel, this.cellCounts, this._tickCounter);
        }

        // ---- Win check ----
        var uniformOwner = WorldState.isUniformFromCounts(this.cellCounts);
        this._handleWinConditions(uniformOwner);
    },

    _resolveAttack: function(idx, owner, fac, nIdx, nx, ny, targetOwner) {
        var myAtk = WorldState.calcPower(owner, idx, false, WorldState._bufAtk);
        var enDef = WorldState.calcPower(targetOwner, nIdx, true, WorldState._bufDef);

        if (myAtk.power > enDef.power) {
            this._handleCapture(owner, idx, nIdx, nx, ny, fac, myAtk, targetOwner);
        } else {
            this._handleBlock(nIdx, nx, ny, targetOwner);
        }
    },

    _handleCapture: function(owner, idx, nIdx, nx, ny, fac, myAtk, targetOwner) {
        if (WorldState.capturedThisTick[nIdx]) return;

        WorldState.nextGrid[nIdx] = owner;
        WorldState.capturedThisTick[nIdx] = 1;
        var customVFXHandled = false;
        var compiled = fac._compiled;

        if (myAtk.isCrit && myAtk.power !== Infinity) {
            VFX.spawn(nx * CONFIG.GRID.SIZE + 8, ny * CONFIG.GRID.SIZE - 8,
                      CONFIG.VFX.COLORS.TEXT_CRIT, 1, 'textCrit', 'CRIT!');
            WorldState.playSound('crit');
            WorldState.requestShake(CONFIG.VFX.SHAKE.CRIT);
        }

        if (compiled && compiled.onAttackSuccess) {
            customVFXHandled = compiled.onAttackSuccess(WorldState, idx, nIdx, nx, ny, fac);
        }
        if (!customVFXHandled) {
            VFX.spawn(nx * CONFIG.GRID.SIZE + 8, ny * CONFIG.GRID.SIZE + 8, fac.icon.color, 4, 'normal');
            WorldState.playSound('capture');
            if (!myAtk.isCrit) WorldState.requestShake(CONFIG.VFX.SHAKE.CAPTURE);
        }

        var enemyFac = WorldState.factions[targetOwner];
        var enemyCompiled = enemyFac._compiled;
        if (enemyCompiled && enemyCompiled.onDefendFail) {
            enemyCompiled.onDefendFail(WorldState, nIdx, targetOwner, idx, owner, enemyFac);
        }

        WorldState.changes++;
        this._lastCapX = nx;
        this._lastCapY = ny;
        this._lastCapFac = fac;
    },

    _handleBlock: function(nIdx, nx, ny, targetOwner) {
        var enemyFac = WorldState.factions[targetOwner];
        var enemyCompiled = enemyFac._compiled;

        if (enemyFac.isBlocker && Utils.fastRNG() < CONFIG.SIMULATION.BLOCK_CHANCE &&
            (!enemyCompiled || !enemyCompiled.onDefendSuccess)) {
            VFX.spawn(nx * CONFIG.GRID.SIZE + 8, ny * CONFIG.GRID.SIZE,
                      CONFIG.VFX.COLORS.TEXT_BLOCK, 1, 'text', 'BLOCK');
            WorldState.playSound('block');
        }
        if (enemyCompiled && enemyCompiled.onDefendSuccess) {
            enemyCompiled.onDefendSuccess(WorldState, nIdx, nx, ny, enemyFac);
        }
    },

    _handleWinConditions: function(uniformOwner) {
        if (uniformOwner === -1) return;

        if (WorldState.changes > 0 && !WorldState.lastOneTriggered && this._lastCapFac) {
            WorldState.lastOneTriggered = true;
            var lx = this._lastCapX * CONFIG.GRID.SIZE + 8;
            var ly = this._lastCapY * CONFIG.GRID.SIZE + 8;
            VFX.spawnShockwave(lx, ly, this._lastCapFac.icon.color, 120, 8, 4);
            VFX.spawn(lx, ly, this._lastCapFac.icon.color, 15, 'normal');
            VFX.spawn(lx, ly - 8, CONFIG.VFX.COLORS.TEXT_LAST, 1, 'text', 'LAST ONE!');
            AudioService.sfx.lastone();
            WorldState.requestShake(CONFIG.VFX.SHAKE.LAST_ONE);
            return;
        }

        if (WorldState.changes === 0) {
            WorldState.winPending = true;

            // FREEZE OVERLAY sebelum stop — cegah VFX hilang
            if (typeof Renderer !== 'undefined' && Renderer.freezeOverlay) {
                Renderer.freezeOverlay();
            }

            this.stop();
            var popup = document.getElementById(CONFIG.UI.SPEEDUP_OVERLAY);
            if (popup) popup.classList.remove('show');

            setTimeout(function() {
                var winnerFac = WorldState.factions[uniformOwner];
                var overlay = document.getElementById(CONFIG.UI.WINNER_OVERLAY);
                var textEl = document.getElementById(CONFIG.UI.WINNER_TEXT);
                overlay.style.display = 'flex';
                textEl.innerHTML = winnerFac.icon.unicode + '<br><br>' + winnerFac.name.toUpperCase() + '<br>WINS!';
                textEl.style.color = winnerFac.icon.color;
                textEl.className = 'winnerPopAnim';
                overlay.style.boxShadow = 'inset 0 0 50px ' + winnerFac.icon.color;
                AudioService.sfx.win();

                setTimeout(function() {
                    overlay.style.display = 'none';
                    textEl.className = '';
                    document.getElementById(CONFIG.UI.SCENE_SIMULATION).style.display = 'none';
                    document.getElementById(CONFIG.UI.GAME_CONTAINER).style.display = 'block';
                    document.getElementById(CONFIG.UI.SCENE_EDITOR).style.display = 'flex';
                    Renderer.isRendering = false;

                    // Unfreeze untuk battle berikutnya
                    if (typeof Renderer !== 'undefined' && Renderer.unfreezeOverlay) {
                        Renderer.unfreezeOverlay();
                    }

                    if (typeof Main !== 'undefined' && Main.onSimulationEnd) Main.onSimulationEnd();
                }, CONFIG.ANIMATION.WINNER_HOLD_MS);
            }, CONFIG.ANIMATION.WINNER_DELAY_MS);
        }
    }
};

if (typeof window !== 'undefined') window.Engine = Engine;