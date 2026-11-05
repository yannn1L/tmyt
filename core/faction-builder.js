/**
 * FACTION BUILDER — Modular factory (`defineFaction`) and Zero-GC Action Toolkit (`AbilityActions`).
 *
 * Enables limitless faction & ability creation:
 * - Mix and match reusable base abilities from `data/abilities.js` via `ability` tags & `partData`
 * - Write bespoke per-faction mechanics inline via `customAbilities`
 * - Use high-level `ctx.actions` helpers OR direct low-level TypedArray buffers (`ctx.ws.grid`, `ctx.ws.layers`)
 */

import { CONFIG, Utils } from './config.js';
import { VFX } from './vfx.js';
import { ABILITY_PARTS } from '../data/abilities.js';

export const DEFAULT_HAZARD_KEYS = ['inferno', 'ices', 'poison', 'sickening'];

/**
 * Registry of custom abilities defined inside individual faction modules via `defineFaction`.
 * Stored both by scoped key (`<factionKey>:<abilityKey>`) and bare key (`<abilityKey>`).
 */
export const CUSTOM_ABILITY_PARTS = Object.create(null);

/**
 * Zero-allocation high-level Action Toolkit attached to `ctx.actions`.
 * All methods operate on the currently active `_sharedCtx` (`this._ctx`) without creating closures.
 */
