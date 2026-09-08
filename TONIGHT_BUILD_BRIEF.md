# TONIGHT_BUILD_BRIEF.md — BLINKFALL Alpha Run

Companion to `blinkfall-gdd-v2.2.1.md`. The GDD is the **destination**. This is **tonight**.

---

## 0. The definition of done

Read this first and re-read it before you report.

> I can launch BLINKFALL, select a reactor, enter a continuous chain, fight multiple readable
> enemies at speed, Perfect Vanish attacks, become surrounded if I rotate poorly, recover
> control by piloting correctly, enter a Forge, materially mutate my machine, continue without
> a loading break, fight SEVERANCE, receive a mastery rank and a named build discipline, and
> immediately start another seeded run.

**Do not cut scope.** The Alpha Run scope in §3 is the minimum accepted build. If implementation
pressure rises, simplify internal implementation, reuse donor systems more aggressively, or
defer nonessential refactors — but do not remove requested mechanics, encounters, content, boss
behaviour, scoring, controller support, or loop coverage.

> **Nothing gets cut. Implementation may get uglier before scope gets smaller.**

---

## 1. Substrate

Start from **`koviq4/astra-vs-fable`**. Michael has explicit permission to build from it.

- `Fable 5.1/` (IRONVEIL) is the better architecture — modular, `core/Tuning.ts` already
  centralised, streamer, pooling, event bus, 9-state enemy FSM, procedural mech models with zero
  authored assets.
- `Astra/` (ASHFALL) has the better tuning values and a skill system with a usable GLSL shield
  shader. Raid it; do not fork it.

**Boot the donor unchanged first.** Verify a playable baseline on its pinned versions before
touching dependencies. Then bump Three r170 → r180 **only if the migration is clean**. Do not
upgrade TypeScript or Vite for freshness — preserve working pinned versions unless BLINKFALL
requires a change. Dependency churn follows the same philosophy as the engine decision: working
technology beats theoretical advantage.

**Do not rebuild anything either donor already solves.** Where both solve the same problem, take
the better implementation and record the decision.

Also available: the OUTNUMBERED prototype (Director, Perfect Vanish, Rally, encirclement HUD,
all with working constants).

---

## 2. Non-negotiables

1. **The encirclement arc exclusively determines simultaneous attack tokens.** No other system
   writes that value. The pressure model may shape bearing, archetype, sequencing, timing and
   band pressure — never token count. `__state().director.tokenSource` must prove it at runtime.
2. **Law III.** Every upgrade alters a condition, interaction, timing rule, spatial rule,
   resource conversion, tradeoff, or verb behaviour. An unconditional numerical increase may not
   be an upgrade's whole identity.
3. **Exact values on every upgrade card.** Never hide magnitude behind flavour text. Format:
   fantasy line, then machinery — `Radius 18m · Deflection 65° · Duration 0.45s`.
4. **No authored meshes.** Everything procedural.
5. **Scope completeness is mandatory.** Every item in §3 is required for tonight's accepted
   Alpha. "Partial implementation," "stubbed system," "placeholder flow," or "deferred due to
   budget" does not satisfy the brief. Where a system is expensive, reduce engineering elegance
   before reducing player-facing scope.
6. **No `Math.random()` in gameplay simulation.** Per-domain PRNG streams per GDD §14. Cosmetic
   particles may use unseeded randomness.

---

## 3. Scope — all of this is required

### Combat foundation
- Movement, camera, lock-on ported and finalised from the donor
- Structure / Impact / EN with the GDD's constants, **including Quick Boost 20 EN / 0.34s**
- Perfect Vanish — 0.30s window · 0.13× time · 0.85s · 17m blink · 18 EN · 0.18s cooldown
- Exposed — 1.5s · 2.4× impact
- Rally and **Reverse Rally** — 5 exchanges · 1.05s first window · ×0.82 ramp
- Four hardpoints: Rifle (0.10s · 62 · 26), Blade (17m · 620 · 300 · 0.72s), Missile Rack
  (6 · 140 · 90 · **1.8s rack cooldown · 0.08s spacing**), Pile Driver (900 · 520 · 4.0s, air-only)

