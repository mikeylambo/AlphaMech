# BLINKFALL — Game Design Document v2.2.1

Supersedes v2.1. This is the destination document. Tonight's build target is defined in
`TONIGHT_BUILD_BRIEF.md`.

**This document is closed for editing.** Further design changes wait for playtest evidence.

**Working title.** Alternates: VANISHPOINT, COILFRAME, SUNDERSTEP.

---

## 0. Changes from v2.1

Spec-hole closure only. No design changes.

| # | Hole | Closed |
|---|---|---|
| 1 | Mine Drop and Shield Advance had no values | full row for each in §7 |
| 2 | BRAWLER listed `lunge, lunge, sweep` | not a typo — it was **weighting**, now stated explicitly as percentages for all five archetypes |
| 3 | Quick Boost cost and cooldown dropped from the movement table | restored: **20 EN · 0.34s** |
| 4 | Missile Rack had no cadence | **1.8s rack cooldown · 0.08s launch spacing** |
| 5 | Scoring defined meanings, not formulas | exact formulas, weights, rank thresholds, and an undefined-metric rule in §10 |
| 6 | SEVERANCE "may counter-vanish" | deterministic phase-1 rule, seeded phase-2 rule, reverse-rally resolution |
| 7 | `Math.random()` not prohibited | banned from gameplay simulation; **per-domain PRNG streams** specified |
| 8 | `__state()` exposed the player but not hostiles | full `hostiles[]` schema plus `perf.streamerState` |

### v2.2.1 patches

| # | Hole | Closed |
|---|---|---|
| 9 | INTEGRITY divided by a hardcoded 9,000, mis-scoring any non-baseline chassis | now divides by **max structure at encounter start** |
| 10 | FORGE weapon-evolution offer was ambiguous — could read as one forced card | **all eligible hardpoints shown, choose one**; evolved hardpoints leave the pool |
| 11 | Vanish Battery's "refunds instead of costing" could read as pay-18-then-gain-30 | restated as an absolute sign flip |
| 12 | RETRY SEED promised "reproduces the encounter exactly" | narrowed to procedural setup; execution equivalence requires identical inputs |

---

## 1. Thesis

**A high-speed mech action roguelite about becoming impossible to surround.**

Descend through a collapsing orbital megastructure, fighting duels, kill-boxes, pursuit battles
and colossal war machines. Every run rewrites how your machine BOOSTS, VANISHES, LOCKS and
STAGGERS — changing how you pilot rather than simply making you stronger.

### The three laws

**LAW I — Being outnumbered is the fantasy, not the failure state.**
You are stronger than any one of them and weaker than all of them at once. The entire skill
ceiling lives in that gap.

**LAW II — Rotation is the load-bearing skill.**
Keeping a formation in front of you, continuously, at speed, while fighting. Every system
either teaches, tests, or scores it.

**LAW III — Upgrades rewrite piloting, not merely stats.**
Every upgrade must introduce or alter a **condition, interaction, timing rule, spatial rule,
resource conversion, tradeoff, or verb behaviour.** Numerical bonuses and penalties are
encouraged for clarity, but an unconditional numerical increase may not be an upgrade's entire
identity.

> `+20% damage` — illegal.
> `Damage scales with current velocity, up to +100% at Assault Boost speed` — legal.

**Presentation rule.** Surface exact values on every upgrade card. Never hide mechanical
magnitude behind flavour text:

```
GRAVITY THRUSTERS
Quick Boost toward your locked target bends hostile projectiles into your wake.
Radius 18m · Deflection 65° · Duration 0.45s
```

### The Inclusion Test

> Does this make controlling a formation around yourself more interesting?

---

## 2. The run journey

### 2.1 Run length — locked

```
SECTOR = CHAIN A → FORGE → CHAIN B → FORGE → BOSS
CHAIN  = 2–3 encounter states + connective tissue
RUN    = 4 sectors
```

**16–24 combat states + 4 bosses. 30–40 minutes. 8 FORGE decisions per run**, plus one reactor
choice at the start. Each sector holds an authored pool of 6–8 chains; the seed plays two.

### 2.2 Rooms are combat states, not literal rooms

No fade to a menu. You leave an encounter by launching out of it.

| Type | What it is |
|---|---|
| **CONDUIT** | High-speed corridor. Assault boost sustained; hostiles may join in transit |
| **OPEN FALL** | Vertical descent through open structure. Altitude is the axis |
| **BREACH** | Short forced traversal into a new volume — a hull you cut through |
| **DIRECT** | No transit. The space changes around you mid-fight. Sector 4 only |

