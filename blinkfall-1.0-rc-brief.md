# BLINKFALL — 1.0 RELEASE CANDIDATE BRIEF

The production plan from v0.2 to a shippable game. Companion to `blinkfall-gdd-v2.2.1.md` +
`blinkfall-gdd-v2.3-patch.md`.

**Target:** $19.99 premium desktop SKU with a free browser demo.

**This brief is frozen.** Changes from here wait for playtest or harness evidence, not another
planning cycle. Next action is v0.3.

---

## 0. What RC means

> BLINKFALL 1.0 RC is reached when a player can buy the game, learn it without documentation,
> clear four sectors against eight bosses on any of ten difficulty tiers with eight reactors and
> fifty-four behavioural upgrades, unlock AFTERFALL, chase a daily seed on a leaderboard, play it
> on a controller with the accessibility options they need, hear an original score that reacts to
> what they're doing, and reach the end of it having been told a story — and nothing in that
> sentence is stubbed, placeholder, or "coming in 1.1."

**Content completeness and feature completeness are both required.** A build with every system
working and half the roster is not an RC. Neither is a full roster with no leaderboard.

---

## 1. Where we are

**Built and verified (v0.1 Alpha + v0.2 Ceiling Pass):**

Sovereign arc · pressure model · pilot model · determinism across seven RNG streams · sector
lifecycle with two-sector residency · Perfect Vanish, Rally, Reverse Rally · Exposed · six
encounter states · 24 encounter variants · five archetypes + RELAY · SEVERANCE + GRAVEMARK ·
VECTOR + MIRRORWORK · 12 upgrades + corrupted ecosystem · 4 weapon evolutions · FORGE · scoring
and rank · discipline classifier · FALL ladder (retuning) · accessibility suite · onboarding ·
profiling instrument.

**The foundational engineering is largely proven. The content layer is roughly a fifth built. The
product layer does not exist.**

Resist reading v0.3–v0.5 as data entry. Premium content generates engine work, and several items
below will certainly do so: ANVIL PRIME and THE UNDERSIDE as multi-part destructible war machines,
CONTRAIL's trail-as-geometry, PHASE's intangibility, tier-2 weapon evolutions, AFTERFALL mixing
encounter laws the campaign generator would reject, and server-side replay validation. Percentages
imply the remaining work is known in kind. It isn't.

---

## 2. The 1.0 content manifest

Every roster item named, so no phase begins with a design question.

### 2.1 Enemy archetypes — 11

Each archetype exists to pose a **distinct spatial problem**. Never add one to raise a count.

| Archetype | Spatial problem | HP | Impact max | Band | Speed | Status |
|---|---|---|---|---|---|---|
| LANCER | long-axis pressure | 3,400 | 620 | 95–175 | 44 | built |
| BRAWLER | collapses distance | 4,200 | 820 | 14–52 | 66 | built |
| SENTRY | anchors a zone | 5,200 | 1,050 | 55–120 | 36 | built |
| HARRIER | vertical pressure | 2,600 | 480 | 40–90 | 82 | built |
| WARDEN | blocks frontal resolution | 7,800 | 1,900 | 30–70 | 28 | built |
| RELAY | must be isolated to matter | 1,800 | 400 | 50–100 | 46 | built (GRAVEMARK) |
| **SPLITTER** | forces target switching | 3,000 | 700 | 60–110 | 52 | v0.3 |
| **HOOK** | alters your trajectory | 3,600 | 900 | 25–70 | 58 | v0.3 |
| **JAMMER** | degrades information | 2,800 | 560 | 110–190 | 40 | v0.4 |
| **DRAGOON** | shares your movement language | 4,000 | 1,100 | 20–140 | 96 | v0.4 |
| **ARCHITECT** | changes the arena | 6,400 | 1,600 | 90–160 | 30 | v0.5 |

**SPLITTER** — on stagger, splits into two shards at 1,200 structure each, each holding its own
bearing. A single hostile becomes two bearings, widening the arc as a *consequence of your own
success*. Attacks: volley, scatter (0.85 windup / 0.70 recovery / 18 radius / 240 dmg / 200 impact).

**HOOK** — fires a harpoon that pulls the player 30m toward it. The one enemy that moves *you*,
which means it can drag you into the middle of a formation you had just escaped. Attacks: harpoon
(1.20 / 0.95 / 11 / 180 dmg / 240 impact), sweep.

