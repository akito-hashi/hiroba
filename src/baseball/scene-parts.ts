// 盤の立体表示の部品づくり。盤座標 (x, y) は 3D の (x, 0, -y) に置く。
// 平らな部品は盤座標のまま XY 平面に作り、X 軸まわりに -90° 倒して地面に寝かせる。
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  SphereGeometry,
} from 'three';
import { CUPS, FENCE_R, FOUL_ANGLE, INFIELD_R, MOUND_Y, WALL_SEGMENTS, type Cup, type Vec } from './field';

export const COLORS = {
  defense: '#ff7eb6', // 守備側（ピンク系）
  defenseCap: '#ff4f9a',
  defenseHead: '#ffd3e6',
  offense: '#3d7bff', // 攻撃側（青系）
  offenseCap: '#1f4fd1',
  offenseHead: '#d6e4ff',
};
const LANE_INNER = FENCE_R - 11; // 区画の色帯の内側の半径
const LANE_COLORS = { triple: '#ff8a3d', double: '#4fb7ff', single: '#5fcf7a', homer: '#ffcc33' };
const LANE_LABELS = { triple: '3', double: '2', single: '1', homer: 'crown' };
// 塁の位置（一塁・二塁・三塁）。飾りなので物理とは関係しない
export const BASES: Vec[] = [
  { x: 22, y: 22 },
  { x: 0, y: 44 },
  { x: -22, y: 22 },
];

export const mat = (color: string, opts: { side?: typeof DoubleSide } = {}) =>
  new MeshStandardMaterial({ color, roughness: 0.65, metalness: 0, ...opts });

// 盤座標の点を 3D の位置に置く
export function place<T extends { position: { set(x: number, y: number, z: number): unknown } }>(
  obj: T,
  p: Vec,
  height = 0,
): T {
  obj.position.set(p.x, height, -p.y);
  return obj;
}

// 盤座標で作った平らな形を地面に寝かせる。lift は重なり順のための高さ
function flat(geo: BufferGeometry, material: MeshStandardMaterial, lift: number): Mesh {
  const m = new Mesh(geo, material);
  m.rotation.x = -Math.PI / 2;
  m.position.y = lift;
  m.receiveShadow = true;
  return m;
}

