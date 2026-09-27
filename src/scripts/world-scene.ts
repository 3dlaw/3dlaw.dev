import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roomDesign as design, type RoomPalette } from '../data/room-design';
import { directionInfo, directions, type Direction } from '../data/room-map';

export interface RoomPortal {
  direction: Direction;
  target: THREE.Mesh;
  anchor: THREE.Vector3;
}

// Only the current room exists. Each short passage ends in opaque black; its
// destination is a link, resolved by the navigation controller while concealed.
// Replace this builder with an authored scene later, retaining these portals.
export function createRoomScene(palette: RoomPalette) {
  const { width, depth, height, doorwayWidth: doorWidth, doorwayHeight: doorHeight, passageDepth, wallThickness } = design;
  const halfWidth = width / 2, halfDepth = depth / 2, halfDoor = doorWidth / 2;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050508');

  const geometries: THREE.BufferGeometry[] = [];
  const wallParts: THREE.BufferGeometry[] = [];
  const floorParts: THREE.BufferGeometry[] = [];
  const ceilingParts: THREE.BufferGeometry[] = [];
  const capParts: THREE.BufferGeometry[] = [];
  const point = new THREE.Vector3();
  const clamp = THREE.MathUtils.clamp;

  // Broad, deterministic contact shading supplies gentle depth without shadow
  // maps, image downloads, grain, or decorative surface detail.
  const passageShade = (distance: number) => Math.pow(clamp(1 - distance / passageDepth, 0, 1), 1.7);
  function boundaryDistance(x: number, z: number) {
    const xGap = Math.max(halfDoor - Math.abs(x), 0);
    const zGap = Math.max(halfDoor - Math.abs(z), 0);
    return Math.min(
      Math.hypot(xGap, halfDepth - z), Math.hypot(xGap, halfDepth + z),
      Math.hypot(halfWidth - x, zGap), Math.hypot(halfWidth + x, zGap),
    );
  }
  function shade(geometry: THREE.BufferGeometry, kind: 'wall' | 'floor' | 'ceiling') {
    const positions = geometry.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i);
      // Cardinal rotations should have exact zero coordinates. Removing sine
      // roundoff also prevents raycast misses along a shared centreline edge.
      if (Math.abs(point.x) < 1e-7) point.x = 0;
      if (Math.abs(point.y) < 1e-7) point.y = 0;
      if (Math.abs(point.z) < 1e-7) point.z = 0;
      positions.setXYZ(i, point.x, point.y, point.z);
      const beyond = Math.max(Math.abs(point.x) - halfWidth, Math.abs(point.z) - halfDepth, 0);
      let value: number;
      if (kind === 'wall') {
        const vertical = Math.sin(clamp(point.y / height, 0, 1) * Math.PI);
        const corner = Math.hypot(halfWidth - Math.abs(point.x), halfDepth - Math.abs(point.z));
        value = (0.72 + vertical * 0.28) * (0.69 + 0.31 * clamp(corner / 1.5, 0, 1));
      } else {
        const contact = clamp(boundaryDistance(point.x, point.z) / 1.35, 0, 1);
        value = kind === 'floor' ? 0.58 + 0.42 * Math.sqrt(contact) : 0.65 + 0.35 * contact;
      }
      value *= passageShade(beyond);
      colors.set([value, value, value], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  }
  function plane(w: number, h: number, x: number, y: number, z: number, rx = 0, ry = 0, sx = 1, sy = 1) {
    const geometry = new THREE.PlaneGeometry(w, h, sx, sy);
    geometry.rotateX(rx);
    geometry.rotateY(ry);
    geometry.translate(x, y, z);
    return geometry;
  }
  function block(w: number, h: number, d: number, x: number, y: number, z: number, yaw: number) {
    const geometry = new THREE.BoxGeometry(w, h, d, Math.max(2, Math.ceil(w / 0.6)), Math.max(2, Math.ceil(h / 0.5)), 1);
    geometry.translate(x, y, z);
    geometry.rotateY(yaw);
    wallParts.push(shade(geometry, 'wall'));
  }

  floorParts.push(shade(plane(width, depth, 0, 0, 0, -Math.PI / 2, 0, 20, 20), 'floor'));
  ceilingParts.push(shade(plane(width, depth, 0, height, 0, Math.PI / 2, 0, 16, 16), 'ceiling'));
  const portals: RoomPortal[] = [];
  const targetGeometry = new THREE.PlaneGeometry(doorWidth, doorHeight);
  const targetMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false, side: THREE.DoubleSide });
  geometries.push(targetGeometry);

  for (const direction of directions) {
    const info = directionInfo[direction];
    const half = info.x ? halfWidth : halfDepth;
    const span = info.x ? depth : width;
    const sideWidth = (span - doorWidth) / 2;
    const sideCenter = (span + doorWidth) / 4;
    // Front faces meet the room bounds; thickness extends into the passage.
    for (const sign of [-1, 1]) block(sideWidth, height, wallThickness, sign * sideCenter, height / 2, -half - wallThickness / 2, info.yaw);
    block(doorWidth, height - doorHeight, wallThickness, 0, (height + doorHeight) / 2, -half - wallThickness / 2, info.yaw);

    // Door reveals are already the block sides. Start these surfaces beyond
    // their thickness to avoid coplanar flicker at the doorway.
    const remaining = passageDepth - wallThickness;
    const middle = -half - wallThickness - remaining / 2;
    const rotate = (geometry: THREE.BufferGeometry) => geometry.rotateY(info.yaw);
    floorParts.push(shade(rotate(plane(doorWidth, passageDepth, 0, 0, -half - passageDepth / 2, -Math.PI / 2, 0, 6, 12)), 'floor'));
    ceilingParts.push(shade(rotate(plane(doorWidth, remaining, 0, doorHeight, middle, Math.PI / 2, 0, 6, 12)), 'ceiling'));
    for (const sign of [-1, 1]) {
      wallParts.push(shade(rotate(plane(remaining, doorHeight, sign * halfDoor, doorHeight / 2, middle, 0, -sign * Math.PI / 2, 12, 6)), 'wall'));
    }
    capParts.push(rotate(plane(doorWidth, doorHeight, 0, doorHeight / 2, -half - passageDepth)));

    const target = new THREE.Mesh(targetGeometry, targetMaterial);
    target.name = 'passage-' + direction;
    target.position.set(info.x * (half - 0.015), doorHeight / 2, info.z * (half - 0.015));
    target.rotation.y = info.yaw;
    target.userData.direction = direction;
    scene.add(target);
    portals.push({ direction, target, anchor: new THREE.Vector3(info.x * (half - 0.07), doorHeight + 0.23, info.z * (half - 0.07)) });
  }

  const wallMaterial = new THREE.MeshStandardMaterial({ color: palette.wall, roughness: 1, metalness: 0, vertexColors: true });
  const floorMaterial = new THREE.MeshStandardMaterial({ color: palette.floor, roughness: 0.98, metalness: 0, vertexColors: true });
  const ceilingMaterial = new THREE.MeshStandardMaterial({ color: palette.ceiling, roughness: 1, metalness: 0, vertexColors: true });
  const capMaterial = new THREE.MeshBasicMaterial({ color: '#000000', side: THREE.DoubleSide });
  const solids: THREE.Object3D[] = [];
  function merge(parts: THREE.BufferGeometry[], material: THREE.Material, name: string) {
    const geometry = mergeGeometries(parts, false);
    if (!geometry) throw new Error('Unable to build room ' + name + '.');
    parts.forEach(part => part.dispose());
    geometry.computeBoundingSphere();
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    scene.add(mesh);
    solids.push(mesh);
  }
  merge(wallParts, wallMaterial, 'walls-and-passage-reveals');
  merge(floorParts, floorMaterial, 'floor');
  merge(ceilingParts, ceilingMaterial, 'ceiling');
  merge(capParts, capMaterial, 'sealed-passage-ends');

  const ambient = new THREE.AmbientLight(palette.ambient, 0.55);
  const hemisphere = new THREE.HemisphereLight(palette.ambient, new THREE.Color(palette.ambient).multiplyScalar(0.18), 0.75);
  const key = new THREE.DirectionalLight(palette.ambient, 2.1);
  key.position.set(-3.5, 7, 3);
  const fill = new THREE.DirectionalLight(palette.accent, 0.4);
  fill.position.set(4, 3, -2);
  // Its intensity changes, not visibility, avoiding new shader variants when
  // the pointer enters a passage. The black cap remains completely unlit.
  const hoverLight = new THREE.PointLight(palette.accent, 0, 2.8, 2);
  scene.add(ambient, hemisphere, key, fill, hoverLight);
  scene.updateMatrixWorld(true);

  return {
    scene, solids, portals,
    setPalette(next: RoomPalette) {
      wallMaterial.color.set(next.wall);
      floorMaterial.color.set(next.floor);
      ceilingMaterial.color.set(next.ceiling);
      ambient.color.set(next.ambient);
      hemisphere.color.set(next.ambient);
      hemisphere.groundColor.set(next.ambient).multiplyScalar(0.18);
      key.color.set(next.ambient);
      fill.color.set(next.accent);
      hoverLight.color.set(next.accent);
    },
    setHover(direction: Direction | undefined) {
      if (!direction) { hoverLight.intensity = 0; return; }
      const info = directionInfo[direction];
      const half = info.x ? halfWidth : halfDepth;
      hoverLight.position.set(info.x * (half - 0.3), 0.8, info.z * (half - 0.3));
      hoverLight.intensity = 0.75;
    },
    dispose() {
      geometries.forEach(geometry => geometry.dispose());
      [wallMaterial, floorMaterial, ceilingMaterial, capMaterial, targetMaterial].forEach(material => material.dispose());
      scene.clear();
    },
  };
}