### 2.3 The descent means something

**S1 EXTERIOR** — outer infrastructure, hard light, open sky. Enemies fight like pilots. Static
arenas. Where the game teaches rotation.

**S2 MANUFACTURE** — deep machinery, cooling stacks, vertical volumes. Machines alter the
environment: moving platforms, active hazards, conveyor volumes.

**S3 MILITARY CORE** — war machines appear. Arenas contain hostile architecture that fires.
ANVIL PRIME visible on the horizon all sector.

**S4 BLINKFALL** — entire rooms move. Gravity shifts, arenas rotate, geometry closes. You are
fighting the station. *Blinkfall* names the moment a structure's descent stops being controlled.

### 2.4 The FORGE

A hangar bay you boost into and land in.

> **A FORGE is the only place in the run where the machine becomes completely still.**

Enter at speed. Thrusters wind down. Mechanical locks engage with weight. The score loses its
percussion. The build interface assembles physically around the machine rather than overlaying
the screen. Then **LAUNCH**, and the bay doors open.

Each FORGE offers **three upgrade cards (take one)** and a **weapon evolution row showing every
currently eligible evolution — one card per un-evolved hardpoint (take one)**. Once a hardpoint
evolves it leaves the pool, so the evolution row shrinks by one at each subsequent FORGE.

---

## 3. Encounter grammar

Eight states with **authored stress metadata**. The generator never infers meaning.

| State | Shape | primaryStress | secondaryStress |
|---|---|---|---|
| **ARENA** | 3–5 peers, full director | ROTATION | LOCK |
| **DUEL** | one opponent, no adds | VANISH | STAGGER |
| **STORM** | 1–2 enemies owning the arena with patterns | BOOST | EN |
| **PURSUIT** | continuous combat down a streamed corridor | BOOST | LOCK |
| **HUNT** | flying enemies only, vertical arena | ALTITUDE | LOCK |
| **OBJECTIVE** | defend / intercept / destroy under interference | ROTATION | STAGGER |
| **COLOSSUS** | the environment is the enemy | ALTITUDE | BOOST |
| **TRAVERSAL** | pure piloting, environmental damage, no combat | BOOST | EN |

Tags: `ROTATION · BOOST · VANISH · LOCK · STAGGER · EN · ALTITUDE`

---

## 4. Encounter chains

2–3 states plus connective tissue, played without interruption, ending at a FORGE or a boss.

### Chain laws

1. No state repeats back-to-back, except ARENA → ARENA, available from Sector 3.
2. A chain's dominant stress must differ from the previous chain's dominant stress. Computed
   from metadata. Chain A of Sector 1 has no previous-chain constraint.
3. Every chain ends at a decision point.
4. DIRECT connective tissue is Sector 4 only.

### Authored chains

| Chain | Sequence | Dominant stress |
|---|---|---|
| OPENING GAMBIT | TRAVERSAL → ARENA | ROTATION |
| INTERCEPT | TRAVERSAL → PURSUIT → DUEL | BOOST |
| PRESSURE COOKER | ARENA → STORM → ARENA | ROTATION |
| SKYFALL | HUNT → COLOSSUS → TRAVERSAL | ALTITUDE |
| THE EPISODE | PURSUIT → ARENA → DUEL | BOOST |
| COLLAPSE | OBJECTIVE → TRAVERSAL (timed) → ARENA | ROTATION |
| THE LONG WAY DOWN | TRAVERSAL → HUNT → OBJECTIVE | ALTITUDE |
| SPLIT THE FORMATION | ARENA → DIRECT → ARENA | ROTATION (S4) |

---

## 5. Combat core

### 5.1 Movement

| Constant | Value |
|---|---|
| `speed` / `accel` | 62 / 16 |
| `thrust` / `gravity` | 92 / 50 |
| `quickSpeed` / `quickDur` | 200 / 0.22 |
| **`quickCost` / `quickCooldown`** | **20 EN / 0.34s** |
| `assaultSpeed` / `assaultDrain` | 200 / 6 per sec |
| `energyMax` | 100 |
| `hoverCost` | 14 per sec |
| `regenGround` / `regenAir` | 43 / 16 per sec |
| `regenDelay` | 0.5 |

Ground regen at nearly 3× air regen makes altitude a real decision. Do not flatten it.

