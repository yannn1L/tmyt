/**
 * FACTION REGISTRY — ECS-style Ability Compiler + Zero-Allocation Execution Contexts.
 *
 * Optimizations & Modular Upgrades:
 * 1. Pre-allocated monomorphic context struct (_sharedCtx) mutated in place with `ctx.actions`
 *    (Zero-GC high-level Action Toolkit) and direct TypedArray buffer access (`ctx.ws`).
 * 2. Resolves both reusable base abilities (`ABILITY_PARTS`) and faction-scoped `customAbilities`
 *    (`CUSTOM_ABILITY_PARTS`) registered via `defineFaction()`.
 * 3. Value-returning hooks (onPowerCalc, onDefendCalc) properly chain their returned values
 *    across composite parts.
 */

import { CONFIG, Utils } from './config.js';
import { ABILITY_PARTS } from '../data/abilities.js';
import { AbilityActions, CUSTOM_ABILITY_PARTS } from './faction-builder.js';

export const HOOK_SIGNATURES = {
    onTick:           ['ws', 'idx', 'owner', 'fac'],
    onBeforeAttack:   ['ws', 'nIdx', 'owner', 'fac'],
    onAttackSuccess:  ['ws', 'idx', 'nIdx', 'nx', 'ny', 'fac', 'targetOwner'],
    onDefendCalc:     ['ws', 'idx', 'basePower', 'fac'],
    onDefendFail:     ['ws', 'nIdx', 'targetOwner', 'attackerIdx', 'attackerOwner', 'fac'],
    onDefendSuccess:  ['ws', 'nIdx', 'nx', 'ny', 'fac'],
    onPowerCalc:      ['ws', 'idx', 'basePower', 'fac'],
    onRenderVFX:      ['gfx', 'x', 'y', 'idx', 'frame', 'fac', 'ws'],
    onRenderTileLogic:['gfx', 'x', 'y', 'idx', 'mask', 'frame', 'fac', 'ws']
};

export const RENDER_HOOKS = {
    onRenderVFX: true,
    onRenderTileLogic: true
};

var VALUE_RETURN_HOOKS = {
    onPowerCalc: true,
    onDefendCalc: true
};

// Pre-allocated, monomorphic reusable execution context (Zero-GC)
var _sharedCtx = {
    partData: null,
    actions: AbilityActions,
    ws: null,
    idx: 0,
    nIdx: 0,
    nx: 0,
    ny: 0,
    x: 0,
    y: 0,
    mask: 0,
    frame: 0,
    owner: -1,
    targetOwner: -1,
    attackerIdx: 0,
    attackerOwner: -1,
    basePower: 0,
    fac: null,
    facId: -1,
    gfx: null
};
AbilityActions._ctx = _sharedCtx;

