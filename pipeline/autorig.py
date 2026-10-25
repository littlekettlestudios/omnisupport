"""Auto-rig a clean Clippet mesh and author the protocol's clips, no Mixamo needed:

    blender -b --factory-startup -P pipeline/autorig.py -- \
        --input build/remesh/sprout_lowpoly.glb --out assets/clippet.glb [--poses build/poses]

Fits a Mixamo-named humanoid armature from silhouette landmarks (head, neck, shoulders,
crotch, knees, ankles from cross-section widths), skins it with Blender's automatic
weights, keyframes every clip named in docs/companion-protocol.md procedurally, and
exports a 1 m, Y-up, +Z-facing GLB with one animation per clip. --poses renders one
frame of each clip for a visual check.

Quality is "charming toy": fine for the companion's idle, look-around, wave, nod and
hop; replace with Mixamo clips through assemble.py when you want mocap motion.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

FPS = 30


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="clean GLB or FBX from decimate.py")
    ap.add_argument("--out", required=True)
    ap.add_argument("--poses", help="folder for one render per clip")
    ap.add_argument("--face", default=None, help="idle face PNG for the FaceScreen patch (default assets/face/idle.png next to the repo)")
    ap.add_argument("--no-face", action="store_true", help="skip the FaceScreen patch")
    ap.add_argument("--arm-motion", type=float, default=None, help="arm swing scale 0..1; default 1, or 0.35 when the arms are drawn against the body")
    return ap.parse_args(argv)


# ---------------------------------------------------------------- landmarks

def landmarks(mesh_obj: bpy.types.Object) -> dict:
    """Joint positions in Blender world space (Z up, character faces -Y) from the silhouette."""
    v = np.array([mesh_obj.matrix_world @ Vector(c.co) for c in mesh_obj.data.vertices])
    z0 = v[:, 2].min()
    v[:, 2] -= z0
    H = v[:, 2].max()
    n = 120
    edges = np.linspace(0, H, n + 1)
    band = np.clip(((v[:, 2] / H) * n).astype(int), 0, n - 1)
    width = np.zeros(n); ymean = np.zeros(n); centre_gap = np.ones(n, bool); maxabs = np.zeros(n)
    for i in range(n):
        sel = v[band == i]
        if len(sel) < 4:
            continue
        width[i] = sel[:, 0].max() - sel[:, 0].min()
        maxabs[i] = np.abs(sel[:, 0]).max()
        ymean[i] = sel[:, 1].mean()
        centre_gap[i] = (np.abs(sel[:, 0]) < 0.03 * H).sum() == 0
    zc = (edges[:-1] + edges[1:]) / 2

    def band_at(z: float) -> int:
        return int(np.clip(z / H * n, 0, n - 1))

    def torso_half(z: float) -> float:
        """Half-width of the central body at height z: |x| up to the first gap wider than
        2% of the height. With arms away from the body that gap separates torso from arm;
        with arms against the body there is no gap and the full width is returned."""
        sel = np.sort(np.abs(v[band == band_at(z)][:, 0]))
        if len(sel) < 4:
            return 0.1 * H
        gaps = np.diff(sel)
        idx = np.argmax(gaps > 0.02 * H) if (gaps > 0.02 * H).any() else len(sel) - 1
        return float(sel[idx])

    top = H
    upper = zc > 0.5 * H
    head_z = float(zc[upper][np.argmax(width[upper])])
    head_half = width[band_at(head_z)] / 2
    lo, hi = band_at(0.4 * H), band_at(head_z - 0.08 * H)
    neck_z = float(zc[lo + np.argmin(width[lo:hi])]) if hi > lo else 0.6 * H
    shoulder_z = neck_z - 0.05 * H
    sh_half = width[band_at(shoulder_z)] / 2          # full silhouette, arms included
    torso_sh = torso_half(shoulder_z)                 # body only

    legs = (zc > 0.05 * H) & (zc < 0.45 * H) & centre_gap
    crotch_z = float(zc[legs].max()) if legs.any() else 0.3 * H
    hips_z = crotch_z + 0.07 * H
    ankle_z = 0.07 * H
    knee_z = (crotch_z + ankle_z) / 2
    leg_band = v[(v[:, 2] > ankle_z) & (v[:, 2] < crotch_z)]
    leg_x = float(np.abs(leg_band[:, 0]).mean()) if len(leg_band) else 0.08 * H
    leg_x = max(leg_x, 0.04 * H)
    foot_y = ymean[band_at(ankle_z)]

    wrist_z = hips_z + 0.05 * H
    elbow_z = (shoulder_z + wrist_z) / 2
    # Arms drawn against the body: the silhouette at elbow height is no wider than the hips.
    arm_separation = float(maxabs[band_at(elbow_z)] / max(maxabs[band_at(hips_z)], 1e-6))
    arms_fused = bool(arm_separation < 1.25 and torso_half(elbow_z) >= 0.9 * maxabs[band_at(elbow_z)])
    arm = lambda z: max(maxabs[band_at(z)] * 0.82, sh_half * 0.6)  # stay inside the mesh

    def P(x: float, z: float, zy: float | None = None) -> Vector:
        return Vector((x, float(ymean[band_at(zy if zy is not None else z)]), z + z0))

    L = {
        "H": H,
        "hips": P(0, hips_z), "spine": P(0, hips_z + (neck_z - hips_z) * 0.3),
        "spine1": P(0, hips_z + (neck_z - hips_z) * 0.6), "spine2": P(0, hips_z + (neck_z - hips_z) * 0.85),
        "neck": P(0, neck_z), "head": P(0, neck_z + 0.03 * H), "head_top": P(0, top, head_z),
        "shoulder_z": shoulder_z, "sh_half": sh_half, "head_half": head_half,
        "arm_separation": round(arm_separation, 3), "arms_fused": arms_fused, "torso_sh": float(torso_sh),
    }
    for side, s in (("Left", 1), ("Right", -1)):
        L[f"{side}Shoulder"] = P(s * torso_sh * 0.4, shoulder_z + 0.01 * H)
        L[f"{side}Arm"] = P(s * torso_sh * 0.95, shoulder_z)
        L[f"{side}ForeArm"] = P(s * arm(elbow_z), elbow_z)
        L[f"{side}Hand"] = P(s * arm(wrist_z), wrist_z)
        L[f"{side}HandEnd"] = P(s * arm(wrist_z), wrist_z - 0.06 * H)
        L[f"{side}UpLeg"] = P(s * leg_x, hips_z - 0.02 * H)
        L[f"{side}Leg"] = P(s * leg_x, knee_z)
        L[f"{side}Foot"] = P(s * leg_x, ankle_z)
        L[f"{side}ToeBase"] = Vector((s * leg_x, foot_y - 0.07 * H, 0.015 * H + z0))
        L[f"{side}ToeEnd"] = Vector((s * leg_x, foot_y - 0.11 * H, 0.01 * H + z0))
    d = L["LeftHand"] - L["LeftArm"]
    L["arm_rest_deg"] = 0.0 if arms_fused else max(0.0, math.degrees(math.atan2(abs(d.x), max(1e-6, -d.z))) - 8.0)
    return L


# ---------------------------------------------------------------- armature

CHAIN = [
    # name, head key, tail key, parent, deform
    ("mixamorig:Hips", "hips", "spine", None, True),
    ("mixamorig:Spine", "spine", "spine1", "mixamorig:Hips", True),
    ("mixamorig:Spine1", "spine1", "spine2", "mixamorig:Spine", True),
    ("mixamorig:Spine2", "spine2", "neck", "mixamorig:Spine1", True),
    ("mixamorig:Neck", "neck", "head", "mixamorig:Spine2", True),
    ("mixamorig:Head", "head", "head_top", "mixamorig:Neck", True),
]
for side in ("Left", "Right"):
    CHAIN += [
        (f"mixamorig:{side}Shoulder", f"{side}Shoulder", f"{side}Arm", "mixamorig:Spine2", True),
        (f"mixamorig:{side}Arm", f"{side}Arm", f"{side}ForeArm", f"mixamorig:{side}Shoulder", True),
        (f"mixamorig:{side}ForeArm", f"{side}ForeArm", f"{side}Hand", f"mixamorig:{side}Arm", True),
        (f"mixamorig:{side}Hand", f"{side}Hand", f"{side}HandEnd", f"mixamorig:{side}ForeArm", True),
        (f"mixamorig:{side}UpLeg", f"{side}UpLeg", f"{side}Leg", "mixamorig:Hips", True),
        (f"mixamorig:{side}Leg", f"{side}Leg", f"{side}Foot", f"mixamorig:{side}UpLeg", True),
        (f"mixamorig:{side}Foot", f"{side}Foot", f"{side}ToeBase", f"mixamorig:{side}Leg", True),
        (f"mixamorig:{side}ToeBase", f"{side}ToeBase", f"{side}ToeEnd", f"mixamorig:{side}Foot", True),
    ]


def build_armature(L: dict) -> bpy.types.Object:
    data = bpy.data.armatures.new("Clippet")
    arm = bpy.data.objects.new("Clippet", data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for name, h, t, parent, deform in CHAIN:
        b = data.edit_bones.new(name)
        b.head, b.tail = L[h], L[t]
        if (b.tail - b.head).length < 1e-4:
            b.tail = b.head + Vector((0, 0, 0.01))
        b.roll = 0.0
        b.use_deform = deform
        if parent:
            b.parent = data.edit_bones[parent]
    # Roll 0 with Blender's convention: for every bone here, local X is world +X, so
    # rotation about X pitches forward/back (character faces -Y) and Z yaws.
    bpy.ops.armature.select_all(action="SELECT")
    bpy.ops.armature.calculate_roll(type="GLOBAL_POS_Y")
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def skin(mesh_obj: bpy.types.Object, arm: bpy.types.Object) -> str:
    for o in bpy.context.scene.objects:
        o.select_set(o in (mesh_obj, arm))
    bpy.context.view_layer.objects.active = arm
    try:
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
        if any(vg for vg in mesh_obj.vertex_groups):
            return "auto"
    except RuntimeError:
        pass
    bpy.ops.object.parent_set(type="ARMATURE_ENVELOPE")
    return "envelope"


def protect_torso(mesh_obj: bpy.types.Object, L: dict) -> dict:
    """Arms drawn against the body get their bones' weights spread into the torso by heat
    weighting, so a raised arm drags the chest along. Fade arm-bone influence to zero
    inside the torso silhouette and hand that weight to the spine instead."""
    H = L["H"]
    sh = L["torso_sh"]
    inner, outer = 0.9 * sh, 1.25 * sh
    z_lo, z_hi = L["hips"].z, L["shoulder_z"] + L["hips"].z - L["hips"].z + 0.06 * H
    groups = {g.name: g for g in mesh_obj.vertex_groups}
    arm_names = [f"mixamorig:{s}{p}" for s in ("Left", "Right") for p in ("Shoulder", "Arm", "ForeArm", "Hand")]
    spine = groups.get("mixamorig:Spine2")
    touched = 0
    for v in mesh_obj.data.vertices:
        co = mesh_obj.matrix_world @ v.co
        if not (z_lo - 0.05 * H <= co.z <= z_hi):
            continue
        f = min(max((abs(co.x) - inner) / (outer - inner), 0.0), 1.0)
        f = f * f * (3 - 2 * f)
        if f >= 1.0:
            continue
        moved = 0.0
        for name in arm_names:
            g = groups.get(name)
            if not g:
                continue
            try:
                w = g.weight(v.index)
            except RuntimeError:
                continue
            g.add([v.index], w * f, "REPLACE")
            moved += w * (1 - f)
        if moved > 0 and spine:
            try:
                cur = spine.weight(v.index)
            except RuntimeError:
                cur = 0.0
            spine.add([v.index], cur + moved, "REPLACE")
            touched += 1
    pinned = 0
    if L["arms_fused"]:
        # No separable arm geometry: anything the forearm or hand would move is really
        # torso or pants (a hand in a pocket, a pot against the chest). Hand their weights
        # to the body so only the upper arm / shoulder region can shrug.
        lower = [f"mixamorig:{s}{p}" for s in ("Left", "Right") for p in ("ForeArm", "Hand")]
        hips = groups.get("mixamorig:Hips")
        for v in mesh_obj.data.vertices:
            co = mesh_obj.matrix_world @ v.co
            moved = 0.0
            for name in lower:
                g = groups.get(name)
                if not g:
                    continue
                try:
                    w = g.weight(v.index)
                except RuntimeError:
                    continue
                if w > 0:
                    g.remove([v.index])
                    moved += w
            if moved > 0:
                target = hips if (co.z < L["hips"].z + 0.04 * H and hips) else spine
                if target:
                    try:
                        cur = target.weight(v.index)
                    except RuntimeError:
                        cur = 0.0
                    target.add([v.index], cur + moved, "REPLACE")
                    pinned += 1
    return {"torso_protected_verts": touched, "lower_arm_pinned_verts": pinned}


# ---------------------------------------------------------------- face screen

def select_only(objs: list, active) -> None:
    for o in bpy.context.scene.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = active


def add_face_screen(mesh_obj: bpy.types.Object, arm: bpy.types.Object, L: dict, face_png: Path) -> dict:
    """A thin grid hugging the front of the head, following the Head bone, carrying the
    face texture the renderer swaps per mood. Sized from the head; placed on the most
    forward part of the head, which on this character is the screen."""
    H = L["H"]
    me = mesh_obj.data
    v = np.array([mesh_obj.matrix_world @ Vector(c.co) for c in me.vertices])
    head_lo, head_hi = L["head"].z, L["head_top"].z

    # Per-vertex base-colour luminance from the baked texture: the screen is the dark area
    # on the front of the head. That gives the screen's real extent on this model.
    img = next((n.image for m in me.materials if m and m.use_nodes for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image), None)
    if img is None or not me.uv_layers.active:
        return {"face": "skipped: no baked texture"}
    iw, ih = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(ih, iw, 4)
    uv_of = np.zeros((len(me.vertices), 2), dtype=np.float32)
    uvs = me.uv_layers.active.data
    for poly in me.polygons:
        for li in poly.loop_indices:
            uv_of[me.loops[li].vertex_index] = uvs[li].uv
    sx = np.clip((uv_of[:, 0] * iw).astype(int), 0, iw - 1)
    sy = np.clip((uv_of[:, 1] * ih).astype(int), 0, ih - 1)
    lum = px[sy, sx, :3].mean(axis=1)
    front_half = v[:, 1] < float(np.median(v[(v[:, 2] > head_lo) & (v[:, 2] < head_hi)][:, 1]))
    dark = (lum < 0.24) & (v[:, 2] > head_lo) & (v[:, 2] < head_hi) & front_half
    if dark.sum() >= 20:
        # The screen is one connected dark patch; dark panels elsewhere on the head are
        # other patches. Keep the connected component that holds the most forward vertex.
        adj: dict[int, list[int]] = {}
        for e in me.edges:
            a, b = e.vertices
            if dark[a] and dark[b]:
                adj.setdefault(a, []).append(b)
                adj.setdefault(b, []).append(a)
        seed = int(np.where(dark)[0][np.argmin(v[dark][:, 1])])
        comp = {seed}
        stack = [seed]
        while stack:
            for nb in adj.get(stack.pop(), []):
                if nb not in comp:
                    comp.add(nb)
                    stack.append(nb)
        keep = np.zeros_like(dark)
        keep[list(comp)] = True
        dark &= keep
    if dark.sum() < 20:
        return {"face": f"skipped: only {int(dark.sum())} dark head vertices"}
    d = v[dark]
    x0, x1 = np.percentile(d[:, 0], 1), np.percentile(d[:, 0], 99)
    z0, z1 = np.percentile(d[:, 2], 1), np.percentile(d[:, 2], 99)
    centre_x, centre_z = float((x0 + x1) / 2), float((z0 + z1) / 2)
    front_y = float(d[:, 1].min())
    w = float(x1 - x0) * 0.98
    h = float(z1 - z0) * 0.98

    # Paint the modelled screen blank in the baked texture so its eyes never show through
    # the patch: fill the UV triangles of faces whose vertices are all screen vertices.
    screen_col = np.median(px[sy[dark], sx[dark], :3], axis=0)
    # Every front-facing face inside the screen's box, eyes included (those are bright).
    in_screen = (v[:, 0] >= x0 + 0.004 * H) & (v[:, 0] <= x1 - 0.004 * H) & (v[:, 2] >= z0 + 0.004 * H) & (v[:, 2] <= z1 - 0.004 * H) & front_half
    painted = 0
    for poly in me.polygons:
        vids = [me.loops[li].vertex_index for li in poly.loop_indices]
        if not all(in_screen[i] for i in vids):
            continue
        pts = np.array([(uvs[li].uv[0] * iw, uvs[li].uv[1] * ih) for li in poly.loop_indices])
        bx0, by0 = np.floor(pts.min(axis=0)).astype(int) - 1
        bx1, by1 = np.ceil(pts.max(axis=0)).astype(int) + 1
        bx0, by0, bx1, by1 = max(bx0, 0), max(by0, 0), min(bx1, iw - 1), min(by1, ih - 1)
        if bx1 <= bx0 or by1 <= by0:
            continue
        gy, gx = np.mgrid[by0:by1 + 1, bx0:bx1 + 1]
        inside = np.ones(gx.shape, dtype=bool)
        for a, b in ((0, 1), (1, 2), (2, 0)):
            ex, ey = pts[b] - pts[a]
            cross = ex * (gy + 0.5 - pts[a][1]) - ey * (gx + 0.5 - pts[a][0])
            inside &= cross >= -1.5 if np.cross(pts[1] - pts[0], pts[2] - pts[0]) > 0 else cross <= 1.5
        px[gy[inside], gx[inside], :3] = screen_col
        painted += int(inside.sum())
    img.pixels[:] = px.ravel()
    img.pack()

    bpy.ops.mesh.primitive_grid_add(x_subdivisions=28, y_subdivisions=20, size=1.0, location=(centre_x, front_y - 0.04, centre_z), rotation=(math.pi / 2, 0, 0))
    patch = bpy.context.active_object
    patch.name = "FaceScreen"
    patch.scale = (w, h, 1)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    sw = patch.modifiers.new("wrap", "SHRINKWRAP")
    sw.target = mesh_obj
    sw.wrap_method = "NEAREST_SURFACEPOINT"
    sw.wrap_mode = "ABOVE_SURFACE"
    sw.offset = 0.004
    select_only([patch], patch)
    bpy.ops.object.modifier_apply(modifier=sw.name)
    bpy.ops.object.shade_smooth()

    img = bpy.data.images.load(str(face_png))
    img.pack()
    mat = bpy.data.materials.new("FaceScreen")
    mat.use_nodes = True
    mat.surface_render_method = "BLENDED"
    mat.use_backface_culling = True
    nodes = mat.node_tree.nodes
    bsdf = nodes["Principled BSDF"]
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    links = mat.node_tree.links
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
    links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Emission Strength"].default_value = 1.0
    bsdf.inputs["Roughness"].default_value = 0.35
    patch.data.materials.append(mat)

    vg = patch.vertex_groups.new(name="mixamorig:Head")
    vg.add([vv.index for vv in patch.data.vertices], 1.0, "REPLACE")
    patch.parent = arm
    mod = patch.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    return {"face": str(face_png), "face_centre": [round(centre_x, 3), round(front_y, 3), round(centre_z, 3)], "face_size": [round(w, 3), round(h, 3)], "screen_verts": int(dark.sum()), "screen_pixels_painted": painted}


# ---------------------------------------------------------------- clips

def deg(x: float, y: float = 0.0, z: float = 0.0) -> tuple[float, float, float]:
    return (math.radians(x), math.radians(y), math.radians(z))


class Poser:
    """Sample a pose function over a clip and write keyframes into a new action."""

    def __init__(self, arm: bpy.types.Object, arm_motion: float = 1.0, arm_rest_deg: float = 0.0):
        self.arm = arm
        self.arm_motion = arm_motion  # 1 = full swings; ~0.35 when the arms are fused to the body
        self.arm_rest_deg = arm_rest_deg  # lower the arms from the modelled pose to the sides
        for pb in arm.pose.bones:
            pb.rotation_mode = "XYZ"
        self.pitch_sign, self.out_sign, self.fwd_sign = self.calibrate()

    def _tail_delta(self, bone: str, axis: int, rad: float) -> Vector:
        """World displacement of a bone's tail when rotated about one local axis."""
        pb = self.arm.pose.bones[bone]
        before = (self.arm.matrix_world @ pb.tail).copy()
        r = [0.0, 0.0, 0.0]; r[axis] = rad
        pb.rotation_euler = r
        bpy.context.view_layer.update()
        after = (self.arm.matrix_world @ pb.tail).copy()
        pb.rotation_euler = (0, 0, 0)
        bpy.context.view_layer.update()
        return after - before

    def calibrate(self) -> tuple[float, float, float]:
        """Bone rolls differ between Blender versions and import paths, so measure which
        way each local axis turns instead of assuming: +pitch must tip the head forward
        (-Y), +out must swing the left arm outward (+X), +fwd must swing it forward (-Y)."""
        pitch = -1.0 if self._tail_delta("mixamorig:Head", 0, 0.5).y > 0 else 1.0
        out = -1.0 if self._tail_delta("mixamorig:LeftArm", 2, 0.5).x < 0 else 1.0
        fwd = -1.0 if self._tail_delta("mixamorig:LeftArm", 0, 0.5).y > 0 else 1.0
        print(f"AUTORIG_AXES pitch_sign={pitch} out_sign={out} fwd_sign={fwd}")
        return pitch, out, fwd

    def reset(self) -> None:
        for pb in self.arm.pose.bones:
            pb.rotation_euler = (0, 0, 0)
            pb.location = (0, 0, 0)
        if self.arm_rest_deg:
            for side, sgn in (("Left", 1), ("Right", -1)):
                self.rot(f"{side}Arm", z=-sgn * self.arm_rest_deg * self.out_sign)

    def key(self, frame: int) -> None:
        for pb in self.arm.pose.bones:
            pb.keyframe_insert("rotation_euler", frame=frame)
            if pb.name == "mixamorig:Hips":
                pb.keyframe_insert("location", frame=frame)

    def clip(self, name: str, seconds: float, fn, step: int = 2) -> bpy.types.Action:
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        self.arm.animation_data_create()
        self.arm.animation_data.action = act
        if hasattr(act, "slots"):
            slot = act.slots.new(id_type="OBJECT", name="Clippet") if not len(act.slots) else act.slots[0]
            self.arm.animation_data.action_slot = slot
        frames = int(seconds * FPS)
        for f in range(0, frames + 1, step):
            self.reset()
            fn(self, f / frames, f / FPS)
            self.key(f)
        if frames % step:
            self.reset(); fn(self, 1.0, seconds); self.key(frames)
        self.arm.animation_data.action = None
        return act

    # pose helpers -------------------------------------------------------
    def rot(self, bone: str, x: float = 0, y: float = 0, z: float = 0) -> None:
        pb = self.arm.pose.bones.get(f"mixamorig:{bone}")
        if pb:
            r = pb.rotation_euler
            pb.rotation_euler = (r.x + math.radians(x) * self.pitch_sign, r.y + math.radians(y), r.z + math.radians(z))

    def hips_up(self, metres: float) -> None:
        pb = self.arm.pose.bones["mixamorig:Hips"]
        pb.location = (0, metres, 0)  # bone-local Y is along the bone (up)

    def raise_arm(self, side: str, out: float = 0, fwd: float = 0, elbow: float = 0) -> None:
        """out: lift sideways (deg), fwd: swing forward, elbow: bend the forearm."""
        s = 1 if side == "Left" else -1
        k = self.arm_motion
        # rot() already applies pitch_sign to x; fwd and elbow are "pitch" moves on arm bones
        # whose rest direction is down, so they take fwd_sign relative to pitch_sign.
        fx = self.fwd_sign * self.pitch_sign
        self.rot(f"{side}Arm", x=fwd * k * fx, z=s * out * k * self.out_sign)
        self.rot(f"{side}ForeArm", x=elbow * k * k * fx)  # forearm barely moves on fused arms
        if k < 1:  # fused arms: show the intent with the shoulder instead
            self.rot(f"{side}Shoulder", z=s * out * 0.12 * self.out_sign, x=fwd * 0.08 * fx)

    def breathe(self, t: float, amp: float = 1.0) -> None:
        b = math.sin(t * 2 * math.pi)
        self.rot("Spine1", x=1.2 * amp * b)
        self.rot("Spine2", x=-0.8 * amp * b)
        self.rot("Head", x=-0.8 * amp * b)
        self.rot("LeftShoulder", x=1.0 * amp * b); self.rot("RightShoulder", x=1.0 * amp * b)


