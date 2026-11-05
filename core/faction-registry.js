/**
 * FACTION REGISTRY — Compiler + runtime registry untuk faction abilities.
 * 
 * FIX v3: Render hooks treat semua trigger sebagai 'always'
 * karena Renderer sudah filter layer sebelum panggil hook.
 */
'use strict';

var HOOK_SIGNATURES = {
    // --- GAME LOGIC HOOKS ---
    onTick:           ['ws', 'idx', 'owner', 'fac'],
    onBeforeAttack:   ['ws', 'nIdx', 'owner', 'fac'],
    onAttackSuccess:  ['ws', 'idx', 'nIdx', 'nx', 'ny', 'fac'],
    onDefendCalc:     ['ws', 'idx', 'basePower', 'fac'],
    onDefendFail:     ['ws', 'nIdx', 'targetOwner', 'attackerIdx', 'attackerOwner', 'fac'],
    onDefendSuccess:  ['ws', 'nIdx', 'nx', 'ny', 'fac'],
    onPowerCalc:      ['ws', 'idx', 'basePower', 'fac'],
    // --- RENDER HOOKS ---
    onRenderVFX:      ['gfx', 'x', 'y', 'idx', 'frame', 'fac'],
    onRenderTileLogic:['gfx', 'x', 'y', 'idx', 'mask', 'frame', 'fac']
};

var RENDER_HOOKS = {
    onRenderVFX: true,
    onRenderTileLogic: true
};

