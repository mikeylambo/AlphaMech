# BLINKFALL

**A high-speed mech action roguelite about becoming impossible to surround.**

Sector 01 · EXTERIOR · **v0.2 — the Ceiling Pass**. TypeScript + Three.js + Vite. No authored
meshes, no asset downloads, no `Math.random()` in the simulation.

```sh
npm install
npm run dev        # http://localhost:5180
```

`npm run build` type-checks and bundles. `npm run verify` type-checks only.
`npm run profile` builds, serves and measures the frame budget on this machine — run it with
`-- --headful` on the hardware you actually ship to.

---

## The three laws

**LAW I** — Being outnumbered is the fantasy, not the failure state.
**LAW II** — Rotation is the load-bearing skill.
**LAW III** — Upgrades rewrite piloting, not merely stats.

Aggression is a rationed resource. The **encirclement arc** — the minimal arc containing every
hostile bearing around you — is the *only* thing that decides how many of them may attack at
once. Keep the formation in front of you and exactly one of them can open. Let them wrap past
235° and a second token is released. Control the formation, and you control aggression.

```
> __state().director.tokenSource
"encirclement-arc(237.3°) > 235° -> 2"
```

---

## The ten FALLs

Difficulty is a ladder of ten tiers, and it is measured rather than asserted. A tier may only
move Director and encounter pressure: token cooldown, forward bias, arena ceiling, sequencing,
spawn spread, reinforcement pacing, wave bonus, elite eligibility, corrupted offer fraction,
geometry pressure.

**No FALL tier touches damage, structure, or the arc thresholds.** The arc rule is byte-identical
at FALL I and FALL X — 145° and 235°, 9000 structure, at every tier. This is provable at runtime:

```
> __fallProof().damageLevers      // []
> __fallProof().structureLevers   // []
> __fallProof().tiers.map(t => t.arcThresholds)   // identical, ten times over
```

Clear a tier to unlock the next. Elites appear from FALL VII and are **behavioural only** —
`anchor` holds cohesion, `relentless` recovers faster, `screened` refuses frontal damage,
`vectored` orbits wider, `phased` reads tightest. None of them has a single extra hit point.
From FALL VIII the FORGE begins offering **corrupted** upgrades: a much larger version of the
effect, bought with a permanent downside. At FALL X every card is corrupted.

---

## Accessibility

Every assist is in the pause menu, in the settings screen, and on the results card — recorded in
`RunState.assists{}` whether or not any of them is on.

| Assist | Range | Default |
|---|---|---|
| Vanish window | 0.30 · 0.38 · 0.46 · 0.55 s | 0.30 |
| Bullet time duration | 0.6× – 2.0× | 1.0× |
| Telegraph intensity | 0 – 100% | 100% |
| High-contrast telegraphs | on · off | off |
| Camera shake | 0 – 100% | 100% |
| FX intensity | 0 – 100%, independent of telegraphs | 100% |
| Look sensitivity · FOV | sliders | — |
| Input remapping | all 11 actions, keyboard · mouse · pad | — |
| Assault Boost · Hard lock | hold or toggle | hold |

---

## Controls

| Action | Keyboard / Mouse | Gamepad |
|---|---|---|
| Boost skate | W A S D | Left stick |
| Camera · aim | Mouse | Right stick |
| **Quick Boost · Perfect Vanish** | Shift | RB |
| Assault boost | E | L3 |
| Vertical thrust | Space | A |
| Descend | C · Ctrl | B |
| Hard lock | Q · MMB | R3 |
| Cycle target | Wheel · ← → | D-pad ← → |
| Rifle | LMB | RT |
| Energy blade | RMB · F | X |
| Missile rack | 1 | LB |
| Pile driver | 2 | Y |
| Rally prompt | W A S D | D-pad · left stick |
| Pause | Esc | Start |
| Live tuning panel | P | — |
| Profiling overlay | O | — |

Every screen — title, reactor select, FORGE, results, pause — is fully navigable on a gamepad.

---

## The vanish

Quick-boost with an attack's remaining windup at or under **0.30s** and you get a Perfect Vanish:
time drops to **0.13×** for **0.85s**, you blink **17m** to the attacker's flank, the attack is
cancelled, the attacker is **Exposed for 1.5s at 2.4× impact**, and the camera hard-locks onto
them. It costs **18 EN** instead of the normal 20, with a **0.18s** cooldown.

