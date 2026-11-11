// The 3D market: Preet's story as a candlestick chart you fly along while scrolling.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

const DX = 0.55; // world units between candles
const YS = 0.9; // world units per unit of price

const COLOR = {
  bg: 0x05060b,
  line: 0xa898ff,
  area: 0x6f5cff,
  average: 0x3d8bff,
  up: 0x22d39a,
  down: 0xff4d6a,
  grid: 0x1a2034,
  dust: 0x7a83b8,
  dot: 0xf4f1ff,
};

// Camera framing per section: the candle to look at, then distance, yaw and pitch (degrees) around it.
// sx/sy shift the picture (as a fraction of the screen) to make room for that section's copy.
const SHOTS = [
  { at: 12, dist: 9, yaw: -38, pitch: 9, ahead: 3.5, sx: 0.13 }, // 01 opening bell: copy on the left
  { at: 46, dist: 28, yaw: -16, pitch: 12, ahead: 0, sx: -0.13 }, // 02 price history: copy on the right
  { at: 102, dist: 24, yaw: -28, pitch: 24, ahead: 0, sx: 0.17 }, // 03 portfolio: copy on the left
  { at: 126, dist: 10, yaw: -52, pitch: 5, ahead: 3, sx: 0.05 }, // 04 terminal
  { yaw: -6, pitch: 14, wide: true, sx: 0, sy: 0.22 }, // 05 closing bell: the whole chart, above the copy
];
// How far the price line has been drawn at each section
const PLAYHEAD = [22, 76, 112, 134, 159];
const TAG_GAP = 26; // px between a candle and its label

const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const UP = new THREE.Vector3(0, 1, 0);

