# -*- coding: utf-8 -*-
"""
lxbuild — Land-XI 절차적 모델 빌드 헬퍼 (Blender 5.x, headless)

bpy.ops 대신 bmesh.ops 만 사용해 컨텍스트 의존성을 없앤다.
머티리얼 슬롯 단위로 지오메트리를 합쳐 드로우콜을 최소화하고,
노드(오브젝트) 이름은 런타임에서 회전시킬 부품(rotor_0..3, prop)에만 분리한다.

단위: 1 Blender unit = 1 m. 씬은 Z-up 으로 만들고 glTF 익스포터가 Y-up 으로 변환한다.
"""

import math
import os

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

TAU = math.tau
D2R = math.radians

# 익형 단면(단위 좌표). a = 두께 방향(rx 배), b = 코드 방향(ry 배, -1 = 앞전 / +1 = 뒷전).
# 앞전 → 윗면 → 뒷전 → 아랫면 순서. 날개·수평/수직 미익·스트럿·프로펠러 블레이드 공용.
AIRFOIL = [
    (0.00, -1.00),
    (0.42, -0.88), (0.70, -0.70), (0.95, -0.40), (1.00, 0.00), (0.72, 0.50), (0.32, 0.88),
    (0.04, 1.00),
    (-0.20, 0.88), (-0.42, 0.50), (-0.52, 0.00), (-0.52, -0.40), (-0.42, -0.70), (-0.30, -0.88),
]


