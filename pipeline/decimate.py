"""Rebuild an LKF character as a clean low-poly mesh for rigging. Runs inside Blender:

    blender -b --factory-startup -P pipeline/decimate.py -- \
        --input .../output/<name>/blender/character.glb --out build/mixamo/clippet_lowpoly.fbx \
        [--target-tris 15000] [--voxel 0.006] [--bake-size 2048] [--glb build/mixamo/character_lowpoly.glb]
        [--no-remesh]

Default path (what Mixamo and skinning want): voxel-remesh the 800k-triangle LKF output into
one watertight, evenly tessellated surface, collapse that to ~target triangles, unwrap it,
and bake the original base colour onto a new texture. The result deforms cleanly because
the triangles are uniform and there are no overlapping shells. --no-remesh keeps the old
behaviour: straight collapse of the original mesh (fast, fragmented, keeps the original UVs).

Writes the FBX (textures embedded and copied next to it), a JSON report, and with --glb a
GLB of the same mesh (loadable in Omni Support before rigging). Never touches the input file.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--out", required=True, help="FBX path for Mixamo")
    ap.add_argument("--target-tris", type=int, default=15000)
    ap.add_argument("--voxel", type=float, default=0.006, help="remesh voxel size in metres (model is 1 m tall)")
    ap.add_argument("--bake-size", type=int, default=2048)
    ap.add_argument("--glb", help="also export a GLB here")
    ap.add_argument("--no-remesh", action="store_true", help="plain collapse of the original mesh, keep its UVs/textures")
    ap.add_argument("--texture-size", type=int, default=2048, help="(--no-remesh) max texture edge")
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


def select_only(objs: list[bpy.types.Object], active: bpy.types.Object) -> None:
    for o in bpy.context.scene.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = active


def join_all(objs: list[bpy.types.Object]) -> bpy.types.Object:
    if len(objs) == 1:
        return objs[0]
    select_only(objs, objs[0])
    bpy.ops.object.join()
    return objs[0]


def apply_modifier(obj: bpy.types.Object, mod: bpy.types.Modifier) -> None:
    select_only([obj], obj)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def collapse(obj: bpy.types.Object, target: int) -> dict:
    before = tri_count(obj)
    if before <= target:
        return {"tris_before": before, "tris_after": before, "skipped": True}
    mod = obj.modifiers.new("decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = target / before
    mod.use_collapse_triangulate = True
    apply_modifier(obj, mod)
    select_only([obj], obj)
    bpy.ops.object.shade_smooth()
    return {"tris_before": before, "tris_after": tri_count(obj), "skipped": False}


def duplicate(obj: bpy.types.Object, name: str) -> bpy.types.Object:
    dup = obj.copy()
    dup.data = obj.data.copy()
    dup.name = name
    bpy.context.scene.collection.objects.link(dup)
    return dup


def keep_largest_shell(obj: bpy.types.Object) -> dict:
    """Delete every connected piece except the one with the most faces (inner cavities, specks)."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    seen: set[int] = set()
    comps: list[list[int]] = []
    for f in bm.faces:
        if f.index in seen:
            continue
        comp, stack = [], [f]
        while stack:
            x = stack.pop()
            if x.index in seen:
                continue
            seen.add(x.index)
            comp.append(x.index)
            for e in x.edges:
                stack.extend(lf for lf in e.link_faces if lf.index not in seen)
        comps.append(comp)
    comps.sort(key=len, reverse=True)
    drop = [bm.faces[i] for c in comps[1:] for i in c]
    bmesh.ops.delete(bm, geom=drop, context="FACES")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return {"shells": len(comps), "shell_faces": [len(c) for c in comps[:4]]}


def remesh(obj: bpy.types.Object, voxel: float) -> dict:
    # The LKF output is a soup of unwelded patches, not a closed surface. Thicken every
    # patch into a slab first so their union is a solid; the voxel remesh then yields a
    # proper outer skin (plus inner cavity shells, removed below).
    sol = obj.modifiers.new("solidify", "SOLIDIFY")
    sol.thickness = voxel * 4
    sol.offset = 0.0
    sol.use_rim = True
    apply_modifier(obj, sol)
    mod = obj.modifiers.new("remesh", "REMESH")
    mod.mode = "VOXEL"
    mod.voxel_size = voxel
    mod.use_smooth_shade = True
    apply_modifier(obj, mod)
    tris = tri_count(obj)
    info = keep_largest_shell(obj)
    return {"remesh_tris": tris, "outer_shell_tris": tri_count(obj), **info}