export function createScene({ canvas, tagLayer, candles, milestones, reducedMotion = false, snap = false }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOR.bg);
  scene.fog = new THREE.FogExp2(COLOR.bg, 0.03);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 600);

  const N = candles.length;
  const L = (N - 1) * DX;
  const closes = candles.map((c) => c.close);
  const floorY = Math.min(...candles.map((c) => c.low)) * YS - 1.8;
  const topY = Math.max(...candles.map((c) => c.high)) * YS;
  const smoothClose = (i) => {
    let sum = 0;
    let n = 0;
    for (let k = Math.max(0, i - 5); k <= Math.min(N - 1, i + 5); k++, n++) sum += closes[k];
    return sum / n;
  };

  /* --- Grid: a floor that recedes into the fog, and price levels on a back wall --- */
  const floor = new THREE.GridHelper(340, 170, COLOR.grid, COLOR.grid);
  floor.position.set(L / 2, floorY, 0);
  floor.material.transparent = true;
  floor.material.opacity = 0.6;
  floor.material.depthWrite = false;
  scene.add(floor);

  const wall = [];
  for (let y = Math.ceil(floorY); y <= topY + 6; y += 2) wall.push(-40, y, -5, L + 40, y, -5);
  for (let i = 0; i < N; i += 10) wall.push(i * DX, floorY, -5, i * DX, topY + 6, -5);
  const wallGeometry = new THREE.BufferGeometry();
  wallGeometry.setAttribute("position", new THREE.Float32BufferAttribute(wall, 3));
  scene.add(new THREE.LineSegments(wallGeometry, new THREE.LineBasicMaterial({ color: COLOR.grid, transparent: true, opacity: 0.8 })));

  /* --- Candles, wicks and volume bars --- */
  const box = new THREE.BoxGeometry(1, 1, 1);
  const instanced = (opacity = 1) => {
    const mesh = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ toneMapped: false, transparent: opacity < 1, opacity }), N);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  };
  const bodies = instanced();
  const wicks = instanced();
  const volumes = instanced(0.4);
  const up = new THREE.Color(COLOR.up);
  const down = new THREE.Color(COLOR.down);
  candles.forEach((c, i) => {
    const color = c.close >= c.open ? up : down;
    bodies.setColorAt(i, color.clone().multiplyScalar(0.62));
    wicks.setColorAt(i, color.clone().multiplyScalar(0.45));
    volumes.setColorAt(i, color.clone().multiplyScalar(0.16));
  });

  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const at = new THREE.Vector3();
  const size = new THREE.Vector3();
  function layoutCandles(play) {
    for (let i = 0; i < N; i++) {
      const c = candles[i];
      const grow = ease(clamp01((play - i) / 2.5));
      const width = grow > 0.001 ? DX * 0.62 : 1e-4;
      const x = i * DX;

      at.set(x, ((c.open + c.close) / 2) * YS, 0);
      size.set(width, Math.max(Math.abs(c.close - c.open) * YS, 0.05) * grow + 1e-4, width);
      bodies.setMatrixAt(i, matrix.compose(at, rotation, size));

      at.set(x, ((c.high + c.low) / 2) * YS, 0);
      size.set(grow > 0.001 ? 0.045 : 1e-4, (c.high - c.low) * YS * grow + 1e-4, grow > 0.001 ? 0.045 : 1e-4);
      wicks.setMatrixAt(i, matrix.compose(at, rotation, size));

      const height = c.volume * grow;
      at.set(x, floorY + height / 2, 0);
      size.set(width, height + 1e-4, width);
      volumes.setMatrixAt(i, matrix.compose(at, rotation, size));
    }
    bodies.instanceMatrix.needsUpdate = true;
    wicks.instanceMatrix.needsUpdate = true;
    volumes.instanceMatrix.needsUpdate = true;
  }

  /* --- Price line, a soft area fill under it, and a moving average --- */
  const curve = new THREE.CatmullRomCurve3(closes.map((p, i) => new THREE.Vector3(i * DX, p * YS, 0)), false, "catmullrom", 0.25);
  const SEG = (N - 1) * 6;
  const samples = curve.getPoints(SEG); // evenly spaced by candle, so segment k sits at candle k / 6

  const lineGeometry = new LineGeometry();
  lineGeometry.setPositions(samples.flatMap((p) => [p.x, p.y, p.z]));
  const lineMaterial = new LineMaterial({ color: COLOR.line, linewidth: 2.4, worldUnits: false });
  lineMaterial.fog = true;
  const priceLine = new Line2(lineGeometry, lineMaterial);
  priceLine.frustumCulled = false;
  scene.add(priceLine);

  const areaPositions = [];
  const areaColors = [];
  const areaIndex = [];
  const glow = new THREE.Color(COLOR.area).multiplyScalar(0.09);
  samples.forEach((p, k) => {
    areaPositions.push(p.x, p.y, -0.02, p.x, Math.max(floorY, p.y - 1.6), -0.02); // a glow band just under the line
    areaColors.push(glow.r, glow.g, glow.b, 0, 0, 0);
    if (k < SEG) areaIndex.push(2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 1, 2 * k + 3, 2 * k + 2);
  });
  const areaGeometry = new THREE.BufferGeometry();
  areaGeometry.setAttribute("position", new THREE.Float32BufferAttribute(areaPositions, 3));
  areaGeometry.setAttribute("color", new THREE.Float32BufferAttribute(areaColors, 3));
  areaGeometry.setIndex(areaIndex);
  const area = new THREE.Mesh(
    areaGeometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  area.frustumCulled = false;
  scene.add(area);

  const average = closes.map((_, i) => {
    let sum = 0;
    for (let k = Math.max(0, i - 11); k <= i; k++) sum += closes[k];
    return sum / (i - Math.max(0, i - 11) + 1);
  });
  const averageGeometry = new LineGeometry();
  averageGeometry.setPositions(average.flatMap((p, i) => [i * DX, p * YS, -0.3]));
  const averageMaterial = new LineMaterial({ color: COLOR.average, linewidth: 1.2, worldUnits: false, transparent: true, opacity: 0.55 });
  averageMaterial.fog = true;
  const averageLine = new Line2(averageGeometry, averageMaterial);
  averageLine.frustumCulled = false;
  scene.add(averageLine);

  /* --- Playhead: a glowing dot at the tip of the line, with a dashed last-price line --- */
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 20), new THREE.MeshBasicMaterial({ color: COLOR.dot, toneMapped: false }));
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color: COLOR.line, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  halo.scale.setScalar(0.9);
  dot.add(halo);
  scene.add(dot);

  const lastPrice = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ color: COLOR.line, dashSize: 0.22, gapSize: 0.16, transparent: true, opacity: 0.5 })
  );
  lastPrice.frustumCulled = false;
  scene.add(lastPrice);

  /* --- Milestones: HTML labels pinned to candles, laid out in screen space --- */
  const marks = milestones.map((ms) => {
    const c = candles[ms.at];
    const isDown = ms.dir === "down";
    const el = document.createElement("div");
    el.className = `tag tag--${ms.dir}`;
    const title = document.createElement("b");
    const note = document.createElement("span");
    title.textContent = ms.title;
    note.textContent = ms.note;
    el.append(title, note);
    tagLayer.append(el);
    const base = new THREE.Vector3(ms.at * DX, (isDown ? c.low : c.high) * YS, 0);
    return { at: ms.at, isDown, base, el, vis: 0, shown: false, width: 0, height: 0 };
  });
  const remeasureTags = () => marks.forEach((mark) => (mark.width = 0));
  document.fonts?.ready.then(remeasureTags);
  let occluders = [];

  /* --- Dust, for depth --- */
  const DUST = innerWidth < 720 ? 500 : 1100;
  const dustPositions = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dustPositions[i * 3] = -30 + Math.random() * (L + 60);
    dustPositions[i * 3 + 1] = floorY + Math.random() * (topY - floorY + 16);
    dustPositions[i * 3 + 2] = -30 + Math.random() * 50;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({ color: COLOR.dust, size: 0.05, transparent: true, opacity: 0.6, depthWrite: false })
  );
  scene.add(dust);

  /* --- Glow --- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.45, 0.22);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* --- Camera path through the five sections --- */
  let posCurve;
  let lookCurve;
  let shiftX = [];
  let shiftY = [];
  const view = { w: 1, h: 1, sx: NaN, sy: NaN };
  function planShots(aspect) {
    const portrait = aspect < 0.85;
    const points = [];
    const looks = [];
    // Phones stack the copy at the bottom, so the picture moves up instead of sideways
    shiftX = SHOTS.map((shot) => (aspect > 1.15 ? shot.sx ?? 0 : 0));
    shiftY = SHOTS.map((shot) => (portrait ? (shot.wide ? 0.2 : 0.14) : shot.sy ?? 0));
    for (const shot of SHOTS) {
      const target = new THREE.Vector3();
      let dist;
      let yaw = shot.yaw;
      if (shot.wide) {
        target.set(L * 0.5, (floorY + topY) / 2 + 1, 0);
        if (portrait) {
          yaw = -62;
          dist = L * 0.8;
        } else {
          const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * aspect);
          dist = (L * 0.5) / (Math.tan(half) * 0.84); // chart spans ~85% of the width
        }
      } else {
        target.set(shot.at * DX + shot.ahead, smoothClose(shot.at) * YS + 0.6, 0);
        dist = shot.dist * (portrait ? 1.35 : 1);
      }
      const y = THREE.MathUtils.degToRad(yaw);
      const p = THREE.MathUtils.degToRad(shot.pitch);
      points.push(new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)).multiplyScalar(dist).add(target));
      looks.push(target);
    }
    posCurve = new THREE.CatmullRomCurve3(points, false, "centripetal");
    lookCurve = new THREE.CatmullRomCurve3(looks, false, "centripetal");
  }

  function resize() {
    const w = innerWidth;
    const h = innerHeight;
    const aspect = w / h;
    renderer.setPixelRatio(Math.min(devicePixelRatio, w < 720 ? 1.5 : 1.75));
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = aspect;
    camera.fov = aspect < 1 ? 52 : 40;
    view.w = w;
    view.h = h;
    view.sx = NaN; // force the view offset to be re-applied
    lineMaterial.resolution.set(w, h);
    averageMaterial.resolution.set(w, h);
    remeasureTags();
    planShots(aspect);
  }

  function applyShift(sx, sy) {
    if (Math.abs(sx - view.sx) < 1e-4 && Math.abs(sy - view.sy) < 1e-4) return;
    view.sx = sx;
    view.sy = sy;
    camera.setViewOffset(view.w, view.h, -view.w * sx, view.h * sy, view.w, view.h);
    camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize);
  resize();

  /* --- Per-frame --- */
  const state = {
    story: 0,
    goal: 0,
    intro: snap || reducedMotion ? 1 : 0,
    introOn: snap || reducedMotion,
    px: 0,
    py: 0,
    sx: 0,
    sy: 0,
    yaw: 0,
    pitch: 0,
    play: -1,
  };
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const side = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const clock = new THREE.Clock();
  let frames = 0;
  let markReady;
  const ready = new Promise((resolve) => (markReady = resolve));

  // The glow under the line fades in behind the tip instead of ending in a hard edge
  const areaColor = areaGeometry.attributes.color;
  const RAMP = 36; // samples (6 per candle)
  let ramp = [0, 0];
  function shadeTip(segments) {
    const from = Math.max(0, Math.min(ramp[0], segments - RAMP));
    const to = Math.min(SEG, Math.max(ramp[1], segments));
    for (let k = from; k <= to; k++) {
      const f = clamp01((segments - k) / RAMP);
      areaColor.setXYZ(2 * k, glow.r * f, glow.g * f, glow.b * f);
    }
    areaColor.needsUpdate = true;
    ramp = [Math.max(0, segments - RAMP), segments];
  }

  function drawTo(play) {
    layoutCandles(play);
    const t = clamp01(play / (N - 1));
    const segments = Math.max(1, Math.round(t * SEG));
    lineGeometry.instanceCount = segments;
    areaGeometry.setDrawRange(0, segments * 6);
    shadeTip(segments);
    averageGeometry.instanceCount = Math.max(1, Math.floor(play));
    curve.getPoint(t, dot.position);
    dot.visible = lastPrice.visible = play > 0.4;
    const ends = lastPrice.geometry.attributes.position;
    ends.setXYZ(0, dot.position.x, dot.position.y, 0);
    ends.setXYZ(1, L + 14, dot.position.y, 0);
    ends.needsUpdate = true;
    lastPrice.computeLineDistances();
  }

  // Labels stack so neighbours never overlap, and fade out wherever they'd sit behind the copy
  const placed = [];
  const hits = (a, b, pad) => a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;
  function placeTags(play) {
    const reach = pos.distanceTo(look) * 2.2;
    placed.length = 0;
    for (const mark of marks) {
      if (!mark.width) {
        mark.width = mark.el.offsetWidth;
        mark.height = mark.el.offsetHeight;
      }
      projected.copy(mark.base).project(camera);
      const ax = ((projected.x + 1) / 2) * view.w;
      const ay = ((1 - projected.y) / 2) * view.h;
      const onScreen = projected.z < 1 && ax > -60 && ax < view.w + 60 && ay > -60 && ay < view.h + 60;
      let target = onScreen ? clamp01((play - mark.at) / 3) * clamp01(1.6 - camera.position.distanceTo(mark.base) / reach) : 0;

      // Keep the label on screen; its stem still points at the candle
      const left = Math.max(8, Math.min(view.w - mark.width - 8, ax - mark.width / 2));
      const box = { left, right: left + mark.width, top: 0, bottom: 0 };
      box.top = mark.isDown ? ay + TAG_GAP : ay - TAG_GAP - mark.height;
      box.bottom = box.top + mark.height;
      if (target > 0) {
        for (let guard = 0; guard <= placed.length; guard++) {
          const clash = placed.find((other) => hits(box, other, 6));
          if (!clash) break;
          box.top = mark.isDown ? clash.bottom + 6 : clash.top - 6 - mark.height;
          box.bottom = box.top + mark.height;
        }
        if (occluders.some((rect) => hits(box, rect, 0))) target = 0;
        else placed.push({ ...box });
      }

      mark.vis += (target - mark.vis) * (snap ? 1 : 0.18);
      if (mark.vis < 0.02) {
        if (mark.shown) mark.el.style.opacity = "0";
        mark.shown = false;
        continue;
      }
      mark.shown = true;
      mark.el.style.opacity = mark.vis.toFixed(3);
      mark.el.style.transform = `translate3d(${box.left.toFixed(1)}px, ${box.top.toFixed(1)}px, 0)`;
      mark.el.style.setProperty("--stem", `${Math.max(0, mark.isDown ? box.top - ay : ay - box.bottom).toFixed(1)}px`);
      mark.el.style.setProperty("--stem-x", `${Math.max(2, Math.min(mark.width - 2, ax - box.left)).toFixed(1)}px`);
    }
  }

  function render() {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    state.story = snap ? state.goal : state.story + (state.goal - state.story) * (1 - Math.exp(-dt * 3.2));
    if (state.introOn && state.intro < 1) state.intro = Math.min(1, state.intro + dt / 2.6);
    const intro = 1 - Math.pow(1 - state.intro, 3);

    const last = SHOTS.length - 1;
    const seg = Math.min(Math.floor(state.story), last - 1);
    const local = ease(clamp01(state.story - seg));
    posCurve.getPoint((seg + local) / last, pos);
    lookCurve.getPoint((seg + local) / last, look);
    applyShift(shiftX[seg] + (shiftX[seg + 1] - shiftX[seg]) * local, shiftY[seg] + (shiftY[seg + 1] - shiftY[seg]) * local);

    // Intro: drift in from higher and further out while the line starts drawing
    pos.y += (1 - intro) * 2.5;
    pos.z += (1 - intro) * 5;

    if (!reducedMotion) {
      const k = 1 - Math.exp(-dt * 2.5);
      state.sx += (state.px - state.sx) * k;
      state.sy += (state.py - state.sy) * k;
      pos.x += state.sx * 0.6;
      pos.y -= state.sy * 0.35;
    }

    // At the closing bell, visitors can drag the view around the chart
    const orbit = ease(clamp01((state.story - 3.5) / 0.5));
    if (orbit > 0) {
      offset.subVectors(pos, look).applyAxisAngle(UP, state.yaw * orbit);
      side.crossVectors(offset, UP).normalize();
      offset.applyAxisAngle(side, state.pitch * orbit);
      pos.addVectors(look, offset);
    } else {
      state.yaw *= 0.92;
      state.pitch *= 0.92;
    }

    camera.position.copy(pos);
    camera.lookAt(look);
    scene.fog.density = 0.42 / Math.max(6, pos.distanceTo(look));

    const pseg = Math.min(Math.floor(state.story), PLAYHEAD.length - 2);
    const play = (PLAYHEAD[pseg] + (PLAYHEAD[pseg + 1] - PLAYHEAD[pseg]) * ease(clamp01(state.story - pseg))) * intro;
    if (Math.abs(play - state.play) > 0.001) {
      drawTo(play);
      state.play = play;
    }

    halo.material.opacity = reducedMotion ? 0.55 : 0.45 + Math.sin(t * 3) * 0.15;
    if (!reducedMotion) dust.position.y = Math.sin(t * 0.25) * 0.4;
    placeTags(play);
    composer.render();

    if (++frames === 2) markReady();
    if (snap && frames > 40) renderer.setAnimationLoop(null); // screenshots: let the page go idle
  }
  renderer.setAnimationLoop(render);

  return {
    ready,
    setStory(story) {
      state.goal = story;
    },
    setPointer(x, y) {
      state.px = x;
      state.py = y;
    },
    drag(dx, dy) {
      state.yaw -= dx * 0.005;
      state.pitch = Math.max(-0.25, Math.min(0.8, state.pitch + dy * 0.004));
    },
    intro() {
      state.introOn = true;
    },
    setOccluders(rects) {
      occluders = rects;
    },
    getPlayhead: () => Math.max(0, state.play),
  };
}

function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(255,255,255,0.45)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