export const AbilityActions = {
    _ctx: null,

    /* -------------------------------------------------------------------- */
    /* Spatial & Grid Queries                                               */
    /* -------------------------------------------------------------------- */

    getX: function(idx) {
        return CONFIG.CELL_X[idx !== undefined ? idx : this._ctx.idx];
    },

    getY: function(idx) {
        return CONFIG.CELL_Y[idx !== undefined ? idx : this._ctx.idx];
    },

    getIndex: function(x, y) {
        return y * CONFIG.GRID.COLS + x;
    },

    isValid: function(x, y) {
        return x >= 0 && x < CONFIG.GRID.COLS && y >= 0 && y < CONFIG.GRID.ROWS;
    },

    getOwner: function(idx) {
        var ws = this._ctx.ws;
        return ws.grid[idx !== undefined ? idx : this._ctx.idx];
    },

    getNextOwner: function(idx) {
        var ws = this._ctx.ws;
        return ws.nextGrid[idx !== undefined ? idx : this._ctx.idx];
    },

    isAlly: function(idx, ownerId) {
        var ws = this._ctx.ws;
        var checkOwner = ownerId !== undefined ? ownerId : this._ctx.facId;
        return idx !== -1 && ws.grid[idx] === checkOwner;
    },

    isEnemy: function(idx, ownerId) {
        if (idx === -1) return false;
        var cellOwner = this._ctx.ws.grid[idx];
        var checkOwner = ownerId !== undefined ? ownerId : this._ctx.facId;
        return cellOwner !== -1 && cellOwner !== checkOwner;
    },

    isEmpty: function(idx) {
        return idx !== -1 && this._ctx.ws.grid[idx] === -1;
    },

    randomNeighbor: function(idx) {
        var cIdx = idx !== undefined ? idx : this._ctx.idx;
        var di = (Utils.fastRNG() * 4) | 0;
        return CONFIG.NEIGHBOR_IDX[cIdx * 4 + di];
    },

    randomDiagNeighbor: function(idx) {
        var cIdx = idx !== undefined ? idx : this._ctx.idx;
        var di = (Utils.fastRNG() * 4) | 0;
        return CONFIG.DIAG_NEIGHBOR_IDX[cIdx * 4 + di];
    },

    randomJump2Neighbor: function(idx) {
        var cIdx = idx !== undefined ? idx : this._ctx.idx;
        var di = (Utils.fastRNG() * 4) | 0;
        return CONFIG.JUMP2_NEIGHBOR_IDX[cIdx * 4 + di];
    },

    countAdjacentAllies: function(idx, facId) {
        var ws = this._ctx.ws;
        var cIdx = idx !== undefined ? idx : this._ctx.idx;
        var targetFacId = facId !== undefined ? facId : this._ctx.facId;
        var base = cIdx * 4;
        var neigh = CONFIG.NEIGHBOR_IDX;
        var count = 0;
        for (var d = 0; d < 4; d++) {
            var n = neigh[base + d];
            if (n !== -1 && ws.grid[n] === targetFacId) count++;
        }
        return count;
    },

    countAdjacentEnemies: function(idx, facId) {
        var ws = this._ctx.ws;
        var cIdx = idx !== undefined ? idx : this._ctx.idx;
        var targetFacId = facId !== undefined ? facId : this._ctx.facId;
        var base = cIdx * 4;
        var neigh = CONFIG.NEIGHBOR_IDX;
        var count = 0;
        for (var d = 0; d < 4; d++) {
            var n = neigh[base + d];
            if (n !== -1) {
                var nOwner = ws.grid[n];
                if (nOwner !== -1 && nOwner !== targetFacId) count++;
            }
        }
        return count;
    },

    forEachNeighbor: function(idx, callback) {
        var cIdx = idx !== undefined ? idx : this._ctx.idx;
        var base = cIdx * 4;
        var neigh = CONFIG.NEIGHBOR_IDX;
        for (var d = 0; d < 4; d++) {
            var n = neigh[base + d];
            if (n !== -1) callback(n, d);
        }
    },

    forEachInRadius: function(cx, cy, radius, callback) {
        var cols = CONFIG.GRID.COLS;
        var rows = CONFIG.GRID.ROWS;
        var r = radius | 0;
        for (var dx = -r; dx <= r; dx++) {
            var x = cx + dx;
            if (x < 0 || x >= cols) continue;
            for (var dy = -r; dy <= r; dy++) {
                var y = cy + dy;
                if (y < 0 || y >= rows) continue;
                callback(y * cols + x, x, y);
            }
        }
    },

    /* -------------------------------------------------------------------- */
    /* Territory & Combat Mutations                                         */
    /* -------------------------------------------------------------------- */

    captureCell: function(targetIdx, newOwner) {
        if (targetIdx === -1 || targetIdx === undefined) return false;
        var ws = this._ctx.ws;
        var owner = newOwner !== undefined ? newOwner : this._ctx.owner;
        if (owner === -1 || ws.grid[targetIdx] === owner) return false;
        if (ws.capturedThisTick[targetIdx]) return false;

        ws.nextGrid[targetIdx] = owner;
        ws.capturedThisTick[targetIdx] = 1;
        ws.changes++;
        return true;
    },

    clearCell: function(targetIdx) {
        if (targetIdx === -1 || targetIdx === undefined) return false;
        var ws = this._ctx.ws;
        if (ws.capturedThisTick[targetIdx]) return false;
        ws.nextGrid[targetIdx] = -1;
        return true;
    },

    clearArea: function(cx, cy, radius, ignoreOwner, clearLayers) {
        var ws = this._ctx.ws;
        var cols = CONFIG.GRID.COLS;
        var rows = CONFIG.GRID.ROWS;
        var r = radius !== undefined ? (radius | 0) : 1;
        var cleared = 0;

        for (var dx = -r; dx <= r; dx++) {
            var x = cx + dx;
            if (x < 0 || x >= cols) continue;
            for (var dy = -r; dy <= r; dy++) {
                var y = cy + dy;
                if (y < 0 || y >= rows) continue;
                var cellIdx = y * cols + x;
                if (ignoreOwner !== undefined && ws.grid[cellIdx] === ignoreOwner) continue;
                if (ws.capturedThisTick[cellIdx]) continue;
                ws.nextGrid[cellIdx] = -1;
                if (clearLayers && ws.layers) {
                    for (var l = 0; l < clearLayers.length; l++) {
                        var lk = clearLayers[l];
                        if (ws.layers[lk]) ws.layers[lk][cellIdx] = 0;
                    }
                }
                cleared++;
            }
        }
        return cleared;
    },

    calcAttackPower: function(owner, idx) {
        var ws = this._ctx.ws;
        return ws.calcPower(owner, idx, false, ws._bufAtk).power;
    },

    calcDefensePower: function(owner, idx) {
        var ws = this._ctx.ws;
        return ws.calcPower(owner, idx, true, ws._bufDef).power;
    },

    rollChance: function(probability) {
        return Utils.fastRNG() < probability;
    },

    random: function() {
        return Utils.fastRNG();
    },

    randomInt: function(maxExclusive) {
        return (Utils.fastRNG() * maxExclusive) | 0;
    },

    /* -------------------------------------------------------------------- */
    /* Status & Custom Layer Manipulation                                   */
    /* -------------------------------------------------------------------- */

    ensureLayer: function(layerKey) {
        var ws = this._ctx.ws;
        if (!ws || !ws.layers) return null;
        if (ws.ensureLayerBuffers) {
            return ws.ensureLayerBuffers(layerKey);
        }
        var layer = ws.layers[layerKey];
        if (!layer) {
            layer = new Int16Array(CONFIG.GRID.TOTAL);
            ws.layers[layerKey] = layer;
            ws.layerHasActiveCells[layerKey] = false;
        }
        return layer;
    },

    getLayer: function(layerKey, idx) {
        var layer = this.ensureLayer(layerKey);
        if (!layer) return 0;
        var cIdx = idx !== undefined ? idx : this._ctx.idx;
        return layer[cIdx];
    },

    setLayer: function(layerKey, idx, value) {
        var ws = this._ctx.ws;
        var cIdx = idx !== undefined ? idx : this._ctx.idx;
        if (ws && ws.setLayerValue) {
            return ws.setLayerValue(layerKey, cIdx, value);
        }
        var layer = this.ensureLayer(layerKey);
        if (!layer) return 0;
        var v = value > 0 ? (value | 0) : 0;
        layer[cIdx] = v;
        if (v > 0 && ws) ws.markLayerActive(layerKey, cIdx);
        return v;
    },

    addLayer: function(layerKey, idx, delta, maxVal) {
        var ws = this._ctx.ws;
        var cIdx = idx !== undefined ? idx : this._ctx.idx;
        if (ws && ws.addLayerValue) {
            return ws.addLayerValue(layerKey, cIdx, delta, maxVal);
        }
        var layer = this.ensureLayer(layerKey);
        if (!layer) return 0;
        var cap = maxVal !== undefined ? maxVal : 100;
        var next = layer[cIdx] + delta;
        if (next > cap) next = cap;
        if (next < 0) next = 0;
        layer[cIdx] = next;
        if (next > 0 && ws) ws.markLayerActive(layerKey, cIdx);
        return next;
    },

    spreadLayerToRandomNeighbor: function(layerKey, idx, diminish) {
        var layer = this.ensureLayer(layerKey);
        if (!layer) return false;
        var cIdx = idx !== undefined ? idx : this._ctx.idx;
        var cur = layer[cIdx];
        if (cur <= 0) return false;
        var nIdx = this.randomNeighbor(cIdx);
        if (nIdx === -1) return false;
        var spreadVal = cur - (diminish !== undefined ? diminish : 10);
        if (spreadVal > layer[nIdx]) {
            layer[nIdx] = spreadVal;
            var ws = this._ctx.ws;
            if (ws) {
                if (ws.trackActiveLayerCell) ws.trackActiveLayerCell(layerKey, nIdx);
                else ws.markLayerActive(layerKey, nIdx);
            }
            return true;
        }
        return false;
    },

    /* -------------------------------------------------------------------- */
    /* VFX, Audio & Camera Feedback                                         */
    /* -------------------------------------------------------------------- */

    spawnParticles: function(cellIdx, color, count, style) {
        var cIdx = cellIdx !== undefined ? cellIdx : this._ctx.idx;
        var cw = CONFIG.GRID.CELL_W || CONFIG.GRID.SIZE;
        var ch = CONFIG.GRID.CELL_H || CONFIG.GRID.SIZE;
        var px = CONFIG.CELL_X[cIdx] * cw + cw * 0.5;
        var py = CONFIG.CELL_Y[cIdx] * ch + ch * 0.5;
        var col = color || (this._ctx.fac && this._ctx.fac.icon && this._ctx.fac.icon.color) || '#ffffff';
        VFX.spawn(px, py, col, count || 4, style || 'normal');
    },

    spawnParticlesAt: function(px, py, color, count, style) {
        VFX.spawn(px, py, color || '#ffffff', count || 4, style || 'normal');
    },

    spawnText: function(cellIdx, text, color, isCrit) {
        var cIdx = cellIdx !== undefined ? cellIdx : this._ctx.idx;
        var cw = CONFIG.GRID.CELL_W || CONFIG.GRID.SIZE;
        var ch = CONFIG.GRID.CELL_H || CONFIG.GRID.SIZE;
        var px = CONFIG.CELL_X[cIdx] * cw + cw * 0.5;
        var py = CONFIG.CELL_Y[cIdx] * ch - 4;
        var col = color || (this._ctx.fac && this._ctx.fac.icon && this._ctx.fac.icon.color) || '#ffffff';
        VFX.spawn(px, py, col, 1, isCrit ? 'textCrit' : 'text', text);
    },

    shockwave: function(cellIdx, color, maxRadius, speed, width) {
        var cIdx = cellIdx !== undefined ? cellIdx : this._ctx.idx;
        var cw = CONFIG.GRID.CELL_W || CONFIG.GRID.SIZE;
        var ch = CONFIG.GRID.CELL_H || CONFIG.GRID.SIZE;
        var px = CONFIG.CELL_X[cIdx] * cw + cw * 0.5;
        var py = CONFIG.CELL_Y[cIdx] * ch + ch * 0.5;
        var col = color || (this._ctx.fac && this._ctx.fac.icon && this._ctx.fac.icon.color) || '#00ffcc';
        VFX.spawnShockwave(px, py, col, maxRadius || 50, speed || 4, width || 3);
    },

    laser: function(fromIdx, toIdx, color, width) {
        var cw = CONFIG.GRID.CELL_W || CONFIG.GRID.SIZE;
        var ch = CONFIG.GRID.CELL_H || CONFIG.GRID.SIZE;
        var x1 = CONFIG.CELL_X[fromIdx] * cw + cw * 0.5;
        var y1 = CONFIG.CELL_Y[fromIdx] * ch + ch * 0.5;
        var x2 = CONFIG.CELL_X[toIdx] * cw + cw * 0.5;
        var y2 = CONFIG.CELL_Y[toIdx] * ch + ch * 0.5;
        VFX.spawnLaser(x1, y1, x2, y2, color || '#00ffcc', width || 2);
    },

    sound: function(sfxKey) {
        if (this._ctx.ws && this._ctx.ws.playSound) {
            this._ctx.ws.playSound(sfxKey);
        }
    },

    shake: function(intensity) {
        if (this._ctx.ws && this._ctx.ws.requestShake) {
            this._ctx.ws.requestShake(intensity !== undefined ? intensity : CONFIG.VFX.SHAKE.CAPTURE);
        }
    }
};

