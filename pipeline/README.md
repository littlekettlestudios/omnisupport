# Character pipeline: LKF → Mixamo → clippet.glb

Three steps. The first and last are scripts here; the middle one is Mixamo in a browser.
Blender 4.2+ on `PATH` (tested with 5.2).

## 1. Rebuild the LKF output as a clean low-poly mesh

```bash
blender -b --factory-startup -P pipeline/decimate.py -- \
  --input ~/Desktop/GameDev/LKF/output/<name>/blender/character.glb \
  --out build/mixamo/clippet_lowpoly.fbx \
  --glb assets/placeholder.glb --target-tris 15000
```

The LKF GLB is not a surface: it is ~26,000 unwelded triangle patches (820k triangles on
the sprout farmer). A plain decimation of that looks shattered and skins badly. The
script therefore thickens every patch into a slab (Solidify), voxel-remeshes the union
into one closed skin, keeps only the outer shell, collapses it to ~15k evenly sized
triangles, smooths, unwraps, and bakes the original base colour onto a new 2048 texture.
About 10 s on an M1 Max. The report JSON next to the FBX lists shell counts and bake
time. `--voxel` (default 6 mm) trades detail for cleanliness; `--no-remesh` is the old
straight collapse that keeps the original UVs.

The `--glb` copy is the static placeholder the Clippet renderer uses until the rigged
model exists (`--target-tris 8000 --bake-size 1024` makes a 2 MB one that is fine to
commit). Fused parts in the source art (a hand in a pocket, a pot against the chest) stay
fused; draw them apart in the source.

## 2. Rig and animate on Mixamo

1. Open mixamo.com (free Adobe account), **Upload character**, choose the FBX from step 1.
2. Auto-rigger: place the markers on chin, wrists, elbows, knees and groin. For chibi
   proportions put the elbow markers where the arm actually bends, even if that is close
   to the wrist. Skeleton LOD: **Standard** (65 bones). Check the turntable for popping.
3. Download the character: Format **FBX Binary**, Pose **T-pose**, Skin **With Skin**.
   Save as `build/mixamo/clippet_rigged.fbx`.
4. For each clip below, search it, tweak the sliders, then download with Format
   **FBX Binary**, Skin **Without Skin**, Frames per second 30, Keyframe reduction none.
   Save into `build/mixamo/clips/` under the protocol name:

| save as | Mixamo search | notes |
|---|---|---|
| `idle.fbx` | Idle, Happy Idle, Breathing Idle | tick **In Place** |
| `attentive.fbx` | Looking Around, Idle (alert) | In Place |
| `thinking.fbx` | Thinking | In Place |
| `searching.fbx` | Looking Around | In Place |
| `talking.fbx` | Talking | In Place |
| `sleeping.fbx` | Sleeping Idle, Sitting Idle | In Place |
| `walk.fbx` | Walking | **In Place** on, or the character drifts |
| `wave.fbx` | Waving | |
| `point.fbx` | Pointing | |
| `happy.fbx` | Excited, Victory, Cheering | |
| `sorry.fbx` | Sad Idle, Defeated | |
| `excited.fbx` | Jump, Excited | |
| `nod.fbx` | Head Nod Yes, Agreeing | |

Missing clips are fine: the renderer falls back to procedural motion for them.

## 3. Assemble the GLB

```bash
blender -b --factory-startup -P pipeline/assemble.py -- \
  --rigged build/mixamo/clippet_rigged.fbx --clips build/mixamo/clips --out assets/clippet.glb
```

Imports the rigged character, drops its T-pose action, imports every clip and puts it on
its own NLA track named after the file, checks the clip's bone names against the rig,
scales to 1 m with feet at the origin, and exports a Y-up GLB facing +Z with one
animation per clip. The report next to the GLB lists clips, seconds, bone count and any
bone-name mismatches (a clip from a different Mixamo rig shows up there).

Smoke test without Mixamo:

```bash
blender -b --factory-startup -P pipeline/make_test_rig.py -- --out build/testrig
blender -b --factory-startup -P pipeline/assemble.py -- --rigged build/testrig/rigged.fbx --clips build/testrig/clips --out build/testrig/test.glb
```

## If Mixamo's auto-rig is bad on the chibi body

Fallback: Blender Rigify metarig scaled to the mesh, automatic weights, then retarget
the same Mixamo clips with Rokoko Studio Live (free) or Auto-Rig Pro's remap. Keep the
Mixamo bone names so the renderer's `lookAt` keeps working.

## Alternative to Mixamo: auto-rig in Blender

```bash
blender -b --factory-startup -P pipeline/autorig.py -- \
  --input build/mixamo/clippet_lowpoly.glb --out assets/clippet.glb --poses build/poses
```

Takes the clean mesh from step 1 (the `--glb` output), fits a Mixamo-named humanoid
armature from silhouette landmarks (head, neck, shoulders, crotch, knees, ankles), skins
it with automatic weights, fades arm influence out of the torso silhouette (arms drawn
against the body would otherwise drag the chest), keyframes every protocol clip
procedurally, and exports the rigged GLB. `--poses` renders one frame per clip for a
quick look. About 10 s. The motion is simple and cheerful rather than mocap; swap in
Mixamo clips through `assemble.py` whenever you want better.

Generate the source character in an **A-pose** (arms held away from the body). The rig
measures how far the arms lean out and lowers them to the sides as the base pose of every
clip, so the character stands with arms down and raises them only to express. Arms drawn
against the body are detected and get shrugs instead of swings. Separate posed renders
(success, thinking, failed) cannot be animated between, since every image-to-3D run gives
a different mesh, but they are good references for tuning the key poses in `CLIPS`. Because the bone names are
Mixamo's, the renderer's head look-at works with either.
