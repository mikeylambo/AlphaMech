# BUILD_REPORT.md — BLINKFALL Alpha Run

Companion to `TONIGHT_BUILD_BRIEF.md` and `blinkfall-gdd-v2.2.1.md`.
Maintained throughout the build, not written at the end.

---

## 1. Donor decision table

Substrate: **`koviq4/astra-vs-fable`**, with the OUTNUMBERED prototype as the feel reference.
Where two donors solve the same problem, the better implementation was taken and the decision
recorded here.

| Subsystem | Chosen source | Why |
|---|---|---|
| Project architecture, module layout | **Fable 5.1 (IRONVEIL)** | Modular, `core/Tuning.ts` already centralised, event bus, pooling, streamer. Astra is a flat `src/*.ts` with 30KB single files. |
| Procedural mech geometry (`MechModels`, `MechRig`, `Materials`) | **Fable 5.1** | Genuinely excellent articulated procedural rig — layered armour, pistons, vents, thruster nodes, bake + far LOD. Astra's `models.ts` and the prototype's box mech are both far cruder. Ported and extended. |
| Rig animation | **Rewritten** (`entities/RigDriver.ts`) | Fable's animation lived inside its `PlayerController`. Extracted into a driver both the player and every hostile use, so a hostile's lean and stride read from the same vocabulary the player learns. |
| Feel constants (movement, vitals, vanish, rally, director) | **OUTNUMBERED prototype / ASHFALL profile** | The prototype's `TUNE` block *is* the GDD's §5 table. Copied value for value into `core/Tuning.ts`. |
| Perfect Vanish, Exposed, Rally | **OUTNUMBERED prototype** | Working implementation with the exact GDD constants. Ported, then extended with Reverse Rally, controller prompts and per-domain seeding. |
| Director (arc → tokens, band steering, orbit bias) | **OUTNUMBERED prototype** | The arc computation and token rationing are the prototype's core contribution. Restructured so `tokenCount` is a *derived getter* (see §3). |
| Encirclement HUD / radar | **OUTNUMBERED prototype**, redrawn | Same information model (bearing dots, safe cone, token colour), rebuilt at higher fidelity with windup arcs, Exposed rings and flank thresholds. |
| Particle system (`fx/VFX.ts`) | **Fable 5.1** | Instanced billboard system with stretch-along-velocity. Astra has no equivalent. Ported unchanged. |
| Thruster shader (`fx/Thruster.ts`) | **Fable 5.1** | Ported unchanged. |
| Procedural textures (`core/Textures.ts`) | **Fable 5.1** | Canvas value-noise concrete/panel/rust/asphalt. Ported unchanged. |
| Audio | **Fable 5.1**, extended | Full procedural WebAudio bus with adaptive music. Extended with the GDD §12 requirement: a whole-bus lowpass + pitch drop during bullet time, and percussion drop-out for the FORGE stillness beat. |
| Event bus, object pool, math utilities | **Fable 5.1** | Ported unchanged. |
| Shield shader | **Astra** (concept), reimplemented | Astra's GLSL shield was tied to its skill system. WARDEN's frontal shield is a simpler emissive arc segment with the GDD's break rule; a full shader port was not worth the coupling. |
| World kit, arenas, streamer | **Written for BLINKFALL** | Neither donor builds *encounter volumes joined by connective tissue*. Fable's `Kit.ts` idiom (merge-by-material batches, world-scale UVs) was kept; the layout model is new. |
| Sky and lighting | **Written for BLINKFALL** | Fable's sky is a temperate city. Sector 1 needs rust-and-ember with a visible low sun and a separate key light. |

**Not rebuilt** (taken as-is from a donor): particle system, thruster shader, procedural textures,
mech geometry vocabulary, audio synthesis, pool/bus/math, mech bake + LOD strategy.

---

## 2. Substrate verification and dependency decisions

Per the brief, the donor was booted unchanged before anything was touched.

| Step | Result |
|---|---|
| `Fable 5.1` on pinned versions (three 0.170.0, typescript 5.6, vite 5.4) — `npx tsc --noEmit` | **clean** |
| `Fable 5.1` — `npx vite build` | **clean**, 962 kB bundle |
| Bump three 0.170 → 0.180 in the donor, re-run `tsc --noEmit` | **clean, zero migration errors** |
| Donor on three 0.180 — `npx vite build` | **clean**, 979 kB bundle |

**Dependencies changed from the donor's pinned versions, and why:**

| Package | Donor | BLINKFALL | Reason |
|---|---|---|---|
| `three` | ^0.170.0 | **0.180.0** (exact) | The brief sanctions r170 → r180 *if the migration is clean*. It was verified clean on the donor before the bump, and r180 is the version the sibling donor (Astra) already ships, so it is a proven configuration in this codebase family. Pinned exactly rather than caret-ranged. |
| `@types/three` | ^0.170.0 | **0.180.0** (exact) | Must match `three`. |
| `typescript` | ^5.6.0 | ^5.6.0 | **Unchanged.** No reason to churn. |
| `vite` | ^5.4.0 | ^5.4.0 | **Unchanged.** No reason to churn. |
| `@fontsource/barlow-condensed`, `@fontsource/ibm-plex-mono` | (Astra) ^5.3.0 | ^5.3.0 | Taken from the Astra donor. Bundled locally — no runtime network access. |

No other dependencies were added. There are no runtime asset downloads and no authored meshes.

---

## 3. The sovereign arc rule — how it is enforced

Non-negotiable #1 says the encirclement arc **exclusively** determines simultaneous attack
tokens. This is enforced structurally rather than by convention:

```ts
// director/Director.ts
export function arcTokens(arcDeg: number, sector: number): TokenDerivation { … }

private _arc = 0;
get tokenCount()  { return arcTokens(this._arc, this.sector).count; }
get tokenSource() { return arcTokens(this._arc, this.sector).source; }
```

`tokenCount` is a **getter over a pure function of the arc**. There is no setter and no backing
field, so no other system — pressure model, pilot model, boss script, upgrade, difficulty — is
even *able* to write it. `tokenSource` returns the derivation as a string, so the rule is
provable at runtime:

```
> __state().director.tokenSource
"encirclement-arc(237.3°) > 235° -> 2"
"encirclement-arc(115.0°) <= 235° -> 1"
"encirclement-arc(271.3°) > 235° -> 2"
```

`__proof().sovereignArc` returns the same derivation plus the writer list.