/**
 * Builds standard hazard power modifiers for a faction, automatically making
 * a hazard faction immune (1.0x) to its own hazard layer while defaulting others to 0.6x.
 */
export function buildDefaultPowerModifiers(factionKey, isHazard, customOverrides) {
    var overrides = customOverrides || Object.create(null);
    var modifiers = [];
    for (var i = 0; i < DEFAULT_HAZARD_KEYS.length; i++) {
        var hk = DEFAULT_HAZARD_KEYS[i];
        var mult = overrides[hk] !== undefined
            ? overrides[hk]
            : (isHazard && hk === factionKey ? 1.0 : CONFIG.POWER.DEFAULT_HAZARD_MULT);
        modifiers.push({ type: 'hazard', key: hk, multiplier: mult });
    }
    return modifiers;
}

/**
 * Registers a custom ability part into `CUSTOM_ABILITY_PARTS`.
 */
export function registerCustomAbility(factionKey, abilityName, spec, inferredHook) {
    if (!spec) return null;

    var normalized;
    if (typeof spec === 'function') {
        normalized = {
            hook: inferredHook || 'onTick',
            cost: 0,
            tags: [factionKey, 'custom'],
            trigger: { type: 'always' },
            execute: spec
        };
    } else {
        normalized = {
            hook: spec.hook || inferredHook || 'onTick',
            cost: spec.cost !== undefined ? spec.cost : 0,
            tags: spec.tags || [factionKey, 'custom'],
            trigger: spec.trigger || { type: 'always' },
            data: spec.data || null,
            tickScope: spec.tickScope || null,
            tickLayerKey: spec.tickLayerKey || null,
            execute: spec.execute
        };
    }

    if (normalized.hook === 'onTick' && !normalized.tickScope && !normalized.tickLayerKey && typeof normalized.execute === 'function') {
        var fnSrc = Function.prototype.toString.call(normalized.execute);
        if (
            fnSrc.indexOf("fac.key !== '" + factionKey + "'") !== -1 ||
            fnSrc.indexOf('fac.key !== "' + factionKey + '"') !== -1 ||
            fnSrc.indexOf('ctx.owner !== ctx.fac.id') !== -1 ||
            fnSrc.indexOf('owner !== fac.id') !== -1
        ) {
            normalized.tickScope = 'owner';
        }
    }

    var scopedKey = factionKey + ':' + abilityName;
    CUSTOM_ABILITY_PARTS[scopedKey] = normalized;
    CUSTOM_ABILITY_PARTS[abilityName] = normalized;
    if (ABILITY_PARTS) {
        ABILITY_PARTS[scopedKey] = normalized;
        if (!ABILITY_PARTS[abilityName]) {
            ABILITY_PARTS[abilityName] = normalized;
        }
    }
    return scopedKey;
}

