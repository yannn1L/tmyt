/**
 * FACTIONS INDEX — Aggregator and registry builder for all individual faction modules.
 *
 * To add a new faction:
 * 1. Create `data/factions/<your-faction>.js` using `defineFaction({ ... })`
 * 2. Import and include it in `FACTIONS` below (or call `registerFaction(spec)` at runtime).
 */

import { CONFIG } from '../../core/config.js';
import { defineFaction } from '../../core/faction-builder.js';

import { inferno } from './inferno.js';
import { ices } from './ices.js';
import { mecha } from './mecha.js';
import { bastion } from './bastion.js';
import { cube } from './cube.js';
import { glitch } from './glitch.js';
import { sickening } from './sickening.js';
import { poison } from './poison.js';
import { bomber } from './bomber.js';
import { nature } from './nature.js';
import { multi } from './multi.js';
import { mimic } from './mimic.js';
import { fractal } from './fractal.js';

export {
    defineFaction,
    inferno,
    ices,
    mecha,
    bastion,
    cube,
    glitch,
    sickening,
    poison,
    bomber,
    nature,
    multi,
    mimic,
    fractal
};

export const FACTIONS = [
    inferno,
    ices,
    mecha,
    bastion,
    cube,
    glitch,
    sickening,
    poison,
    bomber,
    nature,
    multi,
    mimic,
    fractal
];

export const FACTIONS_BY_KEY = Object.create(null);
export const FACTIONS_BY_ID = FACTIONS;
export var FACTION_COUNT = FACTIONS.length;
export var FACTION_COLOR_HEX = new Int32Array(FACTIONS.length);
export const BLOCKER_KEYS_SET = Object.create(null);

/**
 * Rebuilds precomputed lookup tables (`FACTIONS_BY_KEY`, `FACTION_COLOR_HEX`, `BLOCKER_KEYS_SET`)
 * whenever factions are initialized or dynamically registered.
 */
export function rebuildFactionRegistries() {
    FACTION_COUNT = FACTIONS.length;
    if (FACTION_COLOR_HEX.length !== FACTION_COUNT) {
        FACTION_COLOR_HEX = new Int32Array(FACTION_COUNT);
    }

    // Clear lookup maps before repopulating so deleted keys do not linger
    for (var oldKey in FACTIONS_BY_KEY) {
        delete FACTIONS_BY_KEY[oldKey];
    }
    for (var oldBlk in BLOCKER_KEYS_SET) {
        delete BLOCKER_KEYS_SET[oldBlk];
    }

    for (var i = 0; i < FACTIONS.length; i++) {
        var f = FACTIONS[i];
        f.id = i;
        if (!f.key) f.key = f.name.toLowerCase();
        FACTIONS_BY_KEY[f.key] = f;
        FACTION_COLOR_HEX[i] = parseInt(f.icon.color.slice(1), 16);

        if (f.traits && f.traits.isBlocker) {
            BLOCKER_KEYS_SET[f.key] = true;
            f.isBlocker = true;
        }
    }

    autoDetectHazardKeys();

    if (typeof window !== 'undefined') {
        window.FACTION_COUNT = FACTION_COUNT;
        window.FACTION_COLOR_HEX = FACTION_COLOR_HEX;
    }
}

/**
 * Dynamically defines and registers a new faction at runtime (or updates an existing custom faction with the same key).
 */
export function registerFaction(specOrFaction, options) {
    var fac = (specOrFaction && specOrFaction._basePower !== undefined)
        ? specOrFaction
        : defineFaction(specOrFaction);
    if (options && options.isCustom !== undefined) {
        fac.isCustom = !!options.isCustom;
    } else if (fac.isCustom === undefined) {
        fac.isCustom = true;
    }
    if (options && typeof options.rawCode === 'string') {
        fac._rawCode = options.rawCode;
    }
    var existingIdx = -1;
    for (var i = 0; i < FACTIONS.length; i++) {
        if (FACTIONS[i].key === fac.key) {
            existingIdx = i;
            break;
        }
    }
    if (existingIdx !== -1) {
        fac.id = existingIdx;
        FACTIONS[existingIdx] = fac;
    } else {
        fac.id = FACTIONS.length;
        FACTIONS.push(fac);
    }
    rebuildFactionRegistries();
    return fac;
}

/**
 * Removes a dynamically added faction by its `key` or `id` and rebuilds faction registries.
 */
export function unregisterFaction(keyOrId) {
    var targetIdx = -1;
    for (var i = 0; i < FACTIONS.length; i++) {
        if (FACTIONS[i].key === keyOrId || FACTIONS[i].id === keyOrId) {
            targetIdx = i;
            break;
        }
    }
    if (targetIdx === -1) return null;
    var removed = FACTIONS.splice(targetIdx, 1)[0];
    rebuildFactionRegistries();
    return removed;
}

export function autoDetectHazardKeys() {
    var hazardKeys = [];
    for (var i = 0; i < FACTIONS.length; i++) {
        var f = FACTIONS[i];
        if ((f.params && f.params.isHazard) || (f.traits && f.traits.isHazard)) {
            hazardKeys.push(f.key);
        }
    }
    if (typeof CONFIG !== 'undefined' && CONFIG.POWER) {
        CONFIG.POWER.HAZARD_KEYS = hazardKeys;
        CONFIG.HAZARD_KEYS = hazardKeys;
    }
    return hazardKeys;
}

rebuildFactionRegistries();

if (typeof window !== 'undefined') {
    window.FACTIONS = FACTIONS;
    window.FACTIONS_BY_KEY = FACTIONS_BY_KEY;
    window.FACTIONS_BY_ID = FACTIONS_BY_ID;
    window.FACTION_COUNT = FACTION_COUNT;
    window.FACTION_COLOR_HEX = FACTION_COLOR_HEX;
    window.BLOCKER_KEYS_SET = BLOCKER_KEYS_SET;
    window.autoDetectHazardKeys = autoDetectHazardKeys;
    window.registerFaction = registerFaction;
    window.unregisterFaction = unregisterFaction;
}