### 5.2 Vitals

Structure and impact. Impact decays 150/sec when not recently hit. Stagger: 2.2s player,
3.0s enemy, **1.9× damage taken** while staggered. Player 9,000 structure / 900 impact.

### 5.3 Vanish

Ground-plane telegraph rings. Quick-boosting with remaining windup **≤ 0.30s** produces a
Perfect Vanish: time to **0.13×** for **0.85s** real, blink 17m to the attacker's flank, attack
cancelled, **Exposed 1.5s at 2.4× impact**, camera hard-locks, afterimage at origin. **18 EN**
(replacing the normal 20 EN Quick Boost cost), cooldown **0.18s**.

### 5.4 Rally

**55%** of Perfect Vanishes escalate (seeded — see §14). First window **1.05s**, each subsequent
**× 0.82**, **5** exchanges to win. Win: 1,400 impact + 900 damage. Fail: 520 damage +
340 impact. Wrong key or timeout both fail.

**Reverse Rally.** Identical timing structure, but the hostile is the aggressor. Winning grants
you the punish (attacker Exposed 1.5s); losing costs the standard fail values.

### 5.5 Lock

Soft assist by default; hard lock frames both fighters. **Lock simplifies orientation, never
positioning.**

---

## 6. The Director

### 6.1 The arc rule — sovereign

**The encirclement arc exclusively determines simultaneous attack tokens. Nothing else may write
this value.**

| Arc | Tokens |
|---|---|
| `< 145°` | 1 |
| `> 235°` | 2 |
| `> 275°` (S3+) | 3 |

Tokens go to the candidate nearest its band centre, off cooldown, unstaggered. Release cooldown
1.5s (1.0s in Sector 4). Non-token hostiles orbit their band with an **0.18 forward bias**.

> **Control the formation, and you control aggression.**

### 6.2 The pressure model

**Inputs:** encirclement arc · average velocity · altitude fraction · EN floor frequency ·
Perfect Vanish rate · stagger conversions per minute · average lock hold · verb dominance vector.

**Outputs — the complete permitted set:**

| Output | Range |
|---|---|
| spawn bearing bias | bearing reinforcements enter from, relative to facing |
| archetype weighting | which enemy type spawns next |
| attack sequencing mode | SEQUENCED (default) / ASYNC |
| reinforcement timing | when the next wave arrives within an encounter |
| preferred distance-band pressure | which band the formation biases toward |

**Simultaneous token count is not on this list and may not be added to it.**

### 6.3 Persistence

**Persist the pilot model. Reset tactical state.**

| Persists (decaying) | Resets every encounter |
|---|---|
| airborne tendency | spawn bearing bias |
| typical velocity | sequencing mode |
| Vanish reliance | immediate archetype response |
| lock duration | reinforcement timing |
| stagger conversion rate | band pressure |
| dominant build behaviour | |

`pressure = 0.70 × current-encounter sampling + 0.30 × run pilot model`

The pilot model **decays 25% at each FORGE**.

### 6.4 The Director Law

> The Director may change **where, when, and what kind** of pressure arrives. It may never
> change damage numbers, alter the token count, disable a player verb, or make an attack
> unvanishable.

---

## 7. Enemies

| Kind | Name | HP | Impact max | Band (m) | Speed | Attack weights |
|---|---|---|---|---|---|---|
| lancer | LANCER | 3,400 | 620 | 95–175 | 44 | volley 50% · lance 50% |
| brawler | BRAWLER | 4,200 | 820 | 14–52 | 66 | **lunge 67% · sweep 33%** |
| sentry | SENTRY | 5,200 | 1,050 | 55–120 | 36 | volley 50% · mortar 50% |
| harrier | HARRIER | 2,600 | 480 | 40–90 | 82 | strafe-run 50% · mine drop 50% |
| warden | WARDEN | 7,800 | 1,900 | 30–70 | 28 | shield-advance 50% · quake 50% |

The BRAWLER duplicate in earlier drafts was **attack weighting**, not a typo. All five
archetypes now state weights explicitly.

HARRIER never lands. WARDEN's frontal shield breaks only to a Perfect Vanish punish or a pile
driver from above.

### Complete attack table