55% of Perfect Vanishes escalate into a **Rally** — five directional exchanges on a shrinking
window. SEVERANCE answers with **Counter-Vanish**, which always starts a **Reverse Rally**: same
timing, but now *it* is the aggressor.

---

## Run structure

```
SECTOR = CHAIN A → FORGE → CHAIN B → FORGE → BOSS → RESULTS
CHAIN  = 2–3 encounter states + connective tissue
```

A sector is generated incrementally under a per-frame millisecond budget while you play the one
before it, and the one behind you is retired when you leave it. **Never more than two sectors are
resident**, and everything that defines the run — pilot model, build, evolutions, score, and all
seven RNG cursors — crosses the boundary untouched.

Each of the six encounter states has **four variants** — twenty-four in all — that change the
geometry, the objective and the failure condition without ever touching the arc rule.

The boss is chosen by the seed: **SEVERANCE**, the duellist, or **GRAVEMARK**, a commander that
cannot be damaged while two of its four RELAY escorts hold its rear arc. Chasing the escorts
loses; rotating the commander's rear arc out from under them wins.

**Sector 1 chain pool:** OPENING GAMBIT · INTERCEPT · PRESSURE COOKER · LONG WAY DOWN α.
The seed plays two, obeying Chain Law 2 (a chain's dominant stress must differ from the
previous chain's).

---

## Architecture

```
src/
  core/       RNG (per-domain streams) · Tuning · Input · Settings · MathUtil · Textures · Pool
  frame/      Vitals · Vanish (in Player) · Rally · Lock · CameraRig · Ordnance · Player
  director/   Director · PilotModel · Encounters · Chains · Fall · Variants
              EncounterFields · Transports · Onboarding
  enemies/    Archetypes · Enemy · Severance · Gravemark · Elites
  build/      Reactors · Upgrades · Corrupted · Weapons · Disciplines · RunState
  world/      Kit · ChainWorld · Sector
  score/      Metrics
  entities/   MechRig · MechModels · Materials · RigCache · RigDriver
  fx/ ui/ audio/
```

`Vitals` works for any entity, and `Director` stays agnostic about whether the pressured thing is
the player or a static objective — both are requirements of the Frame's second consumer.

---

## Determinism

No `Math.random()` in gameplay simulation. Seven per-domain PRNG streams
(`chains · layout · spawn · ai · rally · boss · offers`), each seeded from
`hash(masterSeed + streamName)`, so a chain's layout is identical whether you perfect-vanished
twelve times or none. Cosmetic particles may use unseeded randomness.

**RETRY SEED** reproduces the identical procedural setup — chain selection, layout, cover
placement, initial spawns, offers and all seven initial stream states. **NEW RUN** takes a fresh
seed.

---

## Runtime inspection

| Call | Returns |
|---|---|
| `__state()` | The full GDD §14 schema: player, hostiles[], director, run, build, score, perf |
| `__proof()` | The sovereign-arc derivation, the run's procedural setup signature, chain laws |
| `__dev` | Verification commands — `stops()`, `skipToLabel()`, `spawn()`, `forceWindup()`, `vanish()`, `rallyAnswer()`, `boss()`, `step()` |
| `__replay({seed, segments})` | Headless fixed-timestep replay with scripted input, returning a trace |
| `__fallProof()` | Per-tier proof that no FALL lever touches damage, structure or the arc thresholds |
| `__dev.lifecycle()` | Resident sector count, geometry residency, and everything carried across a boundary |
| `__dev.profileSample()` · `simCost()` | Frame percentiles, draws, tris, programs, GPU memory · isolated CPU cost |
| `__dev.onboarding()` | The orientation's beat and the token count the player was shown at each one |

Scripted verification lives in `tools/`. See `BUILD_REPORT.md` §8.

---

## Documents

- `blinkfall-gdd-v2.2.1.md` — the design document. The destination.
- `TONIGHT_BUILD_BRIEF.md` — the Alpha Run scope.
- v0.2 — the Ceiling Pass: hardware budget, accessibility, sector lifecycle, the FALL ladder,
  24 variants, GRAVEMARK, and the first 100 seconds.
- `BUILD_REPORT.md` — donor decisions, assumptions, checkpoint results, scope table.
