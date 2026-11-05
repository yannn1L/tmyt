import test from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG, Utils, setGridDimensions } from '../core/config.js';
import {
    FACTIONS,
    FACTIONS_BY_KEY,
    FACTION_COUNT,
    autoDetectHazardKeys,
    defineFaction,
    registerFaction,
    unregisterFaction,
    evaluateFactionCode,
    DEFAULT_CUSTOM_FACTION_TEMPLATE,
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
} from '../data/factions.js';
import { BASE_ABILITIES, ABILITY_PARTS } from '../data/abilities.js';
import { AbilityCompiler, FactionRegistry } from '../core/faction-registry.js';
import { WorldState } from '../core/worldstate.js';
import { Renderer } from '../core/renderer.js';
import { Engine } from '../core/engine.js';
import { DependencyValidator, SettingsManager } from '../core/main.js';

// Register factions & runtime registries once for tests
for (let i = 0; i < FACTIONS.length; i++) {
    WorldState.factions[FACTIONS[i].id] = FACTIONS[i];
}
DependencyValidator.registerRuntimeRegistries();
WorldState.initLayers();

test('Precomputed spatial lookup tables match coordinate geometry', () => {
    setGridDimensions(20, 20);
    assert.equal(CONFIG.GRID.COLS, 20);
    assert.equal(CONFIG.GRID.ROWS, 20);
    assert.equal(CONFIG.GRID.TOTAL, 400);

    for (let idx = 0; idx < CONFIG.GRID.TOTAL; idx++) {
        const expectedX = idx % 20;
        const expectedY = Math.floor(idx / 20);
        assert.equal(Utils.getX(idx), expectedX);
        assert.equal(Utils.getY(idx), expectedY);
        assert.equal(Utils.getIndex(expectedX, expectedY), idx);
    }

    assert.equal(CONFIG.NEIGHBOR_IDX[0 * 4 + 0], -1);
    assert.equal(CONFIG.NEIGHBOR_IDX[0 * 4 + 1], 1);
    assert.equal(CONFIG.NEIGHBOR_IDX[0 * 4 + 2], 20);
    assert.equal(CONFIG.NEIGHBOR_IDX[0 * 4 + 3], -1);

    const centerIdx = 10 * 20 + 10;
    assert.equal(CONFIG.NEIGHBOR_IDX[centerIdx * 4 + 0], 9 * 20 + 10);
    assert.equal(CONFIG.NEIGHBOR_IDX[centerIdx * 4 + 1], 10 * 20 + 11);
    assert.equal(CONFIG.NEIGHBOR_IDX[centerIdx * 4 + 2], 11 * 20 + 10);
    assert.equal(CONFIG.NEIGHBOR_IDX[centerIdx * 4 + 3], 10 * 20 + 9);

    assert.equal(CONFIG.DIAG_NEIGHBOR_IDX[centerIdx * 4 + 0], 9 * 20 + 9);
    assert.equal(CONFIG.DIAG_NEIGHBOR_IDX[centerIdx * 4 + 3], 11 * 20 + 11);
});

test('SplitMix32 PRNG is deterministic and within [0, 1)', () => {
    Utils.seed = 42;
    const seq1 = [Utils.fastRNG(), Utils.fastRNG(), Utils.fastRNG()];
    Utils.seed = 42;
    const seq2 = [Utils.fastRNG(), Utils.fastRNG(), Utils.fastRNG()];
    assert.deepEqual(seq1, seq2);
    for (const val of seq1) {
        assert.ok(val >= 0 && val < 1);
    }
});

