import assert from 'node:assert/strict';
import test from 'node:test';
import { roomDesign } from '../src/data/room-design';
import { directions, directionInfo, roomMap } from '../src/data/room-map';
import { approachPoint, canStandAt, ease, movement, passageAt, spawnAt, stepWalker, type Walker } from '../src/data/room-movement';

const origin: Walker = { x: 0, z: 0, vx: 0, vz: 0 };
const close = (actual: number, expected: number, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);

function walk(start: Walker, seconds: number, input = { forward: 1, strafe: 0 }, yaw = 0, fps = 60) {
  let state = { ...start };
  for (let frame = 0; frame < Math.round(seconds * fps); frame += 1) state = stepWalker(state, input, yaw, 1 / fps);
  return state;
}

test('walking and diagonal walking cover the same distance and respect the speed limit', () => {
  const straight = walk(origin, 1);
  const diagonal = walk(origin, 1, { forward: 1, strafe: 1 });
  close(Math.hypot(straight.x, straight.z), Math.hypot(diagonal.x, diagonal.z));
  close(diagonal.x, -diagonal.z);
  assert.ok(Math.hypot(diagonal.vx, diagonal.vz) <= movement.speed);
  assert.ok(-straight.z > 2 && -straight.z < movement.speed);
  assert.deepEqual(origin, { x: 0, z: 0, vx: 0, vz: 0 }, 'the function does not mutate its caller');
});

test('acceleration and stopping are independent of display refresh rate', () => {
  const results = [30, 60, 144].map(fps => {
    const moving = walk(origin, 0.5, { forward: 1, strafe: 0 }, 0.7, fps);
    return walk(moving, 0.5, { forward: 0, strafe: 0 }, 0.7, fps);
  });
  for (const result of results.slice(1)) {
    close(result.x, results[0].x);
    close(result.z, results[0].z);
    close(result.vx, results[0].vx);
    close(result.vz, results[0].vz);
  }
});

test('releasing movement stops within ten centimetres without bobbing or drifting', () => {
  const moving = walk(origin, 0.5);
  const stopped = walk(moving, 0.5, { forward: 0, strafe: 0 });
  assert.ok(Math.hypot(stopped.x - moving.x, stopped.z - moving.z) < 0.1);
  assert.ok(Math.hypot(stopped.vx, stopped.vz) < 0.001);
  assert.equal(movement.eyeHeight, 1.65);
  assert.equal(movement.fieldOfView, 65);
});

test('yaw rotates both forward and strafe without reversing them', () => {
  for (const direction of directions) {
    const info = directionInfo[direction];
    const forward = walk(origin, 0.5, { forward: 1, strafe: 0 }, info.yaw);
    assert.ok(forward.x * info.x + forward.z * info.z > 0.8);
    close(forward.x * -info.z + forward.z * info.x, 0);
    const right = walk(origin, 0.5, { forward: 0, strafe: 1 }, info.yaw);
    assert.ok(right.x * -info.z + right.z * info.x > 0.8);
    close(right.x * info.x + right.z * info.z, 0);
  }
});

test('all four walls stop the walker at a body radius, with no velocity into the wall', () => {
  for (const direction of directions) {
    const info = directionInfo[direction];
    const half = (info.x ? roomDesign.width : roomDesign.depth) / 2;
    const start = { x: -info.z * 2, z: info.x * 2, vx: 0, vz: 0 };
    const end = walk(start, 5, { forward: 1, strafe: 0 }, info.yaw);
    close(end.x * info.x + end.z * info.z, half - movement.radius, 2e-6);
    close(end.vx * info.x + end.vz * info.z, 0);
    assert.equal(passageAt(end), undefined);
  }
});

test('all four openings can be entered, trigger once beyond the lip, and end at an opaque wall', () => {
  for (const direction of directions) {
    const info = directionInfo[direction];
    const half = (info.x ? roomDesign.width : roomDesign.depth) / 2;
    assert.equal(passageAt({ x: info.x * (half + 0.34), z: info.z * (half + 0.34) }), undefined);
    assert.equal(passageAt({ x: info.x * (half + 0.36), z: info.z * (half + 0.36) }), direction);
    const end = walk(origin, 5, { forward: 1, strafe: 0 }, info.yaw);
    close(end.x * info.x + end.z * info.z, half + roomDesign.passageDepth - movement.radius, 2e-6);
    assert.equal(passageAt(end), direction);
  }
});

test('walls allow lateral sliding, and an inside corner blocks both components', () => {
  const besideWall = { x: 2, z: -roomDesign.depth / 2 + movement.radius, vx: 0, vz: 0 };
  const sliding = walk(besideWall, 0.5, { forward: 1, strafe: -1 });
  assert.ok(sliding.x < 1.4, 'the wall must not cancel the tangent component');
  close(sliding.z, besideWall.z, 2e-6);
  const corner = walk(origin, 5, { forward: 1, strafe: 1 });
  close(corner.x, roomDesign.width / 2 - movement.radius, 2e-6);
  close(corner.z, -roomDesign.depth / 2 + movement.radius, 2e-6);
  assert.ok(Math.hypot(corner.vx, corner.vz) < 0.0001);
});