/**
 * Declarative factory for creating a modular faction definition.
 *
 * Supports:
 * - Reusable base ability tags in `ability: { onTick: ['...'], ... }`
 * - Faction-unique abilities in `customAbilities: { myUniqueSkill: { hook, trigger, cost, data, execute(ctx) } }`
 * - Inline functions directly inside `ability` arrays or `customAbilities`
 * - Automatic trait, hazard modifier, and base power normalization
 */
export function defineFaction(spec) {
    if (!spec || !spec.name) {
        throw new Error('[defineFaction] Faction specification requires at least a `name`.');
    }

    var key = (spec.key || spec.name).toLowerCase().replace(/[^a-z0-9_]/g, '');
    var baseStats = {
        att: (spec.baseStats && spec.baseStats.att !== undefined) ? spec.baseStats.att : 50,
        res: (spec.baseStats && spec.baseStats.res !== undefined) ? spec.baseStats.res : 50,
        spr: (spec.baseStats && spec.baseStats.spr !== undefined) ? spec.baseStats.spr : 50
    };

    var traits = {
        isHazard: Boolean((spec.traits && spec.traits.isHazard) || (spec.params && spec.params.isHazard)),
        isBlocker: Boolean(spec.traits && spec.traits.isBlocker),
        freezeImmune: Boolean(spec.traits && spec.traits.freezeImmune),
        skipStandardSpread: Boolean(spec.traits && spec.traits.skipStandardSpread)
    };

    var params = Object.assign({}, spec.params || {});
    if (traits.isHazard) {
        params.isHazard = true;
        if (params.layerMax === undefined) params.layerMax = 100;
        if (params.decay === undefined) params.decay = 10;
    }

    var powerModifiers = Array.isArray(spec.powerModifiers)
        ? spec.powerModifiers
        : buildDefaultPowerModifiers(key, traits.isHazard, spec.hazardMultipliers);

    var ability = {};
    if (spec.ability) {
        for (var h in spec.ability) {
            if (Object.prototype.hasOwnProperty.call(spec.ability, h)) {
                ability[h] = Array.isArray(spec.ability[h]) ? spec.ability[h].slice() : [spec.ability[h]];
            }
        }
    }

    var partData = Object.assign({}, spec.partData || {});
    var customAbilities = spec.customAbilities || {};

    // 1. Register inline functions inside `ability[hook]` if any
    for (var hookName in ability) {
        if (!Object.prototype.hasOwnProperty.call(ability, hookName)) continue;
        var list = ability[hookName];
        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            if (typeof item === 'function') {
                var inlineName = 'inline_' + hookName + '_' + i;
                registerCustomAbility(key, inlineName, item, hookName);
                list[i] = inlineName;
            } else if (item && typeof item === 'object' && typeof item.execute === 'function') {
                var objName = item.name || ('inline_' + hookName + '_' + i);
                registerCustomAbility(key, objName, item, hookName);
                if (item.data && !partData[objName]) {
                    partData[objName] = item.data;
                }
                list[i] = objName;
            }
        }
    }

    // 2. Register entries in `customAbilities` and auto-attach to `ability[hook]` if not already listed
    for (var customName in customAbilities) {
        if (!Object.prototype.hasOwnProperty.call(customAbilities, customName)) continue;
        var cSpec = customAbilities[customName];
        if (!cSpec) continue;

        // Infer hook if customName is already referenced in `ability`
        var targetHook = cSpec.hook || null;
        if (!targetHook) {
            for (var hk in ability) {
                if (ability[hk] && ability[hk].indexOf(customName) !== -1) {
                    targetHook = hk;
                    break;
                }
            }
        }
        if (!targetHook) targetHook = 'onTick';

        registerCustomAbility(key, customName, cSpec, targetHook);

        if (cSpec.data && !partData[customName]) {
            partData[customName] = cSpec.data;
        }

        // Auto-wire into `ability[targetHook]` if not explicitly placed in `ability`
        if (!ability[targetHook]) {
            ability[targetHook] = [customName];
        } else if (
            ability[targetHook].indexOf(customName) === -1 &&
            ability[targetHook].indexOf(key + ':' + customName) === -1
        ) {
            ability[targetHook].push(customName);
        }
    }

    var formula = spec.powerFormula || CONFIG.POWER.BASE_FORMULA;
    var maxStat = Math.max(baseStats.spr, baseStats.res, baseStats.att);
    var basePower =
        baseStats.att * formula.attWeight +
        baseStats.res * formula.resWeight +
        baseStats.spr * formula.sprWeight +
        (baseStats.att + baseStats.res) * (formula.balancedBonus || 0);

    return {
        id: spec.id !== undefined ? spec.id : -1,
        name: spec.name,
        key: key,
        icon: {
            glyph: (spec.icon && spec.icon.glyph) || '',
            unicode: (spec.icon && spec.icon.unicode) || spec.name[0],
            color: (spec.icon && spec.icon.color) || '#00ffcc'
        },
        baseStats: baseStats,
        powerFormula: spec.powerFormula || null,
        powerModifiers: powerModifiers,
        ability: ability,
        customAbilities: customAbilities,
        partData: partData,
        traits: traits,
        isBlocker: traits.isBlocker,
        params: params,
        maxBudget: spec.maxBudget !== undefined ? spec.maxBudget : 15,
        rarity: spec.rarity || 'starter',
        descShort: spec.descShort || spec.name,
        descLong: spec.descLong || '',
        _maxStat: maxStat,
        _basePower: basePower
    };
}

