/**
 * ENGINE — Faction-agnostic ECS tick loop, speedup escalation, and win resolution.
 *
 * Optimizations:
 * 1. Uses precomputed NEIGHBOR_IDX and CELL_X/CELL_Y tables (zero modulo/division in hot loops).
 * 2. Uses declarative faction.traits (freezeImmune, skipStandardSpread, isBlocker) instead of
 *    hardcoded faction key checks.
 * 3. Skips empty hazard/decay layers in O(1) via WorldState.layerHasActiveCells.
 * 4. Pushes changed tiles and their orthogonal neighbors directly to Renderer.markDirty(idx).
 */

import { CONFIG, Utils } from './config.js';
import { FACTIONS, FACTION_COUNT } from '../data/factions.js';
import { WorldState } from './worldstate.js';
import { FactionRegistry } from './faction-registry.js';
import { Renderer } from './renderer.js';
import { VFX } from './vfx.js';
import { AudioService } from './audio.js';

export const Engine = {
    loop: null,
    speedTimer: null,
    speedLevel: 1,
    currentTickRate: 150,
    paused: false,
    indices: new Int32Array(CONFIG.GRID.TOTAL),
    cellCounts: new Int32Array(FACTIONS.length),
    _tickCounter: 0,
    _cellsChanged: 0,
    _capturesThisTick: 0,
    _dominantFaction: -1,

    freeCells: new Int32Array(CONFIG.GRID.TOTAL),
    freeCellsCount: 0,
    freeCellCursor: 0,

    _activeLayerTicksBuf: [],
    _lastCapX: -1,
    _lastCapY: -1,
    _lastCapFac: null,
    _winTimeouts: [],

    syncBuffers: function() {
        var total = CONFIG.GRID.TOTAL;
        var fCount = FACTIONS.length;
        if (this.indices.length !== total) {
            this.indices = new Int32Array(total);
            for (var i = 0; i < total; i++) this.indices[i] = i;
        }
        if (this.freeCells.length !== total) {
            this.freeCells = new Int32Array(total);
        }
        if (this.cellCounts.length < fCount) {
            this.cellCounts = new Int32Array(fCount);
        }
    },

    start: function() {
        this._clearWinTimeouts();
        this.syncBuffers();
        WorldState.reset();

        for (var i = 0; i < CONFIG.GRID.TOTAL; i++) this.indices[i] = i;

        for (var a = 0; a < WorldState.activeFactions.length; a++) {
            var fac = WorldState.activeFactions[a];
            if (typeof document !== 'undefined') {
                WorldState.domCache[fac.id] = document.getElementById('stat-val-' + fac.id);
            }
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

        if (Renderer && Renderer.unfreezeOverlay) {
            Renderer.unfreezeOverlay();
        }
        Renderer.reset();

        this.speedLevel = 1;
        this.currentTickRate = CONFIG.SIMULATION.BASE_TICK_MS;
        this.paused = false;
        this._tickCounter = 0;
        this._cellsChanged = 0;
        this._capturesThisTick = 0;
        this._dominantFaction = -1;
        this.freeCellsCount = 0;
        this.freeCellCursor = 0;

        if (typeof document !== 'undefined') {
            document.body.dataset.state = 'playing';
            var popup = document.getElementById(CONFIG.UI.SPEEDUP_OVERLAY);
            if (popup) popup.classList.remove('show');
        }

        clearInterval(this.loop);
        clearInterval(this.speedTimer);
        var self = this;
        this.loop = setInterval(function() { self.tick(); }, this.currentTickRate);
        this.speedTimer = setInterval(function() { self.triggerSpeedUp(); }, CONFIG.SIMULATION.SPEEDUP_INTERVAL_MS);

        WorldState.playSound('start');
        Renderer.isRendering = true;

        console.log('[ENGINE] Started | speed=' + this.speedLevel + 'x');
    },

    _clearWinTimeouts: function() {
        for (var i = 0; i < this._winTimeouts.length; i++) {
            clearTimeout(this._winTimeouts[i]);
        }
        this._winTimeouts.length = 0;
    },

    togglePause: function() {
        if (WorldState.winPending || (!this.loop && !this.paused)) return false;
        this.paused = !this.paused;
        if (typeof document !== 'undefined') {
            document.body.dataset.state = this.paused ? 'paused' : 'playing';
        }
        return this.paused;
    },

    stop: function() {
        clearInterval(this.loop);
        clearInterval(this.speedTimer);
        this.loop = null;
        this.speedTimer = null;
        this.paused = false;
        WorldState.domCache = {};
        WorldState.domValues = {};
        FactionRegistry.clear();
    },

    triggerSpeedUp: function() {
        if (this.paused || WorldState.winPending) return;
        if (this.speedLevel >= CONFIG.STUCK_RESOLVER.CRITICAL_AT_SPEED) {
            return;
        }

        this.speedLevel *= 2;
        this.currentTickRate = Math.max(
            CONFIG.SIMULATION.MIN_TICK_MS,
            Math.floor(this.currentTickRate / 2)
        );

        clearInterval(this.loop);
        var self = this;
        this.loop = setInterval(function() { self.tick(); }, this.currentTickRate);

        if (typeof document !== 'undefined') {
            var popup = document.getElementById(CONFIG.UI.SPEEDUP_OVERLAY);
            if (popup) {
                popup.innerText = 'SPEED ' + this.speedLevel + 'X!';
                popup.classList.remove('show');
                void popup.offsetWidth;
                popup.classList.add('show');
            }
        }

        AudioService.sfx.speedup(this.speedLevel);
        WorldState.requestShake(CONFIG.VFX.SHAKE.SPEEDUP);

        if (this.speedLevel === CONFIG.STUCK_RESOLVER.ENABLE_AT_SPEED) {
            console.log('[ENGINE] Stuck monitor enabled at ' + this.speedLevel + 'x');
        }
    },

    tick: function() {
        if (WorldState.winPending || this.paused) return;

        if (this.indices.length !== CONFIG.GRID.TOTAL || this.cellCounts.length < FACTIONS.length) {
            this.syncBuffers();
            WorldState.syncBuffers();
            Renderer.syncGridAndFactions();
        }

        this._tickCounter++;
        this._capturesThisTick = 0;
        WorldState.beginTick();
        WorldState.capturedThisTick.fill(0);

        if ((this._tickCounter & 3) === 1) {
            Utils.shuffleArray(this.indices);
        }

        var TOTAL = CONFIG.GRID.TOTAL;
        var grid = WorldState.grid;
        var nextGrid = WorldState.nextGrid;
        nextGrid.set(grid);
        WorldState.changes = 0;
        this.cellCounts.fill(0);
        Renderer.sumX.fill(0);
        Renderer.sumY.fill(0);
        Renderer.count.fill(0);

        var freeCells = this.freeCells;
        var freeCount = 0;
        for (var fc = 0; fc < TOTAL; fc++) {
            if (grid[fc] === -1) freeCells[freeCount++] = fc;
        }
        this.freeCellsCount = freeCount;

        this._lastCapX = -1;
        this._lastCapY = -1;
        this._lastCapFac = null;

        // Gather only currently-active layer tick hooks for this tick
        var ownerTickHooksById = FactionRegistry.activeOwnerTickHooksByFacId;
        var globalTickHooks = FactionRegistry.activeGlobalTickHooks;
        var globalTickCount = globalTickHooks.length;
        var allLayerTickEntries = FactionRegistry.activeLayerTickEntries;
        var activeLayerTicks = this._activeLayerTicksBuf;
        var activeLayerTickCount = 0;

        for (var lte = 0; lte < allLayerTickEntries.length; lte++) {
            var entry = allLayerTickEntries[lte];
            var lKey = entry.layerKey;
            if (WorldState.layerHasActiveCells[lKey] && WorldState.layers[lKey]) {
                activeLayerTicks[activeLayerTickCount++] = entry;
            }
        }

        var neighTable = CONFIG.NEIGHBOR_IDX;
        var cellX = CONFIG.CELL_X;
        var cellY = CONFIG.CELL_Y;
        var icesLayer = WorldState.layers.ices;
        var icesActive = WorldState.layerHasActiveCells.ices === true;
        var factionsMap = WorldState.factions;

        for (var i = 0; i < TOTAL; i++) {
            var idx = this.indices[i];
            var owner = grid[idx];
            var ownerFac = owner !== -1 ? factionsMap[owner] : null;

            // 1a. Layer-gated hazard tick hooks (only evaluated on cells with active layer > 0)
            for (var lk = 0; lk < activeLayerTickCount; lk++) {
                var lEntry = activeLayerTicks[lk];
                if (WorldState.layers[lEntry.layerKey][idx] > 0) {
                    lEntry.hook(WorldState, idx, owner, ownerFac);
                }
            }

            // 1b. Global fallback tick hooks (if any custom ability requires non-owned cell ticks)
            for (var gk = 0; gk < globalTickCount; gk++) {
                globalTickHooks[gk](WorldState, idx, owner, ownerFac);
            }

            if (owner === -1) continue;

            // 1c. O(1) Owner-dispatched tick hook (only runs for the faction owning this cell)
            var ownerTickHook = ownerTickHooksById[owner];
            if (ownerTickHook) {
                ownerTickHook(WorldState, idx, owner, ownerFac);
            }

            var fac = ownerFac;
            var traits = fac.traits;

            // 2. Check freeze status & spread traits (O(1) short-circuit when ices layer is inactive)
            if (icesActive && icesLayer && icesLayer[idx] > 0 && !(traits && traits.freezeImmune)) continue;
            if (traits && traits.skipStandardSpread) continue;

            // 3. O(1) neighbor lookup
            var di = (Utils.fastRNG() * 4) | 0;
            var nIdx = neighTable[idx * 4 + di];
            if (nIdx === -1) continue;

            var targetOwner = grid[nIdx];
            if (targetOwner === owner) continue;

            var compiled = fac._compiled;
            if (compiled && compiled.onBeforeAttack) {
                compiled.onBeforeAttack(WorldState, nIdx, owner, fac);
            }

            var nx = cellX[nIdx];
            var ny = cellY[nIdx];

            if (targetOwner === -1) {
                if (WorldState.capturedThisTick[nIdx]) continue;

                nextGrid[nIdx] = owner;
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

        // ---- Commit grid + O(1) dirty tile queuing + sparse tileHookCells collection ----
        var cellsChanged = 0;
        var ownerBoundLayersById = FactionRegistry.activeOwnerBoundLayersByFacId;
        var tileHooksById = FactionRegistry.activeTileHooksByFacId;
        var hasTileHooks = CONFIG.ACTIVE_TILE_KEYS.length > 0 && tileHooksById;
        var tileHookCells = Renderer.tileHookCells;
        var tileHookWriteIdx = 0;

        for (var ci = 0; ci < TOTAL; ci++) {
            var prevOwner = grid[ci];
            var nextOwner = nextGrid[ci];

            if (prevOwner !== nextOwner) {
                cellsChanged++;
                if (prevOwner !== -1) {
                    var boundLayerKey = ownerBoundLayersById[prevOwner];
                    if (boundLayerKey && WorldState.layers[boundLayerKey]) {
                        WorldState.layers[boundLayerKey][ci] = 0;
                    }
                }
                Renderer.markDirty(ci);
                var nBase = ci * 4;
                var n0 = neighTable[nBase];
                var n1 = neighTable[nBase + 1];
                var n2 = neighTable[nBase + 2];
                var n3 = neighTable[nBase + 3];
                if (n0 !== -1) Renderer.markDirty(n0);
                if (n1 !== -1) Renderer.markDirty(n1);
                if (n2 !== -1) Renderer.markDirty(n2);
                if (n3 !== -1) Renderer.markDirty(n3);
            }
            grid[ci] = nextOwner;

            if (nextOwner !== -1) {
                Renderer.sumX[nextOwner] += cellX[ci];
                Renderer.sumY[nextOwner] += cellY[ci];
                Renderer.count[nextOwner]++;
                this.cellCounts[nextOwner]++;
                if (hasTileHooks && tileHookCells && tileHooksById[nextOwner]) {
                    tileHookCells[tileHookWriteIdx++] = ci;
                }
            }
        }
        Renderer.tileHookCellCount = tileHookWriteIdx;
        this._cellsChanged = cellsChanged;

        // ---- Sparse Hazard & Layer Decay System (iterates only active cells via swap-and-pop) ----
        var decayLayers = CONFIG.DECAY_LAYERS;
        var decayBoost = WorldState.getDecayBoost();
        for (var dl = 0; dl < decayLayers.length; dl++) {
            var dKey = decayLayers[dl].key;
            if (!WorldState.layerHasActiveCells[dKey]) continue;
            var arr = WorldState.layers[dKey];
            if (!arr) continue;

            var actList = WorldState.layerActiveList[dKey];
            var inSet = WorldState.layerInActiveSet[dKey];
            var actCount = WorldState.layerActiveCount[dKey] | 0;
            if (actCount === 0) {
                actCount = WorldState.syncLayerActiveList(dKey);
            }

            var decay = decayLayers[dl].decay * decayBoost;
            var di2 = 0;
            while (di2 < actCount) {
                var cIdx = actList[di2];
                var val = arr[cIdx] - decay;
                if (val > 0) {
                    arr[cIdx] = val;
                    di2++;
                } else {
                    arr[cIdx] = 0;
                    inSet[cIdx] = 0;
                    actList[di2] = actList[--actCount];
                }
            }
            WorldState.layerActiveCount[dKey] = actCount;
            WorldState.layerHasActiveCells[dKey] = actCount > 0;
        }

        // Compact non-decay active layers whose cells may have been zeroed this tick
        var allLayerKeys = WorldState._layerKeys;
        for (var lkIdx = 0; lkIdx < allLayerKeys.length; lkIdx++) {
            var kCheck = allLayerKeys[lkIdx];
            if (!WorldState.layerHasActiveCells[kCheck]) continue;
            var cArr = WorldState.layers[kCheck];
            var cList = WorldState.layerActiveList[kCheck];
            var cInSet = WorldState.layerInActiveSet[kCheck];
            var cCount = WorldState.layerActiveCount[kCheck] | 0;
            if (!cArr || !cList || !cInSet) continue;
            var ci2 = 0;
            while (ci2 < cCount) {
                var checkCell = cList[ci2];
                if (cArr[checkCell] > 0) {
                    ci2++;
                } else {
                    cInSet[checkCell] = 0;
                    cList[ci2] = cList[--cCount];
                }
            }
            WorldState.layerActiveCount[kCheck] = cCount;
            WorldState.layerHasActiveCells[kCheck] = cCount > 0;
        }

        var fCount = FACTIONS.length;
        // ---- Wipe dead faction layers ----
        for (var f = 0; f < fCount; f++) {
            var facD = FACTIONS[f];
            if (this.cellCounts[facD.id] === 0) {
                if (WorldState.layerHasActiveCells[facD.key]) {
                    WorldState.clearLayer(facD.key);
                }
                if (facD.params && facD.params.extraLayers) {
                    for (var el = 0; el < facD.params.extraLayers.length; el++) {
                        var exKey = facD.params.extraLayers[el];
                        if (WorldState.layerHasActiveCells[exKey]) {
                            WorldState.clearLayer(exKey);
                        }
                    }
                }
            }
        }

        // ---- Centroids + Dominant detection ----
        var dominantFaction = -1;
        var dominantCount = 0;
        var cellW = CONFIG.GRID.CELL_W || CONFIG.GRID.SIZE;
        var cellH = CONFIG.GRID.CELL_H || CONFIG.GRID.SIZE;
        var halfW = cellW * 0.5;
        var halfH = cellH * 0.5;

        for (var cc = 0; cc < fCount; cc++) {
            var cen = Renderer.centroids ? Renderer.centroids[cc] : null;
            if (cen) {
                if (Renderer.count[cc] > 0) {
                    if (!cen.active) cen._emoteSet = false;
                    cen.active = true;
                    cen.emote = FACTIONS[cc].icon.unicode;
                    cen.x = Math.round((Renderer.sumX[cc] / Renderer.count[cc]) * cellW + halfW);
                    cen.y = Math.round((Renderer.sumY[cc] / Renderer.count[cc]) * cellH + halfH);
                } else {
                    cen.active = false;
                }
            }
            if (this.cellCounts[cc] > dominantCount) {
                dominantCount = this.cellCounts[cc];
                dominantFaction = cc;
            }
        }
        this._dominantFaction = dominantFaction;

        // ---- Sound queue ----
        for (var sk in WorldState.soundQueue) {
            if (Object.prototype.hasOwnProperty.call(WorldState.soundQueue, sk) && WorldState.soundQueue[sk] === 1) {
                if (AudioService.sfx[sk]) AudioService.sfx[sk]();
                WorldState.soundQueue[sk] = 0;
            }
        }

        WorldState.lastCounts.set(this.cellCounts.subarray(0, WorldState.lastCounts.length));

        // ---- DOM % ----
        for (var af = 0; af < WorldState.activeFactions.length; af++) {
            var facA = WorldState.activeFactions[af];
            var str = ((this.cellCounts[facA.id] / TOTAL) * 100).toFixed(1) + '%';
            if (WorldState.domValues[facA.id] !== str) {
                WorldState.domValues[facA.id] = str;
                var elDom = WorldState.domCache[facA.id];
                if (elDom) elDom.innerText = str;
            }
        }

        // ---- Stuck Monitor ----
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
        this._capturesThisTick++;
        var customVFXHandled = false;
        var compiled = fac._compiled;
        var cellW = CONFIG.GRID.CELL_W || CONFIG.GRID.SIZE;
        var cellH = CONFIG.GRID.CELL_H || CONFIG.GRID.SIZE;
        var px = nx * cellW + cellW * 0.5;
        var py = ny * cellH + cellH * 0.5;

        if (myAtk.isCrit && myAtk.power !== Infinity) {
            VFX.spawn(px, py - 8,
                      CONFIG.VFX.COLORS.TEXT_CRIT, 1, 'textCrit', 'CRIT!');
            WorldState.playSound('crit');
            WorldState.requestShake(CONFIG.VFX.SHAKE.CRIT);
        }

        if (compiled && compiled.onAttackSuccess) {
            customVFXHandled = compiled.onAttackSuccess(WorldState, idx, nIdx, nx, ny, fac, targetOwner);
        }
        if (!customVFXHandled) {
            // Adaptive capture dust pacing for enlarged grids / high speedups
            var capCount = this._capturesThisTick;
            if (capCount <= 20) {
                VFX.spawn(px, py, fac.icon.color, 4, 'normal');
            } else if (capCount <= 48) {
                VFX.spawn(px, py, fac.icon.color, 2, 'normal');
            } else if ((capCount & 1) === 0) {
                VFX.spawn(px, py, fac.icon.color, 1, 'normal');
            }
            WorldState.playSound('capture');
            if (!myAtk.isCrit) WorldState.requestShake(CONFIG.VFX.SHAKE.CAPTURE);
        }

        var enemyFac = WorldState.factions[targetOwner];
        var enemyCompiled = enemyFac ? enemyFac._compiled : null;
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
        if (!enemyFac) return;
        var enemyCompiled = enemyFac._compiled;
        var cellW = CONFIG.GRID.CELL_W || CONFIG.GRID.SIZE;
        var cellH = CONFIG.GRID.CELL_H || CONFIG.GRID.SIZE;

        if (enemyFac.isBlocker && Utils.fastRNG() < CONFIG.SIMULATION.BLOCK_CHANCE &&
            (!enemyCompiled || !enemyCompiled.onDefendSuccess)) {
            VFX.spawn(nx * cellW + cellW * 0.5, ny * cellH,
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
            var cellW = CONFIG.GRID.CELL_W || CONFIG.GRID.SIZE;
            var cellH = CONFIG.GRID.CELL_H || CONFIG.GRID.SIZE;
            var lx = this._lastCapX * cellW + cellW * 0.5;
            var ly = this._lastCapY * cellH + cellH * 0.5;
            VFX.spawnShockwave(lx, ly, this._lastCapFac.icon.color, 120, 8, 4);
            VFX.spawn(lx, ly, this._lastCapFac.icon.color, 15, 'normal');
            VFX.spawn(lx, ly - 8, CONFIG.VFX.COLORS.TEXT_LAST, 1, 'text', 'LAST ONE!');
            AudioService.sfx.lastone();
            WorldState.requestShake(CONFIG.VFX.SHAKE.LAST_ONE);
            return;
        }

        if (WorldState.changes === 0) {
            WorldState.winPending = true;

            if (Renderer && Renderer.freezeOverlay) {
                Renderer.freezeOverlay();
            }

            this.stop();
            if (typeof document !== 'undefined') {
                document.body.dataset.state = 'gameover';
                var popup = document.getElementById(CONFIG.UI.SPEEDUP_OVERLAY);
                if (popup) popup.classList.remove('show');
            }

            var self = this;
            var t1 = setTimeout(function() {
                if (typeof document === 'undefined') return;
                var winnerFac = WorldState.factions[uniformOwner];
                var overlay = document.getElementById(CONFIG.UI.WINNER_OVERLAY);
                var textEl = document.getElementById(CONFIG.UI.WINNER_TEXT);
                if (overlay && textEl && winnerFac) {
                    overlay.style.display = 'flex';
                    textEl.innerHTML = winnerFac.icon.unicode + '<br><br>' + winnerFac.name.toUpperCase() + '<br>WINS!';
                    textEl.style.color = winnerFac.icon.color;
                    textEl.className = 'winnerPopAnim';
                    overlay.style.boxShadow = 'inset 0 0 50px ' + winnerFac.icon.color;
                }
                AudioService.sfx.win();

                var t2 = setTimeout(function() {
                    if (typeof document === 'undefined') return;
                    if (overlay) overlay.style.display = 'none';
                    if (textEl) textEl.className = '';
                    var simScene = document.getElementById(CONFIG.UI.SCENE_SIMULATION);
                    var gameCont = document.getElementById(CONFIG.UI.GAME_CONTAINER);
                    var editorScene = document.getElementById(CONFIG.UI.SCENE_EDITOR);
                    if (simScene) simScene.style.display = 'none';
                    if (gameCont) gameCont.style.display = 'block';
                    if (editorScene) editorScene.style.display = 'flex';
                    document.body.dataset.state = 'title';
                    Renderer.isRendering = false;

                    if (Renderer && Renderer.unfreezeOverlay) {
                        Renderer.unfreezeOverlay();
                    }

                    if (typeof window !== 'undefined' && window.Main && window.Main.onSimulationEnd) {
                        window.Main.onSimulationEnd();
                    }
                }, CONFIG.ANIMATION.WINNER_HOLD_MS);
                self._winTimeouts.push(t2);
            }, CONFIG.ANIMATION.WINNER_DELAY_MS);
            this._winTimeouts.push(t1);
        }
    }
};

if (typeof window !== 'undefined') {
    window.Engine = Engine;
}