test('rounded jamb clearance lets oblique approaches slide safely into every doorway', () => {
  for (const direction of directions) {
    const info = directionInfo[direction];
    const half = (info.x ? roomDesign.width : roomDesign.depth) / 2;
    for (const side of [-1, 1]) {
      const lateral = { x: -info.z * side, z: info.x * side };
      const corner = { x: info.x * half + lateral.x * roomDesign.doorwayWidth / 2, z: info.z * half + lateral.z * roomDesign.doorwayWidth / 2 };
      let state: Walker = {
        x: info.x * (half - 0.55) + lateral.x * (roomDesign.doorwayWidth / 2 + 0.08),
        z: info.z * (half - 0.55) + lateral.z * (roomDesign.doorwayWidth / 2 + 0.08), vx: 0, vz: 0,
      };
      let entered = false;
      for (let frame = 0; frame < 180; frame += 1) {
        state = stepWalker(state, { forward: 1, strafe: -side * 0.18 }, info.yaw, 1 / 60);
        assert.ok(Math.hypot(state.x - corner.x, state.z - corner.z) >= movement.radius - 2e-6, `${direction} jamb was clipped`);
        if (state.x * info.x + state.z * info.z > half) {
          assert.ok(Math.abs(state.x * -info.z + state.z * info.x) <= roomDesign.doorwayWidth / 2 - movement.radius + 2e-6);
        }
        entered ||= passageAt(state) === direction;
      }
      assert.ok(entered, `${direction} approach should pass around the jamb`);
    }
  }
});

test('frame stalls cannot jump through a wall or move a large unexpected distance', () => {
  const start = { x: 2, z: -roomDesign.depth / 2 + movement.radius + 0.1, vx: 0, vz: -movement.speed };
  const end = stepWalker(start, { forward: 1, strafe: 0 }, 0, 15);
  assert.ok(Math.hypot(end.x - start.x, end.z - start.z) <= movement.speed * 0.1 + 1e-6);
  assert.ok(end.z >= -roomDesign.depth / 2 + movement.radius - 2e-6);
  for (const dt of [0, -1, Number.NaN, Infinity]) assert.deepEqual(stepWalker(origin, { forward: 1, strafe: 0 }, 0, dt), origin);
});

test('every graph arrival faces inward, has clearance, and cannot immediately retrigger', () => {
  close(spawnAt().z, roomDesign.depth / 2 - movement.arrivalInset);
  for (const room of Object.values(roomMap)) {
    for (const exit of Object.values(room.exits)) {
      const spawn = spawnAt(exit.arrival);
      const info = directionInfo[exit.arrival];
      assert.ok(canStandAt(spawn));
      assert.equal(passageAt(spawn), undefined);
      close(-Math.sin(spawn.yaw), -info.x);
      close(-Math.cos(spawn.yaw), -info.z);
      const walked = walk({ ...spawn, vx: 0, vz: 0 }, 0.2, { forward: 1, strafe: 0 }, spawn.yaw);
      assert.ok(Math.hypot(walked.x, walked.z) < Math.hypot(spawn.x, spawn.z));
    }
  }
});

test('click approaches stay short and safe from room corners and from other entrances', () => {
  const nearX = roomDesign.width / 2 - movement.radius - 0.02;
  const nearZ = roomDesign.depth / 2 - movement.radius - 0.02;
  const starts = [
    origin,
    { x: nearX, z: -nearZ }, { x: -nearX, z: nearZ },
    { x: 0, z: -roomDesign.depth / 2 - roomDesign.passageDepth / 2 },
    { x: roomDesign.width / 2 + roomDesign.passageDepth / 2, z: 0 },
  ];
  for (const start of starts) {
    assert.ok(canStandAt(start));
    for (const direction of directions) {
      const end = approachPoint(start, direction);
      assert.ok(canStandAt(end));
      assert.ok(Math.hypot(end.x - start.x, end.z - start.z) <= 0.5 + 1e-6);
      for (let sample = 0; sample <= 20; sample += 1) {
        const t = sample / 20;
        assert.ok(canStandAt({ x: start.x + (end.x - start.x) * t, z: start.z + (end.z - start.z) * t }), 'camera interpolation must also be collision-safe');
      }
    }
  }
});

test('easing remains within its endpoints', () => {
  assert.equal(ease(-1), 0);
  assert.equal(ease(0), 0);
  assert.equal(ease(0.5), 0.5);
  assert.equal(ease(1), 1);
  assert.equal(ease(2), 1);
});
