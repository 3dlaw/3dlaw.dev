export const directions = ['north', 'east', 'south', 'west'] as const;
export type Direction = typeof directions[number];
export const directionInfo: Record<Direction, { x: number; z: number; yaw: number; label: string }> = {
  north: { x: 0, z: -1, yaw: 0, label: 'North passage' },
  east: { x: 1, z: 0, yaw: -Math.PI / 2, label: 'East passage' },
  south: { x: 0, z: 1, yaw: Math.PI, label: 'South passage' },
  west: { x: -1, z: 0, yaw: Math.PI / 2, label: 'West passage' },
};
export const opposite: Record<Direction, Direction> = { north: 'south', east: 'west', south: 'north', west: 'east' };
export interface RoomExit { room: string; arrival: Direction }
export interface RoomNode {
  id: string; title: string; subtitle: string; description: string; palette: string; scene: string;
  page: { label: string; path: string };
  exits: Record<Direction, RoomExit>;
}
// Links, not coordinates. Arrival identifies a destination doorway. Connections
// can be rewired without moving geometry; a scene's model can change independently.
export const roomMap: Record<string, RoomNode> = {
  threshold: {
    id: 'threshold', title: 'The threshold', subtitle: 'A place for curiosity', palette: 'threshold', scene: 'chamber',
    description: 'Different interests. Connected spaces. Choose a passage and see where it leads.',
    page: { label: 'Browse all projects', path: 'projects/' },
    exits: { north: { room: 'worldbuilding', arrival: 'south' }, east: { room: 'surface', arrival: 'west' }, south: { room: 'writing', arrival: 'north' }, west: { room: 'workshop', arrival: 'east' } },
  },
  worldbuilding: {
    id: 'worldbuilding', title: 'Worldbuilding', subtitle: 'Imagined worlds', palette: 'worldbuilding', scene: 'chamber',
    description: 'Auralis begins with a world, and leaves room for the stories, images, and experiments that might grow from it.',
    page: { label: 'Explore Worldbuilding', path: 'projects/worldbuilding/' },
    exits: { north: { room: 'workshop', arrival: 'south' }, east: { room: 'writing', arrival: 'west' }, south: { room: 'threshold', arrival: 'north' }, west: { room: 'surface', arrival: 'south' } },
  },
  surface: {
    id: 'surface', title: 'Beneath the surface', subtitle: 'Understanding how things work', palette: 'surface', scene: 'chamber',
    description: 'An exploration of geometry, computation, and the behaviour of the models we build.',
    page: { label: 'Explore Beneath the surface', path: 'projects/model-behavior/' },
    exits: { north: { room: 'writing', arrival: 'south' }, east: { room: 'workshop', arrival: 'west' }, south: { room: 'worldbuilding', arrival: 'west' }, west: { room: 'threshold', arrival: 'east' } },
  },
  writing: {
    id: 'writing', title: 'Writing', subtitle: 'Ideas taking shape', palette: 'writing', scene: 'chamber',
    description: 'A place for longer thoughts and discoveries along the way.',
    page: { label: 'Browse writing', path: 'writing/' },
    exits: { north: { room: 'threshold', arrival: 'south' }, east: { room: 'workshop', arrival: 'north' }, south: { room: 'surface', arrival: 'north' }, west: { room: 'worldbuilding', arrival: 'east' } },
  },
  workshop: {
    id: 'workshop', title: 'The workshop', subtitle: 'Always a work in progress', palette: 'workshop', scene: 'chamber',
    description: 'The space between an idea and something you can step inside. This website is one of those experiments.',
    page: { label: 'About 3DLaw', path: 'about/' },
    exits: { north: { room: 'writing', arrival: 'east' }, east: { room: 'threshold', arrival: 'west' }, south: { room: 'worldbuilding', arrival: 'north' }, west: { room: 'surface', arrival: 'east' } },
  },
};
export const entranceRoom = 'threshold';
for (const room of Object.values(roomMap)) {
  for (const [direction, exit] of Object.entries(room.exits)) {
    if (!roomMap[exit.room] || !directions.includes(exit.arrival)) throw new Error(`Invalid ${direction} exit in ${room.id}.`);
  }
}
