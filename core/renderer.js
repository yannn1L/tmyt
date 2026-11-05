/**
 * RENDERER — PixiJS stage, texture baking, dirty-queue tile updates, and active-bounce set rendering.
 *
 * Optimizations:
 * 1. dirtyQueue (Uint16Array) + dirtyCells bitflag: only updates sprites whose tile or neighbor
 *    changed instead of scanning all 400 cells every frame.
 * 2. activeBounceList (Uint16Array) swap-and-pop set: only animates tiles currently bouncing,
 *    eliminating a 400-cell loop on idle frames.
 * 3. Direct FactionRegistry lookup for tile/VFX overlay rendering without indexOf scans.
 */

import { CONFIG, Utils } from './config.js';
import { FACTIONS, FACTION_COUNT } from '../data/factions.js';
import { WorldState } from './worldstate.js';
import { FactionRegistry } from './faction-registry.js';
import { VFX } from './vfx.js';

export const Renderer = {
    app: null,
    gridContainer: null,
    gridSprites: [],
    overlayGraphics: null,
    bakedTextures: {},
    _bakedBaseSize: 16,
    _baseScaleX: 1,
    _baseScaleY: 1,
    _centroidStyle: null,
    frameCount: 0,
    shakeTime: 0,
    isRendering: false,
    fullRedraw: true,
    crtFilter: null,

    sumX: new Int32Array(FACTIONS.length),
    sumY: new Int32Array(FACTIONS.length),
    count: new Int32Array(FACTIONS.length),
    centroids: null,

    // Dirty queue & active bounce set (TypedArrays)
    dirtyCells: new Uint8Array(CONFIG.GRID.TOTAL),
    dirtyQueue: new Uint16Array(CONFIG.GRID.TOTAL),
    dirtyCount: 0,

    animTimers: new Float32Array(CONFIG.GRID.TOTAL),
    inBounceSet: new Uint8Array(CONFIG.GRID.TOTAL),
    activeBounceList: new Uint16Array(CONFIG.GRID.TOTAL),
    activeBounceCount: 0,

    tileHookCells: new Uint16Array(CONFIG.GRID.TOTAL),
    tileHookCellCount: 0,

    _overlayFrameSkip: 0,
    _overlayFrozen: false,
    _overlayWasEmpty: true,

    init: function() {
        var fCount = FACTIONS.length;
        this.centroids = new Array(fCount);
        for (var i = 0; i < fCount; i++) {
            this.centroids[i] = { x: 0, y: 0, active: false, emote: '', obj: null, _emoteSet: false };
        }

        if (typeof PIXI === 'undefined' || typeof document === 'undefined') return;

        this.app = new PIXI.Application({
            width: CONFIG.LAYOUT.CANVAS_SIZE,
            height: CONFIG.LAYOUT.CANVAS_SIZE,
            backgroundAlpha: 0,
            resolution: 1,
            antialias: false,
            powerPreference: 'high-performance'
        });
        PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
        PIXI.settings.RENDER_OPTIONS = PIXI.settings.RENDER_OPTIONS || {};
        PIXI.settings.GC_MODE = PIXI.GC_MODES.AUTO;
        PIXI.settings.GC_MAX_IDLE = 120;

        var container = document.getElementById(CONFIG.UI.PIXI_CONTAINER);
        if (container) container.appendChild(this.app.view);

        this.gridContainer = new PIXI.Container();
        this.app.stage.addChild(this.gridContainer);

        this.rebuildGrid();

        this.overlayGraphics = new PIXI.Graphics();
        var cellW = CONFIG.GRID.CELL_W || CONFIG.GRID.SIZE;
        var cellH = CONFIG.GRID.CELL_H || CONFIG.GRID.SIZE;
        this.overlayGraphics.scale.set(
            cellW / CONFIG.GRID.SIZE,
            cellH / CONFIG.GRID.SIZE
        );
        this.app.stage.addChild(this.overlayGraphics);

        this._centroidStyle = new PIXI.TextStyle({
            fontFamily: 'sans-serif',
            fontSize: 22,
            fill: '#ffffff',
            dropShadow: true,
            dropShadowColor: '#000000',
            dropShadowAlpha: 0.6,
            dropShadowBlur: 0,
            dropShadowDistance: 2,
            dropShadowAngle: Math.PI / 2
        });
        for (var t = 0; t < fCount; t++) {
            var text = new PIXI.Text('', this._centroidStyle);
            text.anchor.set(0.5);
            text.visible = false;
            this.app.stage.addChild(text);
            this.centroids[t].obj = text;
        }

        VFX.init(this.app.stage);

        if (CONFIG.CRT.ENABLED) {
            var uniforms = {
                uTime: 0.0,
                uScanline: CONFIG.CRT.SCANLINE_INTENSITY,
                uVignette: CONFIG.CRT.VIGNETTE,
                uAberration: CONFIG.CRT.CHROMATIC_ABERRATION,
                uNoise: CONFIG.CRT.NOISE
            };
            this.crtFilter = new PIXI.Filter(null, CONFIG.CRT.FRAG_SHADER, uniforms);
            this.app.stage.filters = [this.crtFilter];
        }

        var self = this;
        this.app.ticker.add(function() { self.render(); });
        this.app.ticker.maxFPS = 60;
    },

    rebuildGrid: function() {
        var total = CONFIG.GRID.TOTAL;
        if (this.dirtyCells.length !== total) {
            this.dirtyCells = new Uint8Array(total);
            this.dirtyQueue = new Uint16Array(total);
            this.animTimers = new Float32Array(total);
            this.inBounceSet = new Uint8Array(total);
            this.activeBounceList = new Uint16Array(total);
            this.tileHookCells = new Uint16Array(total);
        }
        this.dirtyCount = 0;
        this.activeBounceCount = 0;
        this.tileHookCellCount = 0;

        var cellW = CONFIG.GRID.CELL_W || CONFIG.GRID.SIZE;
        var cellH = CONFIG.GRID.CELL_H || CONFIG.GRID.SIZE;
        this._baseScaleX = cellW / this._bakedBaseSize;
        this._baseScaleY = cellH / this._bakedBaseSize;

        if (!this.gridContainer || typeof PIXI === 'undefined') return;

        // Remove surplus sprites if grid shrank
        while (this.gridSprites.length > total) {
            var oldSpr = this.gridSprites.pop();
            if (oldSpr) {
                this.gridContainer.removeChild(oldSpr);
                oldSpr.destroy();
            }
        }

        var cellX = CONFIG.CELL_X;
        var cellY = CONFIG.CELL_Y;
        var halfW = cellW * 0.5;
        var halfH = cellH * 0.5;

        for (var s = 0; s < total; s++) {
            var spr = this.gridSprites[s];
            if (!spr) {
                spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
                spr.anchor.set(0.5);
                this.gridContainer.addChild(spr);
                this.gridSprites[s] = spr;
            }
            spr.texture = PIXI.Texture.EMPTY;
            spr.x = cellX[s] * cellW + halfW;
            spr.y = cellY[s] * cellH + halfH;
            spr.scale.set(this._baseScaleX, this._baseScaleY);
        }

        if (this.overlayGraphics) {
            this.overlayGraphics.scale.set(
                cellW / CONFIG.GRID.SIZE,
                cellH / CONFIG.GRID.SIZE
            );
        }
    },

    syncGridAndFactions: function() {
        var fCount = FACTIONS.length;
        if (this.sumX.length < fCount) {
            this.sumX = new Int32Array(fCount);
            this.sumY = new Int32Array(fCount);
            this.count = new Int32Array(fCount);
        }
        if (!this.centroids) this.centroids = [];
        while (this.centroids.length < fCount) {
            var cObj = { x: 0, y: 0, active: false, emote: '', obj: null, _emoteSet: false };
            if (this.app && this.app.stage && typeof PIXI !== 'undefined' && this._centroidStyle) {
                var text = new PIXI.Text('', this._centroidStyle);
                text.anchor.set(0.5);
                text.visible = false;
                this.app.stage.addChild(text);
                cObj.obj = text;
            }
            this.centroids.push(cObj);
        }

        for (var i = 0; i < fCount; i++) {
            var fac = FACTIONS[i];
            if (typeof PIXI !== 'undefined' && typeof document !== 'undefined') {
                this.bakeFactionTexture(fac);
            }
        }

        this.rebuildGrid();
    },

    bakeFactionTexture: function(fac) {
        if (typeof PIXI === 'undefined' || typeof document === 'undefined' || !fac) return;
        if (!this._texturesByColor) this._texturesByColor = {};
        var colorKey = (fac.icon && fac.icon.color) ? fac.icon.color : '#ffffff';
        if (!this._texturesByColor[colorKey]) {
            var bs = this._bakedBaseSize;
            var q = bs / 4;
            var texArr = new Array(16);
            for (var mask = 0; mask < 16; mask++) {
                var cvs = document.createElement('canvas');
                cvs.width = bs;
                cvs.height = bs;
                var c = cvs.getContext('2d');
                c.fillStyle = colorKey;
                c.fillRect(q, q, q * 2, q * 2);
                if (mask & 1) c.fillRect(q, 0, q * 2, q);
                if (mask & 2) c.fillRect(q * 3, q, q, q * 2);
                if (mask & 4) c.fillRect(q, q * 3, q * 2, q);
                if (mask & 8) c.fillRect(0, q, q, q * 2);
                texArr[mask] = PIXI.Texture.from(cvs);
            }
            this._texturesByColor[colorKey] = texArr;
        }
        this.bakedTextures[fac.id] = this._texturesByColor[colorKey];
    },

    setCRTEnabled: function(enabled) {
        CONFIG.CRT.ENABLED = !!enabled;
        if (!this.app || !this.app.stage) return;
        if (CONFIG.CRT.ENABLED) {
            if (!this.crtFilter && typeof PIXI !== 'undefined') {
                var uniforms = {
                    uTime: 0.0,
                    uScanline: CONFIG.CRT.SCANLINE_INTENSITY,
                    uVignette: CONFIG.CRT.VIGNETTE,
                    uAberration: CONFIG.CRT.CHROMATIC_ABERRATION,
                    uNoise: CONFIG.CRT.NOISE
                };
                this.crtFilter = new PIXI.Filter(null, CONFIG.CRT.FRAG_SHADER, uniforms);
            }
            if (this.crtFilter) this.app.stage.filters = [this.crtFilter];
        } else {
            this.app.stage.filters = [];
        }
    },

    markDirty: function(idx) {
        if (this.dirtyCells[idx] === 0) {
            this.dirtyCells[idx] = 1;
            this.dirtyQueue[this.dirtyCount++] = idx;
        }
    },

    triggerBounce: function(idx) {
        this.animTimers[idx] = CONFIG.VFX.BOUNCE.DURATION;
        if (this.inBounceSet[idx] === 0) {
            this.inBounceSet[idx] = 1;
            this.activeBounceList[this.activeBounceCount++] = idx;
        }
    },

    freezeOverlay: function() {
        this._overlayFrozen = true;
    },

    unfreezeOverlay: function() {
        this._overlayFrozen = false;
        this._overlayFrameSkip = 0;
    },

    reset: function() {
        if (this.dirtyCells.length !== CONFIG.GRID.TOTAL || this.sumX.length < FACTIONS.length) {
            this.syncGridAndFactions();
        } else {
            var cellW = CONFIG.GRID.CELL_W || CONFIG.GRID.SIZE;
            var cellH = CONFIG.GRID.CELL_H || CONFIG.GRID.SIZE;
            this._baseScaleX = cellW / this._bakedBaseSize;
            this._baseScaleY = cellH / this._bakedBaseSize;
            if (this.overlayGraphics) {
                this.overlayGraphics.scale.set(cellW / CONFIG.GRID.SIZE, cellH / CONFIG.GRID.SIZE);
            }
        }

        if (this.centroids) {
            for (var i = 0; i < this.centroids.length; i++) {
                var c = this.centroids[i];
                c.active = false;
                c._emoteSet = false;
                if (c.obj) c.obj.visible = false;
            }
        }
        if (this.overlayGraphics) this.overlayGraphics.clear();
        this._overlayWasEmpty = true;
        this.shakeTime = 0;
        if (this.app && this.app.stage) {
            this.app.stage.x = 0;
            this.app.stage.y = 0;
        }
        this.dirtyCells.fill(0);
        this.dirtyCount = 0;
        this.animTimers.fill(0);
        this.inBounceSet.fill(0);
        this.activeBounceCount = 0;

        var tileHooksById = FactionRegistry.activeTileHooksByFacId;
        var hasTileHooks = CONFIG.ACTIVE_TILE_KEYS.length > 0 && tileHooksById;
        var thWrite = 0;

        for (var j = 0; j < CONFIG.GRID.TOTAL; j++) {
            if (this.gridSprites[j]) {
                this.gridSprites[j].scale.set(this._baseScaleX, this._baseScaleY);
            }
            var owner = WorldState.grid[j];
            if (owner !== -1) {
                this.triggerBounce(j);
                if (hasTileHooks && tileHooksById[owner]) {
                    this.tileHookCells[thWrite++] = j;
                }
            }
        }
        this.tileHookCellCount = thWrite;
        this.fullRedraw = true;
        this._overlayFrameSkip = 0;
        this._overlayFrozen = false;
        if (this.crtFilter) this.crtFilter.uniforms.uTime = 0;
    },

    bakeAssets: async function() {
        if (typeof PIXI === 'undefined' || typeof document === 'undefined') return;

        for (var oldColor in this._texturesByColor) {
            if (Object.prototype.hasOwnProperty.call(this._texturesByColor, oldColor)) {
                var oldArr = this._texturesByColor[oldColor];
                for (var om = 0; om < oldArr.length; om++) {
                    if (oldArr[om] && oldArr[om].destroy) oldArr[om].destroy(true);
                }
            }
        }
        this._texturesByColor = {};
        this.bakedTextures = {};

        var fillBar = document.getElementById(CONFIG.UI.LOADING_FILL);
        var fCount = FACTIONS.length;
        var totalBakes = fCount * 16;
        var progress = 0;

        for (var fIdx = 0; fIdx < fCount; fIdx++) {
            var fac = FACTIONS[fIdx];
            this.bakeFactionTexture(fac);
            progress += 16;
            if (fillBar) fillBar.style.width = ((progress / totalBakes) * 100) + '%';
        }
    },

    updateTileTexture: function(idx) {
        var spr = this.gridSprites[idx];
        if (!spr) return;
        var owner = WorldState.grid[idx];
        if (owner === -1) {
            spr.texture = PIXI.Texture.EMPTY;
            return;
        }
        if (!this.bakedTextures[owner] && WorldState.factions[owner]) {
            this.bakeFactionTexture(WorldState.factions[owner]);
        }
        var neigh = CONFIG.NEIGHBOR_IDX;
        var base = idx * 4;
        var mask = 0;
        var n0 = neigh[base];
        var n1 = neigh[base + 1];
        var n2 = neigh[base + 2];
        var n3 = neigh[base + 3];
        if (n0 !== -1 && WorldState.grid[n0] === owner) mask |= 1;
        if (n1 !== -1 && WorldState.grid[n1] === owner) mask |= 2;
        if (n2 !== -1 && WorldState.grid[n2] === owner) mask |= 4;
        if (n3 !== -1 && WorldState.grid[n3] === owner) mask |= 8;
        spr.texture = this.bakedTextures[owner] ? this.bakedTextures[owner][mask] : PIXI.Texture.EMPTY;
    },

    render: function() {
        if (!this.isRendering || !this.app) return;
        this.frameCount++;

        if (this.crtFilter && CONFIG.CRT.ENABLED) this.crtFilter.uniforms.uTime += CONFIG.CRT.TIME_INCREMENT;

        var reqShake = WorldState.consumeShake();
        if (reqShake > this.shakeTime) this.shakeTime = reqShake;

        if (this.shakeTime > 0 && CONFIG.VFX.SHAKE_ENABLED !== false) {
            this.app.stage.x = Math.round((Utils.fastRNG() - 0.5) * this.shakeTime);
            this.app.stage.y = Math.round((Utils.fastRNG() - 0.5) * this.shakeTime);
            this.shakeTime--;
        } else {
            this.shakeTime = 0;
            if (this.app.stage.x !== 0 || this.app.stage.y !== 0) {
                this.app.stage.x = 0;
                this.app.stage.y = 0;
            }
        }

        // 1. Dirty-queue tile texture updates
        if (this.fullRedraw) {
            for (var i = 0; i < CONFIG.GRID.TOTAL; i++) {
                this.updateTileTexture(i);
                this.gridSprites[i].tint = 0xFFFFFF;
                this.dirtyCells[i] = 0;
            }
            this.dirtyCount = 0;
            this.fullRedraw = false;
        } else if (this.dirtyCount > 0) {
            var dQueue = this.dirtyQueue;
            var dCount = this.dirtyCount;
            for (var k = 0; k < dCount; k++) {
                var cellIdx = dQueue[k];
                this.dirtyCells[cellIdx] = 0;
                this.updateTileTexture(cellIdx);
                if (WorldState.grid[cellIdx] !== -1) {
                    this.triggerBounce(cellIdx);
                }
            }
            this.dirtyCount = 0;
        }

        // 2. Active bounce set update (swap-and-pop)
        if (this.activeBounceCount > 0) {
            var bnc = CONFIG.VFX.BOUNCE;
            var bList = this.activeBounceList;
            var bCount = this.activeBounceCount;
            var baseSX = this._baseScaleX;
            var baseSY = this._baseScaleY;
            var bi = 0;
            while (bi < bCount) {
                var bIdx = bList[bi];
                var t = this.animTimers[bIdx] - bnc.DECAY;
                if (t <= 0) {
                    this.animTimers[bIdx] = 0;
                    this.inBounceSet[bIdx] = 0;
                    this.gridSprites[bIdx].scale.set(baseSX, baseSY);
                    bList[bi] = bList[--bCount];
                } else {
                    this.animTimers[bIdx] = t;
                    var p = 1.0 - t;
                    var s = 1 + Math.sin(p * Math.PI * bnc.ELASTICITY) * bnc.MULTIPLIER * (1 - p);
                    this.gridSprites[bIdx].scale.set(baseSX * s, baseSY * s);
                    bi++;
                }
            }
            this.activeBounceCount = bCount;
        }

        // 3. Overlay rendering (throttled to 30fps or fullRedraw, skipped when frozen)
        if (!this._overlayFrozen) {
            this._overlayFrameSkip = (this._overlayFrameSkip + 1) & 1;
            if (this._overlayFrameSkip === 0) {
                this._renderOverlay();
            }
        }

        // 4. Centroids (floating faction emotes)
        var floatY = Math.round(Utils.fastSin((this.frameCount * 8) & 511) * 3);
        var fLen = this.centroids ? this.centroids.length : 0;
        for (var ci = 0; ci < fLen; ci++) {
            var c = this.centroids[ci];
            if (c.active) {
                if (!c._emoteSet) {
                    c.obj.text = c.emote;
                    c._emoteSet = true;
                }
                c.obj.x = c.x;
                c.obj.y = c.y + floatY;
                c.obj.visible = true;
            } else if (c.obj && c.obj.visible) {
                c.obj.visible = false;
            }
        }

        VFX.updateAndDraw();
    },

    _renderOverlay: function() {
        var hasTileHooks = CONFIG.ACTIVE_TILE_KEYS.length > 0 && this.tileHookCellCount > 0;
        var vfxEntries = FactionRegistry.activeVfxEntries;
        var hasActiveVfx = false;
        for (var vCheck = 0; vCheck < vfxEntries.length; vCheck++) {
            var chk = vfxEntries[vCheck];
            if (WorldState.layerHasActiveCells[chk.key]) {
                hasActiveVfx = true;
                break;
            }
            if (chk.extraLayers) {
                for (var ec = 0; ec < chk.extraLayers.length; ec++) {
                    if (WorldState.layerHasActiveCells[chk.extraLayers[ec]]) {
                        hasActiveVfx = true;
                        break;
                    }
                }
                if (hasActiveVfx) break;
            }
        }

        if (!hasTileHooks && !hasActiveVfx) {
            if (!this._overlayWasEmpty) {
                this.overlayGraphics.clear();
                this._overlayWasEmpty = true;
            }
            return;
        }

        this.overlayGraphics.clear();
        this._overlayWasEmpty = false;

        var frame = this.frameCount;
        var cellX = CONFIG.CELL_X;
        var cellY = CONFIG.CELL_Y;

        // 1. Sparse Tile logic (iterates only cells owned by factions with onRenderTileLogic)
        if (hasTileHooks) {
            var tileHooksById = FactionRegistry.activeTileHooksByFacId;
            var thCells = this.tileHookCells;
            var thCount = this.tileHookCellCount;
            for (var tIdx = 0; tIdx < thCount; tIdx++) {
                var idx = thCells[tIdx];
                var owner = WorldState.grid[idx];
                if (owner === -1) continue;
                var tileHook = tileHooksById[owner];
                if (tileHook) {
                    tileHook(
                        this.overlayGraphics,
                        cellX[idx], cellY[idx], idx, 0, frame, WorldState.factions[owner], WorldState
                    );
                }
            }
        }

        // 2. Sparse Hazard VFX (iterates only WorldState.layerActiveList instead of all TOTAL cells)
        if (hasActiveVfx) {
            for (var vk = 0; vk < vfxEntries.length; vk++) {
                var entry = vfxEntries[vk];
                var vKey = entry.key;
                var mainActive = WorldState.layerHasActiveCells[vKey];
                var extraLayers = entry.extraLayers;
                var vfxHook = entry.hook;
                var facV = entry.fac;

                if (mainActive) {
                    var actList = WorldState.layerActiveList[vKey];
                    var actCount = WorldState.layerActiveCount[vKey] | 0;
                    var mainLayer = WorldState.layers[vKey];
                    if (actList && mainLayer) {
                        for (var ai = 0; ai < actCount; ai++) {
                            var idx2 = actList[ai];
                            if (mainLayer[idx2] > 0) {
                                vfxHook(
                                    this.overlayGraphics,
                                    cellX[idx2], cellY[idx2], idx2, frame, facV, WorldState
                                );
                            }
                        }
                    }
                }

                if (extraLayers) {
                    var mainInSet = mainActive ? WorldState.layerInActiveSet[vKey] : null;
                    for (var el = 0; el < extraLayers.length; el++) {
                        var exKey = extraLayers[el];
                        if (!WorldState.layerHasActiveCells[exKey]) continue;
                        var exList = WorldState.layerActiveList[exKey];
                        var exCount = WorldState.layerActiveCount[exKey] | 0;
                        var exLayer = WorldState.layers[exKey];
                        if (!exList || !exLayer) continue;
                        for (var ei = 0; ei < exCount; ei++) {
                            var idxEx = exList[ei];
                            if (mainInSet && mainInSet[idxEx]) continue;
                            if (exLayer[idxEx] > 0) {
                                vfxHook(
                                    this.overlayGraphics,
                                    cellX[idxEx], cellY[idxEx], idxEx, frame, facV, WorldState
                                );
                            }
                        }
                    }
                }
            }
        }
    }
};