function _populateContext(hookName, a0, a1, a2, a3, a4, a5, a6, a7, partData) {
    var ctx = _sharedCtx;
    ctx.partData = partData;
    ctx.actions = AbilityActions;
    AbilityActions._ctx = ctx;

    switch (hookName) {
        case 'onTick':
            ctx.ws = a0; ctx.idx = a1; ctx.owner = a2; ctx.fac = a3;
            ctx.facId = a3 ? a3.id : a2;
            break;
        case 'onBeforeAttack':
            ctx.ws = a0; ctx.nIdx = a1; ctx.idx = a1; ctx.owner = a2; ctx.fac = a3;
            ctx.facId = a3 ? a3.id : a2;
            break;
        case 'onAttackSuccess':
            ctx.ws = a0; ctx.idx = a1; ctx.nIdx = a2; ctx.nx = a3; ctx.ny = a4; ctx.fac = a5;
            ctx.targetOwner = a6 !== undefined ? a6 : -1;
            ctx.facId = a5 ? a5.id : -1;
            ctx.owner = ctx.facId;
            break;
        case 'onDefendCalc':
        case 'onPowerCalc':
            ctx.ws = a0; ctx.idx = a1; ctx.basePower = a2; ctx.fac = a3;
            ctx.facId = a3 ? a3.id : -1;
            ctx.owner = ctx.facId;
            break;
        case 'onDefendFail':
            ctx.ws = a0; ctx.nIdx = a1; ctx.idx = a1; ctx.targetOwner = a2;
            ctx.attackerIdx = a3; ctx.attackerOwner = a4; ctx.fac = a5;
            ctx.facId = a5 ? a5.id : a2;
            ctx.owner = ctx.facId;
            break;
        case 'onDefendSuccess':
            ctx.ws = a0; ctx.nIdx = a1; ctx.idx = a1; ctx.nx = a2; ctx.ny = a3; ctx.fac = a4;
            ctx.facId = a4 ? a4.id : -1;
            ctx.owner = ctx.facId;
            break;
        case 'onRenderVFX':
            ctx.gfx = a0; ctx.x = a1; ctx.y = a2; ctx.idx = a3; ctx.frame = a4; ctx.fac = a5;
            ctx.facId = a5 ? a5.id : -1;
            ctx.ws = a6 || (typeof window !== 'undefined' ? window.WorldState : null);
            break;
        case 'onRenderTileLogic':
            ctx.gfx = a0; ctx.x = a1; ctx.y = a2; ctx.idx = a3; ctx.mask = a4; ctx.frame = a5; ctx.fac = a6;
            ctx.facId = a6 ? a6.id : -1;
            ctx.ws = a7 || (typeof window !== 'undefined' ? window.WorldState : null);
            break;
    }
    return ctx;
}