export const DEFAULT_CUSTOM_FACTION_TEMPLATE = [
    "defineFaction({",
    "  name: 'Solar',",
    "  key: 'solar',",
    "  icon: { unicode: '☀️', color: '#ffcc00' },",
    "  baseStats: { att: 65, res: 55, spr: 55 },",
    "  ability: {",
    "    onDefendCalc: ['adjacentAllyDefenseAura']",
    "  },",
    "  partData: {",
    "    adjacentAllyDefenseAura: { allyDefBonus: 8 }",
    "  },",
    "  customAbilities: {",
    "    solarFlareOnAttack: {",
    "      hook: 'onAttackSuccess',",
    "      cost: 4,",
    "      trigger: { type: 'chance', value: 0.35 },",
    "      execute(ctx) {",
    "        const jumpIdx = ctx.actions.randomJump2Neighbor(ctx.nIdx);",
    "        if (jumpIdx !== -1 && ctx.actions.captureCell(jumpIdx, ctx.owner)) {",
    "          ctx.actions.laser(ctx.nIdx, jumpIdx, '#ffcc00', 2);",
    "          ctx.actions.spawnText(jumpIdx, 'FLARE!', '#ffcc00', false);",
    "        }",
    "      }",
    "    }",
    "  },",
    "  descShort: 'Solar Beam',",
    "  descLong: 'Gains ally aura defense and fires solar flare beams across tiles.'",
    "})"
].join('\n');

