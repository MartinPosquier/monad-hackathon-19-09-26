import * as THREE from "three";
import type { RacerEntry } from "@/shared/types";
import type { ReplayReader } from "@/shared/replay";
import { FINISH_Y, PEGS, RAILS, ROTORS, STAGES, surfaceHeight, launchHeight } from "@/sim/track";
import { buildBedroom } from "./bedroom";
import { physicalSeconds, position } from "./replay";

export type CameraMode = "follow" | "overview";
export interface SceneFrame { ms: number; follow: number; mode: CameraMode }

/** Une seule scène GPU ; le navigateur lit le replay, il ne recalcule aucune collision. */
export function createRaceScene(canvas: HTMLCanvasElement, reader: ReplayReader, racers: RacerEntry[], frame: () => SceneFrame, onError: (message: string) => void) {
  const mobile = window.matchMedia("(max-width: 700px)").matches;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.25 : 1.75));
  renderer.setClearColor(0x160d22);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const textures: THREE.Texture[] = [];
  let disposed = false;
  const fog = new THREE.Fog(0x21132d, 100, 330);
  scene.fog = fog;
  buildBedroom(scene);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 1000);
  scene.add(new THREE.HemisphereLight(0x9981df, 0x302031, 1.25));
  const light = new THREE.DirectionalLight(0xff9273, 1.55);
  light.position.set(-70, 75, 5);
  scene.add(light);
  const fill = new THREE.DirectionalLight(0x9561f3, 1.3);
  fill.position.set(70, 70, -25);
  scene.add(fill);
  const stone = new THREE.MeshStandardMaterial({ color: 0x73c9ce, roughness: 0.67, metalness: 0.24 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xffd18a, roughness: 0.34, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x9c5376, roughness: 0.65, metalness: 0.45 });
  const violet = new THREE.MeshStandardMaterial({ color: 0xd98acd, roughness: 0.36, metalness: 0.35 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xc1d7d9, transparent: true, opacity: 0.13, roughness: 0.2, depthWrite: false, side: THREE.DoubleSide });
  const point = (x: number, y: number, h = 0) => new THREE.Vector3(x, surfaceHeight(x, y) + h, y);
  const addMesh = (geometry: THREE.BufferGeometry, material: THREE.Material, pos?: THREE.Vector3) => {
    const mesh = new THREE.Mesh(geometry, material);
    if (pos) mesh.position.copy(pos);
    scene.add(mesh);
    return mesh;
  };
  const beam = (a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material) => {
    const mesh = addMesh(new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 10), material, a.clone().add(b).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  };

  // Le relief est commun au sol, aux obstacles et aux trajectoires.
  const slideColors = [0xefa972, 0x7acbd0, 0xb9a0dc, 0xf09d9a, 0xf4ca70, 0x8bcba9, 0xe99dbc];
  for (const [stageIndex, stage] of STAGES.entries()) {
    const end = stage.to === FINISH_Y ? FINISH_Y + 8 : stage.to;
    const geo = new THREE.PlaneGeometry(22, end - stage.from, 30, Math.ceil((end - stage.from) * 2));
    const positions = geo.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i) + (stage.from + end) / 2;
      positions.setXYZ(i, x, surfaceHeight(x, y) - 0.05, y);
    }
    // La projection x/y → x/z inverse l'orientation de la surface.
    geo.setIndex(Array.from(geo.index!.array).reduce<number[]>((acc, _, i, a) => { if (i % 3 === 0) acc.push(a[i], a[i + 2], a[i + 1]); return acc; }, []));
    geo.computeVertexNormals();
    const slideMaterial = stone.clone(); slideMaterial.color.setHex(slideColors[stageIndex]); slideMaterial.roughness = 0.32; slideMaterial.metalness = 0.08;
    addMesh(geo, slideMaterial);
    beam(point(-11.2, stage.from, -0.45), point(11.2, stage.from, -0.45), 0.35, dark);
    for (const x of [-11.1, 11.1]) {
      beam(point(x, stage.from, -0.6), point(x, end, -0.6), 0.42, dark);
      beam(point(x, stage.from, 0.7), point(x, end, 0.7), 0.07, metal);
    }
  }
  for (const r of RAILS) {
    if (r.kind === "wall" && Math.abs(r.ax) === 11) continue;
    beam(point(r.ax, r.ay, 0.5), point(r.bx, r.by, 0.5), r.kind === "ladder" ? 0.42 : 0.2, r.kind === "ladder" ? metal : dark);
  }
  // Garde-corps vitrés et supports espacés : silhouette de machine suspendue.
  for (let y = 0; y < FINISH_Y + 7; y += 8) for (const x of [-11, 11]) {
    beam(point(x, y), point(x, y, 1.4), 0.07, metal);
    const pane = addMesh(new THREE.PlaneGeometry(8, 1.3), glass, point(x, y + 4, 0.65));
    pane.rotation.y = Math.PI / 2;
    pane.rotation.z = -Math.atan(0.27);
  }
  // Lance de pompier rouge, embout laiton et tuyau souple raccordé.
  const nozzle = new THREE.Group(); nozzle.position.copy(point(0, 2, 2)); scene.add(nozzle);
  
  const rubber = new THREE.MeshStandardMaterial({ color: 0x191b20, roughness: 0.66 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xcbd1d4, roughness: 0.25, metalness: 0.8 });
  const hoseMaterial = new THREE.MeshStandardMaterial({ color: 0xa5a477, roughness: 0.95 });
  const nozzlePart = (geo: THREE.BufferGeometry, mat: THREE.Material, z: number) => {
    const mesh = new THREE.Mesh(geo, mat); mesh.rotation.x = Math.PI / 2; mesh.position.z = z; nozzle.add(mesh); return mesh;
  };
  nozzlePart(new THREE.CylinderGeometry(1.9, 2.5, 5, 32, 1, true), rubber, -3.2);
  nozzlePart(new THREE.CylinderGeometry(1.9, 1.9, 1.2, 32, 1, true), silver, -0.7);
  for (const z of [-5.7, -4.8, -1.5]) {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.19, 10, 32), rubber); collar.position.z = z; nozzle.add(collar);
  }
  const handle = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.22, 10, 24, Math.PI), metal);
  handle.position.set(0, 1.5, -3); nozzle.add(handle);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.2, 1), rubber); grip.position.set(0, -1.8, -3.3); grip.rotation.x = -0.2; nozzle.add(grip);
  const hoseCurve = new THREE.CatmullRomCurve3([point(0, -5, 2), new THREE.Vector3(-9, 51, -8), new THREE.Vector3(-30, 29, 2), new THREE.Vector3(-40, 17, 26), new THREE.Vector3(-30, 12, 47)]);
  addMesh(new THREE.TubeGeometry(hoseCurve, 70, 1.65, 12, false), hoseMaterial);
  const spray = new THREE.Group(); spray.position.copy(point(0, 2, 2)); scene.add(spray);
  const sprayMat = new THREE.MeshStandardMaterial({ color: 0xf9ece4, transparent: true, opacity: 0.55, roughness: 0.2 });
  for (let i = 0; i < 18; i++) {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.09 + (i % 3) * 0.035, 6, 4), sprayMat);
    spray.add(drop);
  }
  // Traits concentriques épousant le bol du tourbillon.
  for (const radius of [3.3, 5.3, 7.3, 9.3, 10.7]) {
    const pts = Array.from({ length: 97 }, (_, i) => { const a = i / 96 * Math.PI * 2; return point(Math.cos(a) * radius, 27 + Math.sin(a) * radius, 0.03); });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: radius === 10.7 ? 0x998bb7 : 0x65747a }));
    scene.add(line);
  }
  for (const row of PEGS) for (const p of row) {
    addMesh(new THREE.CylinderGeometry(p.radius, p.radius, 1.3, 12), metal, point(p.x, p.y, 0.65));
    addMesh(new THREE.SphereGeometry(p.radius, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), violet, point(p.x, p.y, 1.3));
  }
  // Séparateurs de sortie de Galton : visuels courts, sans fermer le passage.
  for (let x = -9; x <= 9; x += 3) beam(point(x, 62, 0.12), point(x, 65, 0.12), 0.045, metal);
  const rotorGroups = ROTORS.map((r) => {
    const group = new THREE.Group();
    group.position.copy(point(r.x, r.y, 0.5));
    for (const angle of [0, Math.PI / 2]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(r.radius * 2, 0.8, 0.44), violet);
      blade.rotation.y = angle;
      group.add(blade);
    }
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 1.4, 20), metal));
    scene.add(group);
    return group;
  });
  // Ligne d'arrivée, arche, puis plateau de réception.
  for (let i = 0; i < 22; i++) for (let j = 0; j < 2; j++) {
    const tile = addMesh(new THREE.BoxGeometry(1, 0.035, 0.8), (i + j) % 2 ? metal : dark, point(i - 10.5, FINISH_Y - 0.4 + j * 0.8, 0.02));
    tile.rotation.x = Math.atan(0.27);
  }
  // Images fournies par le joueur, conservées intégralement (fond et filigrane inclus).
  function photo(url: string, x: number, y: number, h: number, width: number, ratio: number) {
    const texture = new THREE.TextureLoader().load(url, (loaded) => { if (disposed) loaded.dispose(); }, undefined, () => onError("A course image could not load. Reload the page."));
    texture.colorSpace = THREE.SRGBColorSpace; textures.push(texture);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, toneMapped: false }));
    sprite.position.copy(point(x, y, h)); sprite.scale.set(width, width / ratio, 1); scene.add(sprite);
  }
  photo("/images/ovule-user.png", 0, FINISH_Y + 3, 8.5, 16, 445 / 442);
  photo("/images/lance-reference.png", -8, 9, 4, 4, 611 / 382);
  const podiumPlaces = [{ x: 0, height: 1.7 }, { x: -3.2, height: 1.1 }, { x: 3.2, height: 0.7 }];
  podiumPlaces.forEach((p, i) => {
    addMesh(new THREE.CylinderGeometry(1.2, 1.35, p.height, 32), i === 0 ? violet : metal, point(p.x, FINISH_Y + 5, p.height / 2));
  });

  // Plaques lisibles dans la vue d'ensemble ; pas d'effets néon ni post-processing.
  function label(text: string, x: number, y: number, h: number, width = 9) {
    const c = document.createElement("canvas"); c.width = 768; c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#1c272c"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#e2e6e5"; ctx.font = "500 46px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, 384, 66);
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace; textures.push(texture);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 6), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    mesh.position.copy(point(x, y, h)); mesh.rotation.x = -Math.PI / 2 + 0.27; mesh.rotation.z = Math.PI; scene.add(mesh);
  }
  STAGES.forEach((s, i) => label(`${String(i + 1).padStart(2, "0")}  ${s.name.toUpperCase()}`, -5.8, s.from + 1.4, 0.06, 8.8));


  const headGeometry = new THREE.SphereGeometry(0.3, 14, 10);
  const segmentGeometry = new THREE.SphereGeometry(1, 6, 4);
  const shadowGeo = new THREE.CircleGeometry(0.48, 12);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x080c0f, transparent: true, opacity: 0.25, depthWrite: false });
  const swimmerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.15 });
  const tailCount = mobile ? 7 : 10;
  const heads = new THREE.InstancedMesh(headGeometry, swimmerMat, racers.length);
  const tails = new THREE.InstancedMesh(segmentGeometry, swimmerMat, racers.length * tailCount);
  const shadows = new THREE.InstancedMesh(shadowGeo, shadowMat, racers.length);
  for (const mesh of [heads, tails, shadows]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; // Les matrices évoluent tout au long du parcours.
    scene.add(mesh);
  }
  const swimmers = racers.map((r, index) => {
    const group = new THREE.Group();
    // Three prend des couleurs CSS HSL avec virgules, pas la syntaxe CSS4 du lobby.
    const color = new THREE.Color(r.color.replace(/hsl\((\d+) (\d+)% (\d+)%\)/, "hsl($1, $2%, $3%)"));
    heads.setColorAt(index, color);
    const head = new THREE.Mesh(headGeometry, swimmerMat); head.scale.set(1, 0.8, 1.35); group.add(head);
    const tail = Array.from({ length: tailCount }, (_, i) => {
      tails.setColorAt(index * tailCount + i, color);
      const segment = new THREE.Mesh(segmentGeometry, swimmerMat);
      const radius = 0.105 * (1 - i / 12);
      segment.scale.set(radius, radius, 0.14); group.add(segment); return segment;
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat); shadow.rotation.x = -Math.PI / 2;
    return { group, head, tail, shadow };
  });
  const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  const finishOrder = (reader.replay.finishTimes ?? []).map((ms, index) => ({ ms, index })).sort((a, b) => a.ms - b.ms || a.index - b.index);
  const allFinishedAt = finishOrder.at(-1)?.ms ?? Infinity;
  const ring = addMesh(new THREE.TorusGeometry(0.64, 0.027, 6, 40), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  ring.rotation.x = Math.PI / 2;
  const followMarker = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 4), violet);
  scene.add(followMarker);
  let lastMs = -Infinity, lastFrame = performance.now(), lastFollow = -1, initialized = false;
  const look = new THREE.Vector3();
  const direction = new THREE.Vector3(0, 0, 1);
  const desired = new THREE.Vector3();
  const target = new THREE.Vector3();
  const resize = new ResizeObserver(() => {
    const { width, height } = canvas.getBoundingClientRect();
    if (width > 0 && height > 0) { renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }
  });
  resize.observe(canvas);
  const onLost = (e: Event) => { e.preventDefault(); renderer.setAnimationLoop(null); onError("3D rendering was interrupted. Reload the page to resume your race."); };
  canvas.addEventListener("webglcontextlost", onLost);
  renderer.setAnimationLoop(() => {
    if (document.hidden) { lastFrame = performance.now(); return; }
    const now = performance.now(), dt = Math.min((now - lastFrame) / 1000, 0.05); lastFrame = now;
    const { ms, follow, mode } = frame();
    const time = Math.max(0, ms), index = Math.max(0, Math.min(racers.length - 1, follow));
    const physical = physicalSeconds(reader, time);
    const seek = !initialized || Math.abs(time - lastMs) > 1800 || index !== lastFollow;
    lastMs = time; lastFollow = index;
    swimmers.forEach((swimmer, i) => {
      const [x, y] = position(reader, i, time);
      const [px, py] = position(reader, i, Math.max(0, time - 90));
      const [nx, ny] = position(reader, i, time + 90);
      const releasedAt = reader.replay.releaseTimes?.[i] ?? 0;
      const age = physical - releasedAt / 1000;
      const airborne = reader.replay.releaseTimes ? launchHeight(age) : 0;
      swimmer.group.position.copy(point(x, y, 0.36 + airborne));
      swimmer.group.scale.setScalar(1);
      const heading = Math.atan2(nx - px, ny - py);
      swimmer.group.rotation.y = heading;
      swimmer.tail.forEach((segment, k) => {
        const [tx, ty] = position(reader, i, Math.max(releasedAt, time - (k + 1) * 28));
        const dx = tx - x, dz = ty - y, length = Math.hypot(dx, dz);
        const distance = 0.42 + k * 0.19;
        const backX = length > 0.01 ? dx / length * distance : -Math.sin(heading) * distance;
        const backZ = length > 0.01 ? dz / length * distance : -Math.cos(heading) * distance;
        const tailFlight = reader.replay.releaseTimes ? launchHeight(Math.max(0, age - (k + 1) * 0.025)) : 0;
        const tailHeight = surfaceHeight(x + backX, y + backZ) - surfaceHeight(x, y) - 0.2 + tailFlight - airborne;
        segment.position.set(backX * Math.cos(heading) - backZ * Math.sin(heading), tailHeight, backX * Math.sin(heading) + backZ * Math.cos(heading));
      });
      swimmer.shadow.position.copy(point(x, y, 0.025));
      swimmer.group.visible = ms >= releasedAt && (y < FINISH_Y - 0.01 || time < (reader.replay.finishTimes?.[i] ?? Infinity) + 1000);
      const entry = Math.max(0, (time - (reader.replay.finishTimes?.[i] ?? Infinity)) / 1000);
      if (entry > 0 && entry < 1) { swimmer.group.position.z += entry * 5; swimmer.group.scale.setScalar(1 - entry * 0.7); }
      swimmer.shadow.visible = swimmer.group.visible;
      if (time > allFinishedAt + 500) {
        const podiumIndex = finishOrder.slice(0, 3).findIndex((p) => p.index === i);
        swimmer.group.visible = podiumIndex >= 0;
        swimmer.shadow.visible = false;
        if (podiumIndex >= 0) {
          const podium = podiumPlaces[podiumIndex];
          swimmer.group.position.copy(point(podium.x, FINISH_Y + 5, podium.height + 0.6));
          swimmer.group.scale.setScalar(1.7);
          swimmer.group.rotation.y = Math.PI;
        }
      }
      swimmer.group.updateMatrixWorld(true); swimmer.shadow.updateMatrixWorld(true);
      heads.setMatrixAt(i, swimmer.group.visible ? swimmer.head.matrixWorld : hiddenMatrix);
      swimmer.tail.forEach((segment, k) => tails.setMatrixAt(i * tailCount + k, swimmer.group.visible ? segment.matrixWorld : hiddenMatrix));
      shadows.setMatrixAt(i, swimmer.shadow.visible ? swimmer.shadow.matrixWorld : hiddenMatrix);
      if (i === index) {
        target.copy(swimmer.group.position);
        const delta = new THREE.Vector3(nx - px, 0, ny - py);
        if (delta.lengthSq() > 0.0001) direction.lerp(delta.normalize(), seek ? 1 : 1 - Math.exp(-dt * 2)).normalize();
      }
    });
    heads.instanceMatrix.needsUpdate = true; tails.instanceMatrix.needsUpdate = true; shadows.instanceMatrix.needsUpdate = true;
    const burstAge = physical - Math.floor(physical);
    const burst = ms >= 0 && physical < Math.ceil(racers.length / 10) && burstAge < 0.42;
    const kick = burst ? Math.sin(burstAge / 0.42 * Math.PI) : 0;
    nozzle.position.z = 2 - kick * 0.45;
    spray.visible = burst;
    spray.children.forEach((drop, i) => {
      const angle = i * 2.39996, radius = burstAge * (0.8 + i % 4);
      drop.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius + 4 * burstAge - 4.905 * burstAge * burstAge, burstAge * (9 + i % 5));
    });
    rotorGroups.forEach((group, i) => { group.rotation.y = -(ROTORS[i].phase + physical * ROTORS[i].speed); });
    ring.position.copy(target).add(new THREE.Vector3(0, -0.2, 0));
    followMarker.position.copy(target).add(new THREE.Vector3(0, 1.8, 0)); followMarker.rotation.z = Math.PI;
    const finished = time >= (reader.replay.finishTimes?.[index] ?? Infinity);
    const waiting = ms < (reader.replay.releaseTimes?.[index] ?? 0);
    ring.visible = !finished && !waiting; followMarker.visible = !finished && !waiting;
    if (mode === "overview" || ms < 0) {
      const zoom = Math.max(1, 1.25 / camera.aspect);
      desired.set(-85 * zoom, 20 + 80 * zoom, 95 + 160 * zoom); target.set(0, 23, 90);
      scene.fog = null;
    } else if (waiting) {
      scene.fog = fog; desired.copy(point(8, -9, 8)); target.copy(point(0, 5, 2));
    } else if (finished) {
      scene.fog = fog;
      const zoom = Math.max(1, 1.15 / camera.aspect);
      desired.copy(point(12 * zoom, FINISH_Y - 23 * zoom, 22 * zoom)); target.copy(point(0, FINISH_Y + 3, 6));
    } else {
      scene.fog = fog;
      const distance = mobile ? 12 : 10.5;
      desired.copy(target).addScaledVector(direction, -distance).add(new THREE.Vector3(0, reduced ? 13 : 9, 0));
      target.addScaledVector(direction, 4);
      // Au-dessus de toute géométrie proche : pas de caméra à l'intérieur d'un barreau.
      desired.y = Math.max(desired.y, surfaceHeight(desired.x, desired.z) + 5.5);
    }
    const blend = seek ? 1 : 1 - Math.exp(-dt * (reduced ? 2 : 4));
    camera.position.lerp(desired, blend); look.lerp(target, blend); camera.lookAt(look);
    initialized = true;
    renderer.render(scene, camera);
  });
  return () => {
    disposed = true;
    renderer.setAnimationLoop(null); resize.disconnect(); canvas.removeEventListener("webglcontextlost", onLost);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    scene.traverse((o) => { if (o instanceof THREE.Mesh || o instanceof THREE.Line) { geometries.add(o.geometry); const m = o.material; (Array.isArray(m) ? m : [m]).forEach((v) => materials.add(v)); } if (o instanceof THREE.Sprite) materials.add(o.material); if (o instanceof THREE.InstancedMesh) o.dispose(); });
    geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose());
    // Ne pas perdre volontairement le contexte : React StrictMode et le hot reload
    // réutilisent ce canvas immédiatement. dispose libère déjà les ressources GPU.
    renderer.dispose();
  };
}
