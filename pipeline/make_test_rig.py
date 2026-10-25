"""Build a tiny Mixamo-shaped rig and two clips to exercise assemble.py without Mixamo:

    blender -b --factory-startup -P pipeline/make_test_rig.py -- --out build/testrig

Writes rigged.fbx (capsule skinned to mixamorig:Hips → Spine → Head, in centimetres like
Mixamo) and clips/idle.fbx, clips/wave.fbx (armature-only, each with one action).
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    return ap.parse_args(argv)


def build_rig(with_mesh: bool) -> bpy.types.Object:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    arm_data = bpy.data.armatures.new("Armature")
    arm = bpy.data.objects.new("Armature", arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    chain = [("mixamorig:Hips", 0, 90), ("mixamorig:Spine", 90, 140), ("mixamorig:Head", 140, 180)]
    prev = None
    for name, z0, z1 in chain:
        b = arm_data.edit_bones.new(name)
        b.head = (0, 0, z0)
        b.tail = (0, 0, z1)
        if prev:
            b.parent = prev
            b.use_connect = True
        prev = b
    bpy.ops.object.mode_set(mode="OBJECT")
    if with_mesh:
        bpy.ops.mesh.primitive_cylinder_add(radius=25, depth=180, location=(0, 0, 90))
        mesh = bpy.context.active_object
        mesh.name = "Body"
        mesh.parent = arm
        mod = mesh.modifiers.new("Armature", "ARMATURE")
        mod.object = arm
        for name, z0, z1 in chain:
            vg = mesh.vertex_groups.new(name=name)
            idx = [v.index for v in mesh.data.vertices if z0 - 90 <= v.co.z + 90 < z1 or (z1 == 180 and v.co.z + 90 >= 180)]
            vg.add(idx, 1.0, "REPLACE")
    return arm


def animate(arm: bpy.types.Object, name: str, amplitude: float) -> None:
    arm.animation_data_create()
    action = bpy.data.actions.new(name)
    arm.animation_data.action = action
    head = arm.pose.bones["mixamorig:Head"]
    head.rotation_mode = "XYZ"
    for frame in range(0, 31, 10):
        head.rotation_euler = (0, 0, amplitude * math.sin(frame / 30 * 2 * math.pi))
        head.keyframe_insert("rotation_euler", frame=frame)
    bpy.context.scene.frame_end = 30


def export(path: Path, objs: list[bpy.types.Object]) -> None:
    for o in bpy.context.scene.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.fbx(filepath=str(path), use_selection=True, add_leaf_bones=False, bake_anim=True,
                             bake_anim_use_all_actions=False, bake_anim_use_nla_strips=False, axis_forward="-Z", axis_up="Y")


def main() -> None:
    args = parse_args()
    out = Path(args.out).resolve()
    (out / "clips").mkdir(parents=True, exist_ok=True)
    arm = build_rig(with_mesh=True)
    export(out / "rigged.fbx", [arm] + [o for o in bpy.context.scene.objects if o.type == "MESH"])
    for clip, amp in (("idle", 0.1), ("wave", 0.6)):
        arm = build_rig(with_mesh=False)
        animate(arm, clip, amp)
        export(out / "clips" / f"{clip}.fbx", [arm])
    print("TESTRIG_OK", out)


if __name__ == "__main__":
    main()