**JAMMER** — static burst degrades HUD readouts within 60m for 4.0s: hostile impact bars, Sensor
Bloom reveals, and target-list detail. **Lock acquisition, cycling, and hard lock all continue to
function, and ground telegraph rings always render at full contrast.** Information, never
capability — the Director Law applies to enemy design too. Attacks: volley, static burst
(1.00 / 0.80 / 60 / 90 dmg / 60 impact).

**DRAGOON** — a rival frame with your movement vocabulary: boost skating, quick boost, and the
ability to **Perfect Vanish your attacks**, leaving you Exposed. Variable band. The archetype that
makes ordinary encounters feel like duels. Attacks: boost-strike (0.65 / 0.90 / 16 / 420 dmg /
280 impact), lance.

> **Counter-readability contract — the inverse of the player's own.** A DRAGOON may only Perfect
> Vanish an attack whose commitment is visibly readable to the player, and it must enter a
> **Vanish-ready state with its own pre-read** — a lock flare and stance change held for at least
> 0.45s before the window opens.
>
> Without this it becomes *"sometimes the AI dodges me and I get punished."* With it, it becomes a
> mind game: you can see it waiting, and you choose whether to commit, bait, or reposition. The
> player's vanish is fair because attacks telegraph. The enemy's must be fair for the same reason.

**ARCHITECT** — deploys temporary cover pillars that block firing lines and reshape the arena
mid-encounter. Turns a solved formation into an unsolved one without adding a single hostile.
Attacks: pillar deploy (1.40 / 1.10 / 20 / 0 dmg / 0 impact), mortar.

**Elite variants.** Any archetype can spawn Elite from FALL VII. Elites **retain the base
archetype's structure and impact max** — they gain one additional attack drawn from a compatible
archetype's table, more aggressive movement and entry behaviour, and a distinct silhouette accent.
Not a separate roster, a modifier.

**Difficulty raises their frequency, never their health.** A 60%-healthier LANCER at FALL VII is
HP inflation wearing a modifier's clothing, and it is exactly what non-negotiable 7 exists to
prevent — from the player's seat it does not matter whether the number lives on the archetype or
on a spawn flag.

Where an elite needs to be harder to kill, give it a **breakable armour plate** that changes how
you engage rather than how long you shoot: the plate absorbs frontal damage until broken, and it
breaks to a Perfect Vanish punish, a pile driver from above, or Breach Driver / Hullbreaker. That
is gameplay, and it gives the Breach branch a standing reason to exist.

**Station-born mutations (Sector 4).** Not five new archetypes — **one modifier system** applied
to the existing roster. FALLEN LANCER, FALLEN BRAWLER, and so on: same core attack identity and
stat lines, with altered locomotion, abandoned band discipline, distorted telegraph presentation,
geometry interaction, and abnormal entry vectors.

> **They remain fully subject to the sovereign arc and the attack-token budget.** A station-born
> hostile may use a Sector 4–specific token release cooldown minimum, but it **never attacks
> without a token**. The station becomes lawless. The combat contract does not.

Sector 4 is where Law II matters most, not where it stops applying. This is the descent's payoff
and it costs one modifier system — do not let it become a debt of five new enemies.

### 2.2 Bosses — 8, two per sector, seed picks one

| Sector | Boss | Class | Structure | Status |
|---|---|---|---|---|
| 1 EXTERIOR | SEVERANCE | ACE | 22,000 | built |
| 1 EXTERIOR | GRAVEMARK | FORMATION | 26,000 | built |
| 2 MANUFACTURE | CHORUS | FORMATION | 34,000 | v0.3 |
| 2 MANUFACTURE | **KILNWORKS** | WAR MACHINE | 44,000 | v0.3 |
| 3 MILITARY CORE | ANVIL PRIME | WAR MACHINE | 68,000 | v0.4 |
| 3 MILITARY CORE | **COLDIRON** | ACE | 40,000 | v0.4 |
| 4 BLINKFALL | THE LAST FRAME | ACE | 48,000 | v0.5 |
| 4 BLINKFALL | **THE UNDERSIDE** | WAR MACHINE | 72,000 | v0.5 |

Every sector offers two different **classes**, so the exam changes with the seed, not just the
model.

**KILNWORKS** — the foundry line is the boss. You fight along a continuously moving casting
line: sever four feed arms, ride the line inward against its travel, disable the pour. The arena
translates for the entire fight, so no position is holdable and rotation must be continuous.
Three phases.

**COLDIRON** — a decorated military ace that fights **inside the same token economy you do**.
There is one Director and one attack budget: COLDIRON and its three-hostile escort participate in
the sovereign allocation together, and **COLDIRON receives no privileged aggression slot**.

