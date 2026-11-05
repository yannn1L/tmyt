/**
 * MAIN — Boot, dependency validation, error catcher, FPS logger, UI wiring.
 */
'use strict';

var ErrorCatcher = {
    install: function() {
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
            if (typeof Engine !== 'undefined' && Engine.stop) Engine.stop();
            if (typeof Renderer !== 'undefined' && Renderer.app && Renderer.app.ticker) {
                Renderer.isRendering = false;
            }
            console.warn('[ENGINE HALTED]', reason);
        } catch (e) {
            console.error('[HALT FAILED]', e);
        }
    }
};

var DependencyValidator = {
    // Updated: hapus ABILITY_PARAMS, tambah new deps
    required: [
        'UI_CONFIG', 'SFX_DATA', 'SFX_COMPOSITE',
        'ABILITY_PARTS', 'AbilityCompiler', 'FactionRegistry',
        'FACTIONS', 'FACTIONS_BY_KEY', 'FACTION_COUNT', 'FACTION_COLOR_HEX',
        'CONFIG', 'Utils', 'DIRS', 'DIAG_DIRS',
        'AudioService', 'PixiParticle', 'PixiShockwave', 'PixiLaser', 'VFX',
        'WorldState', 'Renderer', 'Engine', 'RetroBackground'
    ],

    validate: function() {
        var missing = [];
        for (var i = 0; i < this.required.length; i++) {
            var name = this.required[i];
            var val;
            try {
                // Use eval to detect `const`/`let` globals that aren't on window
                val = eval('typeof ' + name);
            } catch (e) {
                val = 'undefined';
            }
            if (val === 'undefined') missing.push(name);
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
                    if (f.params.extraLayerDecay.hasOwnProperty(el)) {
                        decayLayers.push({ key: el, decay: f.params.extraLayerDecay[el] });
                    }
                }
            }
        }
        CONFIG.DECAY_LAYERS = decayLayers;
        console.log('[BOOT] Decay layers: ' + decayLayers.length);

        // Ensure registries exist (even before Engine.start)
        if (!CONFIG.ACTIVE_ABILITY_KEYS) CONFIG.ACTIVE_ABILITY_KEYS = [];
        if (!CONFIG.ACTIVE_VFX_KEYS) CONFIG.ACTIVE_VFX_KEYS = [];
        if (!CONFIG.ACTIVE_TILE_KEYS) CONFIG.ACTIVE_TILE_KEYS = [];
        if (!CONFIG.ACTIVE_HOOKS) CONFIG.ACTIVE_HOOKS = {};
    }
};

var FPSMonitor = {
    frames: 0,
    lastSample: 0,
    enabled: false,
    _rafId: 0,

    start: function() {
        if (!CONFIG.FPS.ENABLED) return;
        this.enabled = true;
        this.lastSample = performance.now();
        this.frames = 0;
        this._loop();
    },

    _loop: function() {
        if (!this.enabled) return;
        this.frames++;
        var now = performance.now();
        var elapsed = now - this.lastSample;

        if (elapsed >= CONFIG.FPS.SAMPLE_INTERVAL_MS) {
            var fps = (this.frames * 1000 / elapsed).toFixed(1);

            // Null-safe reads
            var tickRate = (typeof Engine !== 'undefined' && Engine.currentTickRate) || 0;
            var speed = (typeof Engine !== 'undefined' && Engine.speedLevel) || 1;

            var activeCount = (WorldState && WorldState.activeFactions)
                ? WorldState.activeFactions.length : 0;

            var activeAbilities = (CONFIG.ACTIVE_ABILITY_KEYS && CONFIG.ACTIVE_ABILITY_KEYS.length) || 0;
            var activeVfx = (CONFIG.ACTIVE_VFX_KEYS && CONFIG.ACTIVE_VFX_KEYS.length) || 0;

            var particleTotal = (VFX && VFX.pool) ? VFX.pool.length : 0;
            var freeSlots = (VFX && VFX._freeList) ? VFX._freeList.length : 0;

            console.log(
                CONFIG.FPS.LOG_TAG + ' ' + fps + ' fps | tick=' + tickRate + 'ms (' + speed + 'x) | ' +
                'factions=' + activeCount + ' | abilities=' + activeAbilities + '/' + activeVfx + ' | ' +
                'particles=' + (particleTotal - freeSlots) + '/' + particleTotal
            );

            this.frames = 0;
            this.lastSample = now;
        }

        this._rafId = requestAnimationFrame(function() { FPSMonitor._loop(); });
    },

    stop: function() {
        this.enabled = false;
        if (this._rafId) cancelAnimationFrame(this._rafId);
    }
};

