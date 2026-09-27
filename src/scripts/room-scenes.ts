import { roomPalettes } from '../data/room-design';
import type { RoomNode } from '../data/room-map';
import { createRoomScene } from './world-scene';

export type RoomScene = ReturnType<typeof createRoomScene>;

// Scene selection is separate from room connections. Add an authored builder
// here and set a node's scene key to use it. Only one resulting scene is retained.
// A custom layout also requires matching collision and arrival positions.
export function buildRoomScene(room: RoomNode): RoomScene {
  switch (room.scene) {
    case 'chamber': return createRoomScene(roomPalettes[room.palette]);
    default: throw new Error(`Unknown scene ${room.scene} for room ${room.id}.`);
  }
}