| Attack | Windup | Recovery | Telegraph radius | Damage | Impact | Behaviour |
|---|---|---|---|---|---|---|
| volley | 0.90 | 0.60 | 12 | 210 | 95 | 3-round burst, light spread |
| lance | 1.50 | 1.00 | 9 | 430 | 190 | sustained beam, 0.24s |
| lunge | 0.75 | 0.85 | 15 | 380 | 260 | closes to 13m, melee swing |
| sweep | 0.60 | 0.70 | 19 | 300 | 330 | wide arc, tightest read in the roster |
| mortar | 1.30 | 0.90 | 26 | 340 | 150 | arcing, lands at telegraph centre |
| strafe-run | 1.10 | 0.70 | 14 | 250 | 120 | airborne pass, fires along the run |
| **mine drop** | **0.80** | **0.65** | **10** | **280** | **180** | **arms after 0.55s · 10m trigger · persists 8.0s** |
| **shield advance** | **1.10** | **0.90** | **22** | **260** | **300** | **advances 22m behind the frontal shield; contact damage along the path** |
| quake | 1.60 | 1.20 | 34 | 480 | 420 | ground shock, radius grows over the windup |

Keep at least one attack near sweep's 0.60s floor in every sector so the vanish skill stays live.

---

## 8. Build system

### 8.1 Base hardpoints

| Slot | Default | Values |
|---|---|---|
| Primary | Rifle | 0.10s rate · 62 dmg · 26 impact |
| Melee | Energy Blade | 17m · 620 dmg · 300 impact · 0.72s cooldown |
| Shoulder A | Missile Rack | 6 missiles · 140 dmg · 90 impact each · **1.8s rack cooldown · 0.08s launch spacing** · soft-homing |
| Shoulder B | Pile Driver | air-only · 900 dmg · 520 impact · 4.0s cooldown |

### 8.2 Upgrades — 30 total

#### BOOST

| Upgrade | Effect |
|---|---|
| **Zero-Point Reactor** | Ground EN regen 43 → **0/sec**; airborne 16 → **129/sec** |
| **Gravity Thrusters** | Quick Boost toward your locked target bends hostile projectiles into your wake. Radius **18m** · Deflection **65°** · Duration **0.45s** |
| **Rail Core** | Weapon damage scales with current velocity, **+0% at 62 → +100% at 200** |
| **Contrail Weave** | Boost trail persists **3.0s** as damaging geometry. **140 dmg + 60 impact per second** to hostiles crossing it. Width **4m** |
| **Overburn** | Assault Boost costs **0 EN for the first 1.5s** of each activation. Re-toggle lockout **2.0s** |
| **Ground Effect** | Skating below **6m** builds charge at **12/sec** (max 100). Landing discharges **8 dmg + 6 impact per charge**, radius **22m** |
| **Kinetic Bank** | **40%** of EN spent on movement banks (max **120**). Discharge for **5 dmg + 3 impact per point** in a **30m** cone |
| **Slipstream** | Passing within **8m** of a hostile above **120 velocity** grants **+100% acceleration for 0.5s**. Stacks to **3×** |

#### VANISH

| Upgrade | Effect |
|---|---|
| **Mirror Chassis** | Perfect Vanish leaves a clone for **4.0s** firing your rifle at **60%** (37 dmg). One at a time |
| **Echo Split** | Perfect Vanish spawns **2 afterimages** for **2.0s**. Hostiles retarget to them **70%** of the time |
| **Cascade** | Each Perfect Vanish within **6.0s** of the last extends bullet time by **+0.25s**, max **+1.25s** |
| **Punish Doctrine** | Exposed impact bonus **2.4× → 1.8×**; Exposed duration **1.5s → 3.0s** |
| **Vanish Battery** | Perfect Vanish changes from **−18 EN to +30 EN**. Improvement vs baseline: **+48 EN** |
| **Counterweight** | Rally wins apply the full **1,400 impact** to every hostile within **40m** |
| **Blind Angle** | **Untargetable 1.2s** after a Perfect Vanish. Hostiles in windup against you abort |
| **Predator Read** | Telegraphs appear **0.4s earlier**; Perfect Vanish window **0.30s → 0.22s** |
| **Impact Reflection** | Vanished attacks convert **100% of their impact** onto the attacker (lance = 190) |

#### LOCK

