/**
 * SICKENING — Contagious Disease Vector faction.
 * Uses reusable Contagion Spread, Pre-Attack Layer Apply, Infected Auto-Capture, and Bubble Overlay abilities.
 */

import { defineFaction } from '../../core/faction-builder.js';

export const sickening = defineFaction({
    id: 6,
    name: 'Sickening',
    key: 'sickening',
    icon: { glyph: '\ue016', unicode: '🤢', color: '#a3cc29' },
    baseStats: { att: 30, res: 50, spr: 60 },
    traits: {
        isHazard: true,
        isBlocker: false,
        freezeImmune: false,
        skipStandardSpread: false
    },
    ability: {
        onTick: ['contagionSpreadTick'],
        onBeforeAttack: ['applyLayerOnBeforeAttack', 'autoCaptureInfectedOnBeforeAttack'],
        onRenderVFX: ['bubbleOverlayVisual']
    },
    partData: {
        contagionSpreadTick: {
            layerKey: 'sickening',
            diminishRate: 5
        },
        applyLayerOnBeforeAttack: {
            layerKey: 'sickening'
        },
        autoCaptureInfectedOnBeforeAttack: {
            layerKey: 'sickening',
            autoCap: 0.2,
            text: 'AUTO!',
            color: '#a3cc29'
        },
        bubbleOverlayVisual: {
            layerKey: 'sickening'
        }
    },
    params: {
        isHazard: true,
        layerMax: 100,
        decay: 5,
        vfx: { cBase: 0xa3cc29, cBub: 0x66ff00, bubSpd: 2, bubSz: 3 }
    },
    maxBudget: 10,
    rarity: 'starter',
    descShort: 'Disease Vector',
    descLong: 'Spreads sickness that weakens enemies. Chance to auto-capture.'
});
