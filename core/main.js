/**
 * MAIN — ES Module Orchestrator, boot sequence, error catcher, FPS monitor, and UI wiring.
 */

import { UI_CONFIG } from '../data/ui-config.js';
import { SFX_DATA, SFX_COMPOSITE } from '../data/sfx-data.js';
import { CONFIG, Utils, DIRS, DIAG_DIRS, setGridDimensions } from './config.js';
import { ABILITY_PARTS } from '../data/abilities.js';
import {
    FACTIONS,
    FACTIONS_BY_KEY,
    FACTIONS_BY_ID,
    FACTION_COUNT,
    FACTION_COLOR_HEX,
    BLOCKER_KEYS_SET,
    autoDetectHazardKeys,
    registerFaction,
    unregisterFaction,
    evaluateFactionCode,
    DEFAULT_CUSTOM_FACTION_TEMPLATE
} from '../data/factions.js';
import { AudioService } from './audio.js';
import { PixiParticle, PixiShockwave, PixiLaser, VFX } from './vfx.js';
import { AbilityCompiler, FactionRegistry } from './faction-registry.js';
import { WorldState } from './worldstate.js';
import { Renderer, RetroBackground } from './renderer.js';
import { Engine } from './engine.js';

export const CustomFactionStorage = {
    STORAGE_KEY: 'tmt_custom_factions_v1',

    getSaved: function() {
        if (typeof localStorage === 'undefined') return [];
        try {
            var raw = localStorage.getItem(this.STORAGE_KEY);
            if (!raw) return [];
            var parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    },

    saveFaction: function(fac, rawCode) {
        if (typeof localStorage === 'undefined' || !fac) return;
        try {
            var list = this.getSaved();
            var entry = {
                key: fac.key,
                name: fac.name,
                unicode: (fac.icon && fac.icon.unicode) || '⭐',
                color: (fac.icon && fac.icon.color) || '#00ffcc',
                code: rawCode || fac._rawCode || ''
            };
            var idx = -1;
            for (var i = 0; i < list.length; i++) {
                if (list[i].key === entry.key) {
                    idx = i;
                    break;
                }
            }
            if (idx !== -1) {
                list[idx] = entry;
            } else {
                list.push(entry);
            }
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
        } catch (e) { /* ignore storage quota errors */ }
    },

    removeFaction: function(key) {
        if (typeof localStorage === 'undefined') return;
        try {
            var list = this.getSaved();
            var next = [];
            for (var i = 0; i < list.length; i++) {
                if (list[i].key !== key) next.push(list[i]);
            }
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(next));
        } catch (e) { /* silent */ }
    },

    restoreAll: function() {
        var list = this.getSaved();
        var restored = [];
        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            if (!item || !item.code) continue;
            try {
                var spec = evaluateFactionCode(item.code);
                var fac = registerFaction(spec, { isCustom: true, rawCode: item.code });
                restored.push(fac);
            } catch (e) {
                console.warn('[BOOT] Skipping invalid saved custom faction:', item.key, e.message);
            }
        }
        return restored;
    }
};

export const SettingsManager = {
    STORAGE_KEY: 'tmt_game_settings_v1',

    defaults: {
        cols: 20,
        rows: 20,
        baseTickMs: 150,
        speedupIntervalMs: 10000,
        audioEnabled: true,
        crtEnabled: true,
        shakeEnabled: true
    },

    current: {
        cols: 20,
        rows: 20,
        baseTickMs: 150,
        speedupIntervalMs: 10000,
        audioEnabled: true,
        crtEnabled: true,
        shakeEnabled: true
    },

    load: function() {
        this.current = {
            cols: this.defaults.cols,
            rows: this.defaults.rows,
            baseTickMs: this.defaults.baseTickMs,
            speedupIntervalMs: this.defaults.speedupIntervalMs,
            audioEnabled: this.defaults.audioEnabled,
            crtEnabled: this.defaults.crtEnabled,
            shakeEnabled: this.defaults.shakeEnabled
        };
        if (typeof localStorage === 'undefined') return this.current;
        try {
            var raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    if (typeof parsed.cols === 'number') this.current.cols = parsed.cols;
                    if (typeof parsed.rows === 'number') this.current.rows = parsed.rows;
                    if (typeof parsed.baseTickMs === 'number') this.current.baseTickMs = parsed.baseTickMs;
                    if (typeof parsed.speedupIntervalMs === 'number') this.current.speedupIntervalMs = parsed.speedupIntervalMs;
                    if (typeof parsed.audioEnabled === 'boolean') this.current.audioEnabled = parsed.audioEnabled;
                    if (typeof parsed.crtEnabled === 'boolean') this.current.crtEnabled = parsed.crtEnabled;
                    if (typeof parsed.shakeEnabled === 'boolean') {
                        this.current.shakeEnabled = parsed.shakeEnabled;
                    } else if (typeof parsed.crtEnabled === 'boolean') {
                        this.current.shakeEnabled = parsed.crtEnabled;
                    }
                }
            }
        } catch (e) { /* silent */ }
        this.apply();
        return this.current;
    },

    save: function() {
        this.apply();
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.current));
        } catch (e) { /* silent */ }
    },

    resetDefaults: function() {
        this.current = {
            cols: this.defaults.cols,
            rows: this.defaults.rows,
            baseTickMs: this.defaults.baseTickMs,
            speedupIntervalMs: this.defaults.speedupIntervalMs,
            audioEnabled: this.defaults.audioEnabled,
            crtEnabled: this.defaults.crtEnabled,
            shakeEnabled: this.defaults.shakeEnabled
        };
        this.save();
        return this.current;
    },

    apply: function() {
        CONFIG.SIMULATION.BASE_TICK_MS = this.current.baseTickMs;
        CONFIG.SIMULATION.SPEEDUP_INTERVAL_MS = this.current.speedupIntervalMs;
        AudioService.setMuted(!this.current.audioEnabled);
        CONFIG.VFX.SHAKE_ENABLED = this.current.shakeEnabled;
        Renderer.setCRTEnabled(this.current.crtEnabled);
    }
};