| Upgrade | Effect |
|---|---|
| **Split Lock** | Hold **2 locks**. Rifle alternates at full rate — each target receives **50%** of your uptime |
| **Chain Read** | Killing a locked hostile locks the nearest within **220m** and grants **1.0s** bullet time |
| **Weight of Attention** | Locked target takes **+35% damage**; unlocked hostiles deal **+25% damage** to you |
| **Sensor Bloom** | Your locked target's next telegraph is revealed **1.0s before** windup. **2.0s** cooldown on lock change |
| **Ghost Lock** | Lock persists **3.0s** through line-of-sight breaks, painting position through geometry |
| **Target Debt** | Holding a lock builds **+8% blade damage per second** (max **+120%**), dumped and reset on the next blade hit |

#### STAGGER

| Upgrade | Effect |
|---|---|
| **Singularity Engine** | Staggering a target pulls all hostiles within **30m** toward it at **45 m/s for 0.6s** |
| **Cascade Break** | Staggering a target applies **40% of that target's Impact Max** to every other hostile |
| **Execution Protocol** | Blade against staggered enemies deals **+200%** (620 → **1,860**) and **immediately refunds** the 0.72s cooldown |
| **Overpressure** | Impact you deal **does not decay for 5.0s** |
| **Shared Fault** | Staggered enemies emit a **35m** field slowing other hostiles' windups by **40%** |
| **Reactor Bleed** | Staggering a target drops a **40 EN** core, persisting **8.0s** |
| **Fault Line** | Staggering a target while it is Exposed also staggers the nearest hostile within **45m** |

#### Corrupted variants

From Sector 2. Stronger effect, one downside. Always offered alongside a clean option.

| Downside | Value |
|---|---|
| EN ceiling | 100 → **75** |
| Structure | 9,000 → **7,200** |
| Vanish window | 0.30s → **0.24s** |
| Hardpoint lockout | one hardpoint disabled for the run |
| **FLANK DEBT** | non-attacking hostile forward bias **0.18 → 0.34** |

FLANK DEBT makes the formation harder to hold without ever overriding the arc.

### 8.3 Weapon evolution

One per FORGE from an un-evolved hardpoint.

**Blade** — **Phase Blade** (passes shields and plates; 620 dmg · **0 impact**) · **Tether Blade**
(**15m** tether pulls you to the target at **90 m/s**, or the target to you if staggered;
420 dmg · 220 impact) · **Execution Blade** (**1,550 dmg** vs staggered or Exposed, **240 dmg**
otherwise)

**Rifle** — **Ricochet Rifle** (bounces to a second hostile within **40m** at **60%** — 37 dmg ·
16 impact) · **Lock-Splitting Rifle** (fires at every lock at **70%** each — 43 dmg · 18 impact) ·
**Momentum Railgun** (**0.55s** charge · **380 dmg · 160 impact**; cannot fire below **90 velocity**)

**Missiles** — **Orbiting Interceptors** (**4** orbit you, destroying incoming projectiles within
**25m**; rebuild 1 per **3.0s**) · **Mine Lattice** (**6** mines, **12s**, **260 dmg · 180 impact**,
**9m** trigger) · **Swarm Lock** (**14** micro-missiles, **55 dmg · 30 impact** each, distributed
across all locks)

**Pile Driver** — **Seismic Driver** (landing shockwave **320 dmg · 260 impact**, radius **28m**,
in addition to the direct hit) · **Anchor Driver** (pins the target for **2.2s** — no movement,
no flight; **640 dmg · 520 impact**) · **Breach Driver** (destroys plates and shields outright;
**900 dmg · 300 impact**)

### 8.4 Build disciplines

Emergent, not selected.

| Discipline | Core upgrades | Feels like |
|---|---|---|
| **GHOST FRAME** | Mirror Chassis · Echo Split · Blind Angle · Chain Read | teleporting assassination mech |
| **KINETIC FRAME** | Rail Core · Kinetic Bank · Slipstream · Momentum Railgun | a combat racing game |
| **GRAVITY FRAME** | Gravity Thrusters · Singularity Engine · Cascade Break · Anchor Driver | positioning enemies *is* the weapon |
| **CONTRAIL FRAME** | Contrail Weave · Ground Effect · Overburn · Mine Lattice | you draw prisons around enemies |
| **BREAKER FRAME** | Overpressure · Execution Protocol · Fault Line · Shared Fault | you win by stagger economy |

**Classifier.** Score taken upgrades across the four verbs plus a geometry axis. Match to nearest
discipline; if no axis exceeds **55%** of the total, generate a hybrid name from the two
strongest. The end screen leads with the discipline, not the score.

### 8.5 Reactors