/**
 * RETRO BACKGROUND — Pre-rendered emoji + 30fps throttle
 */
export const RetroBackground = {
    canvas: null,
    ctx: null,
    rafId: 0,
    running: false,
    _w: 0,
    _h: 0,
    _emojiCache: {},
    _particles: [],
    _time: 0,
    _lastDraw: 0,
    _frameInterval: 1000 / 30,
    _resizeHandler: null,

    start: function() {
        if (!CONFIG.BACKGROUND.ENABLED || this.running || typeof document === 'undefined') return;
        this.running = true;
        this._time = 0;
        this._lastDraw = 0;

        var cfg = CONFIG.BACKGROUND;

        var EMOJI_PRECISION = 128;
        for (var f = 0; f < FACTIONS.length; f++) {
            var em = FACTIONS[f].icon.unicode;
            if (!em || this._emojiCache[em]) continue;
            var ec = document.createElement('canvas');
            ec.width = EMOJI_PRECISION;
            ec.height = EMOJI_PRECISION;
            var ecx = ec.getContext('2d');
            ecx.font = (EMOJI_PRECISION * 0.7) + 'px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
            ecx.textAlign = 'center';
            ecx.textBaseline = 'middle';
            ecx.fillText(em, EMOJI_PRECISION / 2, EMOJI_PRECISION / 2);
            this._emojiCache[em] = ec;
        }

        var c = document.createElement('canvas');
        c.style.position = 'fixed';
        c.style.top = '0';
        c.style.left = '0';
        c.style.width = '100vw';
        c.style.height = '100vh';
        c.style.zIndex = '-1';
        c.style.pointerEvents = 'none';
        document.body.appendChild(c);
        this.canvas = c;
        this.ctx = c.getContext('2d', { alpha: true });

        this._w = c.width = window.innerWidth;
        this._h = c.height = window.innerHeight;

        var self = this;
        var resizeTimer = 0;
        this._resizeHandler = function() {
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function() {
                if (!self.canvas) return;
                self._w = self.canvas.width = window.innerWidth;
                self._h = self.canvas.height = window.innerHeight;
            }, 150);
        };
        window.addEventListener('resize', this._resizeHandler);

        var emojis = [];
        for (var k = 0; k < FACTIONS.length; k++) {
            if (FACTIONS[k].icon.unicode) emojis.push(FACTIONS[k].icon.unicode);
        }

        this._particles = new Array(cfg.PARTICLE_COUNT);
        for (var i = 0; i < cfg.PARTICLE_COUNT; i++) {
            this._particles[i] = {
                x: Math.random() * this._w,
                y: Math.random() * this._h,
                vx: (Math.random() - 0.5) * cfg.PARTICLE_VELOCITY,
                vy: (Math.random() - 0.5) * cfg.PARTICLE_VELOCITY,
                emote: emojis[(Math.random() * emojis.length) | 0],
                size: cfg.PARTICLE_SIZE_MIN + Math.random() * (cfg.PARTICLE_SIZE_MAX - cfg.PARTICLE_SIZE_MIN),
                phase: Math.random() * Math.PI * 2
            };
        }

        this._rafId = requestAnimationFrame(function(now) { self._draw(now); });
    },

    _draw: function(now) {
        if (!this.running) return;
        var self = this;
        this._rafId = requestAnimationFrame(function(n) { self._draw(n); });

        if (now - this._lastDraw < this._frameInterval) return;
        this._lastDraw = now;

        var cfg = CONFIG.BACKGROUND;
        var ctx = this.ctx;
        var w = this._w, h = this._h;
        if (w === 0 || h === 0) return;

        this._time++;
        ctx.clearRect(0, 0, w, h);

        var offsetX = (this._time * cfg.GRID_SPEED) % cfg.GRID_SIZE;
        var offsetY = (this._time * cfg.GRID_SPEED) % cfg.GRID_SIZE;
        var hue = (this._time * cfg.HUE_SPEED) % 360;

        ctx.strokeStyle = 'hsla(' + hue + ', 100%, 50%, ' + cfg.GRID_ALPHA + ')';
        ctx.lineWidth = cfg.GRID_LINE_WIDTH;
        ctx.beginPath();
        for (var x = offsetX; x < w; x += cfg.GRID_SIZE) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
        for (var y = offsetY; y < h; y += cfg.GRID_SIZE) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
        ctx.stroke();

        ctx.globalAlpha = cfg.PARTICLE_ALPHA;
        var pad = cfg.BOUNDS_PADDING;
        var particles = this._particles;
        for (var p = 0; p < particles.length; p++) {
            var pt = particles[p];
            pt.x += pt.vx;
            pt.y += pt.vy;
            if (pt.x < -pad) pt.x = w + pad;
            if (pt.x > w + pad) pt.x = -pad;
            if (pt.y < -pad) pt.y = h + pad;
            if (pt.y > h + pad) pt.y = -pad;

            var drawY = pt.y + Math.sin(this._time * cfg.PARTICLE_BOB_SPEED + pt.phase) * cfg.PARTICLE_BOB_AMP;
            var img = this._emojiCache[pt.emote];
            if (img) {
                var half = pt.size * 0.5;
                ctx.drawImage(img, pt.x - half, drawY - half, pt.size, pt.size);
            }
        }
        ctx.globalAlpha = 1.0;
    },

    stop: function() {
        this.running = false;
        if (this._rafId) cancelAnimationFrame(this._rafId);
        if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        this.canvas = null;
        this.ctx = null;
    }
};

export const initRetroBackground = function() {
    RetroBackground.start();
};

if (typeof window !== 'undefined') {
    window.Renderer = Renderer;
    window.initRetroBackground = initRetroBackground;
    window.RetroBackground = RetroBackground;
}