S = math.sin; C = math.cos; TAU = 2 * math.pi
ease = lambda t: 0.5 - 0.5 * math.cos(min(max(t, 0), 1) * math.pi)
pulse = lambda t, a, b: ease((t - a) / (b - a)) if a <= t <= b else (0.0 if t < a else 1.0)
bump = lambda t, a, b: S(math.pi * min(max((t - a) / (b - a), 0), 1))  # 0→1→0 over [a,b]


def clip_idle(p: Poser, t: float, s: float) -> None:
    p.breathe(t); p.rot("Head", z=3 * S(t * TAU)); p.rot("Spine", z=1.5 * S(t * TAU + 1))


def clip_attentive(p: Poser, t: float, s: float) -> None:
    p.breathe(t, 0.6)
    p.rot("Head", z=25 * S(t * TAU), x=-6)
    p.rot("Spine2", z=8 * S(t * TAU))
    p.raise_arm("Left", out=8); p.raise_arm("Right", out=8)


def clip_thinking(p: Poser, t: float, s: float) -> None:
    # Reference: one hand to the chin, head tilted toward it, other arm hanging.
    p.breathe(t, 0.5)
    p.rot("Head", x=-6, z=-14 + 3 * S(t * TAU))
    p.raise_arm("Right", fwd=50, out=8, elbow=128)
    p.rot("RightForeArm", z=12 * p.out_sign)
    p.rot("Spine1", z=-4)