export const ErrorCatcher = {
    install: function() {
        if (typeof window === 'undefined') return;
        window.addEventListener('error', function(e) {
            console.error('[ERROR]', e.message);
            if (e.filename) {
                console.error('  at', e.filename, ':', e.lineno, ':', e.colno);
            }
            if (e.error && e.error.stack) console.error('  Stack:', e.error.stack);
            ErrorCatcher._safeHalt('Uncaught error');
        });

        window.addEventListener('unhandledrejection', function(e) {
            console.error('[PROMISE REJECTION]', e.reason);
            e.preventDefault();
        });

        if (typeof PIXI !== 'undefined' && PIXI.utils) {
            PIXI.utils.skipHello = true;
        }
    },

    _safeHalt: function(reason) {
        try {
            if (Engine && Engine.stop) Engine.stop();
            if (Renderer && Renderer.app && Renderer.app.ticker) {
                Renderer.isRendering = false;
            }
            console.warn('[ENGINE HALTED]', reason);
        } catch (e) {
            console.error('[HALT FAILED]', e);
        }
    }
};

export const DependencyValidator = {
    required: [
        'UI_CONFIG', 'SFX_DATA', 'SFX_COMPOSITE',
        'ABILITY_PARTS', 'AbilityCompiler', 'FactionRegistry',
        'FACTIONS', 'FACTIONS_BY_KEY', 'FACTION_COUNT', 'FACTION_COLOR_HEX',
        'CONFIG', 'Utils', 'DIRS', 'DIAG_DIRS',
        'AudioService', 'PixiParticle', 'PixiShockwave', 'PixiLaser', 'VFX',
        'WorldState', 'Renderer', 'Engine', 'RetroBackground'
    ],

    moduleMap: {
        UI_CONFIG: UI_CONFIG,
        SFX_DATA: SFX_DATA,
        SFX_COMPOSITE: SFX_COMPOSITE,
        ABILITY_PARTS: ABILITY_PARTS,
        AbilityCompiler: AbilityCompiler,
        FactionRegistry: FactionRegistry,
        FACTIONS: FACTIONS,
        FACTIONS_BY_KEY: FACTIONS_BY_KEY,
        FACTIONS_BY_ID: FACTIONS_BY_ID,
        FACTION_COUNT: FACTION_COUNT,
        FACTION_COLOR_HEX: FACTION_COLOR_HEX,
        BLOCKER_KEYS_SET: BLOCKER_KEYS_SET,
        CONFIG: CONFIG,
        Utils: Utils,
        DIRS: DIRS,
        DIAG_DIRS: DIAG_DIRS,
        AudioService: AudioService,
        PixiParticle: PixiParticle,
        PixiShockwave: PixiShockwave,
        PixiLaser: PixiLaser,
        VFX: VFX,
        WorldState: WorldState,
        Renderer: Renderer,
        Engine: Engine,
        RetroBackground: RetroBackground
    },

    validate: function() {
        var missing = [];
        for (var i = 0; i < this.required.length; i++) {
            var name = this.required[i];
            if (this.moduleMap[name] === undefined &&
                (typeof window === 'undefined' || window[name] === undefined)) {
                missing.push(name);
            }
        }
        if (missing.length > 0) {
            console.error('[BOOT] Missing dependencies:', missing.join(', '));
            throw new Error('Missing dependencies: ' + missing.join(', '));
        }
        return true;
    },

    registerRuntimeRegistries: function() {
        var decayLayers = [];
        for (var i = 0; i < FACTIONS.length; i++) {
            var f = FACTIONS[i];
            if (f.params && f.params.decay) {
                decayLayers.push({ key: f.key, decay: f.params.decay });
            }
            if (f.params && f.params.extraLayerDecay) {
                for (var el in f.params.extraLayerDecay) {
                    if (Object.prototype.hasOwnProperty.call(f.params.extraLayerDecay, el)) {
                        decayLayers.push({ key: el, decay: f.params.extraLayerDecay[el] });
                    }
                }
            }
        }
        CONFIG.DECAY_LAYERS = decayLayers;
        console.log('[BOOT] Decay layers: ' + decayLayers.length);

        if (!CONFIG.ACTIVE_ABILITY_KEYS) CONFIG.ACTIVE_ABILITY_KEYS = [];
        if (!CONFIG.ACTIVE_VFX_KEYS) CONFIG.ACTIVE_VFX_KEYS = [];
        if (!CONFIG.ACTIVE_TILE_KEYS) CONFIG.ACTIVE_TILE_KEYS = [];
        if (!CONFIG.ACTIVE_HOOKS) CONFIG.ACTIVE_HOOKS = {};

        autoDetectHazardKeys();
    }
};

