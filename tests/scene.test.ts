import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { roomDesign, roomPalettes } from '../src/data/room-design';
import { directions, directionInfo } from '../src/data/room-map';
import { movement } from '../src/data/room-movement';
import { createRoomScene } from '../src/scripts/world-scene';

const halfWidth = roomDesign.width / 2;
const halfDepth = roomDesign.depth / 2;
const epsilon = 1e-5;

test('each doorway is selectable, with an opaque passage end behind it', () => {
  const room = createRoomScene(roomPalettes.threshold);
  try {
    assert.deepEqual(room.portals.map(portal => portal.direction).sort(), [...directions].sort());
    const ray = new THREE.Raycaster();
    const eye = new THREE.Vector3(0, movement.eyeHeight, 0);
    for (const direction of directions) {
      const info = directionInfo[direction];
      const half = info.x ? halfWidth : halfDepth;
      ray.set(eye, new THREE.Vector3(info.x, 0, info.z));
      const hits = ray.intersectObjects([...room.solids, ...room.portals.map(portal => portal.target)], false);
      const portal = room.portals.find(item => item.direction === direction)!;
      assert.equal(hits[0]?.object, portal.target, direction + ' must be a direct click target');
      const cap = ray.intersectObjects(room.solids, false)[0];
      assert(cap, direction + ' must be sealed');
      assert(Math.abs(cap.distance - half - roomDesign.passageDepth) < epsilon);
      const material = (cap.object as THREE.Mesh).material as THREE.MeshBasicMaterial;
      assert(material.isMeshBasicMaterial, 'end cap must stay unlit');
      assert.equal(material.color.getHex(), 0x000000);
      assert.equal(material.transparent, false);
      assert(portal.anchor.y > roomDesign.doorwayHeight && portal.anchor.y < roomDesign.height);
    }
  } finally { room.dispose(); }
});

test('walls occlude clicks outside the doorway opening', () => {
  const room = createRoomScene(roomPalettes.threshold);
  try {
    const eye = new THREE.Vector3(0, movement.eyeHeight, 0);
    const ray = new THREE.Raycaster();
    for (const direction of directions) {
      const info = directionInfo[direction];
      const half = info.x ? halfWidth : halfDepth;
      const side = roomDesign.doorwayWidth / 2 + movement.radius;
      const towardsWall = new THREE.Vector3(info.x * half - info.z * side, 0, info.z * half + info.x * side).normalize();
      ray.set(eye, towardsWall);
      const first = ray.intersectObjects([...room.solids, ...room.portals.map(portal => portal.target)], false)[0];
      assert(first && room.solids.includes(first.object), direction + ' wall must intercept the ray');
    }
  } finally { room.dispose(); }
});

test('the room and all passage stubs are enclosed without neighbouring geometry', () => {
  const room = createRoomScene(roomPalettes.threshold);
  try {
    const ray = new THREE.Raycaster();
    const positions: [number, number][] = [
      [0, 0],
      [halfWidth - movement.radius * 2, halfDepth - movement.radius * 2],
      [-halfWidth + movement.radius * 2, -halfDepth + movement.radius * 2],
      ...directions.map(direction => {
        const info = directionInfo[direction];
        const half = info.x ? halfWidth : halfDepth;
        return [info.x * (half + roomDesign.passageDepth / 2), info.z * (half + roomDesign.passageDepth / 2)] as [number, number];
      }),
    ];
    for (const [x, z] of positions) {
      for (let yaw = 0; yaw < 360; yaw += 3) {
        for (const pitch of [-85, -45, -10, 0, 10, 45, 85]) {
          // Offset sample angles from exact shared triangle edges: CPU
          // barycentric roundoff there is unrelated to a visible geometry gap.
          const azimuth = (yaw + 0.137) * Math.PI / 180;
          const elevation = (pitch + 0.073) * Math.PI / 180;
          const direction = new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation));
          ray.set(new THREE.Vector3(x, movement.eyeHeight, z), direction);
          assert(ray.intersectObjects(room.solids, false).length, JSON.stringify({ x, z, yaw, pitch }));
        }
      }
    }
    const bounds = new THREE.Box3();
    for (const solid of room.solids) bounds.expandByObject(solid);
    assert(bounds.min.x >= -halfWidth - roomDesign.passageDepth - epsilon);
    assert(bounds.max.x <= halfWidth + roomDesign.passageDepth + epsilon);
    assert(bounds.min.z >= -halfDepth - roomDesign.passageDepth - epsilon);
    assert(bounds.max.z <= halfDepth + roomDesign.passageDepth + epsilon);
    assert(bounds.min.y >= -epsilon && bounds.max.y <= roomDesign.height + epsilon);
    ray.set(new THREE.Vector3(0, movement.eyeHeight, 0), new THREE.Vector3(0, 1, 0));
    assert(Math.abs(ray.intersectObjects(room.solids, false)[0].distance - (roomDesign.height - movement.eyeHeight)) < epsilon);
    ray.set(new THREE.Vector3(0, movement.eyeHeight, 0), new THREE.Vector3(0, -1, 0));
    assert(Math.abs(ray.intersectObjects(room.solids, false)[0].distance - movement.eyeHeight) < epsilon);
  } finally { room.dispose(); }
});

test('palette changes preserve scene resources and disposal releases shared resources once', () => {
  const room = createRoomScene(roomPalettes.threshold);
  const meshes: THREE.Mesh[] = [];
  room.scene.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  const geometries = new Set(meshes.map(mesh => mesh.geometry));
  const materials = new Set(meshes.flatMap(mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
  const originalColors = new Map([...materials].filter(material => material instanceof THREE.MeshStandardMaterial).map(material => [material, material.color.getHexString()]));
  const disposals = new Map<THREE.BufferGeometry | THREE.Material, number>();
  for (const resource of [...geometries, ...materials]) {
    disposals.set(resource, 0);
    resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource)! + 1));
  }
  room.setPalette(roomPalettes.surface);
  assert([...originalColors].some(([material, previous]) => material.color.getHexString() !== previous));
  const standardColors = new Set([...materials].filter(material => material instanceof THREE.MeshStandardMaterial).map(material => material.color.getHexString()));
  for (const color of [roomPalettes.surface.wall, roomPalettes.surface.floor, roomPalettes.surface.ceiling]) {
    assert(standardColors.has(new THREE.Color(color).getHexString()));
  }
  for (const direction of directions) room.setHover(direction);
  room.setHover(undefined);
  const after: THREE.Mesh[] = [];
  room.scene.traverse(object => { if (object instanceof THREE.Mesh) after.push(object); });
  assert.deepEqual(after, meshes, 'customisation must not rebuild the scene');
  assert([...disposals.values()].every(count => count === 0));
  room.dispose();
  assert([...disposals.values()].every(count => count === 1), 'shared resources must dispose exactly once');
  assert.equal(room.scene.children.length, 0);
});