| Reactor | Values |
|---|---|
| **VECTOR** | Baseline. The teaching chassis |
| **NULLPOINT** | Ground regen **0/sec**, airborne **48/sec**. Pile driver cooldown **4.0s → 2.0s** |
| **MIRRORWORK** | Perfect Vanish leaves a **2.0s** clone. Vanish cost **18 → 12**. Structure **9,000 → 7,200** |
| **CONTRAIL** | Boost trail persists **3.0s** as solid geometry. A closed loop creates a containment field halving hostile speed inside for **4.0s**; self-intersection detonates for **420 dmg · 200 impact**, radius **16m** |
| **BREAKER** | Boost speed **62 → 37**. Structure **9,000 → 11,500**. Blade impact **300 → 520**. Your impact never decays |

CONTRAIL is the highest-variance system in the game. Give it the most tuning time. It is
isolated to one chassis and one discipline, so it can fail without taking the game with it.

---

## 9. Bosses

**ACE** — same rules as you, pushed to mastery. Tests **execution**.
**FORMATION** — multiple enemies as one boss ecology. Tests **rotation**.
**WAR MACHINE** — the boss is the location. Tests **piloting**.

### SEVERANCE — Sector 1, ACE, 22,000 structure

Phase 2 begins at **50%** structure.

**Counter-Vanish — deterministic enough to test.**

| Phase | Trigger |
|---|---|
| 1 | **Every second** successful Perfect Vanish against SEVERANCE triggers Counter-Vanish |
| 2 | **60% seeded chance** per successful Perfect Vanish, with a **4.0s** internal cooldown |

Counter-Vanish **always** starts a **Reverse Rally** (§5.4). Winning it leaves SEVERANCE Exposed
1.5s; losing costs the standard rally-fail values (520 damage · 340 impact).

### The remaining three

| Boss | Sector | Class | Spec |
|---|---|---|---|
| **CHORUS** | 2 | FORMATION | Three linked frames, one shared pool of **34,000**, three separate bands, independently granted tokens |
| **ANVIL PRIME** | 3 | WAR MACHINE | 90m siege platform, visible all sector. Four AA batteries → shield drops → breach hull → skate armour → disable reactor → escape. Plates at 60%, escalation at 25%. **68,000**, 3 phases |
| **THE LAST FRAME** | 4 | ACE | Equips your four most-used upgrades, opens by naming your discipline. **48,000**, 3 phases |

---

## 10. Mastery and scoring

### Formulas

Sampled per simulation tick over the encounter.

```
CONTROL    = mean( arc < 145° ? clamp(speed / 62, 0, 1) : 0 ) × 100
VANISH     = perfectVanishes / vanishableAttacks × 100
CONVERSION = staggerPunishesLanded / staggersCreated × 100
FLOW       = clamp(averageSpeed / 120, 0, 1) × 100
INTEGRITY  = clamp(1 - structureDamageTaken / maxStructureAtEncounterStart, 0, 1) × 100

FINAL = CONTROL    × 0.30
      + VANISH     × 0.20
      + CONVERSION × 0.20
      + FLOW       × 0.15
      + INTEGRITY  × 0.15
```

CONTROL carries the heaviest weight because rotation is Law II. The velocity term is
load-bearing — without it, backing into a corner scores 100.

INTEGRITY's denominator is **read at encounter start, never hardcoded**. MIRRORWORK begins at
7,200 structure and BREAKER at 11,500; a corrupted downside can drop either by 20%. Against a
fixed 9,000, a MIRRORWORK pilot losing their entire bar would still score 20 INTEGRITY. A
dynamic denominator handles every current chassis, every corruption, and anything added later.

**Undefined-metric rule.** If a metric's denominator is zero — a TRAVERSAL encounter creates no
vanishable attacks and no staggers — that metric is **excluded**, and its weight is redistributed
proportionally across the remaining metrics so FINAL still totals out of 100. Never score a
missing metric as 0.

### Ranks

| Rank | FINAL |
|---|---|
| **S** | 90+ |
| **A** | 80–89 |
| **B** | 70–79 |
| **C** | 55–69 |
| **D** | below 55 |

Ranks aggregate per sector and per run, and modify salvage yield. The scoring screen is the
game's primary teaching surface.

---

## 11. Progression

**In-run:** upgrades, weapon evolutions, reactor state, carried by `RunState`.

**Meta:** salvage buys reactor unlocks, new upgrade-pool entries, and additional weapon evolution
lines. Meta never grants raw power — it grants **more ways to build**, keeping Law III intact
across the whole progression system.

