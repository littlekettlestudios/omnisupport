# Natural motion reference for a 1 m chibi robot (procedural keys, 64 px / 8-12 fps sprites)

Conventions used throughout
- **H** = total height (1.0 m). Character: head ~0.45 H, torso ~0.22 H, hip height ~0.33 H (leg ≈ 0.33 H vs ~0.53 H in an adult).
- Angles are Blender bone rotations relative to the rest pose (A-pose arms are your rest; shoulder numbers below are from arms-down-at-side, so subtract your A-pose abduction). Flexion = forward/bend positive, extension negative. Knee flexion 0° = straight.
- "%" = percent of the cycle (walk/run) or of the clip (one-shots). At 12 fps one frame = 83 ms; at 8 fps = 125 ms.
- **Pixel-grid reality:** in a 64 px frame the robot is ~48-56 px tall, so **1 px ≈ 0.02 H**. Any translation below ~0.01 H either vanishes or flickers between 0 and 1 px ("pixel boil"). Key motions as either ≥1 px (≥0.02 H) or zero. Rotations of the big head read well (the screen face shifts several px for a few degrees); rotations of short limbs below ~8° mostly don't.
- **Scaling human data to chibi legs:** for the same dynamic similarity (Froude number), cadence scales with 1/sqrt(leg length) and stride with leg length. Adult leg 0.9 m vs robot 0.33 m gives cadence ×1.65 and stride ×0.37. That predicts ~180 steps/min for a walk, which matches real toddlers (~175-180 spm at 12 months vs ~110-120 adult; short steps, wide base, longer double support, arms held high early on: [UBC KIN366 gait](https://wiki.ubc.ca/Course:KIN366/ConceptLibrary/Gait), [CP Resource gait development](https://cpresource.org/node/339)). **Toddler gait is the best biomechanical model for this body.**

---

## 1. Walk cycle

Biomechanics reference: stance 60% / swing 40%, two double-support windows of ~10-12% each ([Physiopedia: Gait](https://www.physio-pedia.com/Gait); [Orthobullets gait cycle](https://orthobullets.com/foot-and-ankle/7001/gait-cycle); [OUHSC kinematics notes](https://ouhsc.edu/bserdac/dthompso/web/gait/knmatics/gait.htm)). The center of mass is **lowest in double support and highest at mid-stance**. Pelvic yaw is ~±4°, and pelvic obliquity is ~4-5° with the swing side dropping (Saunders/Inman determinants, same sources). Classic animation layout (Williams' *Survival Kit*): 12 frames per step at 24 fps for a natural walk, with contact / down (recoil) / passing / up ([Monmouth walk-cycle notes](https://animation.monmouth.edu/instruct/?p=351); [AnimSchool on "12s"](https://blog.animschool.edu/?p=588); [Adobe walk layout](https://www.adobe.com/in/creativecloud/roc/blog/video/animation-walk-cycle.html)).

**Phase table (right leg; left leg is the same +50%)**

| % | Pose (anim) | Gait event | Pelvis Z (×H, from mean) | R hip | R knee | R ankle | Notes |
|---|---|---|---|---|---|---|---|
| 0 | **Contact** | R heel strike, double support | -0.01 (falling) | +25..30 | 0..5 | 0 (toe up 5-10 in cartoon) | stride extremes, arms at max swing |
| 8-12 | **Down** | loading response | **-0.02 (lowest)** | +25 | **15..20** (peak) | -5..-8 (foot slaps flat) | "recoil": weight lands; arms just past extreme |
| 25 | **Passing** | mid-stance (L leg passes) | **+0.02 (highest, realistic)** | 0..+5 | 5 | +5..+10 (shin over foot) | L knee ~60 in swing, foot 0.03-0.05 H off ground |
| 37 | **Up** | terminal stance, heel rise | +0.01 (cartoon: highest here) | -10..-15 | 5..10 | -10..-15 (heel off) | push-off; Williams-style puts the peak here for "spring" |
| 50 | Contact (L) | R pre-swing | -0.01 | -10 | 35..40 | -15..-20 (toe-off at ~60%) | |
| 70-75 | (L passing) | R mid-swing | +0.02 | +20..30 | **60..65** (peak swing) | 0 (dorsiflexed to clear) | |
| 90-100 | (L up → R contact) | R terminal swing | | +30 | 5→0 | 0 | knee extends just before contact |

Knee and ankle numbers are the standard sagittal curves: loading flexion ~15°, swing peak ~60°, push-off plantarflexion 15-20° ([Physiopedia](https://www.physio-pedia.com/Gait); flashcard and exam sets in the search agree on 15°/60°).

**Other channels (sinusoids at the step or stride frequency)**

| Channel | Amplitude | Phase / timing |
|---|---|---|
| Pelvis vertical bob | human ±0.012 H; **key ±0.02-0.025 H (1-1.5 px each way)** | 2 cycles per stride. Min at Down (~10%), max at Passing (25%). Use a slightly cusped/triangular wave rather than a pure sine: fast drop into Down, rounder top ([Slynyrd Pixelblog 50](https://www.slynyrd.com/blog/2024/5/24/pixelblog-50-human-walk-cycle)) |
| Pelvis yaw | ±4° human; **±6-8° chibi** | 1/stride. Max forward rotation of the R hip at R contact (0%) |
| Pelvis roll (obliquity) | ±4-5° | swing side drops; max at R mid-stance (~25%: L side low) |
| Pelvis lateral shift | ±0.02 H human-scaled; **±0.025-0.03 H** (wide toddler base, reads as a waddle) | toward the stance foot, peak at mid-stance (25% toward R, 75% toward L) |
| Chest/spine yaw | **opposite** to pelvis, ±3-5° (spine bones split it ~40/60 lower/upper) | in antiphase with pelvis yaw |
| Chest roll | opposite to pelvis roll, ~50% of its amplitude | keeps the head level |
| Spine pitch | constant 3-5° forward lean, ±1-2° at 2/stride | slightly forward at Down |
| Shoulder (sagittal) | +20..25° forward / -10..-15° back (adult); **±25-30° chibi** (short arms need more to read) | **arm swings opposite its own-side leg**; R arm back at R contact. Peak lags the leg extreme by ~5-10% (1 frame at 8 fps) |
| Elbow | rest 15-20° flex, +15° more on the forward swing (elbow range ~30° in arm-swing studies: [Clin Shoulder Elb 2023](https://www.cisejournal.org/journal/view.php?number=923)) | elbow/hand lags the shoulder by 1 frame (drag) |
| Head | translation follows chest; **world pitch counter-rotates the bob by ±2-4°** (head pitches down as the body rises), yaw/roll ≈ 0 (cancel chest) | Head stabilization: pitch about 180° out of phase with vertical translation, total head rotation kept small ([Pozzo et al. 1990](https://www.doi.org/10.1007/BF00230842); [NASA review](https://ntrs.nasa.gov/api/citations/20080026154/downloads/20080026154.pdf)) |

**Timing.** Human ~110 spm (1.1 s stride). Chibi **150-180 spm → 0.67-0.8 s stride**. That is 8 frames at 10-12 fps (contact, down, passing, up × 2), or 6 frames at 8-9 fps (drop the Up pose). Stride ≈ 0.45-0.55 H (step ≈ 0.25 H) so the feet don't slide; derive the root speed as stride/cycle-time and check foot lock on the ground frames.

---

## 2. Run cycle

Running = each foot is in stance **<50%** of the cycle, with two flight ("double float") windows. Stance is about 39-40% at a jog, ~31% at a run and ~22% in a sprint ([Mann & Hagy 1980, PubMed 7416353](https://pubmed.ncbi.nlm.nih.gov/7416353/); [Novacheck 1998, Gait & Posture 7:77-95](https://doi.org/10.1016/S0966-6362(97)00038-6); [Podiatry Management review](https://www.podiatrym.com/pdf/2017/9/Kennedy917web.pdf)). Stance splits roughly half absorption, half propulsion. The **COM is lowest at mid-stance and highest mid-flight**, the inverse of the walk (spring-mass running).

| % | Pose | Pelvis Z | Stance hip | Stance knee | Stance ankle | Swing knee | Arms |
|---|---|---|---|---|---|---|---|
| 0 | **Contact** (foot under/just ahead of COM) | 0 (falling) | +30..35 | 15..20 | 0..+5 | ~90 (tucking) | opposite arm forward at max |
| 15-20 | **Down / mid-stance** | **-0.04..-0.05 H (lowest)** | +10 | **40..45** (peak) | +15..20 dorsi | **90-110** (heel near butt; sprint 125) | passing the hips |
| 35-40 | **Toe-off / push** | rising | -10..-15 | 20..25 | -20..-25 | thigh forward, hip +45..55 | arms at the other extreme |
| 40-50 | **Flight / up** | **+0.03..+0.04 H (highest)** | (both legs off; front thigh up, back leg trailing) | | | | |
| 50-100 | mirror | | | | | | |

**Global run settings**
- Trunk lean **+5..10° forward** at a jog (~6° in economical runners: [Running Magazine](https://runningmagazine.ca/health-nutrition/injuries-true-to-form/2/)), 15-20° in a sprint or cartoon dash. Head counter-pitches back up so the face stays level.
- **Elbows ~80-90°, fixed ±10°.** Shoulder swing ±30-40° (forward hand to chin height, back hand behind the hip). Mitten hands are loose fists. Arms drive slightly ahead of the legs in a run, so key arm extremes 0-1 frame **before** the leg extremes (walk is the opposite: arms lag).
- Pelvis yaw is *smaller* than in the walk (±3-5°) while the chest counter-rotation is *larger* (±8-10°). Lateral shift is tiny (±0.01 H). Drop it to zero in the side views.
- Vertical oscillation in humans is 6-9 cm ≈ 0.04-0.05 H ([RunnersConnect](https://runnersconnect.net/improve-your-vertical-oscillation-for-better-running-performance/)). **Key 0.06-0.08 H peak-to-peak (3-4 px)**: it's the single strongest "run" read in pixel art.
- Cadence: human 160-180 spm. Chibi physics predicts ~270+ spm, which is unreadable. Use **0.45-0.55 s per stride**: 6 frames at 12 fps (contact, down, push, flight × 2) or 8 frames at 14-16 fps. Celeste-style runs use 4-6 frames ([sprite-ai frames overview](https://www.sprite-ai.art/blog/sprite-animation-frames)).

---

## 3. Standing jump (countermovement jump)

Biomechanics: unweighting → braking (deepest point) → propulsion → takeoff. Arm swing adds ~10-13% height and *lengthens* the propulsion phase ([WKU IJESAB arm-swing CMJ](https://digitalcommons.wku.edu/ijesab/vol11/iss4/21); [SJSU arm-swing kinetics PDF](https://sjsu.edu/people/james.kao/courses/KIN147_Biomechanical_Assessment/Upper%20extremity%20augmentation%20of%20lower%20extremity%20kinetics%20during%20countermovement%20vertical%20jumps.pdf); [Vaverka et al. 2016 / PMC5260575](https://pmc.ncbi.nlm.nih.gov/articles/PMC5260575)). Self-selected depth is roughly 90° of knee flexion; going deeper doesn't add height ([UFSC squat-depth study](https://periodicos.ufsc.br/index.php/rbcdh/article/view/1980-0037.2014v16n6p658)). In humans the countermovement takes ~0.5 s and the propulsion ~0.25-0.3 s.

| Phase | Clip % | Frames @12 fps | Pelvis Z (×H) | Spine | Hip | Knee | Ankle | Shoulder | Elbow | Head |
|---|---|---|---|---|---|---|---|---|---|---|
| Ready | 0 | 0-1 | 0 | 0 | 0 | 0..5 | 0 | 0 | 15 | 0 |
| **Anticipation crouch** (ease-in, slow) | 0-30 | 3-4 | **-0.10..-0.13** (≈ 30-40% of leg length) | +25..35 fwd | +60..80 | **80..90** | +25..30 dorsi | **-40..-60 (arms swung back)** | 10..20 | world pitch +10 up (eyes on the target) or -5 down (gathering) |
| Hold at bottom | 30-35 | 0-1 | same | | | | | | | |
| **Takeoff / stretch** (fast, no ease) | 35-45 | 1-2 | +0.03 (toes still touching) | -5 (slight arch) | -5..-10 | 0 | **-35..-45 plantar (on toes)** | **+150..170 (arms up)**, arms lead the legs by ~1 frame | 0..10 | pitch up +10..15, lags 1 frame |
| Rise | 45-60 | 2-3 | to apex (+0.25..0.4 H for a cartoon hop) | 0 | +30 | 30..60 (begin tuck) | -20 | 120..150 | 30 | |
| **Apex tuck** | 60-70 | 1-2 (hold) | apex | +10 | +70..90 | 70..90 | -10 | 90..120 | 60..90 | head lags: still tilting up as the body tucks |
| Fall / prep | 70-85 | 2 | descending | 0 | +30 | 20..30 (reach down) | 0..-15 (toes reach) | 60..90 (arms out for balance) | 30 | |
| → Landing | 85-100 | see §4 | | | | | | | | |

- Ratio anticipation : takeoff : air : land ≈ **3 : 1 : 4-6 : 3-4**. Airtime is physics: t = 2·sqrt(2h/g). A 0.3 m hop = 0.49 s ≈ 6 frames at 12 fps. Keep the apex 1-2 frames longer than physics (the "hang time" cheat) and accelerate the fall (ease-in going down).
- The **takeoff frame is a stretch pose: the longest silhouette in the clip.** The anticipation frame is the shortest. That contrast *is* the squash and stretch on a rigid body.
- Overlap: the arms lead the takeoff, and the head and hands trail the root by 1 frame going up and by 1-2 frames when the body reverses at the apex.

---

## 4. Landing

Biomechanics: the initial impact phase is ~80-85 ms, with total absorption of ~150 ms (soft) to ~300 ms (stiff floor) ([ISBS 2005 landing study](https://ojs.ub.uni-konstanz.de/cpa/article/view/1011/924)). More hip, knee and ankle flexion means a lower peak force and a later peak ([Sports Biomech 2015, gymnast landings](https://lida.sport-iat.de/ta/Record/4035347?lng=en)).

| Phase | Clip % | Frames @12 fps | Pelvis Z | Spine | Hip | Knee | Ankle | Arms | Head |
|---|---|---|---|---|---|---|---|---|---|
| Pre-contact | 0 | 1 | -(falling) | 0 | +20..30 | 15..25 | -15 (toes first) | out/up 60-90 | level |
| **Contact** (linear in, **no ease**) | 10 | 1 | 0 | | | | | | |
| **Impact squash** (deepest) | 15-30 | **1 frame after contact** (cut, don't tween) | **-0.08..-0.12** | +25..35 | +50..70 | **60..90** | +20..30 dorsi | swing down/forward, shoulder 20..40 | **keeps going down 1 frame after the pelvis stops** (heavy head): extra pitch +10..15 down and -0.01..-0.02 H below the neck rest |
| Hold | 30-40 | 1 | same | | | | | hands bottom out | head bottoms out |
| Recovery rise (ease-out) | 40-70 | 2 | **overshoot +0.01..+0.02 H** above rest | -3 (slight back arch) | | 0..5 | | arms bounce up 10-15 past rest | head pitches up 3-5 past level |
| Settle (ease-in-out) | 70-100 | 2-3 | 0 | 0 | | 5 | | | level |

- A soft landing totals **4-6 frames (0.35-0.5 s)**. A heavy or high fall gets 1-2 more hold frames at the bottom, and you can add 2-4 frames of hit-stop (at 60 fps) or a 1-frame hold in the sprite.
- **Impact annotations** (2D convention; durations from community and commercial packs: [OpenGameArt spark, 9 f](https://opengameart.org/content/spark-effect), [itch dust particles, 7-9 f](https://weentermakesgames.itch.io/dust-cloud-pixel-art-particles), [Rivals of Aether dust FX](https://rivalsofaether.com/spawn_dust_fx/)):
  - **Dust puffs:** 2 small clouds at the feet, spawned on the contact frame, moving outward horizontally 0.1-0.2 H and slightly up while growing then shrinking or fading. **4-6 frames**. 3 frames for a small step, 6-8 for a heavy landing (add a ground ring in the front/back views).
  - **Impact star / burst:** 3-6 radial ticks or a 4-point star at the contact point, frame 1 at full size or a white flash, frames 2-3 decaying. **2-3 frames.** Use it only on heavy impacts, or the robot's head will clink.
  - **Speed lines:** 2-4 parallel lines trailing the motion, on frames where displacement > ~0.15 H per frame (dash, fall, takeoff). **1-3 frames**, never on held poses.
  - **Smear frames:** one stretched in-between on the fastest frame (takeoff, fist pump). This is the pixel-art substitute for motion blur.
  - FX sprites sit outside the 64 px character frame. Bake them on a separate layer or sheet so they don't clip.

---

## 5. Climbing / mantling a ledge

Game convention: grab-in → hang idle (loop) → mantle-up → stand. The mantle is authored as root motion so the capsule follows the arc, with IK on the hands so they don't float above or clip into the edge ([MoCap Online climbing guide](https://mocaponline.com/blogs/mocap-news/climbing-animation-games-guide); [GDC 2024 Pandora obstacle traversal](https://gdcvault.com/play/1034231/Obstacle-Traversal-in-the-Organic); [Spine forum on hitbox vs. visual offset](https://esotericsoftware.com/forum/d/10710)). A mantle in AAA games runs ~0.8-1.5 s.

**Chibi problem:** the shoulders sit at ~0.55 H and the arms are ~0.25 H long, so the hands reach only ~0.8 H, **lower than the top of the head**. A realistic hang-and-pull reads poorly. Use the **toddler-onto-a-sofa mantle**: a hop to get the hands and chest over the edge, a belly or chest flop, a knee up, then standing. The ledge should be ≤ 0.6-0.7 H.

| Phase | Clip % | Frames @10-12 fps | Root path (×H) | Key angles | Lead / lag |
|---|---|---|---|---|---|
| **Reach / hop** | 0-15 | 2 | crouch -0.05, then up +0.15..0.25 | arms up, shoulder +150..170, elbow 10..20; knees 40→0 | hands lead; head tilts up +15..20 to look at the edge *before* the arms move (1-2 frames) |
| **Grab** | 15-25 | 1-2 | small drop -0.02..-0.03 (weight catch), slight swing | elbows 20..30; legs dangle, knees 20..30 | legs swing forward 1 frame after the catch (pendulum) |
| **Pull** (slow start, ease-in) | 25-45 | 2-3 | vertical first: +0.15..0.2 | elbows 30→100..120, shoulders 150→60, spine +10..20; one knee up as a scramble | head/torso lag the hands, feet scrabble 1-2 frames out of sync |
| **Press over** | 45-60 | 2 | arc forward over the edge (+0.1 fwd, +0.05 up) | shoulders over the hands, elbows 120→20 (push down), spine +30..45 (chest on ledge) | the "hook" COM path: **up, then forward**. Never a diagonal straight line |
| **Knee up** | 60-80 | 2 | forward +0.1..0.15, slight dip | lead hip +100..120, knee 110..130, foot/knee onto the ledge; trailing leg hanging | lead leg leads, trailing leg follows 1-2 frames later |
| **Stand** (ease-out) | 80-100 | 2-3 | up to standing on the ledge, small overshoot +0.01 | spine 45→0, knees 60→5, arms down | head is the last to straighten (1 frame lag), mini settle |

---

## 6. Thinking (idle variant, 2-5 s, loopable hold)

- Gaze aversion is the strongest cue. People look away more while thinking than while listening, and more as the problem gets harder ([Doherty-Sneddon work, summarized at ScienceABC](https://www.scienceabc.com/humans/why-do-people-generally-look-up-when-theyre-searching-for-an-answer-to-something.html)). The direction is typically **up and to the side**. On the robot this is the face-screen eyes, plus the head following them.
- Hand-to-chin, head tilt and weight shift are animation-vocabulary staples rather than measured data. Treat the numbers as acting choices.

| Phase | Time | Body | Head | Arms |
|---|---|---|---|---|
| Entry (ease-in-out) | 0.3-0.5 s (3-5 f) | **weight onto one leg**: pelvis lateral 0.02-0.03 H, pelvis roll 3-5° (free hip drops), free knee 10-15°; spine lean 3-5° back or aside | eyes move **first**, then the head 1-2 frames later: yaw 10-20° aside, pitch +8..12 up, roll (tilt) 8-15° | **thinking hand**: shoulder flex 45-60°, adducted toward the midline, elbow 120-140°, mitten at the chin or lower screen edge. **Other arm** across the belly holding the elbow (shoulder 20°, elbow 90-100°) |
| Hold with life | 1.5-3 s | breathing: chest/shoulders ±0.005-0.01 H at a 3-4 s period (sub-pixel, so show it via shoulder rotation 1-2°, or skip it) | **re-tilt** to the other side or to center halfway through (8-12 f transition); 1-2 "glance" saccades (eyes jump in 1 frame, head follows over 3-4 frames) | **finger or mitten tap**: 2-frame flick every 0.5-0.8 s, irregular (2-3 taps, pause, 2 taps) |
| Exit | 0.3 s | → idle, or chain straight into the Exclamation clip (§7) | head snaps back to camera | |

- Never perfectly still. Never perfectly periodic. Offset the tap rhythm from the breath rhythm.

---

## 7. Exclamation / idea / success ("take" → pop → settle)

Built from the 12 principles: anticipation, squash/stretch, overshoot/follow-through and slow-in/slow-out ([Twelve basic principles](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation)). Joyful movement is faster and more upward ([Frontiers in Neuroscience 2022](https://www.frontiersin.org/articles/10.3389/fnins.2022.842433)).

| Phase | % | Frames @12 fps | Pelvis Z | Spine | Knees | Ankles | Shoulders / elbows | Head |
|---|---|---|---|---|---|---|---|---|
| Anticipation (ease-in) | 0-25 | 2-3 | -0.03..-0.05 | +10..15 fwd (curl) | 20..30 | +10 | arms down/back -15..-20, or fists drawn in at the chest (elbow 110) | pitch down -8..-12 (eyes closed/narrow) |
| **Pop** (no ease, 1 frame) | 25-35 | 1 | **+0.05..+0.10** (onto toes or a small hop, 1-3 f airborne) | -8..-12 (arched back) | 0 | -30..-40 (toes) | **arms up** +150..170 / elbows 10, *or* **fist pump**: one shoulder +100..130, elbow 90→40 in 1 f | **snap up** pitch +12..18; the head leads this one: it is the first part to pop |
| Overshoot | 35-50 | 1-2 | peak, or land of the hop | | | | arms 5-10° past the target, hands lag 1 f | +3..5 past the target, or a small wobble |
| Hold / sparkle | 50-75 | 2-4 | +0.02 | -5 | 5 | | arms hold; a fist pump can repeat (2 small pumps of 2 f each) | face shows the "!" or bulb FX here |
| Settle (ease-out) | 75-100 | 3-4 | 0 | 0 | 5 | 0 | down with a 1-frame lag per segment (shoulder→elbow→hand) | last to settle |

Ratio anticipation : action : settle ≈ **2-3 : 1 : 3-4**. The "!" FX appears on the pop frame, scales 120% → 100% over 2 frames, holds, then pops out in 1-2 frames.

---

## 8. Sad / failure (slump + sigh)

Sad and depressed gait: slower, shorter strides, **less arm swing, less vertical head motion, more lateral sway, slumped posture with the head flexed** ([Michalak et al. 2009, abstract at TUM](https://mediatum.ub.tum.de/977218); [Frontiers 2022](https://www.frontiersin.org/articles/10.3389/fnins.2022.842433)). Slowing any expression down biases it toward reading as sad. Sighs are breaths of at least 2-3× normal tidal volume ([Physiol Rep 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4673642)).

| Phase | Time | Spine | Neck/Head | Shoulders (clavicle) | Arms | Legs / root |
|---|---|---|---|---|---|---|
| Beat (failure registers) | 0.2-0.3 s hold (2-3 f) | 0 | small recoil up +3..5 | | | |
| **Sigh inhale** (ease-in-out) | 0.8-1.2 s | extend -3..-5 | lift +5..8 | **raise** 5-8° (shoulders up +0.01-0.015 H: 1 px) | slight lift | pelvis +0.01 |
| Top hold | 0.2-0.3 s | | | | | |
| **Exhale + slump** (slow ease-out, **2× normal timing**) | 1.2-2.0 s | thoracic flex **+15..25** | neck flex +15..20, head pitch total **-25..-40** down; may roll 5° | **depress** 8-10° and **protract** (forward) 10°: shoulders end *below* their start (overshoot down, then 0.5 s settle) | arms **hang**: shoulder 0..+5, elbow 5..10, hands in front of the thighs; hands lag the shoulders by 2 f | knees 5-10° soft, pelvis -0.02 H, slight pelvis tuck +5° |
| Sad idle loop | 2-4 s loop | breathing slower, 0.5-1° chest | occasional slow head shake: yaw ±10° over 1 s | | | lateral sway ±0.01 H at 0.3 Hz |

A sad walk variant uses stride ×0.7, cadence ×0.8, arm swing ×0.4, bob ×0.5, lateral sway ×1.5, spine +10, head -20.

---

## 9. Cross-cutting principles (procedural recipes)

**Offsets and overlap (successive breaking of joints).** Drive each child from its parent with a delay:
| Chain | Delay @12 fps | As cycle phase (walk) |
|---|---|---|
| pelvis → spine → chest | 0-1 f | 0-5% |
| chest → neck → **head (big, heavy)** | **1-2 f translation; 2-3 f for "settling" after stops** | 5-10% |
| chest → upper arm → forearm → mitten | 1 f per link (hand trails 2-3 f) | 5-15% |
| antennae / small dangling parts | 2-3 f | 15-25% |
A cheap method: implement follow-through as a damped spring on the child's rotation (ω ≈ 2π·2-3 Hz, damping ratio 0.4-0.6 for the head, 0.3 for dangling parts) baked into keys. Or bake a phase-shifted copy of the parent curve at 60-80% amplitude. David Rosen's Overgrowth work gets fluid motion from very few keys (walk/run at ~4 keys each) through interpolation, plus procedural layering of spring physics, IK and overlap ([GDC 2014 "An Indie Approach to Procedural Animation"](https://gamedeveloper.com/design/video-an-indie-approach-to-procedural-animation); [TAMU reimplementation notes](https://people.engr.tamu.edu/sueda/courses/CSC474/2016W/demos/ismithgr/index.html)). That is directly applicable here.

**Ease rules**
- Ease in/out on holds, gestures, direction reversals (the apex of an arm swing) and settles.
- **Don't ease into contacts and impacts**: go linear or accelerating into the contact, then cut to the squash pose. Ease *out* of the squash only.
- Falls ease in (accelerate). Rises ease out (decelerate to the apex).
- Cycles: auto-clamped Bezier is fine, but shape the bob. **Walk** = sharp valley at Down (the heel-strike collision) and a rounded peak at Passing (the inverted pendulum vaulting over the stance leg). **Run** = rounded valley at mid-stance (spring compression) and a parabolic peak in flight (ballistic), so the pelvis Z should look like a bouncing ball, not a sine.

**Arcs.** Hands, head-top and feet trace arcs. Check them with motion paths in the side view. Linear IK interpolation between two hand targets produces robotic straight lines, so add a mid-key or animate in FK for gestures.

**Asymmetry.** For one-shots and idles, never mirror: vary left/right amplitude by 10-20%, offset by 1 frame, and tilt the head off-axis 3-5°. For locomotion, mirrored cycles are fine, but keep a constant 1-2° head roll or a different elbow bend per side so it doesn't look stamped.

**Squash & stretch on a rigid robot.** Don't deform the armour or glass. Fake it with: (1) pose silhouette, crouched vs. fully extended on toes; (2) joint compression, where knees and hips do the squash; (3) neck "telescoping", head bone translation ±0.01-0.02 H (1 px); (4) at most 3-5% non-uniform head scale on a single impact frame, if the style tolerates it; (5) smear frames and speed lines.

**Chibi adjustments**
- **Big head = big inertia.** Give the head the longest lag (2-3 frames), the smallest pre-motion, and an overshoot plus 1 wobble on every stop. Keep it rotationally stabilized in locomotion (world pitch ±2-4°, near-zero roll and yaw), because rotations of a 0.45 H head read hugely.
- **Short legs = higher cadence, smaller stride, wider base.** Increase lateral waddle and pelvis roll. Exaggerate knee flex (the knees barely show otherwise), and raise the passing foot 1-2 px so the step reads.
- **Short arms:** exaggerate shoulder swing ~1.3×. Arm gestures above the head are impossible, so stage "arms up" as V-shaped arms beside the head.
- **8-direction views:** front and back views lose sagittal swing. Compensate with vertical bob, lateral sway, pelvis roll and arms swinging slightly *inward* across the body (+5-10° adduction on the forward swing). Snap the root to whole pixels per direction to avoid jitter.

---

## 10. Frame budgets (pixel-art norms at 8-12 fps)

| Action | Typical frames | Notes |
|---|---|---|
| Idle / breathe | 4-8 @ 6-8 fps | 1-px chest/head rise. Hold the end frames longer |
| Walk | **6-8** (4 minimum) | 8 = contact, down, passing, up ×2 ([Slynyrd](https://www.slynyrd.com/blog/2024/5/24/pixelblog-50-human-walk-cycle); Shovel Knight 6, Hollow Knight 8 per [sprite-ai](https://www.sprite-ai.art/blog/sprite-animation-frames), unverified) |
| Run | **6** (4-8) | contact, down, push, flight ×2; Celeste ~4 |
| Jump | 6-10 total, split into states | anticipation 1-3, takeoff 1, rise 1-2, apex 1-2, fall 1-2 (loopable), land 2-4 |
| Landing | 3-5 | squash on the first frame after contact |
| Mantle / climb-up | 8-12 | + 2-4 frame hang loop |
| Thinking | 8-16 loop + 3-5 entry | variable frame durations (hold frames 2-4× longer) |
| Exclamation | 6-10 | 1-frame pop |
| Sad | 10-16 + 4-8 loop | runs at the low fps end on purpose |
| Dust 4-6, impact star 2-3, speed lines 1-3 | | separate FX layer |

**Variable timing beats more frames.** Hold key poses 2 ticks and in-betweens 1 tick. Even spacing reads as robotic ([sprite-ai](https://www.sprite-ai.art/blog/sprite-animation-frames)). When baking from Blender, set the keys so the extreme poses land exactly on rendered frames (sample at the target fps, not 24/30 then decimate), so no extreme gets skipped.
