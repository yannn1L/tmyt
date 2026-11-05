/**
 * FACTIONS — Entry point re-exporting modular faction definitions from `data/factions/index.js`
 * and the `defineFaction` builder from `core/faction-builder.js`.
 */

export {
    defineFaction,
    AbilityActions,
    CUSTOM_ABILITY_PARTS,
    registerCustomAbility,
    DEFAULT_CUSTOM_FACTION_TEMPLATE,
    evaluateFactionCode
} from '../core/faction-builder.js';

export {
    FACTIONS,
    FACTIONS_BY_KEY,
    FACTIONS_BY_ID,
    FACTION_COUNT,
    FACTION_COLOR_HEX,
    BLOCKER_KEYS_SET,
    rebuildFactionRegistries,
    registerFaction,
    unregisterFaction,
    autoDetectHazardKeys,
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
} from './factions/index.js';