"""Assemble the rigged character GLB with animation clips. Runs inside Blender:

    blender -b --factory-startup -P pipeline/assemble.py -- \
        --rigged build/mixamo/character_rigged.fbx --clips build/mixamo/clips --out build/character.glb \
        [--height 1.0]

--rigged  Mixamo "With Skin" FBX of the character.
--clips   folder of Mixamo "Without Skin" FBX clips. Each file's stem becomes the clip
          name, so rename the downloads to the protocol names first:
          idle.fbx attentive.fbx thinking.fbx searching.fbx talking.fbx sleeping.fbx
          walk.fbx wave.fbx point.fbx happy.fbx sorry.fbx excited.fbx nod.fbx
          (see docs/companion-protocol.md; missing ones fall back in the renderer).
--out     GLB with one animation per clip, 1 m tall, feet at origin, Y-up, facing +Z.

Every clip's bone names are checked against the rig; mismatches are reported.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import bpy
from mathutils import Vector

BONE_RE = re.compile(r'pose\.bones\["([^"]+)"\]')


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--rigged", required=True)
    ap.add_argument("--clips", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--height", type=float, default=1.0)
    return ap.parse_args(argv)


def import_fbx(path: Path) -> tuple[list[bpy.types.Object], bpy.types.Object | None]:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(path), use_anim=True, ignore_leaf_bones=False, automatic_bone_orientation=False)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next((o for o in new if o.type == "ARMATURE"), None)
    return new, arm


def remove_objects(objs: list[bpy.types.Object]) -> None:
    for o in objs:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if data and data.users == 0:
            if isinstance(data, bpy.types.Armature):
                bpy.data.armatures.remove(data)
            elif isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)


def action_fcurves(action: bpy.types.Action):
    """F-curves of an action on Blender 4.x (action.fcurves) and 5.x (slotted actions)."""
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    out = []
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                out += list(bag.fcurves)
    return out


def action_bones(action: bpy.types.Action) -> set[str]:
    names = set()
    for fc in action_fcurves(action):
        m = BONE_RE.search(fc.data_path)
        if m:
            names.add(m.group(1))
    return names


def world_bbox(objs: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        ev = o.evaluated_get(depsgraph)
        pts += [ev.matrix_world @ Vector(c) for c in ev.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def main() -> None:
    args = parse_args()
    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    clips_dir = Path(args.clips).resolve()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30

    rig_objs, rig = import_fbx(Path(args.rigged).resolve())
    if rig is None:
        sys.exit("no armature in --rigged")
    rig.name = "Clippet"
    meshes = [o for o in rig_objs if o.type == "MESH"]
    if not meshes:
        sys.exit("no skinned mesh in --rigged")
    rig_bones = {b.name for b in rig.data.bones}

    # Drop whatever pose/action the rigged file carried; the clips define the animations.
    if rig.animation_data:
        rig.animation_data_clear()
    rig.animation_data_create()
    for b in rig.pose.bones:
        b.matrix_basis.identity()

    report: dict = {"clips": {}, "warnings": []}
    for clip_file in sorted(clips_dir.glob("*.fbx")):
        name = clip_file.stem.lower()
        objs, arm = import_fbx(clip_file)
        action = arm.animation_data.action if arm and arm.animation_data else None
        if action is None:
            report["warnings"].append(f"{clip_file.name}: no animation found, skipped")
            remove_objects(objs)
            continue
        action = action.copy()
        action.name = name
        action.use_fake_user = True
        missing = sorted(action_bones(action) - rig_bones)
        if missing:
            report["warnings"].append(f"{name}: {len(missing)} animated bones not in rig, e.g. {missing[:3]}")
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        start, end = action.frame_range
        strip = track.strips.new(name, int(start), action)
        strip.name = name
        if hasattr(strip, "action_slot") and len(action.slots):
            strip.action_slot = action.slots[0]
        track.mute = False
        report["clips"][name] = {"frames": int(end - start), "seconds": round((end - start) / 30, 2), "file": clip_file.name}
        remove_objects(objs)

    if not report["clips"]:
        report["warnings"].append("no clips found; exporting the rig alone")

    # Normalise: 1 m tall, feet on the floor. Scale the armature object (not applied), so
    # the hips translation curves scale with it. Mixamo rigs face -Y in Blender, which the
    # Y-up glTF export turns into +Z.
    rig.animation_data.action = None
    bpy.context.view_layer.update()
    lo, hi = world_bbox(meshes)
    height = hi.z - lo.z
    if height > 0:
        rig.scale = rig.scale * (args.height / height)
    bpy.context.view_layer.update()
    lo, hi = world_bbox(meshes)
    rig.location.z -= lo.z
    rig.location.x -= (lo.x + hi.x) / 2
    rig.location.y -= (lo.y + hi.y) / 2
    bpy.context.view_layer.update()
    lo, hi = world_bbox(meshes)

    for o in bpy.context.scene.objects:
        o.select_set(o is rig or o in meshes)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=str(out),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_skins=True,
        export_def_bones=False,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_rest_position_armature=True,
        export_image_format="AUTO",
    )

    report.update({
        "out": str(out),
        "bytes": out.stat().st_size,
        "height_m": round(hi.z - lo.z, 4),
        "bbox_min": [round(v, 4) for v in lo],
        "bbox_max": [round(v, 4) for v in hi],
        "bones": len(rig_bones),
        "mixamo_names": any(b.startswith("mixamorig") for b in rig_bones),
        "meshes": [m.name for m in meshes],
    })
    out.with_suffix(".json").write_text(json.dumps(report, indent=2))
    print("CLIPPET_ASSEMBLE_OK", json.dumps(report))


if __name__ == "__main__":
    main()
