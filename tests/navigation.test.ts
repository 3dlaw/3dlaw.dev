import test from 'node:test';
import assert from 'node:assert/strict';
import { directions, roomMap, entranceRoom, directionInfo } from '../src/data/room-map.ts';
import { roomPalettes } from '../src/data/room-design.ts';
import { spawnAt, canStandAt, passageAt } from '../src/data/room-movement.ts';
import { transitionFrame } from '../src/data/room-transition.ts';

test('all independent room links resolve, return, and spawn safely facing inward', () => {
  const reached = new Set([entranceRoom]);
  const pending = [entranceRoom];
  while (pending.length) {
    const room = roomMap[pending.pop()!];
    assert(roomPalettes[room.palette]);
    for (const direction of directions) {
      const exit = room.exits[direction];
      const back = roomMap[exit.room].exits[exit.arrival];
      assert.equal(back.room,room.id);
      assert.equal(back.arrival,direction);
      const spawn = spawnAt(exit.arrival);
      assert(canStandAt(spawn)); assert.equal(passageAt(spawn),undefined);
      const side = directionInfo[exit.arrival];
      assert(Math.abs(-Math.sin(spawn.yaw) + side.x) < 1e-9);
      assert(Math.abs(-Math.cos(spawn.yaw) + side.z) < 1e-9);
      if (!reached.has(exit.room)) { reached.add(exit.room); pending.push(exit.room); }
    }
  }
  assert.equal(reached.size,Object.keys(roomMap).length);
});

test('the connection map is not a spatial grid', () => {
  const worldbuilding = roomMap.threshold.exits.north;
  const next = roomMap[worldbuilding.room].exits.north;
  const backToThreshold = roomMap[next.room].exits.east;
  assert.equal(backToThreshold.room,entranceRoom);
});

test('scene changes happen only in the fully concealed interval', () => {
  let wasSwapped = false;
  for (let tick=0; tick<=1000; tick++) {
    const frame=transitionFrame(tick/1000);
    assert(frame.opacity >= 0 && frame.opacity <= 1);
    if (frame.swap && !wasSwapped) assert.equal(frame.opacity,1);
    wasSwapped = frame.swap;
  }
  for (const step of [1/30,1/60,1/144,.05/.9,.05/.26]) {
    let prior=false;
    for(let t=0;t<1+step;t+=step) {
      const frame=transitionFrame(t);
      if(frame.swap&&!prior) assert.equal(frame.opacity,1,'black interval must survive ordinary frame steps');
      prior=frame.swap;
    }
  }
  assert.equal(transitionFrame(0).opacity,0);
  assert.equal(transitionFrame(1).opacity,0);
  assert.equal(transitionFrame(1).complete,true);
});