def clip_searching(p: Poser, t: float, s: float) -> None:
    p.breathe(t, 0.5)
    p.rot("Head", z=45 * S(t * TAU), x=-10 + 5 * C(t * TAU * 2))
    p.rot("Spine2", z=12 * S(t * TAU))
    p.raise_arm("Left", fwd=25, elbow=60)  # hand shading the eyes
    p.rot("LeftForeArm", z=-40)


def clip_talking(p: Poser, t: float, s: float) -> None:
    p.breathe(t, 0.6)
    p.rot("Head", x=4 * S(t * TAU * 3), z=5 * S(t * TAU * 1.5))
    p.raise_arm("Left", fwd=15 + 10 * S(t * TAU * 1.5), out=10, elbow=40)
    p.raise_arm("Right", fwd=10 + 10 * C(t * TAU * 1.5), out=10, elbow=35)


def clip_sleeping(p: Poser, t: float, s: float) -> None:
    p.breathe(t, 1.4)
    p.rot("Head", x=28, z=8); p.rot("Neck", x=10); p.rot("Spine1", x=10); p.rot("Spine2", x=6)
    p.raise_arm("Left", out=-4); p.raise_arm("Right", out=-4)


def clip_walk(p: Poser, t: float, s: float) -> None:
    a = S(t * TAU)
    p.rot("LeftUpLeg", x=-28 * a); p.rot("RightUpLeg", x=28 * a)
    p.rot("LeftLeg", x=max(0, 40 * S(t * TAU + 0.6))); p.rot("RightLeg", x=max(0, 40 * S(t * TAU + math.pi + 0.6)))
    p.raise_arm("Left", fwd=-22 * a, elbow=15); p.raise_arm("Right", fwd=22 * a, elbow=15)
    p.rot("Spine", z=4 * a); p.rot("Head", z=-4 * a, x=-3)
    p.hips_up(0.012 * abs(S(t * TAU * 2)) - 0.006)


