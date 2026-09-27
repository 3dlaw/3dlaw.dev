import { ease } from './room-movement';

// Swap the scene only while it is completely concealed. Keeping this timeline
// independent of rendering lets future loaded models use the same transition.
export function transitionFrame(progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  return {
    approach: ease(t / 0.46),
    opacity: t < 0.46 ? ease(t / 0.46) : t <= 0.58 ? 1 : 1 - ease((t - 0.58) / 0.42),
    swap: t >= 0.5,
    arrive: ease((t - 0.58) / 0.42),
    complete: t >= 1,
  };
}