export const FPSMonitor = {
    frames: 0,
    lastSample: 0,
    lastFps: 60.0,
    lastFrameMs: 16.7,
    enabled: false,
    _rafId: 0,

    start: function() {
        if ((!CONFIG.FPS.ENABLED && !(CONFIG.DEV_MODE && CONFIG.DEV_MODE.debugOverlay)) || typeof performance === 'undefined') return;
        if (this.enabled) return;
        this.enabled = true;
        this.lastSample = performance.now();
        this.frames = 0;
        this._loop();
    },

    ensureRunning: function() {
        if (CONFIG.FPS.ENABLED || (CONFIG.DEV_MODE && CONFIG.DEV_MODE.debugOverlay)) {
            this.start();
        } else {
            this.stop();
        }
    },

    _loop: function() {
        if (!this.enabled) return;
        this.frames++;
        var now = performance.now();
        var elapsed = now - this.lastSample;
        var debugActive = !!(CONFIG.DEV_MODE && CONFIG.DEV_MODE.debugOverlay);
        var interval = debugActive ? 250 : CONFIG.FPS.SAMPLE_INTERVAL_MS;

        if (elapsed >= interval) {
            var fpsVal = (this.frames * 1000 / elapsed);
            this.lastFps = fpsVal.toFixed(1);
            this.lastFrameMs = (elapsed / Math.max(1, this.frames)).toFixed(1);

            if (CONFIG.FPS.ENABLED) {
                var tickRate = Engine.currentTickRate || 0;
                var speed = Engine.speedLevel || 1;
                var activeCount = WorldState.activeFactions ? WorldState.activeFactions.length : 0;
                var activeAbilities = (CONFIG.ACTIVE_ABILITY_KEYS && CONFIG.ACTIVE_ABILITY_KEYS.length) || 0;
                var activeVfx = (CONFIG.ACTIVE_VFX_KEYS && CONFIG.ACTIVE_VFX_KEYS.length) || 0;
                var particleTotal = VFX.pool ? VFX.pool.length : 0;
                var activeParticles = VFX._activeParticleCount || 0;

                console.log(
                    CONFIG.FPS.LOG_TAG + ' ' + this.lastFps + ' fps | tick=' + tickRate + 'ms (' + speed + 'x) | ' +
                    'factions=' + activeCount + ' | abilities=' + activeAbilities + '/' + activeVfx + ' | ' +
                    'particles=' + activeParticles + '/' + particleTotal
                );
            }

            if (debugActive) {
                this.renderOverlay();
            }

            this.frames = 0;
            this.lastSample = now;
        }

        this._rafId = requestAnimationFrame(function() { FPSMonitor._loop(); });
    },

    renderOverlay: function() {
        if (typeof document === 'undefined') return;
        var el = document.getElementById(CONFIG.UI.DEBUG_OVERLAY);
        if (!el) return;
        if (!CONFIG.DEV_MODE || !CONFIG.DEV_MODE.debugOverlay) {
            el.style.display = 'none';
            return;
        }
        el.style.display = 'block';

        var tickRate = Math.round(Engine.currentTickRate || CONFIG.SIMULATION.BASE_TICK_MS);
        var speed = Engine.speedLevel || 1;
        var ticks = WorldState._tickId || 0;
        var pActive = VFX._activeParticleCount || 0;
        var pPool = VFX.pool ? VFX.pool.length : 0;
        var swActive = VFX._activeShockwaveCount || 0;
        var swPool = VFX.shockwavePool ? VFX.shockwavePool.length : 0;
        var lzActive = VFX._activeLaserCount || 0;
        var lzPool = VFX.laserPool ? VFX.laserPool.length : 0;
        var dirtyCount = Renderer.dirtyCount || 0;
        var bounceCount = Renderer.activeBounceCells ? Renderer.activeBounceCells.length : 0;
        var activeLayers = (WorldState._activeLayerList && WorldState._activeLayerList.length > 0)
            ? WorldState._activeLayerList.slice(0, 3).join(',')
            : 'none';

        el.innerHTML =
            '<div class="dbg-title">DEBUG TELEMETRY [ON]</div>' +
            '<div class="dbg-row"><span class="dbg-lbl">FPS / DT:</span><span class="dbg-val">' + this.lastFps + ' (' + this.lastFrameMs + 'ms)</span></div>' +
            '<div class="dbg-row"><span class="dbg-lbl">TICK:</span><span class="dbg-val">' + tickRate + 'ms (' + speed + 'x) #' + ticks + '</span></div>' +
            '<div class="dbg-row"><span class="dbg-lbl">ARENA:</span><span class="dbg-val">' + CONFIG.GRID.COLS + '×' + CONFIG.GRID.ROWS + ' (' + CONFIG.GRID.TOTAL + ')</span></div>' +
            '<div class="dbg-row"><span class="dbg-lbl">PARTICLES:</span><span class="dbg-val">' + pActive + ' / ' + pPool + '</span></div>' +
            '<div class="dbg-row"><span class="dbg-lbl">WAVES/LZR:</span><span class="dbg-val">' + swActive + '/' + swPool + ' | ' + lzActive + '/' + lzPool + '</span></div>' +
            '<div class="dbg-row"><span class="dbg-lbl">DIRTY/BNC:</span><span class="dbg-val">' + dirtyCount + ' / ' + bounceCount + '</span></div>' +
            '<div class="dbg-row"><span class="dbg-lbl">LAYERS:</span><span class="dbg-val">' + activeLayers + '</span></div>';
    },

    stop: function() {
        this.enabled = false;
        if (this._rafId) cancelAnimationFrame(this._rafId);
    }
};