Keep the formation collapsed in front of you and the boss simply cannot get a token — the escort
absorbs the budget. Let them spread around you and the budget widens, and COLDIRON earns
opportunities you gave it. The boss demonstrates the thesis rather than being an exception to it.
Two phases.

**THE UNDERSIDE** — fought during continuous free-fall down the station's inverted underbelly.
No ground plane, so the entire ground-telegraph contract inverts: threats read on the *hull
surface* beside you. Structure that has been passing overhead all of Sector 4 turns out to be the
thing you are fighting. Three phases.

**Production note.** GRAVEMARK took roughly eight substantive iterations, several of them real
design bugs. Budget alternate bosses at boss-and-a-half cost, and treat the first hour of
KILNWORKS as a re-test of that estimate before committing to the remaining four.

### 2.3 Reactors — 8

| Reactor | Identity | Status |
|---|---|---|
| VECTOR | baseline, the teaching chassis | built |
| MIRRORWORK | 2.0s vanish clone · vanish 12 EN · 7,200 structure | built |
| NULLPOINT | ground regen 0 · airborne 48 · pile driver 2.0s | v0.3 |
| BREAKER | speed 37 · 11,500 structure · blade impact 520 · impact never decays | v0.3 |
| CONTRAIL | trail as solid geometry · closed loops halve speed inside · self-intersection detonates | v0.4 |
| **REDLINE** | EN becomes heat. Exceed 100 up to 140 for +40% output on every verb; above 100 heat accumulates and a full bar forces a 3.0s shutdown | v0.4 |
| **PHASE** | Perfect Vanish makes you intangible in place for 0.40s instead of blinking. Same window, same Exposed grant — the spatial consequence inverts. Attacks pass through you and continue into whatever is behind | v0.5 |
| **LATTICE** | Each held lock beyond the first draws a conduit between targets: 90 dmg + 40 impact per second to anything crossing the line. Starts with Split Lock | v0.5 |

Reactors are the highest-ROI replayability lever in the project — eight piloting philosophies
without authoring eight characters. CONTRAIL remains the highest-variance and gets the most
tuning time.

### 2.4 Upgrades — 54

30 specced in the GDD (12 built) · **16 new across the four verbs** · **8 PROTOTYPE**.

Per-verb totals at 1.0: BOOST 12 · VANISH 12 · LOCK 11 · STAGGER 11 = **46**, plus 8 PROTOTYPE =
**54**. The GDD's existing 30 break down as BOOST 8 · VANISH 9 · LOCK 6 · STAGGER 7, so the 16 new
are BOOST +4 · VANISH +3 · LOCK +5 · STAGGER +4. Every new upgrade obeys Law III and carries exact
values on its card.

**PROTOTYPE — cross-verb, rare, at most one offered per sector.** These are the run-defining
pulls, and they are the reason a fiftieth run can still surprise.

| Upgrade | Effect |
|---|---|
| **Recursion** | Perfect Vanish also triggers your most recently used STAGGER upgrade effect at the attacker's position |
| **Conduit Frame** | Each held lock beyond the first siphons **4 EN/sec** to you. Once **25 EN** has been siphoned from a target, its **next boost action is cancelled** and that target's counter resets |
| **Displacement Engine** | Quick Boost distance **+60%**, but you always arrive facing the nearest hostile — even when that is the wrong way |
| **Terminal Read** | The first attack of every encounter is **auto-Perfect-Vanished**, bullet time and Exposed included |
| **Weightless** | Vertical thrust costs **0 EN** while any hostile is staggered |
| **Sympathetic Fault** | Impact dealt to a locked target mirrors at **25%** onto the hostile nearest it |
| **Momentum Ledger** | Damage taken is **stored, not applied** — it lands 3.0s later, and is cancelled entirely by a Perfect Vanish inside that window |
| **Hollow Core** | Structure capped at **3,000**. All impact you deal **doubled** |

**Presentation.** A PROTOTYPE offer must not read as another orange card. The FORGE changes — an
alarm, a mechanical arm bringing out something it was not supposed to, and a comm line from the
voice that has been talking to you all descent: *"That component isn't registered."* These should
feel slightly illicit. It is the one place the narrative layer and a mechanic reinforce each other
for free, and it is why PROTOTYPE offers are memorable rather than merely strong.

