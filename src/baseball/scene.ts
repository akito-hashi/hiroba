// トイベースボールの盤の立体表示。状態は持たず、毎フレーム SceneView を受け取って描く。
import {
  CylinderGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Light,
  Material,
  Mesh,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Texture,
  WebGLRenderer,
  type BufferGeometry,
} from 'three';
import type { Vec } from './field';
import type { Side } from './rules';
import { BASES, COLORS, buildField, buildFielders, buildFigure, buildMachine, mat, place } from './scene-parts';

export type SceneView = {
  ball: Vec | null; // 盤上の球（null なら隠す）
  swingProgress: number | null; // 0〜1。バットの振り（null なら構え）
  bases: [boolean, boolean, boolean]; // 走者のいる塁に小さな人形
  battingSide: Side; // 色は役割で決める（守備側＝ピンク系、攻撃側＝青系）ので今は描画に使わない
};

const BALL_R = 1.1;
const BATTER_POS: Vec = { x: -6.5, y: 0.5 }; // 右打者は三塁側（-x）の打席に立つ
const BAT_LEN = 8;
// バットの向き（Y 軸まわり）。0 で本塁の上（+x）を指す。振りの中ほどが芯のタイミング
const SWING_FROM = -0.65 * Math.PI;
const SWING_TO = 0.65 * Math.PI;
const READY_TILT = 1.0; // 構えではバットを立てる
const SWING_TILT = 0.1;

export class BaseballScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(50, 1, 10, 600);
  private ball: Mesh;
  private batYaw = new Group();
  private batTilt = new Group();
  private runners: Group[];
  private disposed = false;

  constructor(private container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.domElement.style.display = 'block';
    container.appendChild(this.renderer.domElement);

    try {
      this.scene.background = new Color('#bfe4ff');
      this.camera.position.set(0, 70, 45);
      this.camera.lookAt(0, 0, -45);

      this.scene.add(new HemisphereLight('#ffffff', '#7aa37a', 1.8));
      const sun = new DirectionalLight('#ffffff', 2.2);
      sun.position.set(40, 120, 50);
      sun.target.position.set(0, 0, -45);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const sc = sun.shadow.camera;
      sc.left = -120;
      sc.right = 120;
      sc.top = 120;
      sc.bottom = -120;
      sc.near = 10;
      sc.far = 320;
      sun.shadow.bias = -0.0005;
      sun.shadow.normalBias = 0.05;
      sun.shadow.radius = 3;
      this.scene.add(sun, sun.target);

      this.scene.add(buildField(), buildFielders(), buildMachine());

      // 打者とバット。バットは手元を軸に回す
      const batter = place(buildFigure(COLORS.offense, COLORS.offenseCap, COLORS.offenseHead), BATTER_POS);
      batter.rotation.y = Math.PI / 2; // 本塁（+x）を向く
      this.scene.add(batter);
      const batGeo = new CylinderGeometry(0.42, 0.2, BAT_LEN, 16);
      batGeo.rotateZ(-Math.PI / 2); // 太い側を +x に
      batGeo.translate(BAT_LEN / 2, 0, 0);
      const bat = new Mesh(batGeo, mat('#e2b26b'));
      bat.castShadow = true;
      this.batTilt.add(bat);
      this.batYaw.add(this.batTilt);
      place(this.batYaw, { x: BATTER_POS.x + 1.6, y: BATTER_POS.y }, 3.6);
      this.scene.add(this.batYaw);

      // 走者（攻撃側の小さな人形）
      this.runners = BASES.map((b) => {
        const r = place(buildFigure(COLORS.offense, COLORS.offenseCap, COLORS.offenseHead), b, 0.5);
        r.scale.setScalar(0.7);
        r.lookAt(0, 0.5, 0);
        this.scene.add(r);
        return r;
      });

      this.ball = new Mesh(new SphereGeometry(BALL_R, 20, 14), mat('#ffffff'));
      this.ball.castShadow = true;
      this.scene.add(this.ball);

      this.resize();
    } catch (e) {
      // 作りかけの盤を片付けてから投げ直す
      this.dispose();
      throw e;
    }
  }

  render(v: SceneView): void {
    if (this.disposed) return;
    this.ball.visible = v.ball !== null;
    if (v.ball) place(this.ball, v.ball, BALL_R);

    const p = v.swingProgress;
    this.batYaw.rotation.y = p === null ? SWING_FROM : SWING_FROM + (SWING_TO - SWING_FROM) * p;
    this.batTilt.rotation.z = p === null ? READY_TILT : SWING_TILT;

    this.runners.forEach((r, i) => (r.visible = v.bases[i]));
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    if (this.disposed) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    this.scene.traverse((obj) => {
      if (obj instanceof Light) obj.dispose(); // 影のマップも解放される
      if (!(obj instanceof Mesh)) return;
      geometries.add(obj.geometry);
      for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) materials.add(m);
    });
    for (const m of materials) {
      for (const value of Object.values(m)) if (value instanceof Texture) textures.add(value);
    }
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
