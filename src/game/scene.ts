import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { RacerEntry } from "@/shared/types";
import type { ReplayReader } from "@/shared/replay";
import { FINISH_Y, HEAD_RADIUS, ROTORS, TRACK_VERSION, launchHeight, trackPoint } from "@/sim/track";
import { physicalSeconds, position } from "./replay";
import { buildBedroom } from "./bedroom";

export type CameraMode = "follow" | "overview";
export interface SceneFrame { ms: number; follow: number; mode: CameraMode }

/** Le parcours visible vient exclusivement de l'OBJ fourni, converti en GLB. */
export async function createRaceScene(canvas: HTMLCanvasElement, reader: ReplayReader, racers: RacerEntry[], frame: () => SceneFrame, onError: (message: string) => void) {
  const imported = await new GLTFLoader().loadAsync(`/models/course.glb?v=${TRACK_VERSION}`);
  const mobile = window.matchMedia("(max-width: 700px)").matches;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.75));
  renderer.setClearColor(0x17101f);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 1, 0.08, 500);
  scene.add(new THREE.HemisphereLight(0xc3badb, 0x302130, 1.7));
  const key = new THREE.DirectionalLight(0xffdcc0, 3.1);
  key.position.set(-25, 65, 30); key.castShadow = !mobile;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -68, right: 68, top: 45, bottom: -45, near: 1, far: 160 });
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9b7cde, 1.3); fill.position.set(35, 35, -40); scene.add(fill);
  const roomScene = new THREE.Scene(); buildBedroom(roomScene);
  const room = new THREE.Group(); [...roomScene.children].forEach((o) => room.add(o));
  room.scale.setScalar(0.55); room.rotation.y = Math.PI / 2; room.position.set(-53, -4.5, 0); scene.add(room);
  scene.add(imported.scene);
  const mill = imported.scene.getObjectByName("mill");
  imported.scene.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
  const textures: THREE.Texture[] = [];
  let disposed = false;
  const image = new THREE.TextureLoader().load("/images/ovule-user.png", (t) => { if (disposed) t.dispose(); });
  image.colorSpace = THREE.SRGBColorSpace; textures.push(image);
  const finishImage = new THREE.Sprite(new THREE.SpriteMaterial({ map: image, toneMapped: false }));
  finishImage.position.set(60, 3.2, -9.5); finishImage.scale.set(4.2, 4.2 * 442 / 445, 1); scene.add(finishImage);

  const sphere = new THREE.SphereGeometry(1, mobile ? 12 : 20, mobile ? 8 : 14);
  const tailGeo = new THREE.CylinderGeometry(1, 1, 1, mobile ? 5 : 8);
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.24, metalness: 0.05, clearcoat: 0.55, clearcoatRoughness: 0.25 });
  const tailCount = mobile ? 10 : 16;
  const heads = new THREE.InstancedMesh(sphere, bodyMat, racers.length);
  const caps = new THREE.InstancedMesh(sphere, bodyMat, racers.length);
  const tails = new THREE.InstancedMesh(tailGeo, bodyMat, racers.length * tailCount);
  for (const mesh of [heads, caps, tails]) { mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.castShadow = !mobile; scene.add(mesh); }
  racers.forEach((r, i) => {
    const color = new THREE.Color(r.color.replace(/hsl\((\d+) (\d+)% (\d+)%\)/, "hsl($1, $2%, $3%)"));
    heads.setColorAt(i, color.clone().lerp(new THREE.Color(0xffffff), 0.35));
    caps.setColorAt(i, color);
    for (let k = 0; k < tailCount; k++) tails.setColorAt(i * tailCount + k, color);
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.012, 6, 40), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  ring.rotation.x = Math.PI / 2; scene.add(ring);
  const marker = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 5), new THREE.MeshBasicMaterial({ color: 0xf2d98b })); marker.rotation.z = Math.PI; scene.add(marker);
  const dummy = new THREE.Object3D(), hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const point = (i: number, ms: number) => {
    const [lane, s] = position(reader, i, ms);
    const age = physicalSeconds(reader, ms) - (reader.replay.releaseTimes?.[i] ?? 0) / 1000;
    return new THREE.Vector3(...trackPoint(lane, s, HEAD_RADIUS + 0.015 + launchHeight(age)));
  };
  const target = new THREE.Vector3(), look = new THREE.Vector3(), direction = new THREE.Vector3(1, 0, 0), desired = new THREE.Vector3();
  const finish = new THREE.Vector3(...trackPoint(0, FINISH_Y, 0.5));
  let lastTime = -Infinity, lastFollow = -1, initialized = false, lastFrame = performance.now();
  const resize = new ResizeObserver(() => { const { width, height } = canvas.getBoundingClientRect(); if (width && height) { renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); } });
  resize.observe(canvas);
  const lost = (event: Event) => { event.preventDefault(); renderer.setAnimationLoop(null); onError("3D rendering was interrupted. Reload to resume."); };
  canvas.addEventListener("webglcontextlost", lost);
  renderer.setAnimationLoop(() => {
    if (document.hidden) { lastFrame = performance.now(); return; }
    const now = performance.now(), dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
    const { ms, follow, mode } = frame();
    const time = Math.max(0, ms), selected = Math.max(0, Math.min(follow, racers.length - 1));
    const seek = !initialized || Math.abs(time - lastTime) > 1000 || selected !== lastFollow;
    lastTime = time; lastFollow = selected;
    racers.forEach((_, i) => {
      const pos = point(i, time), previous = point(i, Math.max(0, time - 55)), next = point(i, time + 55);
      const forward = next.clone().sub(previous);
      if (forward.lengthSq() < 1e-7) { const [lane, s] = position(reader, i, time); forward.set(...trackPoint(lane, Math.min(FINISH_Y, s + 0.1))).sub(new THREE.Vector3(...trackPoint(lane, Math.max(0, s - 0.1)))); }
      forward.normalize();
      const release = reader.replay.releaseTimes?.[i] ?? 0, finishMs = reader.replay.finishTimes?.[i] ?? Infinity;
      const visible = ms >= release;
      if (time >= finishMs) { const angle = i * 2.39996; pos.set(...trackPoint(0, FINISH_Y, HEAD_RADIUS + 0.02)); pos.x += Math.cos(angle) * 1.4; pos.z += Math.sin(angle) * 1.9; }
      dummy.position.copy(pos); dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward); dummy.scale.set(HEAD_RADIUS, HEAD_RADIUS * 0.8, HEAD_RADIUS * 1.45); dummy.updateMatrix(); heads.setMatrixAt(i, visible ? dummy.matrix : hidden);
      dummy.position.copy(pos).addScaledVector(forward, HEAD_RADIUS * 0.7); dummy.scale.set(HEAD_RADIUS * 0.89, HEAD_RADIUS * 0.71, HEAD_RADIUS * 0.88); dummy.updateMatrix(); caps.setMatrixAt(i, visible ? dummy.matrix : hidden);
      let a = pos.clone().addScaledVector(forward, -HEAD_RADIUS);
      for (let k = 0; k < tailCount; k++) {
        const history = point(i, Math.max(release, time - (k + 1) * 22));
        const back = history.sub(a); if (back.lengthSq() < 1e-7 || time >= finishMs) back.copy(forward).negate(); back.normalize();
        const b = a.clone().addScaledVector(back, 0.085);
        const radius = 0.047 * (1 - k / (tailCount + 1));
        dummy.position.copy(a).add(b).multiplyScalar(0.5); dummy.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize()); dummy.scale.set(radius, a.distanceTo(b) + 0.015, radius); dummy.updateMatrix();
        tails.setMatrixAt(i * tailCount + k, visible ? dummy.matrix : hidden); a = b;
      }
      if (i === selected) { target.copy(pos); if (forward.lengthSq() > 0.1) direction.lerp(forward, seek ? 1 : 1 - Math.exp(-dt * 3)).normalize(); }
    });
    heads.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true; tails.instanceMatrix.needsUpdate = true;
    if (mill) mill.rotation.y = physicalSeconds(reader, time) * ROTORS[0].speed;
    const finished = time >= (reader.replay.finishTimes?.[selected] ?? Infinity);
    const waiting = ms < (reader.replay.releaseTimes?.[selected] ?? 0);
    ring.position.copy(target).add(new THREE.Vector3(0, -HEAD_RADIUS * 0.6, 0)); marker.position.copy(target).add(new THREE.Vector3(0, 0.85, 0));
    ring.visible = marker.visible = !finished && !waiting;
    if (mode === "overview" || ms < 0) {
      const zoom = Math.max(1, 1.7 / camera.aspect); desired.set(18 * zoom, 62 * zoom, 85 * zoom); target.set(-2, 8, -2);
    } else if (waiting) {
      desired.set(-55, 25, 7); target.set(-49, 21, 0);
    } else if (finished) {
      const zoom = Math.max(1, 1 / camera.aspect); desired.copy(finish).add(new THREE.Vector3(-7 * zoom, 6 * zoom, 8 * zoom)); target.copy(finish).add(new THREE.Vector3(1, 1.5, 0));
    } else {
      desired.copy(target).addScaledVector(direction, -(mobile ? 4.7 : 4)).add(new THREE.Vector3(0, reduced ? 5 : 3.2, 0)); target.addScaledVector(direction, 1.6);
    }
    const alpha = seek ? 1 : 1 - Math.exp(-dt * (reduced ? 2.5 : 5));
    camera.position.lerp(desired, alpha); look.lerp(target, alpha); camera.lookAt(look); initialized = true;
    renderer.render(scene, camera);
  });
  return () => {
    disposed = true; renderer.setAnimationLoop(null); resize.disconnect(); canvas.removeEventListener("webglcontextlost", lost);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    scene.traverse((o) => { if (o instanceof THREE.Mesh || o instanceof THREE.Line) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => materials.add(m)); } if (o instanceof THREE.Sprite) materials.add(o.material); if (o instanceof THREE.InstancedMesh) o.dispose(); });
    geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose()); renderer.dispose();
  };
}
