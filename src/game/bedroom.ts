import * as THREE from "three";

/** Décor procédural : lit défait, drap froissé, oreillers et éclairage de chevet. */
export function buildBedroom(scene: THREE.Scene) {
  const material = (color: number, roughness = 0.9) => new THREE.MeshStandardMaterial({ color, roughness });
  const linen = material(0x623c55), cream = material(0x947c89), wood = material(0x241824);
  const plum = material(0x33212d), rose = material(0x7d3048), brass = material(0x93674c, 0.4);
  function box(w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(x, y, z); scene.add(mesh); return mesh;
  }
  function cushion(x: number, y: number, z: number, sx: number, sy: number, sz: number, m: THREE.Material, angle = 0) {
    const geometry = new THREE.SphereGeometry(1, 32, 20);
    const positions = geometry.getAttribute("position");
    // Superellipsoïde aplati : silhouette rectangulaire et bords souples d'un oreiller.
    for (let i = 0; i < positions.count; i++) {
      const round = (v: number) => Math.sign(v) * Math.abs(v) ** 0.48;
      positions.setXYZ(i, round(positions.getX(i)), positions.getY(i), round(positions.getZ(i)));
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, m);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.rotation.y = angle; scene.add(mesh); return mesh;
  }
  box(260, 2, 320, 0, -9, 95, material(0x342634));
  for (let x = -120; x < 125; x += 12) box(0.12, 0.04, 320, x, -7.96, 95, wood);
  box(260, 140, 2, 0, 59, -40, material(0x654267));
  box(2, 140, 320, -125, 59, 95, material(0x4e364d));
  for (const x of [-118, -88]) box(0.65, 135, 0.6, x, 57, -38.8, material(0x806482));
  box(156, 0.4, 248, 0, -7.5, 98, material(0x312639));
  box(140, 9, 222, 0, -2, 97, wood);
  box(136, 9, 218, 0, -3, 97, cream);
  box(143, 65, 5, 0, 25, -14, plum);
  // Oreillers décalés devant une tête de lit sombre, comme sur la référence.
  cushion(-32, 12, 7, 29, 7, 17, cream, -0.16);
  cushion(32, 12, 9, 29, 7, 17, linen, 0.21);
  cushion(-29, 19, 2, 29, 6, 16, linen, 0.1).rotation.x = -0.25;
  cushion(30, 18, 5, 29, 6, 16, cream, -0.17).rotation.x = -0.22;
  // Duvet déformé, avec plis diagonaux et bord retroussé ; aucune texture externe.
  const duvet = new THREE.PlaneGeometry(152, 204, 120, 140);
  const p = duvet.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getY(i) + 110;
    const fold = Math.sin(x * 0.29 + z * 0.13) * 0.75 + Math.sin(z * 0.39 - x * 0.1) * 0.6 + Math.sin(x * 0.71 + z * 0.08) * 0.24;
    const piled = 11 * Math.exp(-(((z - 36 - x * 0.3) / 15) ** 2));
    const edge = Math.max(0, Math.abs(x) - 65) * 0.94 + Math.max(0, z - 202) * 0.8;
    p.setXYZ(i, x, 5 + fold + piled - edge, z);
  }
  duvet.setIndex(Array.from(duvet.index!.array).reduce<number[]>((a, _, i, idx) => { if (i % 3 === 0) a.push(idx[i], idx[i + 2], idx[i + 1]); return a; }, []));
  duvet.computeVertexNormals();
  const quiltMaterial = material(0x912d49); quiltMaterial.side = THREE.DoubleSide;
  scene.add(new THREE.Mesh(duvet, quiltMaterial));
  // Drap qui dépasse et coussin jeté en travers du pied du lit.
  cushion(36, 8, 50, 12, 2.5, 18, rose, 0.55);
  function rod(a: THREE.Vector3, b: THREE.Vector3, radius: number, m: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 10), m);
    mesh.position.copy(a).add(b).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); scene.add(mesh);
  }
  for (const x of [-86, 86]) {
    box(23, 20, 24, x, 2, 6, wood);
    box(24, 1.2, 25, x, 12.5, 6, brass);
    box(9, 1, 12, x + 4, 14, 12, plum).rotation.y = 0.2;
    if (x > 0) continue;
    const base = new THREE.Vector3(x, 14, 6), joint = new THREE.Vector3(x - 5, 29, 6), tip = new THREE.Vector3(x + 3, 41, 5);
    rod(base, joint, 0.4, brass); rod(joint, tip, 0.4, brass);
    box(8, 0.8, 7, x, 14, 6, wood);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(3.4, 5, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x38212c, roughness: 0.5, side: THREE.DoubleSide }));
    shade.position.copy(tip); shade.rotation.z = 0.4; scene.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffbb76 })); bulb.position.copy(tip).add(new THREE.Vector3(0, -1.8, 0)); scene.add(bulb);
    const lamp = new THREE.PointLight(0xff6436, 520, 200, 1.4); lamp.position.copy(tip).add(new THREE.Vector3(0, -2, 3)); scene.add(lamp);
  }
  // Plante haute dans le coin gauche, feuilles sombres éclairées par le chevet.
  const leafMaterial = material(0x263c31), stemMaterial = material(0x3e2928);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(7, 5, 12, 24), material(0x372635)); pot.position.set(-103, -1, 3); scene.add(pot);
  rod(new THREE.Vector3(-103, 3, 3), new THREE.Vector3(-103, 72, 3), 0.65, stemMaterial);
  for (let i = 0; i < 24; i++) {
    const angle = i * 2.39996, height = 15 + i * 2.25;
    const end = new THREE.Vector3(-103 + Math.cos(angle) * 12, height + 4, 3 + Math.sin(angle) * 10);
    rod(new THREE.Vector3(-103, height - 5, 3), end, 0.18, stemMaterial);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), leafMaterial); leaf.position.copy(end); leaf.scale.set(4.2, 0.45, 9); leaf.rotation.set(0.3, -angle, 0.4); scene.add(leaf);
  }
}