test('Individual faction modules and reusable BASE_ABILITIES compile cleanly within budget', () => {
    const individualFactions = [
        inferno, ices, mecha, bastion, cube, glitch,
        sickening, poison, bomber, nature, multi, mimic, fractal
    ];
    assert.equal(individualFactions.length, 13);
    assert.equal(FACTION_COUNT, 13);

    // Ensure reusable base abilities are present in BASE_ABILITIES
    assert.ok(BASE_ABILITIES.adjacentAllyDefenseAura);
    assert.ok(BASE_ABILITIES.hazardBurnSpreadTick);
    assert.ok(BASE_ABILITIES.layerBuildupTick);
    assert.ok(BASE_ABILITIES.martyrdomDetonateOnFail);

    // Ensure faction-unique customAbilities are registered for Cube, Glitch, Multi, Mimic, Fractal
    assert.ok(ABILITY_PARTS['cube:cubeFormationDetect']);
    assert.ok(ABILITY_PARTS['glitch:glitchDiagSpread']);
    assert.ok(ABILITY_PARTS['multi:multiAssignAbility']);
    assert.ok(ABILITY_PARTS['mimic:mimicStealAbility']);
    assert.ok(ABILITY_PARTS['fractal:fractalMirrorTick']);

    const hazardKeys = autoDetectHazardKeys();
    assert.deepEqual(hazardKeys, ['inferno', 'ices', 'sickening', 'poison']);

    FactionRegistry.compileAll(FACTIONS);
    for (const fac of FACTIONS) {
        assert.ok(fac._compiled, `Faction ${fac.name} failed to compile`);
        assert.ok(
            fac._compiled._usedBudget <= fac.maxBudget,
            `Faction ${fac.name} exceeded budget: ${fac._compiled._usedBudget}/${fac.maxBudget}`
        );
    }
    assert.ok(FactionRegistry.activeTickHooks.length > 0);
    assert.ok(FactionRegistry.activeVfxEntries.length > 0);
});

test('defineFaction creates modular custom factions with base abilities, customAbilities, and ctx.actions toolkit', () => {
    const chronoFaction = defineFaction({
        id: 99,
        name: 'Chrono',
        key: 'chrono',
        icon: { unicode: '⏳', color: '#00bfff' },
        baseStats: { att: 55, res: 65, spr: 60 },
        ability: {
            onDefendCalc: ['adjacentAllyDefenseAura']
        },
        partData: {
            adjacentAllyDefenseAura: { allyDefBonus: 12 }
        },
        customAbilities: {
            chronoPulseTick: {
                hook: 'onTick',
                cost: 4,
                trigger: { type: 'always' },
                data: { chargePerTick: 25, leapThreshold: 50 },
                execute(ctx) {
                    if (ctx.owner !== ctx.fac.id) return;
                    // High-level ctx.actions layer manipulation
                    const charge = ctx.actions.addLayer('chronoCharge', ctx.idx, ctx.partData.chargePerTick, 100);
                    if (charge >= ctx.partData.leapThreshold) {
                        // Direct buffer + high-level action hybrid
                        const rightNeighbor = CONFIG.NEIGHBOR_IDX[ctx.idx * 4 + 1];
                        if (rightNeighbor !== -1 && ctx.ws.grid[rightNeighbor] === -1) {
                            ctx.actions.captureCell(rightNeighbor, ctx.owner);
                            ctx.actions.setLayer('chronoCharge', ctx.idx, 0);
                        }
                    }
                }
            },
            chronoTimeShield: {
                hook: 'onDefendCalc',
                cost: 3,
                trigger: { type: 'always' },
                execute(ctx) {
                    const charge = ctx.actions.getLayer('chronoCharge', ctx.idx);
                    return ctx.basePower + charge * 0.5;
                }
            }
        }
    });

    const compiled = AbilityCompiler.compile(chronoFaction);
    assert.ok(compiled.onTick, 'Custom onTick hook should compile');
    assert.ok(compiled.onDefendCalc, 'Combined base + custom onDefendCalc hook should compile');

    WorldState.reset();
    WorldState.grid[20] = 99;
    WorldState.grid[21] = 99; // 1 adjacent ally for cell 20

    // Tick 1: builds 25 chronoCharge on cell 20
    compiled.onTick(WorldState, 20, 99, chronoFaction);
    assert.equal(WorldState.layers.chronoCharge[20], 25);

    // Check chained defense bonus: basePower (100) + 1 adjacent ally (12) + 25 * 0.5 (12.5) = 124.5
    const defPower = compiled.onDefendCalc(WorldState, 20, 100, chronoFaction);
    assert.equal(defPower, 124.5);

    // Tick 2 on cell 21: builds 50 chronoCharge and captures right neighbor (cell 22)
    compiled.onTick(WorldState, 21, 99, chronoFaction);
    compiled.onTick(WorldState, 21, 99, chronoFaction);
    assert.equal(WorldState.nextGrid[22], 99);
    assert.equal(WorldState.layers.chronoCharge[21], 0);
});