/**
 * Evaluates user-pasted JavaScript `defineFaction(...)` code in a controlled scope
 * and returns a validated faction specification object.
 */
export function evaluateFactionCode(rawCode) {
    if (!rawCode || typeof rawCode !== 'string' || !rawCode.trim()) {
        throw new Error('Please paste a valid defineFaction({...}) code snippet.');
    }

    // Strip ES module import lines so users can paste entire faction module files directly
    var cleaned = rawCode
        .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
        .replace(/^\s*export\s+default\s+/gm, 'return ')
        .replace(/^\s*export\s+(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=/gm, 'const $1 =')
        .trim();

    var capturedFaction = null;
    var wrappedDefineFaction = function(spec) {
        var f = defineFaction(spec);
        capturedFaction = f;
        return f;
    };

    var result;
    try {
        // First try as an expression or return-based snippet
        var isExpression = /^(?:defineFaction\s*\(|\{)/.test(cleaned);
        var body = isExpression ? ('return (' + cleaned + ');') : cleaned;
        var fn = new Function(
            'defineFaction',
            'AbilityActions',
            'CONFIG',
            'Utils',
            'VFX',
            'ABILITY_PARTS',
            body
        );
        result = fn(wrappedDefineFaction, AbilityActions, CONFIG, Utils, VFX, ABILITY_PARTS);
    } catch (err) {
        throw new Error('Syntax / Execution Error: ' + (err && err.message ? err.message : String(err)));
    }

    var finalFaction = capturedFaction || result;
    if (!finalFaction || typeof finalFaction !== 'object' || !finalFaction.name) {
        throw new Error('Code must call defineFaction({ name, icon, baseStats, ... }) or return a faction object.');
    }

    if (finalFaction._basePower === undefined) {
        finalFaction = defineFaction(finalFaction);
    }

    return finalFaction;
}

if (typeof window !== 'undefined') {
    window.defineFaction = defineFaction;
    window.AbilityActions = AbilityActions;
    window.CUSTOM_ABILITY_PARTS = CUSTOM_ABILITY_PARTS;
    window.evaluateFactionCode = evaluateFactionCode;
    window.DEFAULT_CUSTOM_FACTION_TEMPLATE = DEFAULT_CUSTOM_FACTION_TEMPLATE;
}