---

## 12. World, art, FX, audio

**No authored meshes.** All procedural geometry.

**The silhouette contract.** All hostile threat reads on the **ground plane** as decal
telegraphs. Hostiles are desaturated and low-value; player effects are saturated and additive.
Cover geometry is height-capped so nothing occludes the horizon during a fight.

**Sector palettes.** Exterior: rust and ember, warm key. Manufacture: blue-grey, high fog,
vertical. Military Core: near-monochrome, hard shadows. Blinkfall: black sky, everything
backlit, geometry in motion.

**Escalation without particle count.** Power escalates through scale, duration, world deformation
and camera. A tier-3 beam is not brighter; it is fifteen metres across, it occludes, it lights
what it crosses, and it leaves scorched terrain for the rest of the encounter.

**FX and audio.** Route through **SLU FX Lab recipes**. Procedural WebAudio following VELOCITY's
Build 2 approach; layered engine tone driven by velocity and EN. Bullet time applies a lowpass
sweep and pitch drop across the whole bus — the slow-mo must be heard.

---

## 13. Engine decision

**Three.js, and it stays Three.js until there is evidence otherwise.**

Astra/Fable already provides working movement, camera, lock-on, rig and animation, weapons,
collision, enemy foundation, FX hooks and scene technology.

**Switch gate.** Port only if a representative BLINKFALL encounter cannot hold acceptable frame
pacing after profiling and reasonable optimisation, or if a required gameplay feature is
materially blocked by the web architecture. *"Godot might eventually be stronger"* is not a
trigger.

**Dependency philosophy follows the same rule.** Boot the donor on its pinned versions first.
Upgrade only what BLINKFALL requires. Do not trade working technology for freshness.

---

## 14. Determinism

**No `Math.random()` anywhere in gameplay simulation.** Rally escalation rolls, boss behaviour
rolls, spawn selection, AI variation, chain selection, upgrade offers, and procedural geometry
all consume the seeded PRNG. Cosmetic particles may use unseeded randomness.

**Per-domain PRNG streams.** A single shared stream desynchronises the moment player behaviour
changes how many draws occur — same seed, same map, completely different run. Each domain gets
its own stream seeded from `hash(masterSeed + streamName)`:

```
RNG.stream('chains')     chain selection and slot fill
RNG.stream('layout')     arena and procedural geometry
RNG.stream('spawn')      spawn positions and composition
RNG.stream('ai')         AI variation, attack weight selection
RNG.stream('rally')      rally escalation, prompt keys
RNG.stream('boss')       boss behaviour rolls
RNG.stream('offers')     upgrade and weapon evolution offers
```

**Input-replay tolerance test.** Same seed and inputs produce behavioural equivalence, not
bit-identity.

### `__state()`

```
player:    position, velocity, altitude, structure, impact, energy,
           stagger, staggerRemaining, exposed, exposedRemaining
hostiles[]: id, archetype, position, velocity, structure, impact,
           staggered, staggerRemaining, exposed, exposedRemaining,
           currentAttack, windupRemaining, preferredBand,
           hasAttackToken, targetId
director:  arc°, tokenCount, tokenSource, tokenHolders[],
           pressureOutputs{bearing, archetype, sequencing,
                           reinforcementTiming, bandPressure},
           pilotModel{...}
run:       seed, streamCursors{}, sector, chainId, nodeIndex,
           nodeStress, previousChainStress
build:     reactor, upgrades[], weaponEvolutions[], classifiedDiscipline
score:     control, vanish, conversion, flow, integrity, final, rank
perf:      frameTime, drawCalls, entities, streamerState
```

`director.tokenSource` exists so the sovereign-arc rule is **provable at runtime**, not merely
asserted in a document.

---

## 15. Architecture and donor map

| Donor | Contributes |
|---|---|
| **Astra / Fable** | **Primary substrate** — mech embodiment, movement, camera, lock-on, rig and animation, weapons, collision, enemy foundation, FX hooks, scene tech |
| **OUTNUMBERED prototype** | Director, Perfect Vanish, impact/stagger, Rally, encirclement HUD |
| **IRONVEIL** | Streamer, procedural world infrastructure, pooling, event bus — where objectively better |
| **VELOCITY** | Combat-design intelligence: perceptual play, afterimages, launch/DI |
| **Web Shell** | Product layer — session, input, settings, meta, unlocks, leaderboard |
| **FX Lab** | Effects language |