def clip_wave(p: Poser, t: float, s: float) -> None:
    # Reference: a real wave is forward-and-up with a bent elbow, the forearm near vertical
    # beside the head, and the hand swinging side to side. Not a lateral raise.
    lift = pulse(t, 0, 0.22) * (1 - pulse(t, 0.8, 1))
    swing = S(t * TAU * 3.5) * lift
    p.raise_arm("Right", fwd=55 * lift, out=(38 + 12 * swing) * lift, elbow=118 * lift)
    p.rot("RightForeArm", z=-20 * swing * p.out_sign)
    p.rot("Head", z=-8 * lift, x=-4 * lift); p.rot("Spine2", z=-5 * lift)
    p.hips_up(0.012 * lift * abs(S(t * TAU * 2)))  # a little bounce carries the greeting when the arms cannot
    p.breathe(t, 0.4)


def clip_point(p: Poser, t: float, s: float) -> None:
    lift = pulse(t, 0, 0.25) * (1 - pulse(t, 0.8, 1))
    p.raise_arm("Right", fwd=85 * lift, out=15 * lift, elbow=8 * lift)
    p.rot("Head", x=-6 * lift, z=-8 * lift); p.rot("Spine2", z=-5 * lift, x=-4 * lift)


def clip_happy(p: Poser, t: float, s: float) -> None:
    # Reference: both fists raised beside the head, elbows bent, a hop and a head tilt.
    hop = bump(t, 0.1, 0.55)
    up = pulse(t, 0, 0.3) * (1 - pulse(t, 0.8, 1))
    p.hips_up(0.05 * hop)
    p.raise_arm("Left", fwd=35 * up, out=55 * up, elbow=125 * up)
    p.raise_arm("Right", fwd=35 * up, out=55 * up, elbow=125 * up)
    p.rot("LeftLeg", x=35 * hop); p.rot("RightLeg", x=35 * hop)
    p.rot("Head", x=-10 * up, z=8 * S(t * TAU * 2) * up)