# --------------------------------------------------------------------------- #
# 씬 초기화
# --------------------------------------------------------------------------- #
def reset_scene():
    """기본 씬(큐브/램프/카메라)까지 전부 비운다."""
    for coll in (
        bpy.data.objects,
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for item in list(coll):
            coll.remove(item, do_unlink=True)


# --------------------------------------------------------------------------- #
# 머티리얼
# --------------------------------------------------------------------------- #
def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hexcol(s):
    """'#RRGGBB' → 리니어 RGB 튜플 (Principled Base Color 용)."""
    s = s.lstrip("#")
    r, g, b = (int(s[i : i + 2], 16) / 255.0 for i in (0, 2, 4))
    return tuple(_srgb_to_linear(v) for v in (r, g, b))


_MAT_CACHE = {}


def material(name, color="#808080", metallic=0.0, roughness=0.5, emission=None, emission_strength=1.0, alpha=1.0):
    """Principled BSDF 머티리얼을 만들고(캐시) 반환한다. glTF PBR 로 그대로 매핑된다."""
    if name in _MAT_CACHE and _MAT_CACHE[name].name in bpy.data.materials:
        return _MAT_CACHE[name]

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    rgb = hexcol(color) if isinstance(color, str) else tuple(color)
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "IOR" in bsdf.inputs:
        bsdf.inputs["IOR"].default_value = 1.45
    if emission is not None:
        erg = hexcol(emission) if isinstance(emission, str) else tuple(emission)
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*erg, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
        elif "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = (*erg, 1.0)
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = "BLEND" if hasattr(mat, "blend_method") else mat.blend_method
    _MAT_CACHE[name] = mat
    return mat


# --------------------------------------------------------------------------- #
# 노드(오브젝트) 빌더
# --------------------------------------------------------------------------- #
class _Frame:
    """Node 의 로컬 좌표계를 일시적으로 밀어 넣는 컨텍스트 매니저."""

    def __init__(self, node, matrix):
        self.node = node
        self.matrix = matrix
        self.prev = None

    def __enter__(self):
        self.prev = self.node._xf.copy()
        self.node._xf = self.node._xf @ self.matrix
        return self.node

    def __exit__(self, *exc):
        self.node._xf = self.prev
        return False


class Node:
    """하나의 glTF 노드가 될 메시. 여러 머티리얼 슬롯을 가질 수 있다."""

    def __init__(self, name, origin=(0.0, 0.0, 0.0)):
        self.name = name
        self.origin = Vector(origin)
        self.bm = bmesh.new()
        self.mats = []  # 슬롯 순서대로의 bpy Material
        self._xf = Matrix.Identity(4)

    # -- 좌표계 스택 ------------------------------------------------------- #
    def frame(self, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
        """`with node.frame(loc=..., rot=...):` 안에서 만든 부품은 그 좌표계 기준."""
        return _Frame(self, Matrix.LocRotScale(Vector(loc), Euler([D2R(a) for a in rot], "XYZ"), Vector(scale)))

    # -- 내부 ------------------------------------------------------------- #
    def _slot(self, mat):
        for i, m in enumerate(self.mats):
            if m is mat:
                return i
        self.mats.append(mat)
        return len(self.mats) - 1

    def _absorb(self, tmp, mat, loc, rot, scale=(1.0, 1.0, 1.0), pivot=None):
        """임시 bmesh 를 변환해 본체에 합치고 머티리얼 슬롯을 태그한다."""
        if pivot is not None:
            bmesh.ops.translate(tmp, verts=tmp.verts, vec=Vector(pivot))
        local = Matrix.LocRotScale(Vector(loc), Euler([D2R(a) for a in rot], "XYZ"), Vector(scale))
        mat_world = Matrix.Translation(-self.origin) @ self._xf @ local
        bmesh.ops.transform(tmp, matrix=mat_world, verts=tmp.verts)

        me = bpy.data.meshes.new("_tmp")
        tmp.to_mesh(me)
        tmp.free()

        before = len(self.bm.faces)
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)

        self.bm.faces.ensure_lookup_table()
        idx = self._slot(mat)
        for f in self.bm.faces[before:]:
            f.material_index = idx
        return self

    # -- 프리미티브 -------------------------------------------------------- #
    def cube(self, mat, size=(1, 1, 1), loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, bevel_seg=2, pivot=None):
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        bmesh.ops.scale(tmp, verts=tmp.verts, vec=Vector(size))
        if bevel > 0:
            bmesh.ops.bevel(
                tmp,
                geom=list(tmp.verts) + list(tmp.edges),
                offset=bevel,
                segments=bevel_seg,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )
        return self._absorb(tmp, mat, loc, rot, pivot=pivot)

    def cyl(self, mat, r1=0.5, r2=None, depth=1.0, seg=16, loc=(0, 0, 0), rot=(0, 0, 0), caps=True, bevel=0.0, pivot=None):
        """축은 로컬 +Z. r2 를 주면 원뿔대."""
        r2 = r1 if r2 is None else r2
        tmp = bmesh.new()
        bmesh.ops.create_cone(
            tmp, cap_ends=caps, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=depth
        )
        if bevel > 0:
            edges = [e for e in tmp.edges if e.calc_face_angle(0.0) > D2R(35)]
            if edges:
                bmesh.ops.bevel(
                    tmp, geom=edges, offset=bevel, segments=2, profile=0.5, affect="EDGES", clamp_overlap=True
                )
        return self._absorb(tmp, mat, loc, rot, pivot=pivot)

    def sphere(self, mat, r=0.5, u=16, v=8, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), pivot=None):
        tmp = bmesh.new()
        bmesh.ops.create_uvsphere(tmp, u_segments=u, v_segments=v, radius=r)
        return self._absorb(tmp, mat, loc, rot, scale=scale, pivot=pivot)

    def loft(self, mat, stations, seg=12, profile=None, cap_start=True, cap_end=True, loc=(0, 0, 0), rot=(0, 0, 0)):
        """
        단면 로프트. stations = [(z, rx, ry[, y_offset][, twist_deg]), ...] 를 +Z 축으로 쌓는다.
        rx/ry 가 0 이면 그 스테이션은 하나의 점(첨두)으로 접힌다 — 노즈콘·프로펠러 팁용.
        twist_deg 는 단면을 Z축(스팬축) 기준으로 비튼다 — 블레이드 피치용.
        profile 을 주면 타원 대신 그 단면(단위 좌표 [(a, b), ...], a*rx / b*ry)을 쓴다 → 익형.
        """
        tmp = bmesh.new()
        base = profile if profile else [
            (math.cos(TAU * i / seg), math.sin(TAU * i / seg)) for i in range(seg)
        ]
        rings = []
        for st in stations:
            z, rx, ry = st[0], st[1], st[2]
            off = st[3] if len(st) > 3 else 0.0
            tw = D2R(st[4]) if len(st) > 4 else 0.0
            if abs(rx) <= 1e-6 or abs(ry) <= 1e-6:
                rings.append([tmp.verts.new((0.0, 0.0, z))])
                continue
            ring = []
            ct, stw = math.cos(tw), math.sin(tw)
            for (ua, ub) in base:
                px, py = ua * rx, ub * ry + off
                ring.append(tmp.verts.new((px * ct - py * stw, px * stw + py * ct, z)))
            rings.append(ring)
        tmp.verts.ensure_lookup_table()

        for a, b in zip(rings, rings[1:]):
            if len(a) == 1 and len(b) == 1:
                continue
            if len(a) == 1:
                for i in range(len(b)):
                    tmp.faces.new((a[0], b[i], b[(i + 1) % len(b)]))
            elif len(b) == 1:
                for i in range(len(a)):
                    tmp.faces.new((a[i], a[(i + 1) % len(a)], b[0]))
            else:
                for i in range(len(a)):
                    j = (i + 1) % len(a)
                    tmp.faces.new((a[i], a[j], b[j], b[i]))
        if cap_start and len(rings[0]) > 1:
            tmp.faces.new(rings[0][::-1])
        if cap_end and len(rings[-1]) > 1:
            tmp.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
        return self._absorb(tmp, mat, loc, rot)

    def dish(self, mat, radius=1.0, focal=0.55, rings=4, seg=20, thickness=0.02, loc=(0, 0, 0), rot=(0, 0, 0)):
        """포물면 접시 안테나(+Z 를 바라봄). z = r^2 / (4f)."""
        tmp = bmesh.new()
        grid = []
        for ri in range(rings + 1):
            r = radius * ri / rings
            z = (r * r) / (4.0 * focal)
            if ri == 0:
                grid.append([tmp.verts.new((0.0, 0.0, z))])
                continue
            row = []
            for i in range(seg):
                a = TAU * i / seg
                row.append(tmp.verts.new((math.cos(a) * r, math.sin(a) * r, z)))
            grid.append(row)
        tmp.verts.ensure_lookup_table()
        for a, b in zip(grid, grid[1:]):
            if len(a) == 1:
                for i in range(len(b)):
                    tmp.faces.new((a[0], b[i], b[(i + 1) % len(b)]))
            else:
                for i in range(len(a)):
                    j = (i + 1) % len(a)
                    tmp.faces.new((a[i], a[j], b[j], b[i]))
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
        bmesh.ops.solidify(tmp, geom=list(tmp.faces), thickness=-thickness)
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
        return self._absorb(tmp, mat, loc, rot)

    def solar_panel(self, mat_cell, mat_frame, size=(1.6, 4.4, 0.035), cells=(3, 8), loc=(0, 0, 0), rot=(0, 0, 0), groove=0.022):
        """
        태양전지 패널: 프레임 박스 + 윗면에 셀 격자(inset 로 홈을 파서 텍스처 없이 셀 감을 낸다).
        size = (폭 X, 길이 Y, 두께 Z)
        """
        sx, sy, sz = size
        # 프레임(본체)
        self.cube(mat_frame, size=(sx, sy, sz), loc=loc, rot=rot)
        # 셀 격자
        nx, ny = cells
        cw = (sx - groove * (nx + 1)) / nx
        ch = (sy - groove * (ny + 1)) / ny
        tmp = bmesh.new()
        for ix in range(nx):
            for iy in range(ny):
                x = -sx / 2 + groove * (ix + 1) + cw * (ix + 0.5)
                y = -sy / 2 + groove * (iy + 1) + ch * (iy + 0.5)
                v = [
                    tmp.verts.new((x - cw / 2, y - ch / 2, sz / 2 + 0.004)),
                    tmp.verts.new((x + cw / 2, y - ch / 2, sz / 2 + 0.004)),
                    tmp.verts.new((x + cw / 2, y + ch / 2, sz / 2 + 0.004)),
                    tmp.verts.new((x - cw / 2, y + ch / 2, sz / 2 + 0.004)),
                ]
                tmp.faces.new(v)
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
        self._absorb(tmp, mat_cell, loc, rot)
        return self

    # -- 마감 -------------------------------------------------------------- #
    def finalize(self, sharp_angle=32.0, smooth=True, weld=1e-5):
        bmesh.ops.remove_doubles(self.bm, verts=list(self.bm.verts), dist=weld)
        bmesh.ops.triangulate(self.bm, faces=list(self.bm.faces))
        thr = D2R(sharp_angle)
        for f in self.bm.faces:
            f.smooth = smooth
        for e in self.bm.edges:
            if len(e.link_faces) == 2:
                e.smooth = e.calc_face_angle(0.0) <= thr
            else:
                e.smooth = False

        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        ob.location = self.origin
        bpy.context.scene.collection.objects.link(ob)
        return ob


def tri_count():
    n = 0
    for ob in bpy.data.objects:
        if ob.type == "MESH":
            n += len(ob.data.loop_triangles) or sum(
                max(0, len(p.vertices) - 2) for p in ob.data.polygons
            )
    return n


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for ob in bpy.data.objects:
        if ob.type == "MESH":
            ob.data.calc_loop_triangles()
    tris = tri_count()
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_animations=False,
        export_normals=True,
        export_tangents=False,
        export_texcoords=False,
        use_selection=False,
    )
    size = os.path.getsize(path)
    print(f"[lxbuild] wrote {path}  tris={tris}  bytes={size} ({size/1024:.1f} KB)")
    for ob in sorted(bpy.data.objects, key=lambda o: o.name):
        if ob.type == "MESH":
            print(f"    node {ob.name:<12} tris={len(ob.data.loop_triangles):>5} mats={[m.name for m in ob.data.materials]}")
    return tris, size
