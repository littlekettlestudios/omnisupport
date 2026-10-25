"""Decimate an LKF character for rigging. Runs inside Blender:

    blender -b --factory-startup -P pipeline/decimate.py -- \
        --input .../output/<name>/blender/character.glb --out build/clippet_lowpoly.fbx \
        [--target-tris 15000] [--glb assets/placeholder.glb]

Reads the LKF GLB (1 m tall, feet at origin, Y-up), joins the meshes into one, collapses
to about --target-tris triangles while keeping UVs and the base-colour texture, writes
the textures next to the FBX and embeds them, and exports an FBX that Mixamo's
auto-rigger accepts (Y-up, character facing +Z). --glb also writes a decimated GLB,
which is a good `assets/placeholder.glb` for the Clippet renderer.

Never touches the input file.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--out", required=True, help="FBX path for Mixamo")
    ap.add_argument("--target-tris", type=int, default=15000)
    ap.add_argument("--glb", help="also export a decimated GLB here")
    ap.add_argument("--texture-size", type=int, default=2048, help="max texture edge; larger textures are downscaled")
    return ap.parse_args(argv)


def mesh_objects() -> list[bpy.types.Object]:
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def tri_count(obj: bpy.types.Object) -> int:
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def world_bbox(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def join_all(objs: list[bpy.types.Object]) -> bpy.types.Object:
    if len(objs) == 1:
        return objs[0]
    with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs):
        bpy.ops.object.join()
    return objs[0]


def decimate(obj: bpy.types.Object, target: int) -> dict:
    before = tri_count(obj)
    if before <= target:
        return {"tris_before": before, "tris_after": before, "ratio": 1.0, "skipped": True}
    mod = obj.modifiers.new("decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = target / before
    mod.use_collapse_triangulate = True
    mod.use_symmetry = False
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.ops.object.shade_smooth()
    return {"tris_before": before, "tris_after": tri_count(obj), "ratio": target / before, "skipped": False}


def save_textures(out_dir: Path, max_size: int) -> list[str]:
    """Write every packed image to disk as PNG so the FBX exporter can embed and copy it."""
    tex_dir = out_dir / "textures"
    tex_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for img in bpy.data.images:
        if img.type != "IMAGE" or img.size[0] == 0:
            continue
        w, h = img.size
        if max(w, h) > max_size:
            s = max_size / max(w, h)
            img.scale(int(w * s), int(h * s))
        name = (img.name.rsplit(".", 1)[0] or "texture").replace(" ", "_")
        path = tex_dir / f"{name}.png"
        img.filepath_raw = str(path)
        img.file_format = "PNG"
        img.save()
        if img.packed_file:
            img.unpack(method="REMOVE")
            img.filepath = str(path)
        written.append(str(path))
    return written


def main() -> None:
    args = parse_args()
    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(Path(args.input).resolve()))
    objs = mesh_objects()
    if not objs:
        sys.exit("no mesh in input")

    obj = join_all(objs)
    obj.name = "Clippet"
    result = decimate(obj, args.target_tris)
    lo, hi = world_bbox(obj)
    textures = save_textures(out.parent, args.texture_size)

    with bpy.context.temp_override(active_object=obj, selected_objects=[obj]):
        bpy.ops.export_scene.fbx(
            filepath=str(out),
            use_selection=True,
            object_types={"MESH"},
            apply_unit_scale=True,
            apply_scale_options="FBX_SCALE_ALL",
            axis_forward="-Z",
            axis_up="Y",
            mesh_smooth_type="FACE",
            use_mesh_modifiers=True,
            path_mode="COPY",
            embed_textures=True,
            add_leaf_bones=False,
            bake_anim=False,
        )
        if args.glb:
            glb = Path(args.glb).resolve()
            glb.parent.mkdir(parents=True, exist_ok=True)
            bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=True, export_yup=True, export_apply=True)

    report = {
        **result,
        "height_m": round(hi.z - lo.z, 4),
        "bbox_min": [round(v, 4) for v in lo],
        "bbox_max": [round(v, 4) for v in hi],
        "fbx": str(out),
        "fbx_bytes": out.stat().st_size,
        "glb": str(Path(args.glb).resolve()) if args.glb else None,
        "textures": textures,
    }
    (out.with_suffix(".json")).write_text(json.dumps(report, indent=2))
    print("CLIPPET_DECIMATE_OK", json.dumps(report))


if __name__ == "__main__":
    main()
