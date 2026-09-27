import { roomDesign } from './room-design';
import { directions, directionInfo, type Direction } from './room-map';

// Metres and seconds. Acceleration/deceleration are exponential response rates,
// so walking feels the same at different frame rates. The camera never bobs.
export const movement = {
  eyeHeight: 1.65,
  speed: 2.2,
  radius: 0.28,
  fieldOfView: 65,
  arrivalInset: 0.8,
  acceleration: 14,
  deceleration: 24,
  lookSensitivity: 0.0022,
  maxPitch: 0.55,
  keyboardTurnSpeed: 1.45,
  entrySeconds: 0.7,
  transitionSeconds: 0.9,
} as const;

export type PlanarPoint = { x: number; z: number };
export type Walker = PlanarPoint & { vx: number; vz: number };

export const ease = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

const halfWidth = roomDesign.width / 2;
const halfDepth = roomDesign.depth / 2;
const opening = roomDesign.doorwayWidth / 2;
const passage = roomDesign.passageDepth;
const radius = movement.radius;
const maxFrameSeconds = 0.1;
const maxStepSeconds = 1 / 120;
const epsilon = 1e-8;

// Interior boundary of ONE room and its four closed, short entrance stubs.
// Keeping the real jamb corners allows a circular walker to slide around them,
// instead of snagging on overlapping, artificially shrunken rectangles.
const outline: PlanarPoint[] = [
  { x: -halfWidth, z: -halfDepth }, { x: -opening, z: -halfDepth },
  { x: -opening, z: -halfDepth - passage }, { x: opening, z: -halfDepth - passage },
  { x: opening, z: -halfDepth }, { x: halfWidth, z: -halfDepth },
  { x: halfWidth, z: -opening }, { x: halfWidth + passage, z: -opening },
  { x: halfWidth + passage, z: opening }, { x: halfWidth, z: opening },
  { x: halfWidth, z: halfDepth }, { x: opening, z: halfDepth },
  { x: opening, z: halfDepth + passage }, { x: -opening, z: halfDepth + passage },
  { x: -opening, z: halfDepth }, { x: -halfWidth, z: halfDepth },
  { x: -halfWidth, z: opening }, { x: -halfWidth - passage, z: opening },
  { x: -halfWidth - passage, z: -opening }, { x: -halfWidth, z: -opening },
];
const walls = outline.map((a, index) => ({ a, b: outline[(index + 1) % outline.length] }));

function closestOnWall(point: PlanarPoint, a: PlanarPoint, b: PlanarPoint): PlanarPoint {
  const x = b.x - a.x;
  const z = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * x + (point.z - a.z) * z) / (x * x + z * z)));
  return { x: a.x + t * x, z: a.z + t * z };
}

/** True when the entire walker disk fits inside the room or an entrance. */
export function canStandAt(point: PlanarPoint): boolean {
  const x = Math.abs(point.x);
  const z = Math.abs(point.z);
  const inside = (x <= halfWidth && z <= halfDepth)
    || (x <= opening && z <= halfDepth + passage)
    || (z <= opening && x <= halfWidth + passage);
  if (!inside) return false;
  return walls.every(({ a, b }) => {
    const nearest = closestOnWall(point, a, b);
    return (point.x - nearest.x) ** 2 + (point.z - nearest.z) ** 2 >= radius ** 2 - epsilon;
  });
}

function canTravel(start: PlanarPoint, end: PlanarPoint): boolean {
  if (!canStandAt(end)) return false;
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  if (dx * dx + dz * dz < epsilon * epsilon) return true;
  for (const { a, b } of walls) {
    // A disk can clip a convex jamb between two otherwise valid endpoints.
    // Check the whole swept segment, including direct wall crossings.
    for (const corner of [a, b]) {
      const nearest = closestOnWall(corner, start, end);
      if ((corner.x - nearest.x) ** 2 + (corner.z - nearest.z) ** 2 < radius ** 2 - epsilon) return false;
    }
    const wx = b.x - a.x;
    const wz = b.z - a.z;
    const denominator = dx * wz - dz * wx;
    if (Math.abs(denominator) <= epsilon) continue;
    const ox = a.x - start.x;
    const oz = a.z - start.z;
    const pathFraction = (ox * wz - oz * wx) / denominator;
    const wallFraction = (ox * dz - oz * dx) / denominator;
    if (pathFraction >= 0 && pathFraction <= 1 && wallFraction >= 0 && wallFraction <= 1) return false;
  }
  return true;
}

function contactNormals(point: PlanarPoint): PlanarPoint[] {
  const normals: PlanarPoint[] = [];
  for (const { a, b } of walls) {
    const nearest = closestOnWall(point, a, b);
    const x = point.x - nearest.x;
    const z = point.z - nearest.z;
    const distance = Math.hypot(x, z);
    if (distance <= radius + 0.0001 && distance > epsilon) normals.push({ x: x / distance, z: z / distance });
  }
  return normals;
}

function removeIntoWall(vector: PlanarPoint, normal: PlanarPoint): PlanarPoint {
  const into = Math.min(0, vector.x * normal.x + vector.z * normal.z);
  return { x: vector.x - normal.x * into, z: vector.z - normal.z * into };
}