**Design dependency, decided.** Conduit Frame originally read "targets at 0 EN cannot boost,"
which quietly assumed hostiles carry a persistent energy pool with regeneration. They do not, and
one upgrade should not introduce an entire hostile resource system. The siphon-counter form above
uses only a per-target accumulator and an existing hostile action, so it costs nothing
architecturally. **Hostiles have no EN pool at 1.0.** If a future system genuinely wants one, that
is a deliberate decision made on its own merits, not a side effect of an upgrade card.

### 2.5 Weapon evolutions — 24

12 tier-1 (4 built, 8 specced) plus **12 tier-2**, one per branch, chosen at a later FORGE.

| Tier 1 | Tier 2 |
|---|---|
| Phase Blade | **Voidedge** — passes through terrain, hits every hostile along the line |
| Tether Blade | **Anchor Line** — tether persists 4.0s; you orbit at held distance |
| Execution Blade | **Guillotine** — outright kills any staggered hostile below 25% structure |
| Ricochet Rifle | **Prism Rifle** — up to 4 bounces, +20% damage per bounce |
| Lock-Splitting Rifle | **Constellation Array** — locked targets link; damage to one arcs to all at 30% |
| Momentum Railgun | **Mass Driver** — charge scales with distance travelled while charging |
| Orbiting Interceptors | **Aegis Ring** — 8 orbit, and they body-block melee |
| Mine Lattice | **Minefield Protocol** — mines chain-detonate, each blast arming the next |
| Swarm Lock | **Hivelock** — the swarm re-targets on kill; no missile is ever wasted |
| Seismic Driver | **Fault Hammer** — the shockwave fractures terrain into a persistent hazard |
| Anchor Driver | **Gravemaker** — the pinned target pulls nearby hostiles into the pin |
| Breach Driver | **Hullbreaker** — plate destruction also deals 40% of the target's impact max |

### 2.6 Encounter grammar and chains

**8 states** — the six built plus **OBJECTIVE** and **COLOSSUS**.

**32 configurations** — 24 built plus four each for OBJECTIVE and COLOSSUS:

**OBJECTIVE** — Defend (hold a point through waves) · Assassinate (one marked target inside a
formation) · Intercept (stop transports crossing the volume) · Escort (a moving asset that
dictates your position)

**COLOSSUS** — Ascent (climb a static war machine under fire) · Broadside (fight alongside a
moving machine that hazards the space) · Interior (fight inside one; geometry is the arena) ·
Collapse (it is dying, and taking the arena with it)

**44 authored chains — 11 per sector:**

| Type | Per sector |
|---|---|
| Standard | 7 |
| Rare | 2 |
| Reactor-specific variant | 1 |
| Secret / event | 1 |

Reactor-specific chains only appear when running that reactor and are built around its identity —
a CONTRAIL chain with geometry that rewards closed loops, a REDLINE chain with no EN pickups.
Secret chains require a condition to reach: an S rank on the previous encounter, a specific
PROTOTYPE upgrade held, an untouched structure bar.

**Chain laws are unchanged.** Law 2 continues to operate on the state, not the variant.

### 2.7 Difficulty — FALL I to FALL X

Retuned in v0.2 on composition ceiling, reinforcement pacing and wave count. Each tier unlocked
by clearing the previous.

Every tier must clear the harness gate: 50 seeded runs, monotonic clear-rate decline, every
adjacent pair separating on ≥2 metrics. **The measured table ships alongside the tier list** so
the ladder is self-justifying.

Damage, structure, and the arc thresholds are identical at FALL I and FALL X. Permanently.

---

## 3. Release-only systems

None of these exist yet. All are required for RC.

### 3.1 AFTERFALL — the postgame

Unlocked by defeating a Sector 4 boss.

The station has fallen and its four sets of laws mix. Chains draw from all four sectors. Sector
geometries cross-contaminate. Bosses invade ordinary chains as elites. Corruption frequency
climbs continuously. Encounter configurations combine in ways the campaign generator would reject.
Gravity shifts. You descend until the frame dies.

Difficulty escalates on a continuous curve rather than tiers, using only legal Director and
composition pressure — the arc law holds in AFTERFALL exactly as it does in FALL I.

This is where the ladder, the leaderboards and mastery converge. It is the answer to *"I beat the
game, now I play BLINKFALL."*

### 3.2 Modes

**Boss Rush** — all eight in sequence, one build carried through, seeded order.
**Training** — any encounter configuration, any composition, any FALL tier, on demand, with the
debug readouts exposed. The tuning panel, made player-facing.
**Daily Fall** — one global seed per day, one attempt, leaderboard.
**Weekly Fall** — one seed per week, unlimited attempts, best run scored.
**Custom Fall** — seed, reactor, boss pool, composition ceiling, Director behaviours, sector,
corruption level. The systems as a toybox.