export const AbilityCompiler = {
    resolvePart: function(factionKey, partKey) {
        if (!partKey) return null;
        if (typeof partKey === 'object' && typeof partKey.execute === 'function') {
            return partKey;
        }
        var scoped = factionKey ? CUSTOM_ABILITY_PARTS[factionKey + ':' + partKey] : null;
        if (scoped) return scoped;
        if (CUSTOM_ABILITY_PARTS[partKey]) return CUSTOM_ABILITY_PARTS[partKey];
        if (ABILITY_PARTS[partKey]) return ABILITY_PARTS[partKey];
        return null;
    },

    compile: function(faction) {
        if (!faction.params) faction.params = {};

        var abilityMap = faction.ability;
        if (!abilityMap) return null;

        var usedBudget = 0;
        var hooksGrouped = {};
        var maxBudget = faction.maxBudget !== undefined ? faction.maxBudget : 15;

        for (var hookName in abilityMap) {
            if (!Object.prototype.hasOwnProperty.call(abilityMap, hookName)) continue;

            if (!HOOK_SIGNATURES[hookName]) {
                console.warn('[Compiler] Unknown hook: ' + hookName + ' in ' + faction.name);
                continue;
            }

            var partKeys = abilityMap[hookName];
            if (!partKeys || partKeys.length === 0) continue;

            for (var i = 0; i < partKeys.length; i++) {
                var partKey = partKeys[i];
                var part = this.resolvePart(faction.key, partKey);
                if (!part) {
                    console.warn('[Compiler] Unknown part: ' + partKey + ' in ' + faction.name);
                    continue;
                }

                if (part.hook && part.hook !== hookName) {
                    console.warn('[Compiler] Part/hook mismatch: ' + partKey +
                                 ' (part.hook=' + part.hook + ', map.hook=' + hookName + ')');
                    continue;
                }

                usedBudget += part.cost || 0;

                if (usedBudget > maxBudget) {
                    console.warn('[Compiler] Budget exceeded: ' + faction.name +
                                 ' (' + usedBudget + '/' + maxBudget + ')');
                    break;
                }

                var rawOverride = (faction.partData && faction.partData[partKey]) || null;
                var mergedData = part.data
                    ? Object.assign({}, part.data, rawOverride || {})
                    : (rawOverride || {});

                if (!hooksGrouped[hookName]) hooksGrouped[hookName] = [];
                hooksGrouped[hookName].push({
                    part: part,
                    override: mergedData
                });
            }
        }

        var compiled = {};
        for (var h in hooksGrouped) {
            if (!Object.prototype.hasOwnProperty.call(hooksGrouped, h)) continue;
            var entries = hooksGrouped[h];

            if (entries.length === 1) {
                compiled[h] = this._makeSingleHook(h, entries[0]);
            } else {
                compiled[h] = this._makeCompositeHook(h, entries);
            }
        }

        // Categorize onTick entries into Owner-dispatched, Layer-gated, and Global hooks
        if (hooksGrouped.onTick) {
            var tickEntries = hooksGrouped.onTick;
            var ownerEntries = [];
            var layerEntries = [];
            var globalEntries = [];
            var ownerBoundLayerKey = null;

            for (var ti = 0; ti < tickEntries.length; ti++) {
                var te = tickEntries[ti];
                var tp = te.part;
                var td = te.override || {};
                var trig = tp.trigger || { type: 'always' };
                var inferredLayerKey = td.layerKey || tp.tickLayerKey || (trig.type === 'layer' ? trig.key : null);

                if (tp.tickScope === 'owner') {
                    ownerEntries.push(te);
                    if (tp.clearOnOwnerLoss) {
                        ownerBoundLayerKey = td.layerKey || faction.key;
                    }
                } else if (inferredLayerKey && trig.type !== 'threshold') {
                    layerEntries.push({
                        layerKey: inferredLayerKey,
                        hook: this._makeSingleHook('onTick', te)
                    });
                } else {
                    globalEntries.push(te);
                }
            }

            compiled._ownerOnTick = ownerEntries.length === 1
                ? this._makeSingleHook('onTick', ownerEntries[0])
                : (ownerEntries.length > 1 ? this._makeCompositeHook('onTick', ownerEntries) : null);
            compiled._layerOnTickEntries = layerEntries;
            compiled._globalOnTick = globalEntries.length === 1
                ? this._makeSingleHook('onTick', globalEntries[0])
                : (globalEntries.length > 1 ? this._makeCompositeHook('onTick', globalEntries) : null);
            compiled._ownerBoundLayerKey = ownerBoundLayerKey;
        }

        compiled._usedBudget = usedBudget;
        return compiled;
    },

    _makeSingleHook: function(hookName, entry) {
        var part = entry.part;
        var execute = part.execute;
        var trigger = part.trigger || { type: 'always' };
        var partData = entry.override || {};
        var isRenderHook = RENDER_HOOKS[hookName] === true;
        var isValueHook = VALUE_RETURN_HOOKS[hookName] === true;

        if (isRenderHook || trigger.type === 'always') {
            return function(a0, a1, a2, a3, a4, a5, a6, a7) {
                var ctx = _populateContext(hookName, a0, a1, a2, a3, a4, a5, a6, a7, partData);
                return execute(ctx);
            };
        }

        if (trigger.type === 'cooldown') {
            var ticks = partData.ticks || trigger.ticks || 3;
            var counter = 0;
            return function(a0, a1, a2, a3, a4, a5, a6, a7) {
                counter++;
                if (counter >= ticks) {
                    counter = 0;
                    var ctx = _populateContext(hookName, a0, a1, a2, a3, a4, a5, a6, a7, partData);
                    return execute(ctx);
                }
                return isValueHook ? a2 : undefined;
            };
        }

        if (trigger.type === 'chance') {
            var chance = (partData.chance !== undefined) ? partData.chance : trigger.value;
            return function(a0, a1, a2, a3, a4, a5, a6, a7) {
                if (Utils.fastRNG() >= chance) return isValueHook ? a2 : undefined;
                var ctx = _populateContext(hookName, a0, a1, a2, a3, a4, a5, a6, a7, partData);
                return execute(ctx);
            };
        }

        if (trigger.type === 'layer') {
            var layerKey = partData.layerKey || trigger.key;
            return function(a0, a1, a2, a3, a4, a5, a6, a7) {
                var ctx = _populateContext(hookName, a0, a1, a2, a3, a4, a5, a6, a7, partData);
                var ws = ctx.ws;
                if (!ws || !ws.layers) return isValueHook ? a2 : undefined;
                var layer = ws.layers[layerKey];
                if (layer && layer[ctx.idx] > 0) {
                    return execute(ctx);
                }
                return isValueHook ? a2 : undefined;
            };
        }

        if (trigger.type === 'threshold') {
            var tKey = partData.layerKey || trigger.key;
            var tValue = partData.threshold !== undefined ? partData.threshold : trigger.value;
            return function(a0, a1, a2, a3, a4, a5, a6, a7) {
                var ctx = _populateContext(hookName, a0, a1, a2, a3, a4, a5, a6, a7, partData);
                var ws = ctx.ws;
                if (!ws || !ws.layers) return isValueHook ? a2 : undefined;
                var layer = ws.layers[tKey];
                if (layer && layer[ctx.idx] >= tValue) {
                    return execute(ctx);
                }
                return isValueHook ? a2 : undefined;
            };
        }

        console.warn('[Compiler] Unknown trigger type: ' + trigger.type);
        return function(a0, a1, a2) { return isValueHook ? a2 : undefined; };
    },

    _makeCompositeHook: function(hookName, entries) {
        var isRenderHook = RENDER_HOOKS[hookName] === true;
        var isValueHook = VALUE_RETURN_HOOKS[hookName] === true;

        var alwaysExecutes = [];
        var chanceData = [];
        var layerData = [];
        var thresholdData = [];
        var cooldownStates = [];

        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            var trig = e.part.trigger || { type: 'always' };
            var t = trig.type;
            var partData = e.override || {};

            if (isRenderHook || t === 'always') {
                alwaysExecutes.push({
                    execute: e.part.execute,
                    partData: partData
                });
            } else if (t === 'chance') {
                chanceData.push({
                    execute: e.part.execute,
                    chance: (partData.chance !== undefined) ? partData.chance : trig.value,
                    partData: partData
                });
            } else if (t === 'layer') {
                layerData.push({
                    execute: e.part.execute,
                    layerKey: partData.layerKey || trig.key,
                    partData: partData
                });
            } else if (t === 'threshold') {
                thresholdData.push({
                    execute: e.part.execute,
                    key: partData.layerKey || trig.key,
                    value: partData.threshold !== undefined ? partData.threshold : trig.value,
                    partData: partData
                });
            } else if (t === 'cooldown') {
                cooldownStates.push({
                    execute: e.part.execute,
                    ticks: partData.ticks || trig.ticks || 3,
                    counter: 0,
                    partData: partData
                });
            }
        }

        return function(a0, a1, a2, a3, a4, a5, a6, a7) {
            var ctx = _populateContext(hookName, a0, a1, a2, a3, a4, a5, a6, a7, null);
            var result = isValueHook ? a2 : undefined;

            for (var a = 0; a < alwaysExecutes.length; a++) {
                var ae = alwaysExecutes[a];
                ctx.partData = ae.partData;
                var rA = ae.execute(ctx);
                if (isValueHook && rA !== undefined) {
                    result = rA;
                    ctx.basePower = rA;
                } else if (rA) {
                    result = rA;
                }
            }

            for (var c = 0; c < chanceData.length; c++) {
                var cd = chanceData[c];
                if (Utils.fastRNG() < cd.chance) {
                    ctx.partData = cd.partData;
                    var rC = cd.execute(ctx);
                    if (isValueHook && rC !== undefined) {
                        result = rC;
                        ctx.basePower = rC;
                    } else if (rC) {
                        result = rC;
                    }
                }
            }

            for (var l = 0; l < layerData.length; l++) {
                var ld = layerData[l];
                var ws = ctx.ws;
                if (!ws || !ws.layers) continue;
                var layer = ws.layers[ld.layerKey];
                if (layer && layer[ctx.idx] > 0) {
                    ctx.partData = ld.partData;
                    var rL = ld.execute(ctx);
                    if (isValueHook && rL !== undefined) {
                        result = rL;
                        ctx.basePower = rL;
                    } else if (rL) {
                        result = rL;
                    }
                }
            }

            for (var th = 0; th < thresholdData.length; th++) {
                var td = thresholdData[th];
                var ws2 = ctx.ws;
                if (!ws2 || !ws2.layers) continue;
                var layer2 = ws2.layers[td.key];
                if (layer2 && layer2[ctx.idx] >= td.value) {
                    ctx.partData = td.partData;
                    var rT = td.execute(ctx);
                    if (isValueHook && rT !== undefined) {
                        result = rT;
                        ctx.basePower = rT;
                    } else if (rT) {
                        result = rT;
                    }
                }
            }

            for (var co = 0; co < cooldownStates.length; co++) {
                var cs = cooldownStates[co];
                cs.counter++;
                if (cs.counter >= cs.ticks) {
                    cs.counter = 0;
                    ctx.partData = cs.partData;
                    var rCo = cs.execute(ctx);
                    if (isValueHook && rCo !== undefined) {
                        result = rCo;
                        ctx.basePower = rCo;
                    } else if (rCo) {
                        result = rCo;
                    }
                }
            }

            return result;
        };
    }
};