def clip_sorry(p: Poser, t: float, s: float) -> None:
    # Reference: head bowed, shoulders slumped, arms hanging a little forward.
    d = pulse(t, 0, 0.3) * (1 - pulse(t, 0.8, 1))
    p.rot("Head", x=32 * d, z=6 * d); p.rot("Neck", x=8 * d); p.rot("Spine1", x=12 * d); p.rot("Spine2", x=8 * d)
    p.raise_arm("Left", fwd=14 * d, out=-6 * d, elbow=8 * d); p.raise_arm("Right", fwd=14 * d, out=-6 * d, elbow=8 * d)
    p.rot("LeftShoulder", x=6 * d); p.rot("RightShoulder", x=6 * d)
    p.breathe(t, 0.5)


def clip_excited(p: Poser, t: float, s: float) -> None:
    hop = abs(S(t * TAU * 2.5)) * (1 - pulse(t, 0.85, 1))
    p.hips_up(0.04 * hop)
    p.raise_arm("Left", out=95 * hop + 20, elbow=40); p.raise_arm("Right", out=95 * hop + 20, elbow=40)
    p.rot("LeftLeg", x=30 * hop); p.rot("RightLeg", x=30 * hop)
    p.rot("Head", x=-10, z=12 * S(t * TAU * 5))


