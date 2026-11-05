/**
 * ICES — Frost Nova & Cold Aura faction.
 * Uses reusable AoE Nova, Adjacent Ally Defense Aura, and Tint Overlay base abilities.
 */

import { defineFaction } from '../../core/faction-builder.js';

export const ices = defineFaction({
    id: 1,
    name: 'Ices',
    key: 'ices',
    icon: { glyph: '\ue011', unicode: '❄️', color: '#2a9dff' },
    baseStats: { att: 30, res: 80, spr: 40 },
    traits: {
        isHazard: true,
        isBlocker: false,
        freezeImmune: true,
        skipStandardSpread: false
    },
    ability: {
        onAttackSuccess: ['aoeNovaOnAttack'],
        onDefendCalc: ['adjacentAllyDefenseAura'],
        onRenderVFX: ['layerTintOverlayVisual']
    },
    partData: {
        aoeNovaOnAttack: {
            layerKey: 'ices',
            text: 'NOVA!',
            sound: 'freeze',
            shockRadius: 40
        },
        adjacentAllyDefenseAura: {
            allyDefBonus: 10
        },
        layerTintOverlayVisual: {
            layerKey: 'ices'
        }
    },
    params: {
        isHazard: true,
        layerMax: 100,
        decay: 15,
        vfx: { cFill: 0x00ffff, aFill: 300, shockC: '#00ffff' }
    },
    maxBudget: 10,
    rarity: 'starter',
    descShort: 'Frost Nova',
    descLong: 'Releases chilling nova. Boosts defense when grouped.'
});