var UI = {
    init: function() {
        var listDiv = document.getElementById(CONFIG.UI.UNIT_SELECTION);
        if (!listDiv) {
            console.error('[UI] unit-selection element not found');
            return;
        }
        listDiv.innerHTML = '';

        for (var i = 0; i < FACTIONS.length; i++) {
            var fac = FACTIONS[i];
            var div = document.createElement('div');
            div.className = 'unit-item';
            div.dataset.facId = fac.id;

            var iconColor = (fac.icon && fac.icon.color) || '#ffffff';
            var iconUnicode = (fac.icon && fac.icon.unicode) || fac.name[0];
            var att = (fac.baseStats && fac.baseStats.att) || 0;
            var res = (fac.baseStats && fac.baseStats.res) || 0;
            var spr = (fac.baseStats && fac.baseStats.spr) || 0;

            div.innerHTML =
                '<div class="unit-header">' +
                    '<span class="unit-emote">' + iconUnicode + '</span>' +
                    '<div class="unit-title-stats">' +
                        '<span class="unit-name" style="color: ' + iconColor + '">' + fac.name.toUpperCase() + '</span>' +
                        '<span class="unit-stats"><span style="color:#ff6b6b" title="Attack">A' + att + '</span> <span style="color:#1dd1a1" title="Resistance">R' + res + '</span> <span style="color:#48dbfb" title="Spread Speed">S' + spr + '</span></span>' +
                    '</div>' +
                '</div>' +
                '<span class="unit-skill-badge" style="background: ' + iconColor + '22; color: ' + iconColor + '; border: 1px solid ' + iconColor + '">' + fac.name.toUpperCase() + '</span>' +
                '<div class="unit-desc-long">' + (fac.descLong || '') + '</div>';

            (function(f, d) {
                d.onclick = function() { UI._onUnitClick(d, f); };
            })(fac, div);

            listDiv.appendChild(div);
        }

        var btn = document.getElementById(CONFIG.UI.BTN_START);
        if (btn) btn.onclick = function() { UI._onStartClick(); };
    },

    _onUnitClick: function(div, fac) {
        try {
            AudioService.init();
            AudioService.sfx.click();
        } catch (e) { /* silent */ }

        div.classList.toggle('selected');
        var idx = -1;
        for (var i = 0; i < WorldState.activeFactions.length; i++) {
            if (WorldState.activeFactions[i].id === fac.id) { idx = i; break; }
        }
        if (idx !== -1) {
            WorldState.activeFactions.splice(idx, 1);
        } else {
            WorldState.activeFactions.push(fac);
        }
        document.getElementById(CONFIG.UI.BTN_START).disabled =
            WorldState.activeFactions.length < CONFIG.SIMULATION.START_FACTION_MIN;
    },

    _onStartClick: function() {
        if (Renderer.isRendering) return;

        AudioService.init();
        document.getElementById(CONFIG.UI.GAME_CONTAINER).style.display = 'none';
        document.getElementById(CONFIG.UI.SCENE_SIMULATION).style.display = 'block';

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

        Engine.start();
    },

    onSimulationEnd: function() {
        // Placeholder
    }
};

var Main = {
    initialized: false,

    boot: async function() {
        if (this.initialized) return;
        this.initialized = true;

        try {
            // 1. Validate
            DependencyValidator.validate();
            console.log('[BOOT] Dependencies OK');

            // 2. Runtime registries
            DependencyValidator.registerRuntimeRegistries();

            // 3. Seed RNG
            Utils.seed = Date.now();

            // 4. Register factions
            for (var i = 0; i < FACTIONS.length; i++) {
                WorldState.factions[FACTIONS[i].id] = FACTIONS[i];
            }

            // 5. Init layers
            WorldState.initLayers();

            // 6. Init renderer
            Renderer.init();

            // 7. Bake assets
            await Renderer.bakeAssets();

            // 8. Show editor
            var loadScene = document.getElementById(CONFIG.UI.SCENE_LOADING);
            var editorScene = document.getElementById(CONFIG.UI.SCENE_EDITOR);
            if (loadScene) loadScene.style.display = 'none';
            if (editorScene) editorScene.style.display = 'flex';

            // 9. Wire UI
            UI.init();

            // 10. Background
            if (typeof RetroBackground !== 'undefined' && RetroBackground.start) {
                RetroBackground.start();
                console.log('[BOOT] RetroBackground started');
            } else if (typeof initRetroBackground !== 'undefined') {
                initRetroBackground();
                console.log('[BOOT] initRetroBackground started');
            } else {
                console.warn('[BOOT] No background API');
            }

            // 11. FPS monitor
            FPSMonitor.start();

            console.log('%c[BOOT] Ready.', 'color:#00ffcc; font-weight:bold');
        } catch (e) {
            // Robust error display — no raw HTML injection
            var msg = (e && e.message) ? e.message : String(e);
            var stack = (e && e.stack) ? e.stack : '(no stack)';

            // Log FULL error to console
            console.error('=== BOOT FAILED ===');
            console.error('Message:', msg);
            console.error('Stack:', stack);
            console.error('Full error object:', e);

            // Display in DOM (safe)
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

                var hint = document.createElement('p');
                hint.style.color = '#ffcc00';
                hint.textContent = 'Check browser console for full details.';
                container.appendChild(hint);

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
    },

    onSimulationEnd: function() {
        UI.onSimulationEnd();
    }
};

ErrorCatcher.install();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { Main.boot(); });
} else {
    Main.boot();
}

if (typeof window !== 'undefined') {
    window.ErrorCatcher = ErrorCatcher;
    window.DependencyValidator = DependencyValidator;
    window.FPSMonitor = FPSMonitor;
    window.UI = UI;
    window.Main = Main;
}