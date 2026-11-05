/**
 * BOMBER — Martyrdom AoE detonation faction.
 * Uses reusable Martyrdom Detonate On Fail base ability.
 */

import { defineFaction } from '../../core/faction-builder.js';

export const bomber = defineFaction({
    id: 8,
    name: 'Bomber',
    key: 'bomber',
    icon: { glyph: '\ue018', unicode: '💣', color: '#ff5500' },
    baseStats: { att: 50, res: 15, spr: 80 },
    traits: {
        isHazard: false,
        isBlocker: false,
        freezeImmune: false,
        skipStandardSpread: false
    },
    ability: {
        onDefendFail: ['martyrdomDetonateOnFail']
    },
    partData: {
        martyrdomDetonateOnFail: {
            radius: 1,
            shockC: '#ff5500',
            rMax: 60,
            spd: 5,
            w: 4,
            text: 'BOOM!'
        }
    },
    params: {},
    maxBudget: 10,
    rarity: 'starter',
    descShort: 'Martyrdom',
    descLong: 'Violently detonates when losing defense, clearing a 3x3 area.'
});
