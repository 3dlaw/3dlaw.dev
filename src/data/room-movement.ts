import { roomDesign } from './room-design';
import { directionInfo, type Direction } from './room-map';

// The entrance can later become a ladder animation without changing the map.
export const movement = {
  eyeHeight: 1.65,
  arrivalInset: 1.35,
  fieldOfView: 82,
  entryDrop: 0.5,
  entrySeconds: 1,
  turnSeconds: 0.55,
  travelSpeed: 5.5,
};
export const ease = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export function planPassage(x: number, z: number, direction: Direction) {
  const info = directionInfo[direction];
  const half = (info.x ? roomDesign.width : roomDesign.depth) / 2;
  const center = { x: info.x * (roomDesign.width + roomDesign.hallwayLength), z: info.z * (roomDesign.depth + roomDesign.hallwayLength) };
  const along = x * info.x + z * info.z;
  return {
    aligned: { x: info.x * along, z: info.z * along },
    end: { x: center.x - info.x * (half - movement.arrivalInset), z: center.z - info.z * (half - movement.arrivalInset) },
    center,
  };
}
