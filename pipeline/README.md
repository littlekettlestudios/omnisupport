# Character pipeline: LKF → Mixamo → clippet.glb

Three steps. The first and last are scripts here; the middle one is Mixamo in a browser.
Blender 4.2+ on `PATH` (tested with 5.2).

## 1. Decimate the LKF output

```bash
blender -b --factory-startup -P pipeline/decimate.py -- \
  --input ~/Desktop/GameDev/LKF/output/<name>/blender/character.glb \
  --out build/mixamo/clippet_lowpoly.fbx \
  --glb assets/placeholder.glb --target-tris 15000
```

Joins the meshes, collapses ~800k triangles to ~15k keeping UVs and textures, writes the
textures next to the FBX and embeds them. Takes about 10 s. The `--glb` copy is the
static placeholder the Clippet renderer uses until the rigged model exists (use
`--target-tris 6000 --texture-size 1024` for a small one that is fine to commit).

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
