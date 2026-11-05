/**
 * NATURE — Root Growth & Spore Burst faction.
 * Uses reusable Layer Buildup, Flat Layer Defense Bonus, Spore Jump Spread, Layer Reset, and Branching Roots Visual.
 */

import { defineFaction } from '../../core/faction-builder.js';

export const nature = defineFaction({
    id: 9,
    name: 'Nature',
    key: 'nature',
    icon: { glyph: '\ue019', unicode: '🌵', color: '#2aff2a' },
    baseStats: { att: 40, res: 40, spr: 80 },
    traits: {
        isHazard: false,
        isBlocker: true,
        freezeImmune: false,
        skipStandardSpread: false
    },
    ability: {
        onTick: ['layerBuildupTick', 'sporeJumpSpreadTick'],
        onDefendCalc: ['layerFlatDefenseBonus'],
        onDefendFail: ['layerResetOnDefendFail'],
        onRenderVFX: ['branchingRootsVisual']
    },
    partData: {
        layerBuildupTick: {
            layerKey: 'nature',
            ownerKey: 'nature',
            layerMax: 100,
            rate: 10
        },
        layerFlatDefenseBonus: {
            layerKey: 'nature',
            defMultiplier: 0.6
        },
        sporeJumpSpreadTick: {
            layerKey: 'nature',
            threshold: 100,
            sporeChance: 0.09
        },
        layerResetOnDefendFail: {
            layerKey: 'nature'
        },
        branchingRootsVisual: {
            layerKey: 'nature'
        }
    },
    params: {
        vfx: { cRoot: 0xa0703a, w: 3, alpha: 1.0 }
    },
    maxBudget: 15,
    rarity: 'starter',
    descShort: 'Root & Spores',
    descLong: 'Grows roots for defense. At max growth, launches spores.'
});