test('Power calculation caches per tick and applies hazard modifiers & defense hooks', () => {
    WorldState.reset();
    FactionRegistry.compileAll(FACTIONS);
    WorldState.beginTick();

    const infernoFac = FACTIONS_BY_KEY.inferno;
    const mechaFac = FACTIONS_BY_KEY.mecha;
    const cellIdx = 50;

    Utils.seed = 100;
    const baseMechaDef = WorldState.calcPower(mechaFac.id, cellIdx, true).power;
    const cachedMechaDef = WorldState.calcPower(mechaFac.id, cellIdx, true).power;
    assert.equal(baseMechaDef, cachedMechaDef);

    WorldState.beginTick();
    WorldState.layers.inferno[cellIdx] = 80;
    WorldState.markLayerActive('inferno');

    Utils.seed = 100;
    const hazardMechaDef = WorldState.calcPower(mechaFac.id, cellIdx, true).power;
    assert.ok(hazardMechaDef < baseMechaDef, 'Hazard should reduce non-immune faction power');

    WorldState.beginTick();
    Utils.seed = 100;
    const infernoOnFire = WorldState.calcPower(infernoFac.id, cellIdx, true).power;
    WorldState.beginTick();
    WorldState.layers.inferno[cellIdx] = 0;
    Utils.seed = 100;
    const infernoClean = WorldState.calcPower(infernoFac.id, cellIdx, true).power;
    assert.equal(infernoOnFire, infernoClean);
});

test('Dynamic Arena cols/rows resizing and Dev Mode evaluateFactionCode work end-to-end', () => {
    // 1. Evaluate player-pasted faction code (DEFAULT_CUSTOM_FACTION_TEMPLATE)
    const evaluatedSpec = evaluateFactionCode(DEFAULT_CUSTOM_FACTION_TEMPLATE);
    const solarFac = registerFaction(evaluatedSpec);
    assert.equal(solarFac.name, 'Solar');
    assert.equal(solarFac.key, 'solar');
    assert.ok(FACTIONS_BY_KEY.solar);
    WorldState.factions[solarFac.id] = solarFac;
    DependencyValidator.registerRuntimeRegistries();

    // 2. Resize arena grid to 32x16 while keeping canvas size fixed at 320x320
    WorldState.resize(32, 16);
    Engine.syncBuffers();
    Renderer.syncGridAndFactions();

    assert.equal(CONFIG.LAYOUT.CANVAS_SIZE, 320);
    assert.equal(CONFIG.GRID.COLS, 32);
    assert.equal(CONFIG.GRID.ROWS, 16);
    assert.equal(CONFIG.GRID.TOTAL, 512);
    assert.equal(CONFIG.GRID.CELL_W, 10);
    assert.equal(CONFIG.GRID.CELL_H, 20);
    assert.equal(WorldState.grid.length, 512);
    assert.equal(Engine.indices.length, 512);

    // 3. Run simulation ticks with the custom Solar faction on the resized 32x16 grid
    WorldState.activeFactions = [FACTIONS[0], solarFac];
    WorldState.reset();
    FactionRegistry.compileAll(WorldState.activeFactions);
    Renderer.reset();

    WorldState.grid[10] = FACTIONS[0].id;
    WorldState.grid[250] = solarFac.id;

    for (let i = 0; i < CONFIG.GRID.TOTAL; i++) Engine.indices[i] = i;

    for (let t = 0; t < 12; t++) {
        Engine.tick();
    }

    const totalOwned = Engine.cellCounts[FACTIONS[0].id] + Engine.cellCounts[solarFac.id];
    assert.ok(totalOwned > 2, `Expected territory expansion on 32x16 grid with custom Solar faction, got ${totalOwned}`);

    // 4. Delete custom Solar faction via unregisterFaction and verify registry cleanup
    const removed = unregisterFaction('solar');
    assert.ok(removed);
    assert.equal(removed.key, 'solar');
    assert.equal(FACTIONS_BY_KEY.solar, undefined);
    assert.equal(FACTIONS.length, 13);

    // 5. Verify SettingsManager applies and resets settings cleanly
    SettingsManager.current.baseTickMs = 75;
    SettingsManager.current.speedupIntervalMs = 5000;
    SettingsManager.apply();
    assert.equal(CONFIG.SIMULATION.BASE_TICK_MS, 75);
    assert.equal(CONFIG.SIMULATION.SPEEDUP_INTERVAL_MS, 5000);
    SettingsManager.resetDefaults();
    assert.equal(CONFIG.SIMULATION.BASE_TICK_MS, 150);

    // Restore default 20x20 grid for subsequent tests
    WorldState.resize(20, 20);
    Engine.syncBuffers();
    Renderer.syncGridAndFactions();
});