export const UI = {
    _keyListenerInstalled: false,
    currentEditorTab: 'roster',
    _activeCustomFactionKey: 'solar',

    updateResponsiveScale: function() {
        if (typeof window === 'undefined' || typeof document === 'undefined' || !document.documentElement) return;
        var vw = window.innerWidth || 1024;
        var vh = window.innerHeight || 768;

        var editorScale = Math.max(0.95, Math.min((vw - 48) / 340, (vh - 48) / 340, 2.2));
        document.documentElement.style.setProperty('--editor-scale', editorScale.toFixed(3));

        var simWrapper = document.getElementById('sim-wrapper');
        var unscaledH = (simWrapper && simWrapper.offsetHeight > 320) ? simWrapper.offsetHeight : 490;
        var simScale = Math.max(0.85, Math.min((vw - 48) / 340, (vh - 48) / (unscaledH + 16), CONFIG.LAYOUT.SIM_SCALE));
        document.documentElement.style.setProperty(CONFIG.LAYOUT.CSS_VAR_SIM_SCALE, simScale.toFixed(3));
    },

    init: function() {
        if (typeof document === 'undefined') return;
        this.updateResponsiveScale();
        this.renderUnitList();
        this.renderSavedCustomFactions();
        this._initEditorTabsAndDevMode();
        this._initArenaGridControls();
        this._initSettingsControls();

        var btn = document.getElementById(CONFIG.UI.BTN_START);
        if (btn) {
            btn.dataset.start = 'true';
            btn.onclick = function() { UI._onStartClick(); };
        }

        this._installKeyboardShortcuts();
    },

    renderUnitList: function() {
        if (typeof document === 'undefined') return;
        var listDiv = document.getElementById(CONFIG.UI.UNIT_SELECTION);
        if (!listDiv) {
            console.error('[UI] unit-selection element not found');
            return;
        }
        listDiv.innerHTML = '';

        var activeKeys = Object.create(null);
        for (var a = 0; a < WorldState.activeFactions.length; a++) {
            activeKeys[WorldState.activeFactions[a].key] = true;
        }

        for (var i = 0; i < FACTIONS.length; i++) {
            var fac = FACTIONS[i];
            var isSelected = !!activeKeys[fac.key];
            var div = document.createElement('div');
            div.className = 'unit-item' + (isSelected ? ' selected' : '');
            div.dataset.facId = fac.id;
            div.dataset.facKey = fac.key;
            div.setAttribute('role', 'button');
            div.setAttribute('tabindex', '0');
            div.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
            div.setAttribute('aria-label', 'Select ' + fac.name + ' class');

            var iconColor = (fac.icon && fac.icon.color) || '#ffffff';
            var iconUnicode = (fac.icon && fac.icon.unicode) || fac.name[0];
            var att = (fac.baseStats && fac.baseStats.att) || 0;
            var res = (fac.baseStats && fac.baseStats.res) || 0;
            var spr = (fac.baseStats && fac.baseStats.spr) || 0;

            var delBtnHtml = fac.isCustom
                ? '<button type="button" class="unit-del-btn" data-del-key="' + fac.key + '" title="Delete custom faction">DEL</button>'
                : '';

            div.innerHTML =
                '<div class="unit-header">' +
                    '<span class="unit-emote">' + iconUnicode + '</span>' +
                    '<div class="unit-title-stats">' +
                        '<span class="unit-name" style="color: ' + iconColor + '">' + fac.name.toUpperCase() + '</span>' +
                        '<span class="unit-stats"><span style="color:#ff6b6b" title="Attack">A' + att + '</span> <span style="color:#1dd1a1" title="Resistance">R' + res + '</span> <span style="color:#48dbfb" title="Spread Speed">S' + spr + '</span></span>' +
                    '</div>' +
                '</div>' +
                '<div class="unit-badge-row">' +
                    '<span class="unit-skill-badge" style="background: ' + iconColor + '22; color: ' + iconColor + '; border: 1px solid ' + iconColor + '">' + fac.name.toUpperCase() + '</span>' +
                    delBtnHtml +
                '</div>' +
                '<div class="unit-desc-long">' + (fac.descLong || '') + '</div>';

            (function(f, d) {
                d.onclick = function(e) {
                    var target = e.target;
                    if (target && target.getAttribute && target.getAttribute('data-del-key')) {
                        e.stopPropagation();
                        UI.deleteCustomFaction(target.getAttribute('data-del-key'));
                        return;
                    }
                    UI._onUnitClick(d, f);
                };
                d.onkeydown = function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        UI._onUnitClick(d, f);
                    }
                };
            })(fac, div);

            listDiv.appendChild(div);
        }

        this._updateStartButtonState();
    },

    renderSavedCustomFactions: function() {
        if (typeof document === 'undefined') return;
        var listEl = document.getElementById('dev-saved-list');
        var countEl = document.getElementById('saved-factions-count');
        if (!listEl) return;

        var customFactions = [];
        for (var i = 0; i < FACTIONS.length; i++) {
            if (FACTIONS[i].isCustom) {
                customFactions.push(FACTIONS[i]);
            }
        }
        if (countEl) countEl.textContent = String(customFactions.length);
        listEl.innerHTML = '';

        if (customFactions.length === 0) {
            listEl.innerHTML = '<span class="dev-saved-empty">No saved custom factions yet.</span>';
            return;
        }

        for (var c = 0; c < customFactions.length; c++) {
            var fac = customFactions[c];
            var chip = document.createElement('div');
            chip.className = 'saved-fac-item';
            chip.style.borderColor = (fac.icon && fac.icon.color) || '#444';

            var loadBtn = document.createElement('button');
            loadBtn.type = 'button';
            loadBtn.className = 'saved-fac-load';
            loadBtn.textContent = ((fac.icon && fac.icon.unicode) || '⭐') + ' ' + fac.name.toUpperCase();
            loadBtn.title = 'Load ' + fac.name + ' code into editor';

            var delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'saved-fac-del';
            delBtn.textContent = '✕';
            delBtn.setAttribute('aria-label', 'Delete ' + fac.name);
            delBtn.title = 'Delete ' + fac.name;

            (function(f) {
                loadBtn.onclick = function() {
                    var codeArea = document.getElementById('dev-faction-code');
                    if (codeArea && f._rawCode) {
                        codeArea.value = f._rawCode;
                    }
                    UI._activeCustomFactionKey = f.key;
                    UI._setDevStatus('EDITING: ' + f.name.toUpperCase() + ' (' + f.key + ')', 'ok');
                };
                delBtn.onclick = function() {
                    UI.deleteCustomFaction(f.key);
                };
            })(fac);

            chip.appendChild(loadBtn);
            chip.appendChild(delBtn);
            listEl.appendChild(chip);
        }
    },

    _updateStartButtonState: function() {
        var countLbl = document.getElementById('selected-count-label');
        if (countLbl) countLbl.textContent = String(WorldState.activeFactions.length);
        var btn = document.getElementById(CONFIG.UI.BTN_START);
        if (btn) {
            btn.disabled = WorldState.activeFactions.length < CONFIG.SIMULATION.START_FACTION_MIN;
        }
    },

    _initEditorTabsAndDevMode: function() {
        var btnRoster = document.getElementById('tab-btn-roster');
        var btnSettings = document.getElementById('tab-btn-settings');
        var btnDev = document.getElementById('tab-btn-dev');
        if (btnRoster) btnRoster.onclick = function() { UI.switchEditorTab('roster'); };
        if (btnSettings) btnSettings.onclick = function() { UI.switchEditorTab('settings'); };
        if (btnDev) btnDev.onclick = function() { UI.switchEditorTab('dev'); };

        var codeArea = document.getElementById('dev-faction-code');
        if (codeArea && !codeArea.value) {
            codeArea.value = DEFAULT_CUSTOM_FACTION_TEMPLATE;
        }

        var btnTemplate = document.getElementById('btn-template-faction');
        if (btnTemplate && codeArea) {
            btnTemplate.onclick = function() {
                codeArea.value = DEFAULT_CUSTOM_FACTION_TEMPLATE;
                UI._activeCustomFactionKey = 'solar';
                UI._setDevStatus('Template restored. Edit & click SAVE & LOAD.', '');
            };
        }

        var btnLoad = document.getElementById('btn-load-faction');
        if (btnLoad) {
            btnLoad.onclick = function() {
                UI.loadCustomFactionFromEditor();
            };
        }

        var btnDelete = document.getElementById('btn-delete-faction');
        if (btnDelete) {
            btnDelete.onclick = function() {
                UI.deleteCustomFactionFromEditor();
            };
        }

        var btnDebug = document.getElementById('btn-toggle-debug');
        if (btnDebug) {
            btnDebug.onclick = function() {
                UI.toggleDebugMode();
            };
        }
    },

    _initSettingsControls: function() {
        var tickBtns = document.querySelectorAll('#settings-tick-group .settings-seg-btn');
        for (var t = 0; t < tickBtns.length; t++) {
            (function(btn) {
                btn.onclick = function() {
                    var ms = parseInt(btn.getAttribute('data-tick-ms'), 10) || 150;
                    SettingsManager.current.baseTickMs = ms;
                    SettingsManager.save();
                    UI.syncSettingsUI();
                    UI._setSettingsStatus('Base tick speed set to ' + ms + 'ms & saved.');
                };
            })(tickBtns[t]);
        }

        var escBtns = document.querySelectorAll('#settings-speedup-group .settings-seg-btn');
        for (var s = 0; s < escBtns.length; s++) {
            (function(btn) {
                btn.onclick = function() {
                    var ms = parseInt(btn.getAttribute('data-speedup-ms'), 10) || 10000;
                    SettingsManager.current.speedupIntervalMs = ms;
                    SettingsManager.save();
                    UI.syncSettingsUI();
                    UI._setSettingsStatus('Speedup interval set to ' + (ms / 1000) + 's & saved.');
                };
            })(escBtns[s]);
        }

        var btnAudio = document.getElementById('btn-setting-audio');
        if (btnAudio) {
            btnAudio.onclick = function() {
                SettingsManager.current.audioEnabled = !SettingsManager.current.audioEnabled;
                SettingsManager.save();
                UI.syncSettingsUI();
                UI._setSettingsStatus('SFX Audio ' + (SettingsManager.current.audioEnabled ? 'ON' : 'OFF') + ' & saved.');
            };
        }

        var btnCrt = document.getElementById('btn-setting-crt');
        if (btnCrt) {
            btnCrt.onclick = function() {
                SettingsManager.current.crtEnabled = !SettingsManager.current.crtEnabled;
                SettingsManager.save();
                UI.syncSettingsUI();
                UI._setSettingsStatus('CRT Filter ' + (SettingsManager.current.crtEnabled ? 'ON' : 'OFF') + ' & saved.');
            };
        }

        var btnShake = document.getElementById('btn-setting-shake');
        if (btnShake) {
            btnShake.onclick = function() {
                SettingsManager.current.shakeEnabled = !SettingsManager.current.shakeEnabled;
                SettingsManager.save();
                UI.syncSettingsUI();
                UI._setSettingsStatus('Screen Shake ' + (SettingsManager.current.shakeEnabled ? 'ON' : 'OFF') + ' & saved.');
            };
        }

        var btnSaveSettings = document.getElementById('btn-save-settings');
        if (btnSaveSettings) {
            btnSaveSettings.onclick = function() {
                SettingsManager.current.cols = CONFIG.GRID.COLS;
                SettingsManager.current.rows = CONFIG.GRID.ROWS;
                SettingsManager.save();
                UI.syncSettingsUI();
                UI._setSettingsStatus('SAVED: All settings persisted!');
            };
        }

        var btnResetSettings = document.getElementById('btn-reset-settings');
        if (btnResetSettings) {
            btnResetSettings.onclick = function() {
                var def = SettingsManager.resetDefaults();
                UI.setArenaGrid(def.cols, def.rows);
                UI.syncSettingsUI();
                UI._setSettingsStatus('RESET: Default settings restored!');
            };
        }

        this.syncSettingsUI();
    },

    syncSettingsUI: function() {
        if (typeof document === 'undefined') return;
        var cur = SettingsManager.current;

        var tickBtns = document.querySelectorAll('#settings-tick-group .settings-seg-btn');
        for (var t = 0; t < tickBtns.length; t++) {
            var tMs = parseInt(tickBtns[t].getAttribute('data-tick-ms'), 10);
            tickBtns[t].classList.toggle('active', tMs === cur.baseTickMs);
        }

        var escBtns = document.querySelectorAll('#settings-speedup-group .settings-seg-btn');
        for (var s = 0; s < escBtns.length; s++) {
            var sMs = parseInt(escBtns[s].getAttribute('data-speedup-ms'), 10);
            escBtns[s].classList.toggle('active', sMs === cur.speedupIntervalMs);
        }

        var btnAudio = document.getElementById('btn-setting-audio');
        if (btnAudio) {
            btnAudio.classList.toggle('active', !!cur.audioEnabled);
            btnAudio.setAttribute('aria-pressed', cur.audioEnabled ? 'true' : 'false');
            btnAudio.textContent = cur.audioEnabled ? 'ON' : 'OFF';
        }

        var btnCrt = document.getElementById('btn-setting-crt');
        if (btnCrt) {
            btnCrt.classList.toggle('active', !!cur.crtEnabled);
            btnCrt.setAttribute('aria-pressed', cur.crtEnabled ? 'true' : 'false');
            btnCrt.textContent = cur.crtEnabled ? 'ON' : 'OFF';
        }

        var btnShake = document.getElementById('btn-setting-shake');
        if (btnShake) {
            btnShake.classList.toggle('active', !!cur.shakeEnabled);
            btnShake.setAttribute('aria-pressed', cur.shakeEnabled ? 'true' : 'false');
            btnShake.textContent = cur.shakeEnabled ? 'ON' : 'OFF';
        }
    },

    _setSettingsStatus: function(msg) {
        var el = document.getElementById('settings-status');
        if (el) el.textContent = msg;
    },

    switchEditorTab: function(tabName) {
        this.currentEditorTab = tabName;
        var isRoster = tabName === 'roster';
        var isSettings = tabName === 'settings';
        var isDev = tabName === 'dev';
        CONFIG.DEV_MODE.enabled = isDev;

        var btnRoster = document.getElementById('tab-btn-roster');
        var btnSettings = document.getElementById('tab-btn-settings');
        var btnDev = document.getElementById('tab-btn-dev');
        var panelRoster = document.getElementById('editor-roster-panel');
        var panelSettings = document.getElementById('editor-settings-panel');
        var panelDev = document.getElementById('editor-dev-panel');
        var arenaBar = document.getElementById('arena-config-bar');

        if (btnRoster) {
            btnRoster.classList.toggle('active', isRoster);
            btnRoster.setAttribute('aria-selected', isRoster ? 'true' : 'false');
        }
        if (btnSettings) {
            btnSettings.classList.toggle('active', isSettings);
            btnSettings.setAttribute('aria-selected', isSettings ? 'true' : 'false');
        }
        if (btnDev) {
            btnDev.classList.toggle('active', isDev);
            btnDev.setAttribute('aria-selected', isDev ? 'true' : 'false');
        }
        if (arenaBar) arenaBar.style.display = isDev ? 'none' : 'flex';
        if (panelRoster) panelRoster.style.display = isRoster ? 'flex' : 'none';
        if (panelSettings) panelSettings.style.display = isSettings ? 'flex' : 'none';
        if (panelDev) panelDev.style.display = isDev ? 'flex' : 'none';
    },

    toggleDebugMode: function(forceState) {
        var nextState = typeof forceState === 'boolean'
            ? forceState
            : !CONFIG.DEV_MODE.debugOverlay;
        CONFIG.DEV_MODE.debugOverlay = nextState;

        var btnDebug = document.getElementById('btn-toggle-debug');
        if (btnDebug) {
            btnDebug.classList.toggle('active', nextState);
            btnDebug.setAttribute('aria-pressed', nextState ? 'true' : 'false');
            btnDebug.textContent = nextState ? 'ON' : 'OFF';
        }

        var overlay = document.getElementById(CONFIG.UI.DEBUG_OVERLAY);
        if (overlay) {
            overlay.style.display = nextState ? 'block' : 'none';
        }
        FPSMonitor.ensureRunning();
        if (nextState) {
            FPSMonitor.renderOverlay();
        }
    },

    _setDevStatus: function(msg, statusClass) {
        var statusEl = document.getElementById('dev-code-status');
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.className = statusClass || '';
    },

    _syncWorldFactionsMap: function() {
        WorldState.factions = {};
        for (var i = 0; i < FACTIONS.length; i++) {
            WorldState.factions[FACTIONS[i].id] = FACTIONS[i];
        }
        // Refresh references in WorldState.activeFactions
        var updatedActive = [];
        for (var a = 0; a < WorldState.activeFactions.length; a++) {
            var key = WorldState.activeFactions[a].key;
            if (FACTIONS_BY_KEY[key]) {
                updatedActive.push(FACTIONS_BY_KEY[key]);
            }
        }
        WorldState.activeFactions = updatedActive;
    },

    loadCustomFactionFromEditor: async function() {
        var codeArea = document.getElementById('dev-faction-code');
        if (!codeArea) return null;

        try {
            var rawCode = codeArea.value;
            var evaluated = evaluateFactionCode(rawCode);
            var fac = registerFaction(evaluated, { isCustom: true, rawCode: rawCode });
            this._activeCustomFactionKey = fac.key;

            CustomFactionStorage.saveFaction(fac, rawCode);
            this._syncWorldFactionsMap();

            DependencyValidator.registerRuntimeRegistries();
            WorldState.syncBuffers();
            Engine.syncBuffers();

            await Renderer.bakeFactionTexture(fac);
            Renderer.syncGridAndFactions();

            // Auto-select the newly loaded faction into activeFactions if not already selected
            var foundIdx = -1;
            for (var a = 0; a < WorldState.activeFactions.length; a++) {
                if (WorldState.activeFactions[a].key === fac.key) {
                    foundIdx = a;
                    break;
                }
            }
            if (foundIdx !== -1) {
                WorldState.activeFactions[foundIdx] = fac;
            } else {
                WorldState.activeFactions.push(fac);
            }

            this.renderUnitList();
            this.renderSavedCustomFactions();
            this._setDevStatus('SAVED & LOADED: ' + fac.name.toUpperCase() + ' (' + fac.icon.unicode + ')!', 'ok');
            return fac;
        } catch (err) {
            var errMsg = (err && err.message) ? err.message : String(err);
            console.warn('[DEV MODE] Failed to load custom faction:', errMsg);
            this._setDevStatus('ERR: ' + errMsg, 'err');
            return null;
        }
    },

    deleteCustomFactionFromEditor: function() {
        var targetKey = this._activeCustomFactionKey;
        var codeArea = document.getElementById('dev-faction-code');
        if (codeArea && codeArea.value) {
            try {
                var parsed = evaluateFactionCode(codeArea.value);
                if (parsed && parsed.key) targetKey = parsed.key;
            } catch (e) { /* use fallback _activeCustomFactionKey */ }
        }
        if (!targetKey || !FACTIONS_BY_KEY[targetKey] || !FACTIONS_BY_KEY[targetKey].isCustom) {
            // Fallback: delete most recently added custom faction if any exist
            for (var i = FACTIONS.length - 1; i >= 0; i--) {
                if (FACTIONS[i].isCustom) {
                    targetKey = FACTIONS[i].key;
                    break;
                }
            }
        }
        if (!targetKey || !FACTIONS_BY_KEY[targetKey] || !FACTIONS_BY_KEY[targetKey].isCustom) {
            this._setDevStatus('ERR: No saved custom faction found to delete.', 'err');
            return false;
        }
        return this.deleteCustomFaction(targetKey);
    },

    deleteCustomFaction: function(key) {
        var fac = FACTIONS_BY_KEY[key];
        if (!fac || !fac.isCustom) {
            this._setDevStatus('ERR: Cannot delete built-in faction "' + key + '".', 'err');
            return false;
        }
        var removedName = fac.name.toUpperCase();
        unregisterFaction(key);
        CustomFactionStorage.removeFaction(key);

        this._syncWorldFactionsMap();
        DependencyValidator.registerRuntimeRegistries();
        WorldState.syncBuffers();
        Engine.syncBuffers();
        Renderer.syncGridAndFactions();

        this.renderUnitList();
        this.renderSavedCustomFactions();
        this._setDevStatus('DELETED: ' + removedName + ' removed from game.', 'ok');
        return true;
    },

    _initArenaGridControls: function() {
        var sliderCols = document.getElementById('slider-grid-cols');
        var sliderRows = document.getElementById('slider-grid-rows');
        var presetBtns = document.querySelectorAll('.preset-btn');

        if (sliderCols) {
            sliderCols.oninput = function() {
                var c = parseInt(sliderCols.value, 10) || 20;
                var r = sliderRows ? (parseInt(sliderRows.value, 10) || 20) : CONFIG.GRID.ROWS;
                UI.setArenaGrid(c, r);
            };
        }
        if (sliderRows) {
            sliderRows.oninput = function() {
                var c = sliderCols ? (parseInt(sliderCols.value, 10) || 20) : CONFIG.GRID.COLS;
                var r = parseInt(sliderRows.value, 10) || 20;
                UI.setArenaGrid(c, r);
            };
        }
        for (var i = 0; i < presetBtns.length; i++) {
            (function(btn) {
                btn.onclick = function() {
                    var c = parseInt(btn.getAttribute('data-cols'), 10) || 20;
                    var r = parseInt(btn.getAttribute('data-rows'), 10) || 20;
                    UI.setArenaGrid(c, r);
                };
            })(presetBtns[i]);
        }
    },

    setArenaGrid: function(cols, rows) {
        setGridDimensions(cols, rows);
        SettingsManager.current.cols = CONFIG.GRID.COLS;
        SettingsManager.current.rows = CONFIG.GRID.ROWS;
        SettingsManager.save();

        WorldState.syncBuffers();
        Engine.syncBuffers();
        Renderer.syncGridAndFactions();

        if (typeof document === 'undefined') return;
        var dimLbl = document.getElementById('arena-dim-label');
        var cellsLbl = document.getElementById('arena-cells-label');
        var valCols = document.getElementById('val-grid-cols');
        var valRows = document.getElementById('val-grid-rows');
        var sliderCols = document.getElementById('slider-grid-cols');
        var sliderRows = document.getElementById('slider-grid-rows');

        if (dimLbl) dimLbl.textContent = CONFIG.GRID.COLS + '×' + CONFIG.GRID.ROWS;
        if (cellsLbl) cellsLbl.textContent = String(CONFIG.GRID.TOTAL);
        if (valCols) valCols.textContent = String(CONFIG.GRID.COLS);
        if (valRows) valRows.textContent = String(CONFIG.GRID.ROWS);
        if (sliderCols) sliderCols.value = String(CONFIG.GRID.COLS);
        if (sliderRows) sliderRows.value = String(CONFIG.GRID.ROWS);

        var presetBtns = document.querySelectorAll('.preset-btn');
        for (var i = 0; i < presetBtns.length; i++) {
            var pc = parseInt(presetBtns[i].getAttribute('data-cols'), 10);
            var pr = parseInt(presetBtns[i].getAttribute('data-rows'), 10);
            presetBtns[i].classList.toggle('active', pc === CONFIG.GRID.COLS && pr === CONFIG.GRID.ROWS);
        }
    },

    _installKeyboardShortcuts: function() {
        if (this._keyListenerInstalled || typeof window === 'undefined') return;
        this._keyListenerInstalled = true;

        window.addEventListener('resize', function() {
            UI.updateResponsiveScale();
        });

        window.addEventListener('keydown', function(e) {
            var tag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toUpperCase() : '';
            if (tag === 'TEXTAREA' || tag === 'INPUT') return;

            var state = document.body.dataset.state || 'title';
            if (state === 'title') {
                if ((e.key === 'Enter' || e.key === ' ') && document.activeElement === document.body) {
                    var btn = document.getElementById(CONFIG.UI.BTN_START);
                    if (btn && !btn.disabled) {
                        e.preventDefault();
                        UI._onStartClick();
                    }
                }
            } else if (state === 'playing' || state === 'paused') {
                if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
                    e.preventDefault();
                    Engine.togglePause();
                } else if (e.key === 'r' || e.key === 'R') {
                    e.preventDefault();
                    Engine.stop();
                    Engine.start();
                }
            }
        });
    },

    _onUnitClick: function(div, fac) {
        try {
            AudioService.init();
            AudioService.sfx.click();
        } catch (e) { /* silent */ }

        var isSelected = div.classList.toggle('selected');
        div.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

        var idx = -1;
        for (var i = 0; i < WorldState.activeFactions.length; i++) {
            if (WorldState.activeFactions[i].key === fac.key) { idx = i; break; }
        }
        if (idx !== -1) {
            WorldState.activeFactions.splice(idx, 1);
        } else {
            WorldState.activeFactions.push(fac);
        }
        this._updateStartButtonState();
    },

    _onStartClick: function() {
        if (Renderer.isRendering) return;
        if (WorldState.activeFactions.length < CONFIG.SIMULATION.START_FACTION_MIN) return;

        AudioService.init();
        if (document.activeElement && document.activeElement.blur) {
            document.activeElement.blur();
        }
        document.getElementById(CONFIG.UI.GAME_CONTAINER).style.display = 'none';
        document.getElementById(CONFIG.UI.SCENE_SIMULATION).style.display = 'block';
        document.body.dataset.state = 'playing';

        var debugOverlay = document.getElementById(CONFIG.UI.DEBUG_OVERLAY);
        if (debugOverlay) {
            debugOverlay.style.display = (CONFIG.DEV_MODE && CONFIG.DEV_MODE.debugOverlay) ? 'block' : 'none';
        }
        FPSMonitor.ensureRunning();
        if (CONFIG.DEV_MODE && CONFIG.DEV_MODE.debugOverlay) {
            FPSMonitor.renderOverlay();
        }

        var footer = document.getElementById(CONFIG.UI.SIM_FOOTER);
        footer.innerHTML = '';

        for (var i = 0; i < WorldState.activeFactions.length; i++) {
            var fac = WorldState.activeFactions[i];
            var div = document.createElement('div');
            div.className = 'stat-card';

            var iconColor = (fac.icon && fac.icon.color) || '#ffffff';
            var iconUnicode = (fac.icon && fac.icon.unicode) || fac.name[0];
            var att = (fac.baseStats && fac.baseStats.att) || 0;
            var res = (fac.baseStats && fac.baseStats.res) || 0;
            var spr = (fac.baseStats && fac.baseStats.spr) || 0;

            div.style.borderColor = iconColor;
            div.innerHTML =
                '<div class="stat-card-header"><span class="stat-card-emote">' + iconUnicode + '</span><span class="stat-card-pct" id="stat-val-' + fac.id + '" style="color: ' + iconColor + '">0.0%</span></div>' +
                '<div class="stat-card-stats"><span style="color:#ff6b6b">A' + att + '</span><span style="color:#1dd1a1">R' + res + '</span><span style="color:#48dbfb">S' + spr + '</span></div>' +
                '<div class="stat-card-skill" style="color: ' + iconColor + '">' + fac.name.toUpperCase() + '</div>' +
                '<div class="stat-card-desc-short">' + (fac.descShort || '') + '</div>';
            footer.appendChild(div);
        }

        this.updateResponsiveScale();
        Engine.start();
    },

    onSimulationEnd: function() {
        if (typeof document !== 'undefined') {
            document.body.dataset.state = 'title';
            UI.updateResponsiveScale();
        }
    }
};

