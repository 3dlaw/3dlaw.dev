// Metres. Every scene is local: no neighbouring room geometry is required.
export const roomDesign = {
  width: 8, depth: 10, height: 3.5,
  doorwayWidth: 2.1, doorwayHeight: 2.55,
  passageDepth: 1.55, wallThickness: 0.24,
};
export interface RoomPalette {
  wall: string; floor: string; ceiling: string; accent: string; ambient: string;
}
export const roomPalettes: Record<string, RoomPalette> = {
  threshold: { wall: '#39343f', floor: '#24212b', ceiling: '#25212d', accent: '#bc9bdf', ambient: '#c7bddc' },
  worldbuilding: { wall: '#393638', floor: '#262327', ceiling: '#272429', accent: '#c9af89', ambient: '#ddd0be' },
  surface: { wall: '#30383e', floor: '#20262c', ceiling: '#222830', accent: '#98b7c8', ambient: '#beced9' },
  writing: { wall: '#3a343d', floor: '#28212b', ceiling: '#29232e', accent: '#c8a0be', ambient: '#d6bfd2' },
  workshop: { wall: '#343b39', floor: '#222925', ceiling: '#242b29', accent: '#9cb9ab', ambient: '#c2d0c7' },
};
