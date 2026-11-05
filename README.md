# 🚩 That's My Territory! (TMT)

> **A high-octane retro pixel-art territory war simulator & procedural cellular battleground.**  
> Watch AI factions battle for domination across custom grid arenas with unique combat traits, elemental hazards, spatial synergies, and limitless custom faction creation.

---

## 📑 Table of Contents
1. [Overview & Game Concept](#-overview--game-concept)
2. [Tech Stack & Architecture](#-tech-stack--architecture)
3. [Project Structure](#-project-structure)
4. [Engine & Core Mechanics](#-engine--core-mechanics)
   - [Spatial Math & Neighbor Topology](#spatial-math--neighbor-topology)
   - [Power & Combat Formula](#power--combat-formula)
   - [Decay & Status Layers](#decay--status-layers)
   - [Stuck Resolver & Escalation](#stuck-resolver--escalation)
5. [High-Performance 60 FPS Optimization Architecture](#-high-performance-60-fps-optimization-architecture)
   - [Zero-GC Memory Discipline](#1-zero-gc-memory-discipline)
   - [Sparse Active-Cell Tracking ($O(\text{active})$ vs $O(N)$)](#2-sparse-active-cell-tracking)
   - [Categorized Hook Dispatch](#3-categorized-hook-dispatch)
   - [Resolution-Independent Virtual GPU Overlays](#4-resolution-independent-virtual-gpu-overlays)
   - [VFX Load-Shedding & Quotas](#5-vfx-load-shedding--quotas)
6. [Complete Faction Creation Guide](#-complete-faction-creation-guide)
   - [Quick Start: `defineFaction({...})`](#quick-start-definefaction)
   - [Faction Schema & Parameter Reference](#faction-schema--parameter-reference)
   - [Reusable Base Abilities (`data/abilities.js`)](#reusable-base-abilities)
   - [Creating Bespoke Custom Abilities](#creating-bespoke-custom-abilities)
   - [Lifecycle Hook Types & Execution Flow](#lifecycle-hook-types--execution-flow)
   - [Action Toolkit Reference (`ctx.actions`)](#action-toolkit-reference-ctxactions)
   - [Low-Level Direct Buffer Access (`ctx.ws`)](#low-level-direct-buffer-access-ctxws)
   - [Step-by-Step Custom Faction Examples](#step-by-step-custom-faction-examples)
7. [Editor Scene, Settings & Dev Mode](#-editor-scene-settings--dev-mode)
8. [Testing & Verification](#-testing--verification)

---

## 🎮 Overview & Game Concept

In **That's My Territory!**, distinct faction archetypes compete on an enclosed 2D tile arena:
- **Territory Expansion**: Controlled cells attempt to spread orthogonally (or diagonally) into empty cells or attack neighboring enemy cells.
- **Combat Resolution**: When attacking an enemy tile, the attacker calculates **Attack Power** and the defender calculates **Defense Power**. If Attack exceeds Defense, the cell is captured; otherwise, a block occurs.
- **Archetype Synergy & Hazards**: Factions utilize diverse strategies:
  - *Fire / Inferno*: Spreads lingering wildfire hazard tiles across the board.
  - *Ice / Ices*: Freezes opponents and creates defensive cluster formations.
  - *Fortification / Bastion*: Stacks hard-light shielding that fortifies defense.
  - *Geometric Detonation / Cube*: Detects 2×2 blocks and drops massive monolith shockwaves.
  - *Anomaly / Glitch*: Spreads diagonally and glitches unpredictably across the grid.
  - *Poison & Plague*: Stacks DoTs that weaken enemy power over time.
  - *Biomass / Nature*: Grows root systems that launch spore jumps into backlines.
  - *Echo / Multi & Thief / Mimic*: Borrows and steals abilities across combatants.
  - *Mirror / Fractal*: Reflects adjacent enemy pressure into scaling defensive crystalline power.

---

## 🛠 Tech Stack & Architecture

- **Runtime**: Node.js (ES Modules, `"type": "module"`)
- **Server**: Express proxy (`server.js`) serving static assets and preview environment
- **Client Framework**: Vanilla ES6+ TypeScript/JavaScript (zero heavy framework overhead, minimal DOM mutation)
- **Renderer**: **PixiJS v7** (WebGL/Canvas2D 2D sprite batching, custom procedural `Graphics`, CRT shader filter post-processing)
- **Audio Engine**: Web Audio API Procedural Synthesizer (`AudioContext` wave generator for 8-bit blips, chimes, explosions, and drones—no external MP3 asset dependency)
- **State Storage**: Native browser `localStorage` with JSON serialization for custom player factions and engine settings.
- **Testing**: Node.js native test runner (`node:test`, `node:assert/strict`) via `npm test` / `tsx`.

---

## 📂 Project Structure

```
├── core/
│   ├── config.js            # Spatial geometry tables, grid configs, RNG, and runtime state
│   ├── worldstate.js        # Flat TypedArray buffers, power caching, sparse layer tracking
│   ├── engine.js            # ECS simulation tick loop, combat resolver, stuck monitor, win check
│   ├── renderer.js          # PixiJS sprite grid, auto-tiling, dirty queues, overlay graphics
│   ├── vfx.js               # Zero-allocation particle, shockwave, laser & text pools
│   ├── audio.js             # Procedural Web Audio API sound generator
│   ├── faction-builder.js   # defineFaction factory, Action Toolkit (ctx.actions), code parser
│   ├── faction-registry.js  # ECS Ability Compiler, categorized tick dispatch tables
│   └── main.js              # UI controller, tab switching, arena controls, Dev Mode, telemetry
├── data/
│   ├── factions/            # Modular individual faction files
│   │   ├── inferno.js       # Wildfire hazard archetype
│   │   ├── ices.js          # Frost Nova & Cold Aura archetype
│   │   ├── mecha.js         # Phalanx Grid formation archetype
│   │   ├── bastion.js       # Hard-light Shield Fortification archetype
│   │   ├── cube.js          # 2x2 Monolith Sky-Drop archetype
│   │   ├── glitch.js        # Diagonal Anomaly archetype
│   │   ├── sickening.js     # Contagious Vector archetype
│   │   ├── poison.js        # Stacking DoT & Debuff archetype
│   │   ├── bomber.js        # Martyrdom AoE Detonation archetype
│   │   ├── nature.js        # Root Growth & Spore Burst archetype
│   │   ├── multi.js         # Chaotic Echo archetype
│   │   ├── mimic.js         # Adaptive Thief archetype
│   │   ├── fractal.js       # Neighbor Mirror synergy archetype
│   │   └── index.js         # Consolidated exports and registry lookup
│   ├── factions.js          # Compatibility barrel file re-exporting data/factions/index.js
│   ├── abilities.js         # Parameterized reusable BASE_ABILITIES and semantic aliases
│   ├── ui-config.js         # Layout constants, CSS variables, CRT shader uniforms
│   └── sfx-data.js          # Synthesizer audio frequencies, envelopes, and composites
├── tests/
│   └── engine.test.js       # Automated unit tests (spatial math, combat, 40x40 scaling)
├── index.html               # Main viewport, UI layout, CRT canvas, PixiJS mount
├── server.js                # Express static server (port 3000)
├── metadata.json            # AI Studio applet metadata
└── package.json             # NPM package scripts & dependencies
```

---

## ⚙️ Engine & Core Mechanics

### Spatial Math & Neighbor Topology
Instead of calculating modulo and division in critical simulation loops (`x = idx % COLS; y = Math.floor(idx / COLS)`), spatial coordinates and adjacency links are precomputed into contiguous TypedArrays in `core/config.js`:
- `CONFIG.CELL_X`: `Uint8Array[TOTAL]` ($x$ coordinate for cell $idx$).
- `CONFIG.CELL_Y`: `Uint8Array[TOTAL]` ($y$ coordinate for cell $idx$).
- `CONFIG.NEIGHBOR_IDX`: `Int16Array[TOTAL * 4]` (Orthogonal neighbors: Up, Right, Down, Left. `-1` denotes board edges).
- `CONFIG.DIAG_NEIGHBOR_IDX`: `Int16Array[TOTAL * 4]` (Diagonal neighbors: Top-Left, Top-Right, Bottom-Left, Bottom-Right).
- `CONFIG.JUMP2_NEIGHBOR_IDX`: `Int16Array[TOTAL * 4]` (2-step jump neighbors for long-range spores and projectiles).

### Power & Combat Formula
Every faction defines base stats: **Attack (`att`)**, **Resistance (`res`)**, and **Spirit (`spr`)**.

$$\text{Base Power} = (\text{att} \times 1.0) + (\text{res} \times 1.0) + (\text{spr} \times 0.5) + (\text{att} + \text{res}) \times 0.0$$

During combat:
1. Base Power is computed or read from `fac._basePower`.
2. `onPowerCalc` hooks execute (e.g., Poison stacking debuffs or stat modifiers).
3. Registered `powerModifiers` resolve (e.g. hazard penalties for non-immune factions).
4. If defending, `onDefendCalc` hooks run (e.g. Bastion shields, Mecha ally auras, Fractal reflections).
5. RNG variance adds a small dynamic swing: $\pm (\text{maxStat} \times 0.10)$.
6. Attacking rolls for Critical Strike (15% base chance for $\times 1.5$ power).
7. If $\text{Attack Power} > \text{Defense Power}$, cell capture occurs; otherwise, defender blocks.

### Decay & Status Layers
Environmental hazards (`inferno`, `ices`, `poison`, `sickening`, `nature`, `bastion`, etc.) reside in dedicated `Int16Array[TOTAL]` layer buffers within `WorldState.layers`.
- Active hazard levels are diminished during each tick according to `CONFIG.DECAY_LAYERS` (e.g. fire decays by 10/tick, ice by 15/tick).
- Factions that are hazards are immune to their own layer; non-immune factions taking turns on hazardous tiles suffer power penalties or status effects.

### Stuck Resolver & Escalation
To prevent endless deadlocks when evenly-matched factions stall on high speedups ($32\times$, $64\times$, $128\times$, $256\times$):
- **Mild Stagnation**: Increases layer decay speed ($\times 2.0$) and RNG variance ($\times 2.0$).
- **Moderate Stagnation**: Forces decay on high-density layers and grants a slight random capture nudge to the dominant faction.
- **Severe Stagnation**: Forces instantaneous uniform victory for the dominant faction, triggering a shockwave and the win screen.

---

## ⚡ High-Performance 60 FPS Optimization Architecture

The engine is engineered to run at **60 FPS** on low-end mobile and desktop hardware even on enlarged $32\times 32$ (1,024 cells) and $40\times 40$ (1,600 cells) arenas with 13 active factions.

### 1. Zero-GC Memory Discipline
- **No Object Allocation in Hot Loops**: `Engine.tick()`, `calcPower()`, and `Renderer.render()` allocate **zero** temporary objects or closures.
- **Shared Monomorphic Contexts**: A single monomorphic execution struct `_sharedCtx` is mutated in-place and passed to abilities via `ctx`.
- **Preallocated Buffers**: `Engine.freeCells` uses a preallocated `Int32Array(CONFIG.GRID.TOTAL)` instead of dynamic array resizing (`.push()`).
- **Power Cache**: Power values are cached in flat typed arrays (`_powerCacheAtk`, `_powerCacheDef`, `_powerCacheTickAtk`) indexed by `facId * TOTAL + idx`, avoiding redundant recalculation within the same tick.

### 2. Sparse Active-Cell Tracking
In earlier iterations, every active hazard layer and overlay scanned all $N$ tiles every frame ($O(\text{TOTAL} \times \text{layers})$). On a $40\times 40$ arena with 10 layers, that was 16,000 iterations per tick!
- **Sparse Set**: `WorldState` now maintains `layerActiveList[key]` (`Uint16Array`), `layerActiveCount[key]` (`Int32`), and `layerInActiveSet[key]` (`Uint8Array`).
- **$O(1)$ Insertion**: Mutating a layer tile via `ctx.actions.setLayer()` or `ctx.actions.addLayer()` tracks that cell index in $O(1)$.
- **Swap-and-Pop Decay**: When a cell's layer value reaches 0 during decay, it is swapped with the last element of `layerActiveList` and popped in $O(1)$.
- **Result**: Layer decay, hazard spread ticks, and visual rendering now scale strictly with the number of *active* tiles ($O(\text{activeCells})$), eliminating over 95% of loop overhead.

### 3. Categorized Hook Dispatch
Instead of testing every faction's tick hook across every cell on the board:
- **Owner-Scoped Hooks (`_ownerOnTick`)**: Abilities like Bastion's shield buildup or Glitch's diagonal spread only run if `grid[idx] === fac.id`. These are dispatched in $O(1)$ directly using the cell's owner ID (`activeOwnerTickHooksByFacId[owner]`).
- **Layer-Gated Hooks (`_layerOnTickEntries`)**: Abilities triggered by environmental layers (such as Poison DoTs or Inferno burn spread) only execute for tiles where that layer is currently positive.
- **Global Fallbacks (`_globalOnTick`)**: Reserved only for rare universal hooks that need to examine unowned tiles.

### 4. Resolution-Independent Virtual GPU Overlays
- **Virtual Coordinate Space**: In `Renderer`, the virtual overlay space is fixed at `CONFIG.GRID.SIZE = 16`.
- **Hardware GPU Scaling**: The overlay graphics layer is transformed once via WebGL matrix scale:
  ```js
  overlayGraphics.scale.set(CELL_W / 16, CELL_H / 16);
  ```
- **Perfect Aesthetics**: Visual shaders (flame bars, bubbles, pulsing grids, shields, roots) draw inside clean $16\times 16$ bounds. Whether running on $10\times 10$ ($32\text{px}$ cells) or $40\times 40$ ($8\text{px}$ cells), flame bars and shield borders never overflow tile borders or stretch disproportionately.
- **Sparse Tile Hooks**: `Renderer.tileHookCells` tracks only tiles whose owner has an `onRenderTileLogic` hook, allowing the renderer to skip thousands of inactive cells.

### 5. VFX Load-Shedding & Quotas
- **Ring Buffers**: Visual particles (`PixiParticle`), shockwaves (`PixiShockwave`), and lasers (`PixiLaser`) are pre-pooled. Active entities are tracked in flat `Uint16Array` indices with swap-and-pop removal.
- **Adaptive Load Shedding**: When many cells change simultaneously at high speedups ($16\times$–$256\times$), particle generation scales down dynamically while reserving guaranteed pool slots for critical floating combat text (`CRIT!`, `BURN!`, `NOVA!`, `BOOM!`, `CUBE!`).

---

## 🎨 Complete Faction Creation Guide

The game architecture is completely modular. You can create a new faction by declaring base ability tags, writing custom inline abilities, or executing custom scripts directly in the **Dev Mode** tab in-game.

### Quick Start: `defineFaction`

To define a faction, call `defineFaction({...})`:

```javascript
import { defineFaction } from '../../core/faction-builder.js';

export const solar = defineFaction({
    id: 99,                             // Unique integer ID (auto-assigned if omitted)
    name: 'Solar',                      // Faction display name
    key: 'solar',                       // Identifier key (lowercase alphanumeric)
    icon: {
        unicode: '☀️',                  // Floating centroid emote & badge
        color: '#ffcc00'                // Primary hex color code
    },
    baseStats: {
        att: 65,                        // Attack power weighting
        res: 55,                        // Defense power weighting
        spr: 55                         // Energy / ability variance weighting
    },
    ability: {
        onDefendCalc: ['adjacentAllyDefenseAura'] // Reference reusable base abilities
    },
    partData: {
        adjacentAllyDefenseAura: { allyDefBonus: 8 } // Parameterize base abilities
    },
    customAbilities: {
        solarFlare: {
            hook: 'onAttackSuccess',
            cost: 4,
            trigger: { type: 'chance', value: 0.35 },
            execute(ctx) {
                const jumpIdx = ctx.actions.randomJump2Neighbor(ctx.nIdx);
                if (jumpIdx !== -1 && ctx.actions.captureCell(jumpIdx, ctx.owner)) {
                    ctx.actions.laser(ctx.nIdx, jumpIdx, '#ffcc00', 2);
                    ctx.actions.spawnText(jumpIdx, 'FLARE!', '#ffcc00', false);
                }
            }
        }
    },
    maxBudget: 15,
    descShort: 'Solar Beam',
    descLong: 'Gains aura defense from allies and fires long-range solar flare beams.'
});
```

---

### Faction Schema & Parameter Reference

| Field | Type | Description |
| :--- | :--- | :--- |
| `name` | `string` | Display name of the faction (e.g. `'Solar'`). |
| `key` | `string` | (Optional) Unique key. Defaults to lowercase sanitized name. |
| `icon.unicode`| `string` | Emoji or character representing the faction (e.g. `'🔥'`, `'⚡'`). |
| `icon.color` | `string` | Hex color code used for tiles, particle effects, and UI badges. |
| `baseStats` | `object` | `{ att: 0-100, res: 0-100, spr: 0-100 }`. Determines standard combat power. |
| `traits` | `object` | Boolean combat flags: <br>• `isHazard`: Layer acts as an environmental hazard.<br>• `isBlocker`: Has higher chance to display block text.<br>• `freezeImmune`: Cannot be frozen by ice tiles.<br>• `skipStandardSpread`: Disables standard orthogonal spread (e.g. Glitch spreads diagonally instead). |
| `hazardMultipliers` | `object` | Power modifier override against hazards (e.g. `{ poison: 0.8, inferno: 1.0 }`). |
| `ability` | `object` | Map of hook names to arrays of ability keys: `{ onTick: [...], onAttackSuccess: [...] }`. |
| `partData` | `object` | Configuration overrides for abilities: `{ [abilityName]: { param: value } }`. |
| `customAbilities`| `object` | Map of bespoke unique abilities written directly on this faction. |
| `maxBudget` | `number` | Budget cap for abilities (default: `15`). Each ability has a `cost`. |
| `descShort` | `string` | Short subtitle shown under class selection cards. |
| `descLong` | `string` | Detailed description of the faction mechanics. |

---

### Reusable Base Abilities

The file `data/abilities.js` exposes reusable, battle-tested ability parts. Any faction can plug these in directly using the `ability` field and parameterize them via `partData`:

#### 1. Formations & Auras
- **`adjacentAllyDefenseAura`** (`hook: 'onDefendCalc'`, cost: 3):
  - Increases defense by `allyDefBonus` for each adjacent allied cell.
  - Parameters: `{ allyDefBonus: 10 }`

#### 2. Hazard & Environmental Warfare
- **`hazardBurnSpreadTick`** (`hook: 'onTick'`, cost: 3):
  - Clears non-immune tiles standing in the hazard and spreads to neighboring cells.
  - Parameters: `{ layerKey: 'inferno', spreadChance: 0.5, diminishRate: 15 }`
- **`hazardIgniteOnAttack`** (`hook: 'onAttackSuccess'`, cost: 3):
  - Ignites target cell with a hazard layer and spawns flame VFX.
  - Parameters: `{ layerKey: 'inferno', text: 'BURN!', particleCount: 8 }`
- **`aoeNovaOnAttack`** (`hook: 'onAttackSuccess'`, cost: 4):
  - Applies a layer to the target cell and all 4 adjacent neighbors with a circular shockwave.
  - Parameters: `{ layerKey: 'ices', shockRadius: 40, text: 'NOVA!' }`
- **`contagionSpreadTick`** (`hook: 'onTick'`, cost: 3):
  - Randomly infects neighboring tiles with diminished status values.
  - Parameters: `{ layerKey: 'sickening', diminishRate: 10 }`
- **`autoCaptureInfectedOnBeforeAttack`** (`hook: 'onBeforeAttack'`, cost: 4):
  - Has a chance to immediately claim an enemy tile if it carries a debuff layer.
  - Parameters: `{ layerKey: 'sickening', autoCap: 0.2, text: 'AUTO!' }`

#### 3. Stacking Status & DoTs
- **`stackLayerOnBeforeAttack`** (`hook: 'onBeforeAttack'`, cost: 3):
  - Increments a stack layer on the defender before combat occurs.
  - Parameters: `{ layerKey: 'poison', stackPerHit: 8, maxStack: 100 }`
- **`stackDecayDamageTick`** (`hook: 'onTick'`, cost: 4):
  - Decays stack layers and emits damage pulse VFX.
  - Parameters: `{ layerKey: 'poison', tickDecay: 5, color: '#a020f0' }`
- **`stackPowerPenalty`** (`hook: 'onPowerCalc'`, cost: 3):
  - Reduces power proportionally based on accumulated status stacks.
  - Parameters: `{ layerKey: 'poison', powerPenalty: 0.6 }`

#### 4. Fortification, Spores & Martyrdom
- **`layerBuildupTick`** (`hook: 'onTick'`, cost: 3):
  - Passively builds up a defensive resource layer on allied tiles each tick.
  - Parameters: `{ layerKey: 'bastion', buildRate: 15, maxShield: 100 }`
- **`layerFlatDefenseBonus`** (`hook: 'onDefendCalc'`, cost: 4):
  - Adds the numerical value of a resource layer directly to Defense Power.
  - Parameters: `{ layerKey: 'bastion', defMultiplier: 1.0 }`
- **`sporeJumpSpreadTick`** (`hook: 'onTick'`, cost: 4):
  - When the layer reaches max value, launches a projectile 2 tiles away to claim territory.
  - Parameters: `{ layerKey: 'nature', threshold: 100, sporeChance: 0.05 }`
- **`martyrdomDetonateOnFail`** (`hook: 'onDefendFail'`, cost: 5):
  - Violently explodes in a $3\times 3$ area when losing defense, clearing out all occupying units.
  - Parameters: `{ radius: 1, shockC: '#ff5500', rMax: 60, spd: 5, text: 'BOOM!' }`

#### 5. Procedural GPU Visual Shaders
- **`flameBarsVisual`**: Procedural animated pixel flame bars inside cell.
- **`layerTintOverlayVisual`**: Color wash overlay proportional to layer intensity.
- **`pulsingGridTileVisual`**: Cybernetic pulsing neon border.
- **`shieldBorderTileVisual`**: Glowing golden hard-light barrier.
- **`bubbleOverlayVisual`**: Toxic acid bubbling particles.
- **`dropletOverlayVisual`**: Downward dripping venom droplets.
- **`branchingRootsVisual`**: Organic expanding root branches connecting cell centers.

---

### Creating Bespoke Custom Abilities

If your idea doesn't fit a base ability, write it inside `customAbilities`! You have access to the complete **Action Toolkit** (`ctx.actions`) and zero-allocation execution parameters:

```javascript
customAbilities: {
    lightningStrike: {
        hook: 'onTick',
        cost: 4,
        tickScope: 'owner', // Optimization: only runs on tiles owned by this faction
        trigger: { type: 'chance', value: 0.15 },
        execute(ctx) {
            // Find a random enemy in the arena
            const targetIdx = ctx.actions.randomNeighbor(ctx.idx);
            if (ctx.actions.isEnemy(targetIdx)) {
                ctx.actions.laser(ctx.idx, targetIdx, '#ffff00', 3);
                ctx.actions.captureCell(targetIdx, ctx.owner);
                ctx.actions.spawnText(targetIdx, 'ZAP!', '#ffff00', true);
                ctx.actions.sound('crit');
            }
        }
    }
}
```

---

### Lifecycle Hook Types & Execution Flow

| Hook Name | When It Executes | Typical Use Cases | Expected Return Value |
| :--- | :--- | :--- | :--- |
| `onTick` | Every simulation step for matching cells | Passive resource generation, DoTs, spread, teleports | `void` |
| `onBeforeAttack` | Before rolling combat against a target cell | Applying debuffs, checking preemptive auto-capture | `void` |
| `onAttackSuccess`| When this faction defeats an enemy tile | AoE nova bursts, chain reactions, ability stealing | `boolean` (return `true` if handled custom VFX) |
| `onPowerCalc` | During calculation of Attack/Defense power | Modifying power based on status, terrain, or traits | `number` (returns new modified power) |
| `onDefendCalc` | Specifically when this faction is defending a tile | Defensive auras, shield reinforcement, mirror armor | `number` (returns new modified power) |
| `onDefendFail` | When an allied cell is captured by an enemy | Martyrdom explosions, revenge curses, layer resets | `void` |
| `onDefendSuccess`| When an allied cell successfully repels an attack | Counter-attacks, shockwave deflections | `void` |
| `onRenderTileLogic`| During WebGL rendering for owned tiles | Tile borders, tech grids, cybernetic overlays | `void` |
| `onRenderVFX` | During WebGL rendering for active layer tiles | Flames, bubbles, roots, droplets, status tints | `void` |

---

### Action Toolkit Reference (`ctx.actions`)

The `ctx.actions` object provides a safe, high-level, zero-allocation API for interacting with the board, querying coordinates, applying effects, and mutating the grid:

#### Grid & Spatial Queries
- `ctx.actions.getX(idx)` $\rightarrow$ Returns the $X$ column coordinate ($0 \le X < \text{COLS}$).
- `ctx.actions.getY(idx)` $\rightarrow$ Returns the $Y$ row coordinate ($0 \le Y < \text{ROWS}$).
- `ctx.actions.getIndex(x, y)` $\rightarrow$ Converts $(x, y)$ to flat index.
- `ctx.actions.isValid(x, y)` $\rightarrow$ Returns `true` if within grid bounds.
- `ctx.actions.getOwner(idx)` $\rightarrow$ Returns faction ID of current owner (or `-1` if empty).
- `ctx.actions.getNextOwner(idx)` $\rightarrow$ Returns scheduled next-tick owner.
- `ctx.actions.isAlly(idx, [ownerId])` $\rightarrow$ Checks if cell belongs to this faction.
- `ctx.actions.isEnemy(idx, [ownerId])` $\rightarrow$ Checks if cell belongs to a rival faction.
- `ctx.actions.isEmpty(idx)` $\rightarrow$ Checks if cell is neutral / unowned (`-1`).

#### Neighbor Lookups
- `ctx.actions.randomNeighbor(idx)` $\rightarrow$ Returns a random orthogonal neighbor index (or `-1`).
- `ctx.actions.randomDiagNeighbor(idx)` $\rightarrow$ Returns a random diagonal neighbor index (or `-1`).
- `ctx.actions.randomJump2Neighbor(idx)` $\rightarrow$ Returns a random 2-cell jump neighbor index (or `-1`).
- `ctx.actions.countAdjacentAllies(idx, [facId])` $\rightarrow$ Number of surrounding allied tiles ($0$ to $4$).
- `ctx.actions.countAdjacentEnemies(idx, [facId])` $\rightarrow$ Number of surrounding hostile tiles ($0$ to $4$).
- `ctx.actions.forEachNeighbor(idx, callback)` $\rightarrow$ Loops over valid neighbors `(neighborIdx, dir)`.
- `ctx.actions.forEachInRadius(cx, cy, radius, callback)` $\rightarrow$ Loops over square radius `(idx, x, y)`.

#### Board Mutations
- `ctx.actions.captureCell(targetIdx, [newOwner])` $\rightarrow$ Captures target tile for this faction.
- `ctx.actions.clearCell(targetIdx)` $\rightarrow$ Neutralizes target tile back to empty (`-1`).
- `ctx.actions.clearArea(cx, cy, radius, [ignoreOwner], [clearLayers])` $\rightarrow$ Neutralizes an entire area.

#### Layer Manipulation (Sparse & High-Performance)
- `ctx.actions.getLayer(layerKey, [idx])` $\rightarrow$ Reads status/hazard value at tile.
- `ctx.actions.setLayer(layerKey, idx, value)` $\rightarrow$ Sets value and marks layer active in $O(1)$.
- `ctx.actions.addLayer(layerKey, idx, delta, [maxVal])` $\rightarrow$ Increments value up to cap.
- `ctx.actions.spreadLayerToRandomNeighbor(layerKey, idx, diminish)` $\rightarrow$ Spreads value to neighbor.

#### VFX, Audio & Camera Shake
- `ctx.actions.spawnParticles(cellIdx, color, count, style)` $\rightarrow$ Emits particle burst at cell center.
- `ctx.actions.spawnText(cellIdx, text, color, isCrit)` $\rightarrow$ Spawns floating combat text (`'CRIT!'`, `'ZAP!'`).
- `ctx.actions.shockwave(cellIdx, color, maxRadius, speed, width)` $\rightarrow$ Emits expanding ring shockwave.
- `ctx.actions.laser(fromIdx, toIdx, color, width)` $\rightarrow$ Draws instantaneous energy laser beam.
- `ctx.actions.sound(sfxKey)` $\rightarrow$ Triggers procedural audio (`'crit'`, `'burn'`, `'freeze'`, `'bomb'`, `'thud'`).
- `ctx.actions.shake(intensity)` $\rightarrow$ Triggers camera screen-shake.

#### Math & RNG Helpers
- `ctx.actions.rollChance(probability)` $\rightarrow$ Returns `true` if random roll $< \text{probability}$ ($0.0$ to $1.0$).
- `ctx.actions.random()` $\rightarrow$ Returns fast deterministic pseudo-random float $[0, 1)$.
- `ctx.actions.randomInt(maxExclusive)` $\rightarrow$ Returns integer between $0$ and $\text{maxExclusive}-1$.

---

### Low-Level Direct Buffer Access (`ctx.ws`)

For extreme optimization or custom cellular automata, you can directly inspect and modify `WorldState`'s flat TypedArrays:
- `ctx.ws.grid`: `Int8Array[TOTAL]` — Current cell owners (`-1` = empty, `0..N` = faction ID).
- `ctx.ws.nextGrid`: `Int8Array[TOTAL]` — Scheduled cell owners for next tick commit.
- `ctx.ws.capturedThisTick`: `Uint8Array[TOTAL]` — Prevents a cell from being double-captured in one tick.
- `ctx.ws.layers[layerName]`: `Int16Array[TOTAL]` — Direct values for any custom or hazard layer.

---

### Step-by-Step Custom Faction Examples

#### Example 1: Chrono (Time Warp & Teleportation)
```javascript
defineFaction({
    name: 'Chrono',
    key: 'chrono',
    icon: { unicode: '⏳', color: '#00bfff' },
    baseStats: { att: 55, res: 65, spr: 70 },
    customAbilities: {
        timeWarp: {
            hook: 'onTick',
            cost: 5,
            tickScope: 'owner',
            trigger: { type: 'chance', value: 0.1 },
            execute(ctx) {
                // Leap across space to a random empty 2-tile location
                const jumpIdx = ctx.actions.randomJump2Neighbor(ctx.idx);
                if (jumpIdx !== -1 && ctx.actions.isEmpty(jumpIdx)) {
                    ctx.actions.captureCell(jumpIdx, ctx.owner);
                    ctx.actions.laser(ctx.idx, jumpIdx, '#00bfff', 3);
                    ctx.actions.spawnText(jumpIdx, 'WARP!', '#00bfff', false);
                    ctx.actions.sound('glitch');
                }
            }
        }
    },
    descShort: 'Time Warp',
    descLong: 'Teleports across distance to colonize distant empty tiles.'
});
```

#### Example 2: Vampire (Life Steal on Attack)
```javascript
defineFaction({
    name: 'Vampire',
    key: 'vampire',
    icon: { unicode: '🧛', color: '#cc0033' },
    baseStats: { att: 70, res: 45, spr: 60 },
    customAbilities: {
        lifeDrain: {
            hook: 'onAttackSuccess',
            cost: 4,
            trigger: { type: 'always' },
            execute(ctx) {
                // When capturing an enemy tile, fortify adjacent allied tiles with blood shield
                ctx.actions.forEachNeighbor(ctx.nIdx, (n) => {
                    if (ctx.actions.isAlly(n)) {
                        ctx.actions.addLayer('bloodShield', n, 20, 100);
                        ctx.actions.spawnParticles(n, '#cc0033', 2, 'trail');
                    }
                });
                ctx.actions.spawnText(ctx.nIdx, 'DRAIN!', '#ff0033', true);
            }
        },
        bloodArmor: {
            hook: 'onDefendCalc',
            cost: 3,
            execute(ctx) {
                const shield = ctx.actions.getLayer('bloodShield', ctx.idx);
                return ctx.basePower + shield * 0.75;
            }
        }
    },
    descShort: 'Blood Leech',
    descLong: 'Drains life from captured enemies to shield surrounding allies.'
});
```

---

## 🖥 Editor Scene, Settings & Dev Mode

### 1. Roster Tab
- **Class Selectors**: Click any faction card to toggle selection into the battle.
- **Dynamic Stats & Badges**: Visual indicator of Attack (`A`), Resistance (`R`), and Spirit (`S`).
- **Live Arena Dimension Picker**: Quick preset buttons (`10×10`, `16×16`, `20×20`, `32×32`, `40×40`) and custom Column/Row sliders.
- **Persistent Delete**: Custom factions feature an inline `DEL` button to permanently remove them.

### 2. Settings Tab
- **Game Speed & Pacing**: Adjust Base Tick Speed (`20ms`–`500ms`) and Speedup Escalation Interval (`2.0s`–`30.0s`).
- **CRT Shader & Visuals**: Toggle retro CRT scanlines, chromatic aberration, and animated floating background emojis.
- **Sound Effects**: Toggle procedural Web Audio synthesizer SFX.
- **Persistence**: All settings persist to browser `localStorage` via `SettingsManager`.

### 3. Dev Mode Tab
- **Live Faction Code Editor**: Paste any JavaScript `defineFaction({...})` code directly into the in-game editor.
- **One-Click Validation & Registration**:
  - `SAVE & LOAD`: Validates syntax, compiles abilities within budget, saves to `CustomFactionStorage`, and adds to the roster immediately.
  - `DELETE`: Cleans up saved custom factions.
  - `TEMPLATE`: Inserts the starter Solar beam faction template.
- **Debugging Inspection Overlay**:
  - Toggle live in-simulation telemetry display showing real-time **FPS**, **Frame ms**, **Active Particles**, **Shockwaves**, **Lasers**, **Dirty Sprite Queues**, and **Total Changes/sec**.

---

## 🧪 Testing & Verification

The codebase includes an automated unit test suite verifying spatial coordinate math, PRNG determinism, ability budget limits, custom faction compilation, dynamic grid resizing, and $40\times 40$ large-arena simulation pacing:

```bash
# Run unit tests
npm test

# Run syntax and type validation
npm run lint

# Build static bundle for GitHub Pages
npm run build:pages

# Start local development server (port 3000)
npm start
```

---

## 🚀 Automatic Deployment to GitHub Pages

The repository includes a ready-to-use automated **GitHub Actions CI/CD workflow** located at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

### How It Works
1. **Trigger**: Every push to the `main` or `master` branch (or manual trigger via `workflow_dispatch` in the GitHub Actions tab).
2. **Automated Pipeline**:
   - Checks out the repository and installs dependencies.
   - Runs `npm run lint` and `npm test` to verify zero regression and syntax integrity.
   - Bundles the client-side game assets (`index.html`, `core/`, `data/`, `lib/`, and `.nojekyll` to prevent Jekyll from skipping underscore files).
   - Deploys the site automatically using official GitHub Actions (`actions/upload-pages-artifact` & `actions/deploy-pages`).

### Enabling GitHub Pages in Your Repository
1. On GitHub, navigate to your repository's **Settings** tab.
2. In the left sidebar, click **Pages** (under the "Code and automation" section).
3. Under **Build and deployment** $\rightarrow$ **Source**, select **GitHub Actions**.
4. Push your code to `main` (or click **Run workflow** under the **Actions** tab $\rightarrow$ "Deploy to GitHub Pages").
5. Your game will be live at `https://<your-username>.github.io/<repo-name>/`!