### 3.3 Leaderboards

Supabase, the same stack shipped in Signal. Daily, weekly, AFTERFALL depth, and per-reactor
boards.

**Segmented by `RunState.assists{}`** — written since v0.2 precisely so this is possible without
retrofitting. Assisted runs are ranked, and ranked separately. No one is excluded and no board is
diluted.

**Canonical replay verification.** The Alpha's bit-identical trace was measured in one container.
Bit identity is not promised across GPUs, operating systems, browsers, Tauri WebView versions,
floating-point implementations, or frame timing, and a release plan must not assume it.

Verification instead runs **against a fixed canonical simulation build**, checking behavioural
equivalence plus score-critical events. Every submission carries:

```
game version · simulation version · seed · reactor · assists{}
input replay · final score and per-metric breakdown · integrity hash
```

The server replays against the canonical build for that version and accepts on equivalence.

**Boards are version-scoped.** A balance patch that changes simulation behaviour forks the board
rather than silently invalidating history. Daily and Weekly seeds carry the version they were
issued under.

### 3.4 Meta progression

Unlocks **possibility**, never power. Salvage buys: reactors · upgrade pool entries · weapon
evolution branches · challenge modifiers · procedural mech part sets · FX palettes · HUD styles ·
alternate combat mixes, bonus stems, boss-theme variants, menu themes, and a jukebox.

**The core adaptive score is never gated.** A first-time player hears the finished music. Locking
stems behind salvage would mean deliberately shipping a weaker version of the project's strongest
non-code asset to the exact players deciding whether to keep going. Supplementary audio unlocks;
the score itself does not.

Never a starting stat. The player gets stronger by understanding BLINKFALL better.

### 3.5 Narrative

Restrained. **Combat is movement; story is stillness.** The FORGE is the only place the machine
stops, which makes it the only place dialogue lives.

A single voice on comms, degrading as you descend — clean in Sector 1, breaking up by Sector 3,
something else entirely by Sector 4. Roughly 8–12 FORGE exchanges per sector, drawn by run count
and progress so the fiction advances across runs rather than within one. Two endings: clearing
Sector 4, and whatever AFTERFALL's depth reveals.

Not Hades volume. Hades *syntax*, at a tenth the word count.

### 3.6 Original score

Written and produced in-house — a differentiator most solo competitors cannot execute.

Reactive by construction: percussion drops at the FORGE because the FORGE is stillness, the bus
already filters under bullet time, and intensity tracks encirclement arc and encounter state.
Per-sector palettes. Boss themes for all eight. **The full adaptive score is authored and audible
from the first run** — meta progression unlocks alternate mixes, bonus stems and a jukebox, never
the score itself.

### 3.7 Platform

Desktop wrapper (Tauri preferred — smaller footprint than Electron). Steam: achievements, cloud
saves, store page, trailer, screenshots.

**Steam Deck.** The internal gate is **compatibility criteria met on Deck hardware** —
controller-only boot-to-credits with no keyboard requirement, correct default resolution,
suspend/resume, and readable text at handheld distance. *Deck Verified* is a classification Valve
awards; it is pursued after the internal gate passes and cannot be a production gate of our own.

**Free browser demo: Sector 1, FALL I–III, two reactors.** The frictionless shareable asset, and
it is already 90% built.

Known, boring, schedulable work. It does not belong in a content phase.

---

## 4. Non-negotiables

All prior non-negotiables carry forward unchanged: sovereign arc · Law III · exact values on every
card · no authored meshes · no `Math.random()` in simulation · scope completeness · difficulty
never touches damage, structure or arc thresholds · assists always recorded ·
measured-not-asserted difficulty · PASS/FAIL/BLOCKED reporting.

**One addition, and it is the most important rule in this document:**

**10. Every phase requires human playtest sign-off, not only harness gates.**

Harnesses prove *solvability and separation*. They cannot measure whether something is enjoyable.
GRAVEMARK passing 6/6 on a rotate policy proves the mechanic is solvable by rotation; it says
nothing about whether fighting it is satisfying. No phase closes on green harness results alone.

---

## 5. Production phases

### v0.3 — SECTOR 2
Sector 2 world and palette · CHORUS · KILNWORKS · OBJECTIVE state + 4 configurations · SPLITTER ·
HOOK · NULLPOINT · BREAKER · upgrades to 30 · weapon evolution tier-1 completion (12) ·
11 Sector 2 chains.