export const FactionRegistry = {
    // Fast direct arrays and O(1) lookup tables of compiled hook functions for hot-loop iteration
    activeTickHooks: [],
    activeOwnerTickHooksByFacId: Object.create(null),
    activeOwnerBoundLayersByFacId: Object.create(null),
    activeLayerTickEntries: [],
    activeGlobalTickHooks: [],
    activeVfxEntries: [],
    activeTileHooksByFacId: null,

    compileAll: function(activeFactions) {
        var tickKeys = [];
        var vfxKeys = [];
        var tileKeys = [];
        var hooksMap = Object.create(null);

        this.activeTickHooks = [];
        this.activeOwnerTickHooksByFacId = Object.create(null);
        this.activeOwnerBoundLayersByFacId = Object.create(null);
        this.activeLayerTickEntries = [];
        this.activeGlobalTickHooks = [];
        this.activeVfxEntries = [];
        this.activeTileHooksByFacId = Object.create(null);

        for (var i = 0; i < activeFactions.length; i++) {
            var faction = activeFactions[i];

            if (faction._maxStat === undefined) {
                var s = faction.baseStats;
                faction._maxStat = Math.max(s.spr, s.res, s.att);
            }

            var compiled = AbilityCompiler.compile(faction);
            if (!compiled) continue;

            faction._compiled = compiled;
            hooksMap[faction.key] = compiled;

            if (compiled.onTick) {
                tickKeys.push(faction.key);
                this.activeTickHooks.push(compiled.onTick);
                if (compiled._ownerOnTick) {
                    this.activeOwnerTickHooksByFacId[faction.id] = compiled._ownerOnTick;
                }
                if (compiled._ownerBoundLayerKey) {
                    this.activeOwnerBoundLayersByFacId[faction.id] = compiled._ownerBoundLayerKey;
                }
                if (compiled._layerOnTickEntries && compiled._layerOnTickEntries.length > 0) {
                    for (var le = 0; le < compiled._layerOnTickEntries.length; le++) {
                        this.activeLayerTickEntries.push({
                            layerKey: compiled._layerOnTickEntries[le].layerKey,
                            hook: compiled._layerOnTickEntries[le].hook,
                            fac: faction
                        });
                    }
                }
                if (compiled._globalOnTick) {
                    this.activeGlobalTickHooks.push(compiled._globalOnTick);
                }
            }
            if (compiled.onRenderVFX) {
                vfxKeys.push(faction.key);
                this.activeVfxEntries.push({
                    key: faction.key,
                    fac: faction,
                    hook: compiled.onRenderVFX,
                    extraLayers: (faction.params && faction.params.extraLayers) || null
                });
            }
            if (compiled.onRenderTileLogic) {
                tileKeys.push(faction.key);
                this.activeTileHooksByFacId[faction.id] = compiled.onRenderTileLogic;
            }
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
        this.activeTickHooks = [];
        this.activeOwnerTickHooksByFacId = Object.create(null);
        this.activeOwnerBoundLayersByFacId = Object.create(null);
        this.activeLayerTickEntries = [];
        this.activeGlobalTickHooks = [];
        this.activeVfxEntries = [];
        this.activeTileHooksByFacId = Object.create(null);
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