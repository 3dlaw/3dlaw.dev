// Dimensions are in scene metres. This is the common template for every room.
// Geometry, navigation connections, and camera movement have separate files.
export const roomDesign = {
  width: 10,
  depth: 10,
  height: 4,
  hallwayWidth: 2.6,
  hallwayHeight: 2.7,
  hallwayLength: 6,
  colors: {
    background: '#0c0b10',
    wall: '#39343f',
    sideWall: '#302c37',
    floor: '#29252f',
    ceiling: '#26222c',
    hallwayWall: '#24212b',
    hallwayFloor: '#201d26',
    hallwayCeiling: '#1d1a23',
  },
};

if (roomDesign.hallwayWidth >= Math.min(roomDesign.width, roomDesign.depth)
  || roomDesign.hallwayHeight >= roomDesign.height) {
  throw new Error('The hallway opening must fit inside the room walls.');
}