### Director
- Sovereign arc rule (145° / 235° / 275°) → token count, with `tokenSource` traceability
- Pressure model with its five permitted outputs
- Pilot model, persistent, decaying 25% per FORGE, blended `0.70 current / 0.30 profile`
- Encirclement arc HUD

### Enemies — all five, with weighted attack selection
LANCER (volley 50 / lance 50) · BRAWLER (**lunge 67 / sweep 33**) · SENTRY (volley 50 / mortar 50) ·
HARRIER (strafe-run 50 / **mine drop** 50) · WARDEN (**shield advance** 50 / quake 50)

Mine Drop and Shield Advance are fully specified in GDD §7. Implement them; do not invent values.

### Encounter states — six
ARENA · DUEL · STORM · PURSUIT · HUNT · TRAVERSAL
*(OBJECTIVE and COLOSSUS are Sector 3 material and fall outside tonight's sector.)*

### Connective tissue
CONDUIT and OPEN FALL. Both must run with **no loading break**.

### FORGE
Full stillness beat: boost in, thrusters wind down, locks engage, percussion drops out, build
interface assembles around the machine, **LAUNCH**, doors open.

Each FORGE offers **three upgrade cards (take one)** and a **weapon evolution row showing every
currently eligible evolution — one card per un-evolved hardpoint (take one)**. Evolved hardpoints
leave the pool. Tonight that means FORGE 1 shows four evolution cards and FORGE 2 shows three;
the player leaves Sector 1 with two evolved hardpoints.

### Run structure — one complete sector
```
CHAIN A → FORGE → CHAIN B → FORGE → SEVERANCE → RESULTS → REPLAY
```

**Tonight's chain pool — build exactly these four:**

| Chain | Sequence | Dominant stress |
|---|---|---|
| OPENING GAMBIT | TRAVERSAL → ARENA | ROTATION |
| INTERCEPT | TRAVERSAL → PURSUIT → DUEL | BOOST |
| PRESSURE COOKER | ARENA → STORM → ARENA | ROTATION |
| LONG WAY DOWN α | TRAVERSAL → HUNT → ARENA | ALTITUDE |

The seed chooses two, obeying Chain Law 2. Chain A has no previous-chain constraint. Note that
OPENING GAMBIT and PRESSURE COOKER share ROTATION and therefore cannot pair.

### Content — build exactly these

**12 upgrades, three per verb:**

| Verb | Upgrades |
|---|---|
| BOOST | Zero-Point Reactor · Rail Core · Slipstream |
| VANISH | Mirror Chassis · Vanish Battery · Predator Read |
| LOCK | Split Lock · Weight of Attention · Chain Read |
| STAGGER | Execution Protocol · Cascade Break · Reactor Bleed |

This set can produce **GHOST**, **KINETIC** and **BREAKER** disciplines plus hybrids, so the
classifier is testable tonight. CONTRAIL and GRAVITY are unreachable from this pool by design.

**4 weapon evolutions, one per hardpoint:**
**Tether Blade** · **Momentum Railgun** · **Orbiting Interceptors** · **Seismic Driver**

Two FORGEs means the player takes two of the four per run — replay variety comes free. All
eligible evolutions are shown at each FORGE; see the FORGE spec above.

**2 reactors:** **VECTOR** and **MIRRORWORK**. MIRRORWORK exercises the vanish system hardest.

**Discipline classifier** working over the twelve-upgrade set, including the hybrid path.

**SEVERANCE** — 22,000 structure, phase 2 at 50%. Counter-Vanish per GDD §9: phase 1 fires on
every second successful Perfect Vanish; phase 2 fires on a 60% seeded roll with a 4.0s internal
cooldown. Counter-Vanish always starts a Reverse Rally.

### Systems
- Scoring with the exact formulas, weights, rank thresholds and undefined-metric rule from GDD §10
- Complete menu → run → boss → results → replay loop
- **RETRY SEED** (identical seed) and **NEW RUN** (fresh seed) on the results screen
- Controller support, including full menu navigation
- Live tuning / debug panel bound to `Tuning.ts`
- `window.__state()` with the full schema from GDD §14
- Profiling overlay: frame time, draw calls, entity count, streamer state

---

## 4. Order of work

1. **Substrate up.** Repo from donor on pinned versions. Baseline verified. Then `RNG.ts` with
   streams, `Tuning.ts`, `__state()`, profiling overlay. Three r180 only if clean.
2. **Combat core.** Vitals, Vanish, Exposed, Rally, Reverse Rally, four hardpoints. Verify the
   vanish feels identical to the OUTNUMBERED prototype.
3. **Director + enemies.** Sovereign arc, five archetypes with weighted attacks, metrics
   sampling, pressure model, pilot model, HUD.
4. **Close the loop.** Menu → single ARENA → results → replay, with RETRY SEED and NEW RUN.
5. **Encounter states.** The other five, each playable standalone.
6. **Connective tissue + FORGE.** CONDUIT, OPEN FALL, the stillness beat.
7. **Chains.** The four-chain pool, laws, stress metadata, full sector rhythm.
8. **Content.** Twelve upgrades, four weapon evolutions, MIRRORWORK, classifier.
9. **SEVERANCE** with Counter-Vanish and Reverse Rally.
10. **Scoring and rank.**
11. **Controller, tuning panel, polish.**

Step 4 is the hinge. Once the loop closes, everything later is additive and the build is never
unplayable.

---

## 5. Checkpoints

Report briefly at each. Do not wait for the end.

| # | After | Proof required |
|---|---|---|
| A | Step 1 | Donor decision table. Baseline verified before any version bump. Builds clean. Same seed → identical layout twice. 60fps |
| B | Step 3 | 5-hostile ARENA winnable and losable. `__state().director.tokenSource` shows the arc as sole writer of `tokenCount` |
| C | Step 4 | Menu → fight → results → replay end to end. RETRY SEED reproduces identical **procedural setup** — chain, layout, initial spawns, offers, initial RNG stream states. Same recorded inputs then reproduce behaviourally equivalent execution |
| D | Step 7 | Full sector runs continuously with no loading break at any transition |
| E | Step 9 | SEVERANCE beatable. Phase 1 Counter-Vanish fires on the 2nd Perfect Vanish, reproducibly |
| F | End | §3 scope table, item by item, plus the definition of done walked start to finish |

---

## 6. Production rules

**AUTONOMY RULE.** Do not stop for non-blocking ambiguity. Prefer the GDD, then this brief, then
existing donor behaviour, in that order. Record every assumption in `BUILD_REPORT.md` and
continue. Only stop when blocked by unavailable files or credentials, destructive
incompatibility, or a direct contradiction between non-negotiables.

**REGRESSION RULE.** At every checkpoint, re-run all previous checkpoint gates. A later system
may not break an earlier one.

**SCOPE RULE.** Do not drop features to save time. If time becomes constrained, simplify
implementation architecture, reuse donor code, reduce refactor depth, or lower visual flourish
before reducing gameplay scope. The accepted build must include every item in §3.

**FINAL REPORT STANDARD.** Report each §3 scope item as **PASS**, **FAIL**, or **BLOCKED**. The
build is complete only when all required scope items are PASS. Do not summarise an incomplete
build as successful.

---

## 7. `BUILD_REPORT.md`

Maintain throughout, not at the end:

- Donor decision table — subsystem, chosen source, why
- Every assumption made under the Autonomy Rule
- Any dependency changed from the donor's pinned version, and what required it
- Checkpoint results, including regression re-runs
- Final §3 scope table: PASS / FAIL / BLOCKED per item