**Plus a narrative syntax probe.** Not the writing — just enough to find out whether dialogue
during stillness actually works: an opening comm, 3–5 FORGE exchanges, a boss intro, and a
sector-clear line. Test the expensive assumption before writing forty scenes. One sector palette
of music lands here too, for the same reason.

**Gates:** harness green on all prior · KILNWORKS class distinction demonstrated · sector
lifecycle proven across two *different* sectors · **playtest: is Sector 2 distinguishable from
Sector 1 in more than palette, and does dialogue at the FORGE land or intrude?**

### v0.4 — SECTOR 3
Sector 3 · ANVIL PRIME · COLDIRON · COLOSSUS state + 4 configurations · JAMMER · DRAGOON ·
CONTRAIL · REDLINE · upgrades to 42 · 11 Sector 3 chains.
**Gates:** three-sector run holds residency and frame budget · JAMMER never disables a verb ·
DRAGOON's vanish is readable and counterable · **playtest: does a 25-minute run sustain attention?**

### v0.5 — SECTOR 4 AND THE END
Sector 4 · station-born variants · THE LAST FRAME · THE UNDERSIDE · ARCHITECT · PHASE · LATTICE ·
upgrades to 54 including all 8 PROTOTYPE · weapon evolution tier-2 (24 total) · 11 Sector 4
chains · campaign ending.
**Gates:** full four-sector run completable · residency and budget hold · THE LAST FRAME equips
correctly from any of 54 upgrades · **playtest: does finishing feel like finishing?**

### v0.6 — AFTERFALL AND MODES
AFTERFALL · Boss Rush · Training · Custom Fall · meta progression · rare/reactor/secret chains
(44 total).
**Gates:** AFTERFALL escalates on legal pressure only · meta grants no stat power · **playtest:
does AFTERFALL sustain a session after the campaign is beaten?**

### v0.7 — PRESENTATION
Original score, all sectors and eight boss themes · narrative FORGE beats and two endings ·
boss introductions · stagger ceremonies · rally camera choreography · environmental deformation ·
UI typography pass · FX Lab recipe routing.
**Gates:** a trailer cut from real footage · **playtest: does someone watching ask whether it's a
browser game?**

### v0.8 — PLATFORM
Tauri wrapper · Steam integration · leaderboards with canonical replay verification and assist
segmentation · Daily and Weekly Fall · browser demo build · cloud saves · Deck compatibility ·
store page.
**Gates:** the server-side verifier rejects a tampered replay against the canonical build · demo
is standalone and complete · Deck compatibility criteria met on hardware (controller-only
boot-to-credits, no keyboard requirement, suspend/resume, readable at handheld distance) · Valve
verification submitted.

### v0.9 — BALANCE AND CONTENT LOCK
Full harness sweep across all tiers, reactors and bosses · discipline classifier across the full
54 · accessibility audit · localisation-ready string extraction · content locked.
**Gates:** every FALL tier separates · every reactor reaches a named discipline · every boss has at
least one approved scripted policy that clears it on FALL X across the required seeded harness
sample · **external playtest, not just yours.**

### RC — LOCK
Bug fix only. No new content, no new systems. Ship candidate.

---

## 6. Risks worth naming now

**Alternate boss cost.** GRAVEMARK took eight substantive iterations. If that is the true cost,
four more alternates is a phase and a half, not a week. Re-estimate against KILNWORKS before
committing to COLDIRON and THE UNDERSIDE.

**GPU budget is still unmeasured.** FALL X hits 522 draw calls under SwiftShader. Every content
decision above assumes headroom nobody has observed on real hardware. `npm run profile --
--headful` remains the cheapest unblocking action available.

**The score is the long pole.** Eight boss themes, four sector palettes, and a reactive mix is
months of music work, and it is the one item that cannot be delegated to Claude Code. One sector
palette lands in v0.3 as a syntax probe; sustained writing starts in v0.4, not v0.7.

**Content will generate engineering.** Treating v0.3–v0.5 as content production is the scheduling
error most likely to blow the plan. Multi-part destructible war machines, CONTRAIL geometry, PHASE
intangibility, tier-2 evolutions, AFTERFALL law-mixing and replay validation are all engine work
wearing content clothing.

**Nothing has been verified by a human yet.** The content phases multiply whatever the combat
currently feels like — by four sectors, eight bosses, and fifty-four upgrades. One evening of
playtesting before v0.3 is the highest-leverage hour in this entire document.