function moveOneStep(start: PlanarPoint, displacement: PlanarPoint) {
  let position = { ...start };
  let remaining = { ...displacement };
  const normals: PlanarPoint[] = [];
  for (let contact = 0; contact < 3; contact += 1) {
    const target = { x: position.x + remaining.x, z: position.z + remaining.z };
    if (canTravel(position, target)) return { position: target, normals };

    // Find first contact, then retain only motion tangent to the wall. This
    // gives sliding along straight walls and around the circular jamb clearance.
    let low = 0;
    let high = 1;
    for (let search = 0; search < 18; search += 1) {
      const middle = (low + high) / 2;
      if (canTravel(position, { x: position.x + remaining.x * middle, z: position.z + remaining.z * middle })) low = middle;
      else high = middle;
    }
    position = { x: position.x + remaining.x * low, z: position.z + remaining.z * low };
    remaining = { x: remaining.x * (1 - low), z: remaining.z * (1 - low) };
    const contacts = contactNormals(position);
    for (const normal of contacts) remaining = removeIntoWall(remaining, normal);
    normals.push(...contacts);
    if (!contacts.length || Math.hypot(remaining.x, remaining.z) < epsilon) break;
  }
  return { position, normals };
}

/** Advance a walker. Positive forward follows the camera; positive strafe is right. */
export function stepWalker(state: Walker, input: { forward: number; strafe: number }, yaw: number, dt: number): Walker {
  if (!Number.isFinite(dt) || dt <= 0) return { ...state };
  // A resumed tab or a dropped frame must never become a long, uncontrolled step.
  const seconds = Math.min(dt, maxFrameSeconds);
  let forward = Number.isFinite(input.forward) ? input.forward : 0;
  let strafe = Number.isFinite(input.strafe) ? input.strafe : 0;
  const magnitude = Math.hypot(forward, strafe);
  if (magnitude > 1) { forward /= magnitude; strafe /= magnitude; }
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const target = {
    x: (-sin * forward + cos * strafe) * movement.speed,
    z: (-cos * forward - sin * strafe) * movement.speed,
  };
  const response = magnitude > 0 ? movement.acceleration : movement.deceleration;
  const steps = Math.ceil(seconds / maxStepSeconds);
  const stepSeconds = seconds / steps;
  const retention = Math.exp(-response * stepSeconds);
  let result = { ...state };

  for (let step = 0; step < steps; step += 1) {
    // Integrating the exponential response exactly avoids frame-rate-dependent
    // acceleration and stopping distances.
    const displacement = {
      x: target.x * stepSeconds + (result.vx - target.x) * (1 - retention) / response,
      z: target.z * stepSeconds + (result.vz - target.z) * (1 - retention) / response,
    };
    let velocity = {
      x: target.x + (result.vx - target.x) * retention,
      z: target.z + (result.vz - target.z) * retention,
    };
    const moved = moveOneStep(result, displacement);
    for (const normal of moved.normals) velocity = removeIntoWall(velocity, normal);
    result = { ...moved.position, vx: velocity.x, vz: velocity.z };
  }
  return result;
}

/** Crossing a threshold starts a scene transition; no neighbouring room exists here. */
export function passageAt(position: PlanarPoint): Direction | undefined {
  if (!canStandAt(position)) return undefined;
  for (const direction of directions) {
    const info = directionInfo[direction];
    const along = position.x * info.x + position.z * info.z;
    const across = position.x * -info.z + position.z * info.x;
    const half = info.x ? halfWidth : halfDepth;
    if (along >= half + 0.35 && Math.abs(across) <= opening - radius + epsilon) return direction;
  }
  return undefined;
}

/** Place arrivals well inside their chosen doorway, already facing into the room. */
export function spawnAt(door?: Direction): PlanarPoint & { yaw: number } {
  const info = directionInfo[door ?? 'south'];
  const inset = Math.max(movement.arrivalInset, radius + 0.05);
  const distance = Math.max(0, (info.x ? halfWidth : halfDepth) - inset);
  const yaw = Math.atan2(info.x, info.z);
  return { x: info.x * distance, z: info.z * distance, yaw };
}

/** A small camera approach for clicking any entrance, never a full corridor trip. */
export function approachPoint(position: PlanarPoint, direction: Direction): PlanarPoint {
  const info = directionInfo[direction];
  const half = info.x ? halfWidth : halfDepth;
  const target = { x: info.x * (half + 0.5), z: info.z * (half + 0.5) };
  const distance = Math.hypot(target.x - position.x, target.z - position.z);
  if (distance < epsilon) return { ...position };
  const length = Math.min(0.5, distance);
  const delta = { x: (target.x - position.x) / distance * length, z: (target.z - position.z) / distance * length };
  const end = { x: position.x + delta.x, z: position.z + delta.z };
  if (canTravel(position, end)) return end;
  // The cinematic interpolates a straight line, so stop at contact instead of
  // returning a sliding endpoint whose straight chord could cut through a jamb.
  let low = 0;
  let high = 1;
  for (let search = 0; search < 18; search += 1) {
    const middle = (low + high) / 2;
    if (canTravel(position, { x: position.x + delta.x * middle, z: position.z + delta.z * middle })) low = middle;
    else high = middle;
  }
  return { x: position.x + delta.x * low, z: position.z + delta.z * low };
}