function solid(geo: BufferGeometry, material: MeshStandardMaterial): Mesh {
  const m = new Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// 盤の角度 a（+y から右回りが正）を XY 平面の角度（+x から左回り）にする
const planeAngle = (a: number) => Math.PI / 2 - a;
const laneWidth = (2 * FOUL_ANGLE) / WALL_SEGMENTS.length;

// 区画の床に置く文字（王冠は図形で描く）
function labelTexture(label: string): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.lineJoin = 'round';
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(40, 40, 70, 0.55)';
  g.fillStyle = '#ffffff';
  if (label === 'crown') {
    g.beginPath();
    g.moveTo(16, 100);
    g.lineTo(12, 36);
    g.lineTo(40, 62);
    g.lineTo(64, 22);
    g.lineTo(88, 62);
    g.lineTo(116, 36);
    g.lineTo(112, 100);
    g.closePath();
    g.stroke();
    g.fillStyle = '#fff3b0';
    g.fill();
  } else {
    g.font = 'bold 110px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.strokeText(label, size / 2, size / 2 + 6);
    g.fillText(label, size / 2, size / 2 + 6);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// 芝・土・線・塁・壁の区画・スタンド
export function buildField(): Group {
  const g = new Group();
  const fanStart = planeAngle(FOUL_ANGLE);
  const fanLen = 2 * FOUL_ANGLE;

  const ground = flat(new PlaneGeometry(600, 600), mat('#5f9a63'), 0);
  ground.position.z = -60;
  g.add(ground);

  // 芝の縞（同心円の帯を交互の色で）
  const stripes = 10;
  const stripeMats = [mat('#4cbf5a'), mat('#3fae4e')];
  for (let i = 0; i < stripes; i++) {
    const r0 = (LANE_INNER * i) / stripes;
    const r1 = (LANE_INNER * (i + 1)) / stripes;
    g.add(flat(new RingGeometry(r0, r1, 48, 1, fanStart, fanLen), stripeMats[i % 2], 0.05));
  }

  // 内野の土（ここより内側で止まればアウト）と内側の芝、マウンド
  g.add(flat(new CircleGeometry(INFIELD_R, 48, fanStart, fanLen), mat('#c98a4b'), 0.1));
  const grass = new Shape();
  grass.moveTo(0, 7);
  grass.lineTo(16, 22);
  grass.lineTo(0, 37);
  grass.lineTo(-16, 22);
  grass.closePath();
  g.add(flat(new ShapeGeometry(grass), stripeMats[0], 0.15));
  const mound = flat(new CircleGeometry(5, 32), mat('#b87a3e'), 0.2);
  mound.position.z = -MOUND_Y;
  g.add(mound);
  g.add(flat(new CircleGeometry(6, 32), mat('#c98a4b'), 0.12));

  // 壁の7区画の色帯と文字。field.ts と同じく -45°〜+45° を等分する
  WALL_SEGMENTS.forEach((seg, i) => {
    const a0 = -FOUL_ANGLE + i * laneWidth;
    const band = new RingGeometry(LANE_INNER, FENCE_R, 12, 1, planeAngle(a0 + laneWidth), laneWidth);
    g.add(flat(band, mat(LANE_COLORS[seg]), 0.1));
    const mid = a0 + laneWidth / 2;
    const r = (LANE_INNER + FENCE_R) / 2;
    const label = flat(
      new PlaneGeometry(8, 8),
      new MeshStandardMaterial({ map: labelTexture(LANE_LABELS[seg]), transparent: true, roughness: 0.8 }),
      0.2,
    );
    label.rotation.z = -mid; // 文字の上を本塁から外向きに
    label.position.x = r * Math.sin(mid);
    label.position.z = -r * Math.cos(mid);
    g.add(label);
  });

  // 白線：ファウルライン、区画の境目
  const white = mat('#ffffff');
  const radial = (a: number, r0: number, r1: number, w: number, lift: number) => {
    const geo = new PlaneGeometry(w, r1 - r0);
    geo.translate(0, (r0 + r1) / 2, 0);
    geo.rotateZ(-a);
    return flat(geo, white, lift);
  };
  for (const a of [-FOUL_ANGLE, FOUL_ANGLE]) g.add(radial(a, 0, FENCE_R, 0.7, 0.25));
  for (let i = 1; i < WALL_SEGMENTS.length; i++) g.add(radial(-FOUL_ANGLE + i * laneWidth, LANE_INNER, FENCE_R, 0.5, 0.25));
  g.add(flat(new RingGeometry(LANE_INNER - 0.25, LANE_INNER + 0.25, 64, 1, fanStart, fanLen), white, 0.25));

  // 塁と本塁
  for (const b of BASES) {
    const base = place(solid(new BoxGeometry(2.6, 0.5, 2.6), white), b, 0.25);
    base.rotation.y = Math.PI / 4;
    g.add(base);
  }
  const plate = new Shape();
  plate.moveTo(-1.8, 1.8);
  plate.lineTo(1.8, 1.8);
  plate.lineTo(1.8, 0);
  plate.lineTo(0, -1.8);
  plate.lineTo(-1.8, 0);
  plate.closePath();
  g.add(flat(new ShapeGeometry(plate), white, 0.3));

  g.add(buildWalls());
  return g;
}

// 奥の壁とスタンド、ファウルライン沿いの低い壁
function buildWalls(): Group {
  const g = new Group();
  // CylinderGeometry の角度 θ は (sinθ, cosθ) = (x, z)。盤の角度 a なら θ = π - a
  const arc = (r: number, h: number, y: number, material: MeshStandardMaterial) => {
    const m = solid(new CylinderGeometry(r, r, h, 64, 1, true, Math.PI - FOUL_ANGLE, 2 * FOUL_ANGLE), material);
    m.position.y = y + h / 2;
    return m;
  };
  const blue = mat('#2f6fd6', { side: DoubleSide });
  g.add(arc(FENCE_R + 0.6, 5, 0, blue));
  // 区画の境目の白い柱
  const post = mat('#ffffff');
  for (let i = 0; i <= WALL_SEGMENTS.length; i++) {
    const a = -FOUL_ANGLE + i * laneWidth;
    const p = solid(new BoxGeometry(0.8, 5.6, 0.8), post);
    p.position.set((FENCE_R + 0.6) * Math.sin(a), 2.8, -(FENCE_R + 0.6) * Math.cos(a));
    g.add(p);
  }
  // 段になったスタンド（前面の円弧＋上面の帯）
  const tiers = ['#3a7fe8', '#2a62c4', '#1f4ea3'];
  let r = FENCE_R + 0.6;
  let h = 5;
  tiers.forEach((color, i) => {
    const m = mat(color, { side: DoubleSide });
    const next = r + 7;
    const top = flat(new RingGeometry(r, next, 64, 1, planeAngle(FOUL_ANGLE), 2 * FOUL_ANGLE), m, h);
    g.add(top);
    if (i + 1 < tiers.length) g.add(arc(next, 5, h, m));
    r = next;
    h += 5;
  });
  // ファウルライン外側の低い壁
  for (const s of [-1, 1]) {
    const len = FENCE_R - 6;
    const w = solid(new BoxGeometry(1, 2.5, len), blue);
    const a = s * FOUL_ANGLE;
    const mid = 6 + len / 2;
    const out = 4; // 線から外へ離す
    w.position.set(mid * Math.sin(a) + s * out * Math.cos(a), 1.25, -(mid * Math.cos(a)) + s * out * Math.sin(a));
    w.rotation.y = -a;
    g.add(w);
  }
  return g;
}

// 人形（カプセルの胴・球の頭・帽子とつば）。正面は +z、高さはおよそ 7
export function buildFigure(body: string, cap: string, head: string): Group {
  const g = new Group();
  const bodyMesh = solid(new CapsuleGeometry(1.3, 2.4, 6, 16), mat(body));
  bodyMesh.position.y = 2.5;
  const headMesh = solid(new SphereGeometry(1.2, 20, 14), mat(head));
  headMesh.position.y = 5.9;
  const capMat = mat(cap);
  const capTop = solid(new SphereGeometry(1.26, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
  capTop.position.y = 6.1;
  const brim = solid(new CylinderGeometry(0.95, 0.95, 0.15, 20), capMat);
  brim.position.set(0, 6.15, 1.0);
  const eyeMat = mat('#222233');
  const eyes = [-0.42, 0.42].map((x) => {
    const e = new Mesh(new SphereGeometry(0.16, 8, 6), eyeMat);
    e.position.set(x, 5.85, 1.1);
    return e;
  });
  g.add(bodyMesh, headMesh, capTop, brim, ...eyes);
  return g;
}

// 守備人形の受け皿（浅い円柱）。半径は物理と同じ r
export function buildCup(c: Cup): Group {
  const g = new Group();
  const dish = solid(new CylinderGeometry(c.r, c.r * 0.85, 0.8, 36), mat(COLORS.defense));
  dish.position.y = 0.4;
  const inner = new Mesh(new CircleGeometry(c.r * 0.8, 36), mat('#e0528f'));
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.82;
  g.add(dish, inner);
  return place(g, c);
}

// 受け皿と、その横（外側）に立つ守備人形
export function buildFielders(): Group {
  const g = new Group();
  for (const c of CUPS) {
    g.add(buildCup(c));
    const fig = buildFigure(COLORS.defense, COLORS.defenseCap, COLORS.defenseHead);
    place(fig, { x: c.x + (c.x < 0 ? -1 : 1) * (c.r + 1.6), y: c.y });
    fig.lookAt(0, 0, 0);
    g.add(fig);
  }
  return g;
}

// マウンドの投球マシン（箱＋本塁を向いた筒）
export function buildMachine(): Group {
  const g = new Group();
  const pink = mat(COLORS.defense);
  const body = solid(new BoxGeometry(5, 3.6, 4.4), pink);
  body.position.y = 2.2;
  const top = solid(new CylinderGeometry(1.6, 1.2, 1.4, 20), mat(COLORS.defenseCap));
  top.position.y = 4.7;
  const barrel = solid(new CylinderGeometry(0.9, 1.1, 4, 20), mat('#3a3346'));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 2.6, 3.6);
  const legs = solid(new BoxGeometry(6, 0.4, 5), mat('#8a8798'));
  legs.position.y = 0.2;
  g.add(body, top, barrel, legs);
  return place(g, { x: 0, y: MOUND_Y });
}