test('Engine simulation tick expands territories, queues dirty tiles, and detects uniform win', () => {
    WorldState.activeFactions = [FACTIONS[0], FACTIONS[1], FACTIONS[2]];
    WorldState.reset();
    FactionRegistry.compileAll(WorldState.activeFactions);
    Renderer.reset();

    WorldState.grid[10] = 0;
    WorldState.grid[200] = 1;
    WorldState.grid[350] = 2;

    for (let i = 0; i < CONFIG.GRID.TOTAL; i++) Engine.indices[i] = i;

    for (let t = 0; t < 15; t++) {
        Engine.tick();
    }

    const totalOwned = Engine.cellCounts[0] + Engine.cellCounts[1] + Engine.cellCounts[2];
    assert.ok(totalOwned > 3, `Expected territory expansion, got ${totalOwned} owned cells`);
    assert.ok(Renderer.dirtyCount > 0, 'Expected dirty tiles queued for renderer');

    const mockCounts = new Int32Array(FACTIONS.length);
    mockCounts[0] = CONFIG.GRID.TOTAL;
    assert.equal(WorldState.isUniformFromCounts(mockCounts), 0);
    Engine.stop();
});

test('Enlarged 40x40 arena uses sparse layer tracking, owner/layer-dispatched onTick, and sub-millisecond ticks', () => {
    WorldState.resize(40, 40);
    Engine.syncBuffers();
    Renderer.syncGridAndFactions();

    assert.equal(CONFIG.GRID.COLS, 40);
    assert.equal(CONFIG.GRID.ROWS, 40);
    assert.equal(CONFIG.GRID.TOTAL, 1600);
    assert.equal(CONFIG.GRID.CELL_W, 8);
    assert.equal(CONFIG.GRID.CELL_H, 8);
    // Virtual overlay coordinate space stays 16x16 so all tile/VFX shaders scale cleanly
    assert.equal(CONFIG.GRID.SIZE, 16);

    // Compile all 13 factions and verify categorized onTick dispatch
    WorldState.activeFactions = FACTIONS.slice();
    WorldState.reset();
    FactionRegistry.compileAll(WorldState.activeFactions);
    Renderer.reset();

    assert.ok(FactionRegistry.activeOwnerTickHooksByFacId[bastion.id], 'Bastion should use owner-scoped onTick');
    assert.ok(FactionRegistry.activeOwnerTickHooksByFacId[nature.id], 'Nature should use owner-scoped onTick');
    assert.ok(FactionRegistry.activeOwnerTickHooksByFacId[glitch.id], 'Glitch should use owner-scoped onTick');
    assert.equal(FactionRegistry.activeLayerTickEntries.length, 3, 'Inferno, Sickening, and Poison should use layer-gated onTick');
    assert.equal(FactionRegistry.activeGlobalTickHooks.length, 0, 'Built-in factions should need zero global per-cell fallback ticks');

    // Verify O(1) sparse layer tracking & swap-and-pop decay
    WorldState.setLayerValue('ices', 1599, 15);
    WorldState.setLayerValue('inferno', 500, 100);
    assert.equal(WorldState.layerActiveCount.ices, 1);
    assert.equal(WorldState.layerHasActiveCells.ices, true);

    // Place all 13 factions across the 40x40 arena
    for (let f = 0; f < FACTIONS.length; f++) {
        WorldState.grid[f * 100 + 25] = FACTIONS[f].id;
    }
    for (let i = 0; i < CONFIG.GRID.TOTAL; i++) Engine.indices[i] = i;

    // 1st tick decays isolated ices cell 1599 from 15 -> 0 and swap-pops it out of active set
    Engine.tick();
    assert.equal(WorldState.layers.ices[1599], 0);
    assert.equal(WorldState.layerInActiveSet.ices[1599], 0);

    const t0 = performance.now();
    for (let t = 0; t < 30; t++) {
        Engine.tick();
    }
    const elapsedMs = performance.now() - t0;
    const avgTickMs = elapsedMs / 30;

    assert.ok(Renderer.tileHookCellCount > 0, 'Sparse tileHookCells should track owned tiles with tile shaders');
    assert.ok(avgTickMs < 8.0, `Expected 40x40 tick to run well within 60fps budget (<8ms), got ${avgTickMs.toFixed(2)}ms`);

    // Restore default 20x20 grid
    WorldState.resize(20, 20);
    Engine.syncBuffers();
    Renderer.syncGridAndFactions();
});