def smooth(obj: bpy.types.Object, iterations: int = 3) -> None:
    mod = obj.modifiers.new("smooth", "SMOOTH")
    mod.factor = 0.5
    mod.iterations = iterations
    apply_modifier(obj, mod)


def unwrap(obj: bpy.types.Object) -> None:
    select_only([obj], obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.003, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def bake_basecolor(src: bpy.types.Object, dst: bpy.types.Object, size: int, out_png: Path) -> dict:
    """Project the source mesh's base colour onto the destination's new UVs (Cycles, selected-to-active)."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 4
    scene.cycles.use_denoising = False
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = 0.04
    scene.render.bake.max_ray_distance = 0.1
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    scene.render.bake.margin = 8

    img = bpy.data.images.new("ClippetBaseColor", size, size, alpha=False)
    img.generated_color = (0.5, 0.5, 0.5, 1.0)
    mat = bpy.data.materials.new("Clippet")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.7
    nodes.active = tex
    dst.data.materials.clear()
    dst.data.materials.append(mat)

    # Source materials must be unlit for the bake: route emission from base colour so
    # lighting never leaks in, whatever the GLB material looked like.
    for m in src.data.materials:
        if not m or not m.use_nodes:
            continue
        b = m.node_tree.nodes.get("Principled BSDF")
        if b:
            b.inputs["Roughness"].default_value = 1.0
            b.inputs["Metallic"].default_value = 0.0

    select_only([src, dst], dst)
    t0 = time.time()
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, use_selected_to_active=True, cage_extrusion=0.04, max_ray_distance=0.1, margin=8)
    img.filepath_raw = str(out_png)
    img.file_format = "PNG"
    img.save()
    return {"bake_seconds": round(time.time() - t0, 1), "bake_png": str(out_png)}


def save_original_textures(out_dir: Path, max_size: int) -> list[str]:
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


def export(obj: bpy.types.Object, fbx: Path, glb: Path | None) -> None:
    select_only([obj], obj)
    bpy.ops.export_scene.fbx(
        filepath=str(fbx), use_selection=True, object_types={"MESH"},
        apply_unit_scale=True, apply_scale_options="FBX_SCALE_ALL", axis_forward="-Z", axis_up="Y",
        mesh_smooth_type="FACE", use_mesh_modifiers=True, path_mode="COPY", embed_textures=True,
        add_leaf_bones=False, bake_anim=False,
    )
    if glb:
        glb.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=True, export_yup=True, export_apply=True)


def main() -> None:
    args = parse_args()
    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    glb = Path(args.glb).resolve() if args.glb else None
    t0 = time.time()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(Path(args.input).resolve()))
    objs = mesh_objects()
    if not objs:
        sys.exit("no mesh in input")
    src = join_all(objs)
    src.name = "Source"
    report: dict = {"mode": "collapse" if args.no_remesh else "remesh+bake", "tris_source": tri_count(src)}

    if args.no_remesh:
        src.name = "Clippet"
        report.update(collapse(src, args.target_tris))
        report["textures"] = save_original_textures(out.parent, args.texture_size)
        final = src
    else:
        dst = duplicate(src, "Clippet")
        report.update(remesh(dst, args.voxel))
        smooth(dst, 2)
        report.update(collapse(dst, args.target_tris))
        unwrap(dst)
        tex_dir = out.parent / "textures"
        tex_dir.mkdir(parents=True, exist_ok=True)
        report.update(bake_basecolor(src, dst, args.bake_size, tex_dir / "clippet_basecolor.png"))
        src.hide_set(True)
        src.hide_render = True
        final = dst

    lo, hi = world_bbox(final)
    export(final, out, glb)
    report.update({
        "height_m": round(hi.z - lo.z, 4),
        "bbox_min": [round(v, 4) for v in lo],
        "bbox_max": [round(v, 4) for v in hi],
        "fbx": str(out), "fbx_bytes": out.stat().st_size,
        "glb": str(glb) if glb else None,
        "seconds": round(time.time() - t0, 1),
    })
    out.with_suffix(".json").write_text(json.dumps(report, indent=2))
    print("CLIPPET_DECIMATE_OK", json.dumps(report))


if __name__ == "__main__":
    main()