**Selection rule:** where two donors solve the same problem, take the better implementation. Do
not port a weaker version because an older document named it.

```
src/
  frame/          → extracted to @slu/web-shell as `boost-combat` (last, not first)
    Tuning.ts · Pilot.ts · Vitals.ts · Vanish.ts · Rally.ts · Lock.ts · CameraRig.ts
  director/
    Director.ts · PilotModel.ts · Encounters.ts · Chains.ts
  enemies/
    Enemy.ts · Archetypes.ts · bosses/
  build/
    Reactors.ts · Upgrades.ts · Weapons.ts · Disciplines.ts · RunState.ts
  world/
    Kit.ts · Arena.ts · Streamer.ts · Deform.ts
  core/
    RNG.ts          per-domain streams
  score/
    Metrics.ts · Rank.ts
  fx/ · ui/
```

`Vitals` must work for non-mech entities and `Director.ts` must stay agnostic about whether the
pressured thing is the player or a static objective — both are requirements of §17.

---

## 16. Build sequence

Tonight's pass is defined in `TONIGHT_BUILD_BRIEF.md`. Full-game sequencing:

**Phase 0 — Donor audit.** Working repo from Astra/Fable on pinned versions. Written decision
table. `Tuning.ts`. `RNG.ts` with streams. `__state()`.
*Gate:* decision table exists, builds clean, controllable mech in a seeded arena, same seed →
identical layout, 60fps.

**Phase 1 — Combat core.** Pilot, Vitals, Vanish, Rally, Reverse Rally, lock-on, four hardpoints.
*Gate:* a Perfect Vanish cancels an attack and opens the punish; a rally reaches both a win and
a loss. Feel indistinguishable from the OUTNUMBERED prototype.

**Phase 2 — Director and enemies.** Five archetypes with weighted attacks. Sovereign arc. Metrics
sampling. Pressure model. Pilot model with decay. Encirclement HUD.
*Gate:* a 5-hostile ARENA is winnable and losable. `__state().director.tokenSource` proves the
arc is the only writer.

**Phase 3 — Encounter grammar.** All eight states with stress metadata. CONDUIT and OPEN FALL.
Streamer wired into PURSUIT and transit.
*Gate:* each state playable standalone; a CONDUIT into an ARENA with no load break, no dip.

**Phase 4 — Chains and run structure.** Chain pools, laws, FORGE with the stillness beat,
RunState, four sectors.
*Gate:* full run completable. Same seed → identical run. Chain Law 2 verifiable in `__state()`.

**Phase 5 — Content.** 30 upgrades plus corrupted variants. 12 weapon evolutions. Five reactors.
Classifier. Four bosses. Palettes. Deformation. Scoring. Meta.
*Gate:* every upgrade changes piloting. The classifier names a GHOST run and a CONTRAIL run
correctly and produces a sane hybrid. THE LAST FRAME equips the four most-used upgrades.

**Phase 6 — Frame extraction and polish.** Extract `boost-combat`. FX Lab routing. Rally camera
choreography. Audio bus with bullet-time filtering. Shell integration.
*Gate:* `npm run verify` passes; the Frame compiles against a stub adapter; a second throwaway
consumer produces a controllable mech in under 100 lines.

Abstraction comes last on purpose.

---

## 17. Second consumer — MECH DEFENDERS

Noted so the Frame serves it, not built now.

A Dungeon Defenders–shaped co-op title on the same Frame, where the defended space is a **volume
rather than a set of lanes**. Attackers arrive on any vector off a sphere; the objective sits at
the centre. This is the one tower-defense variant that structurally requires 6DOF — a
ground-locked defender cannot hold a volume — and the build-then-defend loop turns lane
traversal, normally the genre's friction, into a mobility skill.

Reuses the Frame, procedural rig, archetype roster and FSM, FX recipes, world kit, and the
Director's pressure model with the objective substituted for the player.

---

## 18. Open questions

1. **Name.** BLINKFALL is a placeholder.
2. **Salvage currency name.** House law: creative, non-generic, all-ages.
3. **Are upgrades offered as cards at the FORGE, or found in the world?** Same open question as
   SERAPH FRAME's Alignments — worth answering once for both.
4. **Rally input.** Directional keys are the prototype's solution; a single-key timing press with
   a tighter window may read better in slow motion. Test both.
5. **How much does rank feed salvage?** Enough to matter, not enough to punish experimenting.