def clip_nod(p: Poser, t: float, s: float) -> None:
    p.rot("Head", x=14 * S(t * TAU * 2) * (1 - pulse(t, 0.85, 1))); p.rot("Neck", x=4 * S(t * TAU * 2))
    p.breathe(t, 0.4)


CLIPS = [
    ("idle", 3.0, clip_idle), ("attentive", 2.5, clip_attentive), ("thinking", 3.0, clip_thinking),
    ("searching", 3.0, clip_searching), ("talking", 2.0, clip_talking), ("sleeping", 4.0, clip_sleeping),
    ("walk", 0.8, clip_walk), ("wave", 1.6, clip_wave), ("point", 1.4, clip_point), ("happy", 1.2, clip_happy),
    ("sorry", 1.8, clip_sorry), ("excited", 1.4, clip_excited), ("nod", 1.0, clip_nod),
]


# ---------------------------------------------------------------- render + export

def render_poses(arm: bpy.types.Object, mesh_obj: bpy.types.Object, out_dir: Path, L: dict) -> list[str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 360, 420
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("W"); scene.world = world; world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.9, 0.92, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.type = "ORTHO"; cam.data.ortho_scale = L["H"] * 1.5
    cz = L["hips"].z + 0.1 * L["H"]
    cam.location = (-0.9, -2.2, cz); cam.rotation_euler = (math.radians(90), 0, math.radians(-22))
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN")); scene.collection.objects.link(sun)
    sun.data.energy = 3; sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-30))
    files = []
    for name, seconds, _ in CLIPS:
        act = bpy.data.actions[name]
        arm.animation_data.action = act
        if hasattr(arm.animation_data, "action_slot") and len(act.slots):
            arm.animation_data.action_slot = act.slots[0]
        frame = int(seconds * FPS * (0.35 if name in ("wave", "point", "happy", "sorry", "excited") else 0.25))
        scene.frame_set(frame)
        scene.render.filepath = str(out_dir / f"{name}.png")
        bpy.ops.render.render(write_still=True)
        files.append(scene.render.filepath)
    arm.animation_data.action = None
    return files


