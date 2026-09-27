export const directions = ['north', 'east', 'south', 'west'] as const;
export type Direction = typeof directions[number];
export interface RoomNode { id: string; name: string; exits: Record<Direction, string> }
export const directionInfo: Record<Direction, { x: number; z: number; yaw: number; label: string }> = {
  north: { x: 0, z: -1, yaw: 0, label: 'North hallway' },
  east: { x: 1, z: 0, yaw: -Math.PI / 2, label: 'East hallway' },
  south: { x: 0, z: 1, yaw: Math.PI, label: 'South hallway' },
  west: { x: -1, z: 0, yaw: Math.PI / 2, label: 'West hallway' },
};
export const opposite: Record<Direction, Direction> = { north: 'south', south: 'north', east: 'west', west: 'east' };

// Nine placeholder rooms. Opposite edges connect, so every hallway leads to a
// room and a return trip leads back to the room you just left. The visual room
// template does not depend on the number or names of nodes in this map.
const idAt = (x: number, z: number) => `room-${((z + 3) % 3) * 3 + ((x + 3) % 3) + 1}`;
export const roomMap: Record<string, RoomNode> = {};
for (let z = 0; z < 3; z++) {
  for (let x = 0; x < 3; x++) {
    const id = idAt(x, z);
    roomMap[id] = {
      id, name: `Room ${id.split('-')[1].padStart(2, '0')}`,
      exits: { north: idAt(x, z - 1), east: idAt(x + 1, z), south: idAt(x, z + 1), west: idAt(x - 1, z) },
    };
  }
}
export const entranceRoom = 'room-5';

// Add or rewire rooms here. For a two-way connection, update both exits.
// Example: roomMap['room-5'].exits.north = 'my-new-room';
for (const room of Object.values(roomMap)) {
  for (const target of Object.values(room.exits)) {
    if (!roomMap[target]) throw new Error(`Room ${room.id} leads to missing room ${target}.`);
  }
}