var AbilityCompiler = {
    compile: function(faction) {
        if (!faction.params) faction.params = {};

        var abilityMap = faction.ability;
        if (!abilityMap) return null;

        var usedBudget = 0;
        var hooksGrouped = {};

        for (var hookName in abilityMap) {
            if (!abilityMap.hasOwnProperty(hookName)) continue;

            if (!HOOK_SIGNATURES[hookName]) {
                console.warn('[Compiler] Unknown hook: ' + hookName + ' in ' + faction.name);
                continue;
            }

            var partKeys = abilityMap[hookName];
            if (!partKeys || partKeys.length === 0) continue;

            for (var i = 0; i < partKeys.length; i++) {
                var partKey = partKeys[i];
                var part = ABILITY_PARTS[partKey];
                if (!part) {
                    console.warn('[Compiler] Unknown part: ' + partKey + ' in ' + faction.name);
                    continue;
                }

                if (part.hook !== hookName) {
                    console.warn('[Compiler] Part/hook mismatch: ' + partKey +
                                 ' (part.hook=' + part.hook + ', map.hook=' + hookName + ')');
                    continue;
                }

                usedBudget += part.cost || 0;

                if (usedBudget > faction.maxBudget) {
                    console.warn('[Compiler] Budget exceeded: ' + faction.name +
                                 ' (' + usedBudget + '/' + faction.maxBudget + ')');
                    break;
                }

                var override = (faction.partData && faction.partData[partKey]) || null;

                if (!hooksGrouped[hookName]) hooksGrouped[hookName] = [];
                hooksGrouped[hookName].push({
                    part: part,
                    override: override
                });
            }
        }

        var compiled = {};
        for (var h in hooksGrouped) {
            if (!hooksGrouped.hasOwnProperty(h)) continue;
            var entries = hooksGrouped[h];

            if (entries.length === 1) {
                compiled[h] = this._makeSingleHook(h, entries[0]);
            } else {
                compiled[h] = this._makeCompositeHook(h, entries);
            }
        }

        compiled._usedBudget = usedBudget;
        return compiled;
    },

    _buildContext: function(argNames, args, partData) {
        var ctx = { partData: partData };
        for (var i = 0; i < argNames.length; i++) {
            ctx[argNames[i]] = args[i];
        }
        return ctx;
    },

    /**
     * Wrap single part dengan signature yang tepat.
     * 
     * FIX v3: Untuk render hooks, treat SEMUA trigger sebagai 'always'
     * karena Renderer sudah filter layer di luarnya.
     */
    _makeSingleHook: function(hookName, entry) {
        var part = entry.part;
        var execute = part.execute;
        var trigger = part.trigger;
        var partData = entry.override || {};
        var argNames = HOOK_SIGNATURES[hookName];
        var isRenderHook = RENDER_HOOKS[hookName] === true;

        // Render hooks: selalu trigger, abaikan trigger type
        if (isRenderHook) {
            return function() {
                var ctx = AbilityCompiler._buildContext(argNames, arguments, partData);
                return execute(ctx);
            };
        }

        // Game logic hooks: pakai trigger
        if (trigger.type === 'cooldown') {
            var ticks = trigger.ticks || 3;
            var counter = 0;
            return function() {
                counter++;
                if (counter >= ticks) {
                    counter = 0;
                    var ctx = AbilityCompiler._buildContext(argNames, arguments, partData);
                    return execute(ctx);
                }
            };
        }

        if (trigger.type === 'always') {
            return function() {
                var ctx = AbilityCompiler._buildContext(argNames, arguments, partData);
                return execute(ctx);
            };
        }

        if (trigger.type === 'chance') {
            var chance = (partData.chance !== undefined)
                ? partData.chance : trigger.value;
            return function() {
                if (Utils.fastRNG() >= chance) return;
                var ctx = AbilityCompiler._buildContext(argNames, arguments, partData);
                return execute(ctx);
            };
        }

        if (trigger.type === 'layer') {
            var layerKey = trigger.key;
            return function() {
                var args = arguments;
                var ctx = AbilityCompiler._buildContext(argNames, args, partData);
                var ws = ctx.ws;
                if (!ws || !ws.layers) return;
                var layer = ws.layers[layerKey];
                if (layer && layer[ctx.idx] > 0) {
                    return execute(ctx);
                }
            };
        }

        if (trigger.type === 'threshold') {
            var tKey = trigger.key;
            var tValue = trigger.value;
            return function() {
                var args = arguments;
                var ctx = AbilityCompiler._buildContext(argNames, args, partData);
                var ws = ctx.ws;
                if (!ws || !ws.layers) return;
                var layer = ws.layers[tKey];
                if (layer && layer[ctx.idx] >= tValue) {
                    return execute(ctx);
                }
            };
        }

        console.warn('[Compiler] Unknown trigger type: ' + trigger.type);
        return function() {};
    },

    /**
     * Compose multiple parts dengan signature yang tepat.
     * 
     * FIX v3: Untuk render hooks, semua parts jadi 'always'.
     */
    _makeCompositeHook: function(hookName, entries) {
        var argNames = HOOK_SIGNATURES[hookName];
        var isRenderHook = RENDER_HOOKS[hookName] === true;

        var alwaysExecutes = [];
        var chanceData = [];
        var layerData = [];
        var thresholdData = [];
        var cooldownStates = [];

        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            var t = e.part.trigger.type;
            var partData = e.override || {};

            // Render hooks: SEMUA jadi always
            if (isRenderHook) {
                alwaysExecutes.push({
                    execute: e.part.execute,
                    partData: partData
                });
                continue;
            }

            if (t === 'always') {
                alwaysExecutes.push({
                    execute: e.part.execute,
                    partData: partData
                });
            } else if (t === 'chance') {
                chanceData.push({
                    execute: e.part.execute,
                    chance: (partData.chance !== undefined) ? partData.chance : e.part.trigger.value,
                    partData: partData
                });
            } else if (t === 'layer') {
                layerData.push({
                    execute: e.part.execute,
                    layerKey: e.part.trigger.key,
                    partData: partData
                });
            } else if (t === 'threshold') {
                thresholdData.push({
                    execute: e.part.execute,
                    key: e.part.trigger.key,
                    value: e.part.trigger.value,
                    partData: partData
                });
            } else if (t === 'cooldown') {
                cooldownStates.push({
                    execute: e.part.execute,
                    ticks: e.part.trigger.ticks || 3,
                    counter: 0,
                    partData: partData
                });
            }
        }

        return function() {
            var args = arguments;
            var ctx = AbilityCompiler._buildContext(argNames, args, null);

            // Always
            for (var a = 0; a < alwaysExecutes.length; a++) {
                var ae = alwaysExecutes[a];
                ctx.partData = ae.partData;
                ae.execute(ctx);
            }

            // Chance (skip untuk render hooks — hanya masuk kalau non-render)
            for (var c = 0; c < chanceData.length; c++) {
                var cd = chanceData[c];
                if (Utils.fastRNG() < cd.chance) {
                    ctx.partData = cd.partData;
                    cd.execute(ctx);
                }
            }

            // Layer
            for (var l = 0; l < layerData.length; l++) {
                var ld = layerData[l];
                var ws = ctx.ws;
                if (!ws || !ws.layers) continue;
                var layer = ws.layers[ld.layerKey];
                if (layer && layer[ctx.idx] > 0) {
                    ctx.partData = ld.partData;
                    ld.execute(ctx);
                }
            }

            // Threshold
            for (var th = 0; th < thresholdData.length; th++) {
                var td = thresholdData[th];
                var ws2 = ctx.ws;
                if (!ws2 || !ws2.layers) continue;
                var layer2 = ws2.layers[td.key];
                if (layer2 && layer2[ctx.idx] >= td.value) {
                    ctx.partData = td.partData;
                    td.execute(ctx);
                }
            }

            // Cooldown
            for (var co = 0; co < cooldownStates.length; co++) {
                var cs = cooldownStates[co];
                cs.counter++;
                if (cs.counter >= cs.ticks) {
                    cs.counter = 0;
                    ctx.partData = cs.partData;
                    cs.execute(ctx);
                }
            }
        };
    }
};

