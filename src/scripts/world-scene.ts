import * as THREE from 'three';
import { roomDesign as design } from '../data/room-design';
import { directionInfo, directions, type Direction } from '../data/room-map';

export interface Surface {
  width: number; height: number;
  center: [number, number, number]; rotation: [number, number, number]; color: string;
}

// A surface list makes the basic room replaceable independently of navigation.
// A future modeled room can replace this builder while retaining the exits.
export function roomSurfaces(radius = 2): Surface[] {
  const surfaces: Surface[] = [];
  const { width, depth, height, hallwayWidth: door, hallwayHeight: doorHeight, hallwayLength: length, colors } = design;
  const add = (w: number, h: number, center: Surface['center'], rotation: Surface['rotation'], color: string) => {
    surfaces.push({ width: w, height: h, center, rotation, color });
  };
  function room(x: number, z: number) {
    add(width, depth, [x, 0, z], [-Math.PI / 2, 0, 0], colors.floor);
    add(width, depth, [x, height, z], [Math.PI / 2, 0, 0], colors.ceiling);
    for (const direction of directions) {
      const info = directionInfo[direction];
      const wallWidth = info.x ? depth : width;
      const half = (info.x ? width : depth) / 2;
      const centerX = x + info.x * half, centerZ = z + info.z * half;
      const panelWidth = (wallWidth - door) / 2;
      for (const sign of [-1, 1]) {
        const offset = sign * (door + panelWidth) / 2;
        add(panelWidth, height, [centerX + Math.cos(info.yaw) * offset, height / 2, centerZ - Math.sin(info.yaw) * offset], [0, info.yaw, 0], info.x ? colors.sideWall : colors.wall);
      }
      add(door, height - doorHeight, [centerX, (height + doorHeight) / 2, centerZ], [0, info.yaw, 0], info.x ? colors.sideWall : colors.wall);
    }
  }
  function hallway(x: number, z: number, east: boolean) {
    const yaw = east ? -Math.PI / 2 : 0;
    const transform = (px: number, py: number, pz: number): Surface['center'] => [x + Math.cos(yaw) * px + Math.sin(yaw) * pz, py, z - Math.sin(yaw) * px + Math.cos(yaw) * pz];
    // Floor/ceiling use horizontal planes; their dimensions swap for east-west.
    add(east ? length : door, east ? door : length, [x, 0, z], [-Math.PI / 2, 0, 0], colors.hallwayFloor);
    add(east ? length : door, east ? door : length, [x, doorHeight, z], [Math.PI / 2, 0, 0], colors.hallwayCeiling);
    for (const sign of [-1, 1]) {
      add(length, doorHeight, transform(sign * door / 2, doorHeight / 2, 0), [0, yaw - sign * Math.PI / 2, 0], colors.hallwayWall);
    }
  }
  // A small repeating neighborhood lets the visitor see the next room before
  // choosing its hallway. Only the current room's four exits are interactive.
  for (let row = -radius; row <= radius; row++) {
    for (let column = -radius; column <= radius; column++) {
      const x = column * (width + length), z = row * (depth + length);
      room(x, z);
      if (column < radius) hallway(x + (width + length) / 2, z, true);
      if (row < radius) hallway(x, z + (depth + length) / 2, false);
    }
  }
  return surfaces;
}

export function createRoomScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(design.colors.background);
  scene.fog = new THREE.Fog(design.colors.background, 18, 48);
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const point = new THREE.Vector3();
  const rotation = new THREE.Euler();
  // Combine all plain surfaces into one draw call.
  for (const surface of roomSurfaces()) {
    const start = positions.length / 3;
    const color = new THREE.Color(surface.color);
    rotation.set(...surface.rotation);
    for (const [x, y] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      point.set(x * surface.width / 2, y * surface.height / 2, 0).applyEuler(rotation);
      point.x += surface.center[0]; point.y += surface.center[1]; point.z += surface.center[2];
      positions.push(point.x, point.y, point.z);
      colors.push(color.r, color.g, color.b);
    }
    indices.push(start, start + 2, start + 1, start + 2, start + 3, start + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  const solid = new THREE.Mesh(geometry, material);
  scene.add(solid);

  const targetGeometry = new THREE.PlaneGeometry(design.hallwayWidth, design.hallwayHeight);
  const targetMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const portals = directions.map(direction => {
    const info = directionInfo[direction];
    const half = (info.x ? design.width : design.depth) / 2;
    const target = new THREE.Mesh(targetGeometry, targetMaterial);
    target.position.set(info.x * (half + 0.02), design.hallwayHeight / 2, info.z * (half + 0.02));
    target.rotation.y = info.yaw;
    target.userData.direction = direction;
    scene.add(target);
    return { direction, target };
  });
  scene.updateMatrixWorld(true);
  return {
    scene, solid, portals,
    dispose() { geometry.dispose(); material.dispose(); targetGeometry.dispose(); targetMaterial.dispose(); scene.clear(); },
  };
}

export function arrivalPosition(direction: Direction) {
  const info = directionInfo[direction];
  return { x: info.x * (design.width + design.hallwayLength), z: info.z * (design.depth + design.hallwayLength) };
}