The pressure model's five outputs (`bearing`, `archetype`, `sequencing`, `reinforcementTiming`,
`bandPressure`) are declared in one interface and consumed in exactly three places: spawn
bearing, archetype weighting, and *which* candidate receives a token — never how many.
`SEQUENCED` mode delays when a holder opens; it never removes a token.

---

## 4. Assumptions recorded under the Autonomy Rule

Resolution order used throughout: GDD → brief → donor behaviour.

1. **Sector geometry model.** The GDD says encounters are combat states joined by connective
   tissue with no fade to menu, but does not specify a spatial layout. Assumed: the whole sector
   is one continuous corridor along +Z, descending in Y, with encounter volumes, connective
   tissue and both FORGE bays generated **once at run start**. A closed gate at a volume's exit
   opens when its encounter resolves. This is what makes "no loading break" structural rather
   than hidden: there is nothing to load at a transition.
2. **Hostile fire travels.** The prototype hitscans every attack. VOLLEY, MORTAR and STRAFE-RUN
   were changed to travelling projectiles so ORBITING INTERCEPTORS ("destroying incoming
   projectiles within 25m") has something to intercept, and so a fast pilot can outrun a volley.
   Damage and impact values are unchanged and are divided across the burst exactly as the GDD's
   per-attack totals (VOLLEY: 210/95 across 3 rounds).
3. **Telegraph commit.** A telegraph tracks the pilot until the last **0.18s** of a windup, then
   locks. The GDD does not state this; without it the ground telegraph is decorative, because
   the attack lands wherever you are. This makes late repositioning a real defence alongside the
   vanish, and makes the decal honest.
4. **PREDATOR READ's "telegraphs appear 0.4s earlier"** is implemented as a lead-in: the hostile
   commits to its attack and shows a faint precursor ring 0.4s before the windup opens. The
   windup itself is unchanged, so the vanish window still measures against the GDD's timings.
5. **Vertical movement holds altitude.** Releasing thrust stops vertical motion rather than
   dropping you (donor behaviour, ASHFALL profile). Gravity applies while staggered. This is
   the prototype's feel and the reason ground-vs-air regen is a real decision.
6. **Reverse Rally's only trigger tonight is Counter-Vanish.** The GDD defines Reverse Rally's
   mechanics and defines Counter-Vanish as starting one; it defines no other trigger. No trigger
   was invented for ordinary hostiles.
7. **CONVERSION counts once per stagger.** "staggerPunishesLanded / staggersCreated" would
   exceed 100% if every rifle round into a broken frame counted. One conversion is credited per
   stagger event.
8. **Encounter clear conditions.** Combat states clear when the hostile list empties after the
   authored wave count. TRAVERSAL, which creates no hostiles, clears when the pilot reaches the
   far end of the volume. Its gate is open from the start.
9. **Sector 1 volume dimensions** (arena radius 330m, corridor 1600m × 300m, shaft radius 250m,
   FORGE bay radius 200m, boss arena radius 380m) are unspecified in the GDD; chosen so a
   62 m/s skate crosses a corridor in ~26s and an assault boost in ~8s.
10. **Cover height is capped at 17m** and the skyline is placed outside every play volume, to
    satisfy §12's rule that nothing occludes the horizon during a fight.
11. **Mech plate materials are baked to vertex colours.** Merging per bone *per material* costs
    ~120 draw calls per machine, which a five-hostile ARENA cannot afford. Opaque plates now
    share one vertex-coloured material (one draw per bone); emissive parts keep their own
    materials so Exposed flares still animate. Measured: **678 → 242 draw calls** in a
    three-hostile ARENA.
12. **Rigs are instanced from cached prototypes.** Building a mech from primitives costs a few
    milliseconds; doing it five times the instant an ARENA opens is a visible hitch at the worst
    possible moment. Every chassis is built once at startup and cloned per spawn, with
    per-instance materials.
13. **The title screen builds its own backdrop world.** `__dev.worldBuilds()` therefore reads 2
    after the first run starts (one backdrop + one sector); *within* a run it is always 1.
14. **Scoring is left exactly as specified**, including that CONTROL scores near 100 in a
    TRAVERSAL (arc is 0 with no hostiles, and the velocity term is satisfied by flying fast).
    The undefined-metric rule covers zero denominators, and CONTROL's denominator is tick count,
    not hostile count. Flagged as a design observation, not changed.

---

## 5. Checkpoint results

Verification is scripted and repeatable: `tools/*.mjs` drive a real browser against the running
build. The verification container renders through **SwiftShader (software WebGL)**, so absolute
frame times there are not representative of GPU hardware; draw call, triangle and entity counts
are.

### Checkpoint A — after Step 1 (substrate)

| Gate | Result |
|---|---|
| Donor decision table exists | **PASS** — §1 |
| Baseline verified before any version bump | **PASS** — §2, donor `tsc` + `vite build` clean on pinned versions first |
| Builds clean | **PASS** — `npm run build` (`tsc --noEmit && vite build`) clean |
| Same seed → identical layout twice | **PASS** — `tools/loop.mjs`: two `__replay` runs on seed `ALPHA1` produce byte-identical `layoutSignature`, `coverSignature`, chain selection and initial stream states |
| 60fps | **NOT MEASURABLE HERE** — software rasteriser only. Budget evidence: 223–242 draw calls, 48–57k triangles, 18–20 shader programs in a five-hostile ARENA, plus dynamic resolution scaling (§7) |

### Checkpoint B — after Step 3 (director + enemies)

| Gate | Result |
|---|---|
| 5-hostile ARENA winnable | **PASS** — `tools/pilot.mjs`, a scripted pilot that reads windups and rotates: `ARENA CLEARED start 5 left 0 hp 9000 PV 22/28 stag 17 conv 16 rank B 71.7` |
| 5-hostile ARENA losable | **PASS** — `tools/arena.mjs`, passive pilot: 9,000 → 0 structure in ~65s, `FRAME LOST` |
| `tokenSource` shows the arc as sole writer | **PASS** — see §3. Observed at both thresholds: `<= 235° -> 1` and `> 235° -> 2` |

### Checkpoint C — after Step 4 (loop closed)

| Gate | Result |
|---|---|
| Menu → fight → results → replay end to end | **PASS** — `tools/full.mjs` walks title → ARENA → vanish → rally → FORGE → LAUNCH → SEVERANCE → results, with RETRY SEED and NEW RUN on screen |
| RETRY SEED reproduces identical procedural setup | **PASS** — `sameSetup: true` across two runs: chain ids, Chain Law 2 record, full layout signature (every volume's kind/state/z/y/cover count), every cover block's position and height, and all seven initial stream states |
| Same recorded inputs → behaviourally equivalent execution | **PASS, and stronger than required** — `sameTrace: true`, *and* all seven PRNG streams finish on identical internal states and identical draw counts. The GDD asks only for behavioural equivalence; this build is bit-identical. Achieved by resetting every field that can influence a later simulation step in `startRun` / `resetForEncounter`, not only the seed |

### Checkpoint D — after Step 7 (chains)

| Gate | Result |
|---|---|
| Full sector runs continuously with no loading break at any transition | **PASS** — the entire sector (CHAIN A → FORGE → CHAIN B → FORGE → SEVERANCE, 15–17 volumes, ~12 km) is generated in a single `world.build()` at run start. `__dev.worldBuilds()` does not increment for the whole run; the streamer only toggles `visible`. |

`tools/continuity.mjs` flies a full corridor → connective tissue → next-volume transition and
times every frame across the crossings:

```
median 109.9ms   p95 181.3ms   max 210.4ms   worst frame at a volume crossing 173.3ms
```

The worst frame at a crossing sits **below** the run's own p95, i.e. crossing a volume boundary
is not distinguishable from ordinary frame-to-frame variance. (Absolute numbers are SwiftShader
software rasterisation; the *relative* result is the evidence.)

### Checkpoint E — after Step 9 (SEVERANCE)

| Gate | Result |
|---|---|
| SEVERANCE beatable | **PASS** — `tools/pilot.mjs`: `SEVERANCE CLEARED start 1 left 0 PV 8/8 rank A 85.5` |
| Phase 1 Counter-Vanish fires on the 2nd Perfect Vanish, reproducibly | **PASS** — `tools/full.mjs`, six consecutive forced Perfect Vanishes through the real `Player.tryVanish` path: |

```
n=1  perfect  rally RALLY    counters 0  vanishes 1
n=2  perfect  rally REVERSE  counters 1  vanishes 2   <- every second successful vanish
n=4  perfect  rally REVERSE  counters 2  vanishes 4   <- and again
```

Counter-Vanish always started a **Reverse Rally**, never a normal one.

### Regression re-runs

All checkpoint gates were re-run after the world-model, lighting, rig-instancing and
vertex-colour-bake changes. `tools/loop.mjs` (A + C), `tools/arena.mjs` and `tools/pilot.mjs`
(B + E), `tools/continuity.mjs` (D) and `tools/full.mjs` (C + E) all pass on the final build,
with `tsc --noEmit` and `vite build` clean and a clean browser console.

---

## 6. §3 scope table

| Scope item | Status | Where |
|---|---|---|
| **Combat foundation** | | |
| Movement, camera, lock-on ported and finalised | **PASS** | `frame/Player.ts`, `frame/CameraRig.ts`, `frame/Lock.ts` |
| Structure / Impact / EN with GDD constants | **PASS** | `frame/Vitals.ts`, `core/Tuning.ts` |
| Quick Boost 20 EN / 0.34s | **PASS** | `T.quickCost` / `T.quickCooldown` |
| Perfect Vanish 0.30s · 0.13× · 0.85s · 17m · 18 EN · 0.18s cd | **PASS** | `Player.tryVanish` |
| Exposed 1.5s · 2.4× impact | **PASS** | `T.exposedDur`, `Vitals.hit` |
| Rally · 5 exchanges · 1.05s · ×0.82 | **PASS** | `frame/Rally.ts` |
| Reverse Rally | **PASS** | `frame/Rally.ts`, driven by Counter-Vanish |
| Rifle 0.10s · 62 · 26 | **PASS** | `Player.fireRifle`; measured 43 shots / 5s, 3,400 damage |
| Blade 17m · 620 · 300 · 0.72s | **PASS** | `Player.blade` |
| Missile Rack 6 · 140 · 90 · 1.8s rack · 0.08s spacing | **PASS** | `Player.weapons` + `Ordnance.spawnMissile` |
| Pile Driver 900 · 520 · 4.0s, air-only | **PASS** | `Player.resolvePileDriver` |
| **Director** | | |
| Sovereign arc rule 145 / 235 / 275 → tokens, with traceability | **PASS** | `director/Director.ts` §3 above |
| Pressure model, five permitted outputs | **PASS** | `Director.updatePressure` |
| Pilot model, persistent, 25% decay per FORGE, 0.70/0.30 blend | **PASS** | `director/PilotModel.ts` |
| Encirclement arc HUD | **PASS** | `ui/HUD.ts` radar |
| **Enemies — all five, weighted attacks** | | |
| LANCER volley 50 / lance 50 | **PASS** | `enemies/Archetypes.ts` |
| BRAWLER lunge 67 / sweep 33 | **PASS** | " |
| SENTRY volley 50 / mortar 50 | **PASS** | " |
| HARRIER strafe-run 50 / mine drop 50 | **PASS** | mine: 0.55s arm · 10m trigger · 8.0s life |
| WARDEN shield advance 50 / quake 50 | **PASS** | advance 22m behind the shield, contact damage along the path |
| **Encounter states — six** | | |
| ARENA · DUEL · STORM · PURSUIT · HUNT · TRAVERSAL | **PASS** | `director/Encounters.ts`; each cleared standalone by `tools/pilot.mjs` |
| **Connective tissue** | | |
| CONDUIT and OPEN FALL, no loading break | **PASS** | Checkpoint D |
| **FORGE** | | |
| Stillness beat: boost in, wind down, locks, percussion drops, interface assembles, LAUNCH, doors | **PASS** | `Game.enterForge` / `updateForge`, `Audio.duckPercussion`, `ui/Screens.showForge` |
| Three upgrade cards (take one) | **PASS** | `RunState.rollOffer` |
| Evolution row: every eligible evolution, one per un-evolved hardpoint, take one | **PASS** | verified: FORGE 1 offers 4, FORGE 2 offers 3, evolved hardpoints leave the pool |
| **Run structure** | | |
| CHAIN A → FORGE → CHAIN B → FORGE → SEVERANCE → RESULTS → REPLAY | **PASS** | `Game.stops` |
| Four authored chains, seed picks two, Chain Law 2 obeyed | **PASS** | `director/Chains.ts`; `__state().run.chainLaw2` records both stresses and `distinct` |
| **Content** | | |
| 12 upgrades, three per verb, all Law III, exact values on every card | **PASS** | `build/Upgrades.ts` |
| 4 weapon evolutions | **PASS** | `build/Weapons.ts` |
| 2 reactors: VECTOR and MIRRORWORK | **PASS** | `build/Reactors.ts` |
| Discipline classifier incl. hybrid path | **PASS** | GHOST / KINETIC / BREAKER all reachable; hybrids named; empty build → UNWRITTEN FRAME |
| **SEVERANCE** | | |
| 22,000 structure, phase 2 at 50% | **PASS** | `enemies/Severance.ts` |
| Counter-Vanish phase 1 every 2nd, phase 2 60% seeded / 4.0s cd | **PASS** | Checkpoint E |
| Counter-Vanish always starts a Reverse Rally | **PASS** | Checkpoint E |
| **Systems** | | |
| Scoring: exact formulas, weights, thresholds, undefined-metric rule | **PASS** | `score/Metrics.ts`; excluded metrics are shown as N/A with weight redistributed |
| Complete menu → run → boss → results → replay loop | **PASS** | Checkpoint C |
| RETRY SEED and NEW RUN | **PASS** | `ui/Screens.showResults` |
| Controller support incl. full menu navigation | **PASS (unverified on hardware)** | `core/Input.ts` + `ui/Dom.ts` `Nav`; every action and every screen is bound on both devices. No gamepad was available in the verification container |
| Live tuning / debug panel bound to `Tuning.ts` | **PASS** | `ui/Debug.ts`, key **P**; edits re-apply derived build modifiers immediately |
| `window.__state()` with the full §14 schema | **PASS** | `Game.state()` — player, hostiles[], director, run, build, score, perf |
| Profiling overlay: frame time, draw calls, entity count, streamer state | **PASS** | `ui/Debug.ts` `Profiler`, key **O** |

**No item is FAIL or BLOCKED.** One item — controller support — is implemented in full but could
not be exercised against physical hardware in this container; it is called out rather than
claimed as measured.

---

## 6b. Content verification — every value, measured

`tools/content.mjs` drives each reactor, upgrade and evolution through the real simulation and
reads back what actually happened. Measured against the GDD:

| Item | GDD | Measured |
|---|---|---|
| VECTOR | 9,000 structure · 18 EN vanish · no clone | `structure 9000 · vanishCost 18 · clone 0` |
| MIRRORWORK | 7,200 · 12 EN · 2.0s clone | `structure 7200 · vanishCost 12 · clone 2 · clonesAfterVanish 1 · enSpent 12` |
| Zero-Point Reactor | ground 43 → 0, air 16 → 129 | `ground 0 · air 129` |
| Rail Core | +0% at 62 → +100% at 200 | 100 damage at rest → `200` at velocity 200 |
| Slipstream | within 8m above 120 velocity → stack, max 3 | first stack acquired at `speed 126`, `max 3` |
| Mirror Chassis | 4.0s clone firing at 60% | `clones 1 · life 4.0 · damageScale 0.6` |
| Vanish Battery | −18 EN → +30 EN | `50 EN before → 80 EN after` |
| Predator Read | telegraph +0.4s early, window 0.30 → 0.22 | `window 0.22 · lead 0.4` (reaching the enemy through `ctx.telegraphLead`) |
| Split Lock | hold 2 locks | `capacity 2 · held 2` |
| Weight of Attention | locked +35% | `locked 135 · unlocked 100` |
| Chain Read | lock nearest within 220m + 1.0s bullet time | victim `#5` killed → lock chains to `#6` |
| Execution Protocol | blade vs staggered +200% | `3,534` damage = 620 × 3 × 1.9 stagger multiplier |
| Cascade Break | 40% of target's Impact Max to every other hostile | `248` = 40% of 620, applied to both others |
| Reactor Bleed | 40 EN core, 8.0s | `cores 1 · energy 40 · life 8` |
| Tether Blade | 15m tether pulls you in at 90 m/s | `120m → 71m` in 0.5s |
| Momentum Railgun | 0.55s charge · 380 dmg · cannot fire below 90 velocity | `chargeAtRest 0 · readyAtRest false · fired at 200 velocity for 380` |
| Orbiting Interceptors | 4 orbit, destroy incoming within 25m | `live 4 · max 4`; hostile VOLLEY/MORTAR/STRAFE fire travels and is intercepted |
| Seismic Driver | landing shockwave 320/260 r28 **in addition to** the direct hit | direct `900`, plus `320` to each of two hostiles in radius |

**One bug found and fixed by this pass:** CHAIN READ never fired, because a killed hostile drops
out of `lock.all` before `onKill` runs, so the "was this target locked?" test always failed.
Lock membership is now read before the hit lands.

---

## 7. Notes on performance work

Three changes were made after profiling, all recorded above as assumptions 11–12:

1. **Vertex-colour plate bake** — 678 → 242 draw calls in a three-hostile ARENA.
2. **Rig instancing from cached prototypes** — spawning five hostiles no longer rebuilds five
   procedural mechs mid-encounter.
3. **Far LOD at 150m** — distant hostiles drop to a merged rest-pose mesh. Threat still reads,
   because §12 puts every telegraph on the ground plane.

Plus **dynamic resolution**: render scale walks between 0.62× and the device ratio based on a
smoothed frame time, so pacing degrades before it stutters.

Measured in a five-hostile ARENA at 1440×810: **223 draw calls · 57k triangles · 20 shader
programs · 5 tracked entities**.

---

## 8. Verification tooling

| Script | What it proves |
|---|---|
| `tools/smoke.mjs` | Boot, deploy, movement, console cleanliness |
| `tools/loop.mjs` | Determinism: identical procedural setup and identical execution trace from identical input (Checkpoints A, C) |
| `tools/arena.mjs` | A five-hostile ARENA is losable; passive play ends in FRAME LOST (Checkpoint B) |
| `tools/pilot.mjs` | A scripted pilot that reads windups clears ARENA, DUEL, STORM, HUNT, PURSUIT and SEVERANCE (Checkpoints B, E) |
| `tools/full.mjs` | Whole loop: vanish, rally win and loss, FORGE offers, LAUNCH, boss, Counter-Vanish sequence, results (Checkpoints C, E) |
| `tools/continuity.mjs` | One world build per run; volume crossings generate no geometry (Checkpoint D) |
| `tools/forge2.mjs` | FORGE 1 offers 4 evolutions, FORGE 2 offers 3; classifier coverage across the pool |
| `tools/dps.mjs` | Hardpoint values match the GDD at the millisecond level |
| `tools/content.mjs` | Every reactor, upgrade and weapon evolution measured against its GDD values (§6b) |
| `tools/gallery.mjs` | Framed captures of every encounter state and the FORGE |
| `tools/shot.mjs` | Framed screenshots of any encounter state |

Run them with the dev server up:

```sh
npm run dev            # terminal 1
node tools/pilot.mjs   # terminal 2
```

---
---

# BLINKFALL v0.2 — THE CEILING PASS

The Alpha proved the loop. This pass answers the question the Alpha could not: **does BLINKFALL
have enough systemic ceiling to be a premium game, and does the architecture carry four sectors?**

Six systems, built in the order the brief mandates, because each one measures the one before it.

---

## 9. Three additional non-negotiables

| # | Rule | How it is enforced |
|---|---|---|
| **7** | Difficulty may never alter damage, structure, or the arc thresholds. FALL tiers escalate only through legal Director and encounter pressure. | `FallTier` has no damage or structure field — there is nothing to set. `__fallProof()` returns `damageLevers: []`, `structureLevers: []`, and the arc thresholds and player structure per tier, all ten identical. Elites are behavioural modifiers with no stat field. |
| **8** | Every assist is recorded in `RunState` and surfaced on the results screen, written even when every assist is off. | `RunState.assists` is populated from `settings.snapshot()` at `run.begin()`, unconditionally. The results card renders either the active list or `ALL ASSISTS OFF`. |
| **9** | The difficulty ladder must be measured, not asserted. Adjacent tiers producing statistically indistinguishable outcomes are not distinct tiers. | `tools/ladder.mjs`: 50 runs per tier with a byte-identical fallible pilot, reporting clear rate, time-to-clear, structure remaining, arc time above 235°, and the two-sample gap between adjacent rows. The ladder was **retuned twice** because this harness failed it. |

---

## 10. Assumptions recorded under the Autonomy Rule (v0.2)

Resolution order unchanged: GDD → brief → existing implementation.

15. **Corrupted offers at FALL X.** GDD §8.2 says corrupted variants are "always offered
    alongside a clean option". The v0.2 brief's FALL X row specifies **corrupted-only offers**.
    The brief is the later and more specific document for this feature, so it wins: at FALL X
    every card is corrupted. Below FALL X, at least one clean card is always present, satisfying
    the GDD. Flagged rather than silently resolved.
16. **The arc is rotation-invariant, and the onboarding says so.** The encirclement arc is
    `360° − the widest empty bearing gap`, which does not depend on where the pilot is looking.
    Two hostiles can therefore never exceed 180° however they are placed, and "turn to face
    them" can never close an arc. The orientation beat is consequently **ROTATE THE FIGHT —
    boost out of the middle**, not "turn around": four hostiles are walked onto stations at
    roughly ±40° and ±135°, the arc reads ~250°, and the answer is repositioning. This is the
    game's actual load-bearing skill, and the opening now teaches that rather than a fiction.
17. **Elite modifiers are behavioural only, by construction.** `EliteModifier` exposes cohesion,
    recovery scale, frontal shielding, orbit scale and read tightness. It has no health, damage
    or armour field, so non-negotiable 7 cannot be violated by a future elite. Proven at runtime:
    an elite LANCER and a plain LANCER both report 3400 structure.
18. **GRAVEMARK's screen test and its escorts' stations reference different things.** The
    escorts hold station on the **commander's facing**; the screen test measures the rear arc
    **relative to the player's position**. Binding both to the same vector makes the test
    tautological — the screen becomes unbreakable by any piloting and can only be attrited. The
    two references are deliberately split, and the commander's yaw rate is capped at 1.5 rad/s
    so it cannot simply pirouette the arc back under its escorts.
19. **Hazard fields deal damage on a cadence, not per frame.** `HAZARD_CD = 1.1s` per emitter.
    Without it `storm-collapse` and `hunt-descent` took a full-structure frame to zero in about
    four seconds, which is not a variant, it is a bug wearing one.
20. **A sector is built incrementally, not in one pass.** The Alpha's "generate the whole sector
    at run start" is kept *within* a sector; across sectors, the next one is generated by a
    generator that yields after each volume under a per-frame millisecond budget, while the
    current sector is being played. This preserves "nothing left to load at a transition" at
    four-sector scale, where a single-pass build would be a visible stall.

---

## 11. The sector lifecycle (§3.4)

```
play sector N  ─┬─ pump the generator for N+1 under a per-frame ms budget
                └─ on crossing into N+1, retire N-1
RESIDENT ≤ 2 at all times
```

`SectorWorld` owns residency. `Sector` owns one sector's scene graph and disposes only geometry
it created — kit materials are shared and are never disposed under a live sector.

What crosses a boundary untouched: `RunState` (upgrades, evolutions, encounter scores, seed,
FALL tier, assists), the pilot model, the build, the score, and all seven RNG stream cursors.

## 12. The FALL ladder (§3.1)

Ten tiers. Every lever is on the brief's permitted list, and the type has no others:

```ts
interface FallTier {
  tokenCooldown; forwardBias; arenaCeiling; asyncAllowed; spawnSpread;
  reinforcementScale; waveBonus; elites; corruptedFraction; geometryPressure;
}
```

| | Tok CD | Fwd bias | Ceiling | Async | Spread | Reinf | Wave | Elites | Corrupt | Geo |
|---|---|---|---|---|---|---|---|---|---|---|
| **I** | 1.50 | 0.18 | 4 | — | 0.35 | 1.00 | 0 | 0 | — | 1.00 |
| **II** | 1.35 | 0.18 | 4 | — | 0.35 | 1.00 | 0 | 0 | — | 1.00 |
| **III** | 1.35 | 0.26 | 4 | — | 0.45 | 0.95 | 0 | 0 | — | 1.00 |
| **IV** | 1.35 | 0.26 | 5 | — | 0.45 | 0.92 | 0 | 0 | — | 1.00 |
| **V** | 1.35 | 0.36 | 5 | ✓ | 0.65 | 0.84 | 1 | 0 | — | 1.00 |
| **VI** | 1.30 | 0.48 | 6 | ✓ | 0.95 | 0.72 | 2 | 0 | — | 1.15 |
| **VII** | 1.20 | 0.54 | 7 | ✓ | 1.00 | 0.70 | 2 | 1 | — | 1.15 |
| **VIII** | 1.20 | 0.64 | 8 | ✓ | 1.15 | 0.64 | 3 | 1 | 0.50 | 1.25 |
| **IX** | 1.10 | 0.76 | 9 | ✓ | 1.25 | 0.58 | 3 | 2 | 0.50 | 1.35 |
| **X** | 1.00 | 0.92 | 10 | ✓ | 1.45 | 0.50 | 4 | 3 | 1.00 | 1.50 |

**Nothing on that table is damage, structure, or an arc threshold.** There is no column for them
because there is no field for them.

### The retune, and why non-negotiable 9 earned its place

The first ladder passed inspection and failed measurement. The Checkpoint B pilot — which saw
every windup instantly, from any bearing — cleared **100% of runs at every tier**, so ten
"distinct" tiers produced one indistinguishable outcome. Under rule 9 that is not a ladder.

Two changes followed.

1. **The measurement pilot was made fallible in exactly the way the ladder applies pressure.**
   0.22s reaction latency; it tracks one windup at a time, so a second inside that window is
   missed; and a windup opening outside a 1.60 rad front arc is seen only 20% of the time.
   Competence is now tied to holding the formation in front — which is the game's thesis, so
   the instrument and the design agree about what "good" means.
2. **The ladder itself was retuned**, twice. Forward bias 0.30 with an arena ceiling of 5 could
   not widen the arc enough to release a second token, so the middle tiers were doing nothing
   the pilot could feel. `waveBonus` was added as a reinforcement-pacing lever, the ceiling was
   opened tier by tier, and token cooldown was shortened only in the top three rows.

---

## 13. Encounter variants (§3.3)

Twenty-four: four per state. A variant may change geometry, objective, hazard field and failure
condition. **A variant may never change the arc rule, and none does** — `VariantSpec` has no
stress field, so Chain Law 2 still operates on the state, not the variant.

| State | Variants |
|---|---|
| **ARENA** | open-ground · pillar-forest · shrinking-ring · elevated-tiers |
| **DUEL** | classic · seconds · narrow-bridge · en-drain |
| **STORM** | rotating-hazards · collapse · crossfire-lanes · dropping-floor |
| **PURSUIT** | convoy · interceptors · gauntlet · relay-chase |
| **HUNT** | search · beacons · descent · flush |
| **TRAVERSAL** | descent · wake · hazard-grid · pressure-run |

`EncounterFields` is the runtime layer: shrinking confine radius, hazard grids, dropping floors,
EN drain, rotating rotors and wake. `Transports` carries the convoy and relay-chase objectives.

**Hazards deal damage on an 1.1s per-emitter cadence.** Before that cap, `storm-collapse` and
`hunt-descent` drained 9000 structure to zero in roughly four seconds. After it: 8460 and 7990
structure remaining on a clean run.

---

## 14. GRAVEMARK and RELAY (§3.2)

Sector 1's second boss. The seed picks SEVERANCE or GRAVEMARK, so a run is not the same fight
twice. GRAVEMARK is a FORMATION boss: it is the arc rule pointed back at the player.

```
GRAVEMARK          commander. 1.5 rad/s yaw cap. Cannot be damaged while SCREENED.
RELAY ×4           escorts. Station on the COMMANDER'S FACING, angular rate 1.6 rad/s, radius 34m.
SCREEN             holds while ≥2 relays sit in the commander's rear arc AS MEASURED FROM THE PLAYER.
                   Respawn 14s in phase 1, 9s in phase 2 — so attrition alone never wins.
```

The whole fight is the split between those two references. Escorts *keep station* on the
commander's facing; the screen is *tested* against the player's bearing. Bind both to the same
vector and the screen becomes tautological — unbreakable by any amount of skill, defeatable only
by killing escorts faster than they respawn. Split them, and the answer is to **rotate the
commander's rear arc out from under its own escorts**, which is Law II played from the other side.

### Six wrong diagnoses before the instrument found it

Recorded because the sequence is the point: each fix was plausible, and five of them were wrong.

1. Escorts died to incidental fire → escorts that are actively screening became protected.
2. The harness used soft lock, so the "chase the escorts" policy was quietly auto-targeting the
   commander and the two policies were the same policy → hard lock in the policy.
3. Escorts cut across the circle, uncapping their effective angular rate → ring constraint, then
   a kinematic angle with a real rate limit.
4. The commander pirouetted to face the player, so walking around it flipped the arc for free →
   yaw rate capped at 1.5 rad/s.
5. **Root cause, found only by instrumenting with `tools/gmprobe.mjs`:** the escorts' station and
   the screen test both read `rearDir()`. The test was tautological.
6. The "chaser" policy was scoring 14k damage on the commander through blade splash and by
   switching targets once escorts were dead → the policy was made honest: never target the
   commander, no blade, wait when no escort is up.

---

## 15. The first 100 seconds (§3.5)

Eight beats, each advancing on a **condition the player satisfied**, never on a timer alone —
with a hard ceiling per beat so a stuck player is never trapped in a lesson.

```
launch → first-kill → two-in-front → flanked → rotate → vanish → convert → launch-out
```

The load-bearing beat is `flanked → rotate`. Four hostiles are walked onto stations at roughly
±40° and ±135°, leaving no bearing gap wider than about 95°, so the arc reads ~250° and the HUD
says **TOKENS 2** before the player has read a word. They are released the instant the `rotate`
beat opens, because the answer is to move — see assumption 16.

Offered on the title screen, nudged on a first launch, skippable with Esc, and never forced.
`settings.onboarded` persists to localStorage.

---

## 16. Accessibility foundation (§3.6)

`src/core/Settings.ts` owns assists and bindings, persisted to `blinkfall.settings.v1`.

| Assist | Values | Default | Where it lands |
|---|---|---|---|
| Vanish window | 0.30 · 0.38 · 0.46 · 0.55 | 0.30 | `BuildMods.vanishWindow` **baseline** — upgrades still move it relatively, so PREDATOR READ keeps its meaning at every setting |
| Bullet time duration | 0.6× – 2.0× | 1.0× | vanish slow duration, rally window |
| Telegraph intensity | 0 – 100% | 100% | telegraph decal opacity and ring width |
| High-contrast telegraphs | on · off | off | telegraph palette |
| Camera shake | 0 – 100% | 100% | `CameraRig` trauma scale |
| FX intensity | 0 – 100% | 100% | particle and bloom budget, **independent of telegraph intensity** |
| Look sensitivity | slider | 1.0 | `Input` |
| Field of view | slider | 78° | camera |
| Assault Boost | hold · toggle | hold | `Input` |
| Hard lock | hold · toggle | hold | `Input` |
| Remapping | 11 actions, keyboard · mouse · pad | — | `Input` binding table |

Rebinding goes through `Input.captureNext()`, which reports conflicts before committing. Menu
navigation is deliberately **not** rebindable: a pilot who binds menu-up to a key they then
rebind elsewhere cannot reach the settings screen to fix it.

Non-negotiable 8 in one line — `RunState.begin()` calls `settings.snapshot()` unconditionally, so
`assists{}` exists on every run, and the results card prints `ALL ASSISTS OFF` when it is default.

---

## 17. §3.0 — the hardware profile

`npm run profile` builds a production bundle, serves it, and measures five scenarios with
**rendering on and a pilot flying**, because a frame budget that excludes the renderer is not a
frame budget. Add `-- --headful` on the machine you ship to.

It reports frame p50/p95/p99/worst, draws, triangles, programs, geometries, textures, entities,
and — separately — **isolated simulation cost** (`__dev.simCost()`, ticking with the renderer off).
That split matters here: this container has **no GPU** (`/dev/dri` absent, no VGA device, no
Vulkan ICD), so every render number below is a SwiftShader software floor and is *not* a hardware
profile. The CPU half is real and portable.

### Measured in this container (ANGLE · SwiftShader · 1920×1080 · dpr 0.62)

| Scenario | p50 | p95 | worst | **sim p95** | draws | tris | prog | geom |
|---|---|---|---|---|---|---|---|---|
| idle arena | 400ms | 483ms | 550ms | **0.3ms** | 124 | 28,638 | 18 | 86 |
| 5 hostiles *(reference)* | 417ms | 450ms | 467ms | **0.5ms** | 196 | 55,662 | 18 | 231 |
| volume crossing | 433ms | 550ms | 550ms | **0.2ms** | 144 | 30,974 | 18 | 255 |
| FALL X · 13 hostiles | 467ms | 717ms | 717ms | **0.4ms** | 522 | 97,964 | 20 | 297 |
| GRAVEMARK + relays | 500ms | 633ms | 633ms | **0.4ms** | 143 | 90,070 | 20 | 359 |

### The budget FALL X must fit inside

At a 60fps target the frame is **16.67ms**. Simulation p95 never exceeds **0.5ms** — 3% of it —
which leaves **16.17ms for the renderer**. That number is hardware-independent and is the
half of Checkpoint A that can be established here.

Caps this profile sets for the rest of the pass:

```
draw calls    <= 600          FALL X measured (522) + 15%
triangles     <= 112,659
programs      <= 20           no new material family without a re-profile
build slice   <= 6ms/frame    a crossing must never cost two frame budgets
simulation    <= 5.83ms p95   35% of the frame; measured worst is 0.5ms
```

**The finding worth acting on:** draws go 196 → 522 between the 5-hostile reference and FALL X,
and 124 of those are the empty world. That is ~15 draws per hostile plus VFX and ordnance —
linear, not pathological, and comfortable for any discrete GPU, but it is the number a fifth
archetype or a heavier VFX pass now has to be measured against rather than guessed at.

---

## 18. Verification tooling added in v0.2

| Script | What it proves |
|---|---|
| `tools/profile.mjs` | §3.0. Five scenarios with rendering on: frame percentiles, draws, tris, programs, GPU memory, plus isolated simulation cost and the derived FALL X budget. `npm run profile` |
| `tools/settings.mjs` | §3.6. Every assist reaches the value it claims to, persists across a reload, and lands in `RunState.assists`; rebinding and conflict detection |
| `tools/lifecycle.mjs` | §3.4. Three chained Sector 1 instances: residency never exceeds two, geometry is released at each boundary, and the run state crosses intact |
| `tools/fallcheck.mjs` | Non-negotiable 7 at runtime: arc thresholds and player structure identical at all ten tiers; elite vs non-elite structure identical |
| `tools/ladder.mjs` | §3.1 and non-negotiable 9. 50 runs per tier, one fallible pilot, adjacent-pair separation on five outcome metrics |
| `tools/variants.mjs` | §3.3. All 24 variants entered and cleared or failed on their own terms |
| `tools/gravemark.mjs` | §3.2. Two policies, same fight: chasing escorts loses, rotating the commander wins |
| `tools/gmprobe.mjs` | The instrument that found the tautological screen test — kept, because the next formation boss will need it |
| `tools/onboarding.mjs` | Checkpoint F. A scripted first-timer plays the orientation; the token count they were *shown* is asserted 1 → 2 → 1 |

---

## 19. Checkpoint results (v0.2)

Sections are named by the scope item they prove. Where the brief's checkpoint letter is
unambiguous it is stated: **A** — the hardware profile (§17), **C** — the measured ladder (§20),
**F** — the 0:35 → 0:50 beat (below).

### §3.4 — the sector lifecycle (`tools/lifecycle.mjs`, three chained Sector 1 instances)

| Mark | Resident | Sectors | Volumes | Geom | Draws | Built | Retired | Carried |
|---|---|---|---|---|---|---|---|---|
| S1 start | 1 | 1 | 18 | 90 | 125 | 1 | 0 | 0/0/0 |
| S1 mid (post-forge) | 1 | 1 | 18 | 146 | 138 | 1 | 0 | 1/1/0 |
| S1 boss | 1 | 1 | 18 | 277 | 204 | 1 | 0 | 1/1/0 |
| **boundary 1→2** | 1 | 2 | 16 | 190 | 113 | 2 | 1 | 1/1/1 |
| S2 mid | **2** | 2,3 | 33 | 205 | 124 | 3 | 1 | 1/1/1 |
| S2 boss | **2** | 2,3 | 33 | 205 | 122 | 3 | 1 | 1/1/1 |
| **boundary 2→3** | 1 | 3 | 17 | 111 | 112 | 3 | 2 | 1/1/1 |
| S3 mid | 1 | 3 | 17 | 111 | 120 | 3 | 2 | 1/1/1 |
| S3 boss | 1 | 3 | 17 | 111 | 121 | 3 | 2 | 1/1/1 |

**MAX RESIDENT SECTORS: 2 — PASS.** Residency walks 1 → 2 → 1 → 2 → 1 as the next sector is
built during play and the previous one is retired at the boundary. Geometry ranges 90–277 and
comes back down at every boundary, so it is genuinely released rather than merely hidden. Draws
stay flat at 112–204 across all three sectors. Built 3, retired 2. Upgrades, evolutions, encounter
scores, the pilot profile and all seven stream cursors carry through. Console clean.

### Non-negotiable 7 at runtime (`tools/fallcheck.mjs`)

```
arc thresholds identical at every tier : true  (145° / 235° / 275°)
player structure identical at every tier: true  (9000)
damage levers                          : []
structure levers                       : []
```

Tier levers actually reaching the simulation:

```
FALL I    cooldown 1.50s  bias 0.18  ceiling  4  async false  elites 0  corrupted   0%
FALL V    cooldown 1.35s  bias 0.36  ceiling  5  async true   elites 0  corrupted   0%
FALL VII  cooldown 1.20s  bias 0.54  ceiling  7  async true   elites 1  corrupted   0%
FALL X    cooldown 1.00s  bias 0.92  ceiling 10  async true   elites 3  corrupted 100%
```

Corrupted offers by tier — `◆` marks the permanent downside attached to the card:

```
FALL  1: execution-protocol         zero-point-reactor              chain-read
FALL  8: execution-protocol         zero-point-reactor◆(flank-debt) chain-read◆(en-ceiling)
FALL 10: execution-protocol◆(vanish-window)  zero-point-reactor◆(flank-debt)  chain-read◆(en-ceiling)
```

Elites are behavioural only, measured side by side in one encounter:

```
lancer  elite=ANCHOR    structure=3400  impactMax= 620
lancer  elite=PHASED    structure=3400  impactMax= 620
sentry  elite=VECTORED  structure=5200  impactMax=1050
warden  elite=null      structure=7800  impactMax=1900
```

An elite LANCER and a plain LANCER are the same 3400 structure and the same 620 impact. **PASS.**

### §3.3 — the 24 variants (`tools/variants.mjs`)

**REACHABLE AND PLAYABLE: 24/24.** Every variant is entered, its field layer engages, and it
resolves on its own terms — `clear`, `reach-exit`, `intercept` or `destroy-targets`. Console clean.
Field activity is observable per row (`emit` hazard-grid pulses, `rot` rotors, `drain` EN vents,
`void` dropping-floor sectors, `wake`), so a variant that silently degraded to its baseline would
show up as a row of zeroes rather than pass unnoticed.

The three hazard variants after the 1.1s cadence cap: `storm-grid` 8760, `storm-collapse` 8460,
`hunt-descent` 8040 structure remaining. Before the cap, two of those were a full frame to zero
in about four seconds.

### §3.2 — GRAVEMARK (`tools/gravemark.mjs`, 6 seeds per policy, same fight)

| Policy | Boss down | Boss structure left | Damage dealt | Damage refused | Exposed % | Relay kills | Player HP |
|---|---|---|---|---|---|---|---|
| **chaser** — fight the escorts, never the commander | **0/6** | 100% | 114 | 2,356 | 95% | 15.0 | 8,525 |
| **rotator** — orbit hard, hit whenever the screen drops | **6/6** | 0% | 20,863 | 24,676 | 55% | 4.0 | 8,592 |

The chaser kills **15 escorts** across a fight and takes the commander from 26,000 to 25,886. It
is not losing to damage — it ends on 8,525 structure — it is losing because killing escorts is
not the answer to a screen that respawns them. The rotator kills **4** and wins every time.

Both policies take almost identical damage, which is the point: the difference between them is
comprehension, not execution.

### Checkpoint F — the first 100 seconds (`tools/onboarding.mjs`)

```
ENTRY POINT     ORIENTATION present · nudged on first launch
BEATS           launch → first-kill → two-in-front → flanked → rotate → vanish → convert → launch-out
```

The token count the player was **shown**:

```
  two-in-front   ARC     0-57°   TOKENS 1   held 4.80s
  flanked        ARC   235-263°  TOKENS 2   held 2.00s
  rotate         ARC   144-233°  TOKENS 1   held 0.28s
```

```
TOKEN TRANSITIONS      1 → 2(flanked) → 1(rotate)
1 BEFORE THE FLANK     true
2 ON THE FLANK         true
1 AFTER THE ROTATE     true
ALL EIGHT BEATS TAUGHT true
CHECKPOINT F           PASS
```

### Alpha gates re-run under the Regression Rule

Every Alpha checkpoint was re-run against the v0.2 build. Nothing an earlier gate proved was
allowed to break.

| Alpha gate | v0.2 result |
|---|---|
| `tools/loop.mjs` — determinism | **PASS** — identical procedural setup, identical execution trace, identical final stream states |
| `tools/arena.mjs` — a 5-hostile ARENA is losable | **PASS** — naive pilot (hold fire, walk forward) dies at 120s with 3 hostiles standing; fully passive pilot dies at 60s. `tokenSource` observed at both thresholds: `227.6° <= 235° -> 1` and `244.4° > 235° -> 2` |
| `tools/pilot.mjs` — every state is winnable | **PASS** — ARENA 8620 · DUEL 9000 · STORM 9000 · HUNT 8520 · PURSUIT 9000 · SEVERANCE 9000, all cleared |
| `tools/full.mjs` — whole loop end to end | **PASS** — title → HUNT → vanish → rally win, escalation and loss → FORGE → LAUNCH → **GRAVEMARK** (the seed picked it) → phase 2 with the screen broken (1 of 4 relays screening, 974 refused vs 900 taken) → results. Console clean |
| `tools/forge2.mjs` — FORGE 1 offers 4 evolutions, FORGE 2 offers 3 | **PASS** — classifier coverage unchanged across the pool |
| `tools/content.mjs` — every reactor, upgrade and evolution measured | **PASS** — all 18 rows match their GDD values, including the ones the corrupted variants now scale |
| `tools/settings.mjs` — §3.6 | **PASS** — 10 assist rows, 11 rebindable actions, persistence across reload, and the assist snapshot reaching `RunState` |