export const Main = {
    initialized: false,

    boot: async function() {
        if (this.initialized) return;
        this.initialized = true;

        try {
            // 1. Validate dependencies
            DependencyValidator.validate();
            console.log('[BOOT] Dependencies OK');

            // 2. Restore saved settings and custom factions
            var savedSettings = SettingsManager.load();
            CustomFactionStorage.restoreAll();

            // 3. Runtime registries
            DependencyValidator.registerRuntimeRegistries();

            // 4. Seed RNG
            Utils.seed = Date.now() | 0;

            // 5. Register factions
            for (var i = 0; i < FACTIONS.length; i++) {
                WorldState.factions[FACTIONS[i].id] = FACTIONS[i];
            }

            // 6. Init layers & apply saved grid dimensions
            if (savedSettings && (savedSettings.cols !== 20 || savedSettings.rows !== 20)) {
                setGridDimensions(savedSettings.cols, savedSettings.rows);
            }
            WorldState.initLayers();
            WorldState.syncBuffers();
            Engine.syncBuffers();

            // 7. Init renderer
            Renderer.init();
            SettingsManager.apply();

            // 8. Bake assets
            await Renderer.bakeAssets();

            // 9. Show editor
            if (typeof document !== 'undefined') {
                var loadScene = document.getElementById(CONFIG.UI.SCENE_LOADING);
                var editorScene = document.getElementById(CONFIG.UI.SCENE_EDITOR);
                if (loadScene) loadScene.style.display = 'none';
                if (editorScene) editorScene.style.display = 'flex';
                document.body.dataset.state = 'title';
            }

            // 10. Wire UI
            UI.init();
            UI.setArenaGrid(CONFIG.GRID.COLS, CONFIG.GRID.ROWS);

            // 11. Background
            if (RetroBackground && RetroBackground.start) {
                RetroBackground.start();
            }

            // 12. FPS monitor
            FPSMonitor.start();

            // 13. Support ?autostart=1 for automated testing or quick launch
            if (typeof window !== 'undefined' && window.location && window.location.search.indexOf('autostart=1') !== -1) {
                var items = document.querySelectorAll('#unit-selection .unit-item');
                for (var a = 0; a < Math.min(3, items.length); a++) {
                    items[a].click();
                }
                UI._onStartClick();
            }

            console.log('%c[BOOT] Ready.', 'color:#00ffcc; font-weight:bold');
        } catch (e) {
            var msg = (e && e.message) ? e.message : String(e);
            var stack = (e && e.stack) ? e.stack : '(no stack)';

            console.error('=== BOOT FAILED ===');
            console.error('Message:', msg);
            console.error('Stack:', stack);

            if (typeof document !== 'undefined') {
                try {
                    document.body.innerHTML = '';
                    var container = document.createElement('div');
                    container.style.cssText = 'color:#ff2a2a; font-family:monospace; padding:20px; font-size:12px; background:#000; min-height:100vh; position:relative; z-index:9999;';
                    var h2 = document.createElement('h2');
                    h2.textContent = 'BOOT FAILED';
                    h2.style.color = '#ff2a2a';
                    container.appendChild(h2);
                    var pre = document.createElement('pre');
                    pre.style.cssText = 'color:#ff8888; white-space:pre-wrap; word-break:break-all; font-size:11px;';
                    pre.textContent = msg + '\n\n' + stack;
                    container.appendChild(pre);
                    var retryBtn = document.createElement('button');
                    retryBtn.textContent = 'RETRY';
                    retryBtn.style.cssText = 'background:#ff2a2a; color:white; border:none; padding:10px 20px; font-size:14px; cursor:pointer; margin-top:10px;';
                    retryBtn.onclick = function() { location.reload(); };
                    container.appendChild(retryBtn);
                    document.body.appendChild(container);
                } catch (domErr) {
                    console.error('[BOOT] Failed to render error UI:', domErr);
                }
            }
        }
    },

    onSimulationEnd: function() {
        UI.onSimulationEnd();
    }
};

if (typeof window !== 'undefined') {
    window.CustomFactionStorage = CustomFactionStorage;
    window.SettingsManager = SettingsManager;
    window.ErrorCatcher = ErrorCatcher;
    window.DependencyValidator = DependencyValidator;
    window.FPSMonitor = FPSMonitor;
    window.UI = UI;
    window.Main = Main;

    ErrorCatcher.install();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { Main.boot(); });
    } else {
        Main.boot();
    }
}