def push_tracks(arm: bpy.types.Object) -> None:
    arm.animation_data_create()
    for name, _, _ in CLIPS:
        act = bpy.data.actions[name]
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 0, act)
        strip.name = name
        if hasattr(strip, "action_slot") and len(act.slots):
            strip.action_slot = act.slots[0]


def export_glb(arm: bpy.types.Object, mesh_obj: bpy.types.Object, out: Path, extra: list[bpy.types.Object] = ()) -> None:
    for o in bpy.context.scene.objects:
        o.select_set(o is arm or o is mesh_obj or o in extra)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=str(out), export_format="GLB", use_selection=True, export_yup=True, export_apply=False,
        export_skins=True, export_def_bones=False, export_animations=True, export_animation_mode="NLA_TRACKS",
        export_force_sampling=True, export_optimize_animation_size=True, export_rest_position_armature=True,
    )


def main() -> None:
    args = parse_args()
    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    src = Path(args.input).resolve()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    if src.suffix.lower() == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(src))
    else:
        bpy.ops.import_scene.gltf(filepath=str(src))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        sys.exit("no mesh in input")
    mesh_obj = meshes[0]
    if len(meshes) > 1:
        for o in bpy.context.scene.objects:
            o.select_set(o in meshes)
        bpy.context.view_layer.objects.active = mesh_obj
        bpy.ops.object.join()
    mesh_obj.name = "Body"
    for o in bpy.context.scene.objects:
        o.select_set(o is mesh_obj)
    bpy.context.view_layer.objects.active = mesh_obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # GLB import splits vertices at UV seams; weld them back so the surface is one piece,
    # which bone-heat weighting needs. UVs live on loops, so they survive the weld.
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.0001)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    L = landmarks(mesh_obj)
    arm = build_armature(L)
    weights = skin(mesh_obj, arm)
    protect = protect_torso(mesh_obj, L)
    weighted = sum(1 for v in mesh_obj.data.vertices if any(g.weight > 0.001 for g in v.groups))
    weight_fraction = weighted / max(1, len(mesh_obj.data.vertices))
    if weight_fraction < 0.5:
        print(f"AUTORIG_WARN automatic weights covered only {weight_fraction:.0%} of vertices; falling back to envelopes")
        for o in bpy.context.scene.objects:
            o.select_set(o in (mesh_obj, arm))
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.parent_set(type="ARMATURE_ENVELOPE")
        weights = "envelope"

    arm_motion = args.arm_motion if args.arm_motion is not None else (0.35 if L["arms_fused"] else 1.0)
    face_info: dict = {}
    extra: list[bpy.types.Object] = []
    if not args.no_face:
        face_png = Path(args.face).resolve() if args.face else Path(__file__).resolve().parent.parent / "assets" / "face" / "idle.png"
        if face_png.exists():
            face_info = add_face_screen(mesh_obj, arm, L, face_png)
            extra = [o for o in bpy.context.scene.objects if o.name == "FaceScreen"]
        else:
            face_info = {"face": f"skipped: {face_png} not found"}

    poser = Poser(arm, arm_motion, L["arm_rest_deg"])
    for name, seconds, fn in CLIPS:
        poser.clip(name, seconds, fn)
    poser.reset()

    poses = render_poses(arm, mesh_obj, Path(args.poses).resolve(), L) if args.poses else []
    push_tracks(arm)
    export_glb(arm, mesh_obj, out, extra)

    report = {
        "out": str(out), "bytes": out.stat().st_size, "weights": weights, "weight_fraction": round(weight_fraction, 3),
        "verts": len(mesh_obj.data.vertices), **protect, "arm_motion": arm_motion, "arms_fused": L["arms_fused"], "arm_separation": L["arm_separation"], "arm_rest_deg": round(L["arm_rest_deg"], 1), **face_info,
        "bones": len(arm.data.bones), "clips": {n: s for n, s, _ in CLIPS},
        "landmarks": {k: [round(c, 3) for c in v] for k, v in L.items() if isinstance(v, Vector)},
        "poses": poses,
    }
    out.with_suffix(".json").write_text(json.dumps(report, indent=2))
    print("CLIPPET_AUTORIG_OK", json.dumps({k: v for k, v in report.items() if k != "landmarks"}))


if __name__ == "__main__":
    main()