var FactionRegistry = {
    compileAll: function(activeFactions) {
        var tickKeys = [];
        var vfxKeys = [];
        var tileKeys = [];
        var hooksMap = {};
        
        for (var i = 0; i < activeFactions.length; i++) {
            var faction = activeFactions[i];
            
            // ← TAMBAH: precompute _maxStat
            if (faction._maxStat === undefined) {
                var s = faction.baseStats;
                faction._maxStat = Math.max(s.spr, s.res, s.att);
            }
            
            var compiled = AbilityCompiler.compile(faction);
            if (!compiled) continue;
            
            faction._compiled = compiled;
            hooksMap[faction.key] = compiled;
            
            if (compiled.onTick) tickKeys.push(faction.key);
            if (compiled.onRenderVFX) vfxKeys.push(faction.key);
            if (compiled.onRenderTileLogic) tileKeys.push(faction.key);
        }
        
        CONFIG.ACTIVE_ABILITY_KEYS = tickKeys;
        CONFIG.ACTIVE_VFX_KEYS = vfxKeys;
        CONFIG.ACTIVE_TILE_KEYS = tileKeys;
        CONFIG.ACTIVE_HOOKS = hooksMap;
        
        console.log('[REGISTRY] Compiled ' + activeFactions.length + ' factions' +
            ' | tick=' + tickKeys.length +
            ' vfx=' + vfxKeys.length +
            ' tile=' + tileKeys.length);
    },
    
    clear: function() {
        CONFIG.ACTIVE_ABILITY_KEYS = [];
        CONFIG.ACTIVE_VFX_KEYS = [];
        CONFIG.ACTIVE_TILE_KEYS = [];
        CONFIG.ACTIVE_HOOKS = {};
    },
    
    get: function(factionKey) {
        return CONFIG.ACTIVE_HOOKS[factionKey];
    }
};

if (typeof window !== 'undefined') {
    window.HOOK_SIGNATURES = HOOK_SIGNATURES;
    window.RENDER_HOOKS = RENDER_HOOKS;
    window.AbilityCompiler = AbilityCompiler;
    window.FactionRegistry = FactionRegistry;
}