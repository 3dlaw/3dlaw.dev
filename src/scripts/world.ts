import * as THREE from 'three';
import { roomDesign as design } from '../data/room-design';
import { movement, ease, planPassage } from '../data/room-movement';
import { directionInfo, directions, entranceRoom, roomMap, type Direction } from '../data/room-map';
import { arrivalPosition, createRoomScene } from './world-scene';

type Animation =
  | { kind: 'entry'; elapsed: number; fromY: number }
  | { kind: 'turn'; elapsed: number; fromYaw: number; toYaw: number; fromPitch: number }
  | { kind: 'travel'; elapsed: number; from: THREE.Vector3; aligned: THREE.Vector3; end: THREE.Vector3; fromYaw: number; toYaw: number; fromPitch: number; direction: Direction; target: string; duration: number };

export function createWorld(root: HTMLElement) {
  const panel = root.querySelector<HTMLElement>('[data-depths-panel]')!;
  const canvas = root.querySelector<HTMLCanvasElement>('[data-room-canvas]')!;
  const status = root.querySelector<HTMLElement>('[data-room-status]')!;
  const menu = root.querySelector<HTMLDetailsElement>('[data-hallway-menu]')!;
  const controls = [...root.querySelectorAll<HTMLButtonElement>('[data-turn], [data-hallway]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const built = createRoomScene();
  const camera = new THREE.PerspectiveCamera(movement.fieldOfView, 1, 0.08, 65);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, movement.eyeHeight, design.depth / 2 - movement.arrivalInset);
  const raycaster = new THREE.Raycaster();
  const point = new THREE.Vector2();
  const hits = [built.solid, ...built.portals.map(portal => portal.target)];
  let room = entranceRoom, yaw = 0, pitch = 0;
  let active = false, lost = false, frame = 0, previous = 0;
  let animation: Animation | undefined;
  let drag: { id: number; x: number; y: number; distance: number } | undefined;

  function updateRoom() {
    root.dataset.currentRoom = room;
    root.querySelector<HTMLElement>('[data-room-name]')!.textContent = roomMap[room].name;
    status.textContent = `Entered ${roomMap[room].name}. There is a hallway on each wall.`;
  }
  function busy() {
    panel.classList.toggle('is-busy', Boolean(animation));
    panel.setAttribute('aria-busy', String(Boolean(animation)));
    controls.forEach(control => { control.disabled = Boolean(animation) || lost; });
    canvas.classList.remove('is-over-hallway');
  }
  function shortestYaw(target: number) {
    return yaw + Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
  }
  function completeTravel(travel: Extract<Animation, {kind: 'travel'}>) {
    const center = arrivalPosition(travel.direction);
    camera.position.copy(travel.end);
    // Local coordinates recenter seamlessly because every room uses the same
    // template. The graph decides which room this is, independently of geometry.
    camera.position.x -= center.x;
    camera.position.z -= center.z;
    yaw = directionInfo[travel.direction].yaw;
    pitch = 0;
    room = travel.target;
    updateRoom();
  }
  function advance(dt: number) {
    if (!animation) return;
    animation.elapsed += dt;
    let done = false;
    if (animation.kind === 'entry') {
      const t = reduced.matches ? 1 : animation.elapsed / movement.entrySeconds;
      camera.position.y = THREE.MathUtils.lerp(animation.fromY, movement.eyeHeight, ease(t));
      done = t >= 1;
    } else if (animation.kind === 'turn') {
      const t = reduced.matches ? 1 : animation.elapsed / movement.turnSeconds;
      yaw = THREE.MathUtils.lerp(animation.fromYaw, animation.toYaw, ease(t));
      pitch = animation.fromPitch * (1 - ease(t));
      done = t >= 1;
    } else {
      const align = reduced.matches ? 1 : Math.min(1, animation.elapsed / movement.turnSeconds);
      if (align < 1) {
        camera.position.lerpVectors(animation.from, animation.aligned, ease(align));
        yaw = THREE.MathUtils.lerp(animation.fromYaw, animation.toYaw, ease(align));
        pitch = animation.fromPitch * (1 - ease(align));
      } else {
        const t = reduced.matches ? 1 : Math.max(0, (animation.elapsed - movement.turnSeconds) / animation.duration);
        camera.position.lerpVectors(animation.aligned, animation.end, ease(t));
        yaw = animation.toYaw; pitch = 0;
        done = t >= 1;
        if (done) completeTravel(animation);
      }
    }
    if (done) { animation = undefined; busy(); }
  }
  function render(now: number) {
    frame = 0;
    if (!active || lost || document.hidden) return;
    const dt = Math.min(Math.max(0, (now - previous) / 1000), 0.05);
    previous = now;
    advance(dt);
    camera.rotation.set(pitch, yaw, 0);
    renderer.render(built.scene, camera);
    panel.classList.add('is-rendered');
    if (animation) frame = requestAnimationFrame(render);
  }
  function invalidate() {
    if (active && !lost && !document.hidden && !frame) {
      previous = performance.now(); frame = requestAnimationFrame(render);
    }
  }
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    invalidate();
  }
  function enter(firstVisit: boolean) {
    active = true;
    if (firstVisit && !reduced.matches) {
      camera.position.y = movement.eyeHeight + movement.entryDrop;
      animation = { kind: 'entry', elapsed: 0, fromY: camera.position.y };
    }
    resize(); busy(); invalidate();
  }
  function pause() {
    active = false;
    if (drag && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
    drag = undefined;
    cancelAnimationFrame(frame); frame = 0;
    // Keep room, camera, and any in-progress animation for Return below.
  }
  function go(direction: Direction) {
    if (!active || animation || lost) return;
    const info = directionInfo[direction];
    const plan = planPassage(camera.position.x, camera.position.z, direction);
    const end = new THREE.Vector3(plan.end.x, movement.eyeHeight, plan.end.z);
    // First align with the chosen passage inside the room, then move down its
    // centerline. This prevents diagonal corner-cutting through a hallway wall.
    const aligned = new THREE.Vector3(plan.aligned.x, movement.eyeHeight, plan.aligned.z);
    animation = {
      kind: 'travel', elapsed: 0, from: camera.position.clone(), aligned, end,
      fromYaw: yaw, toYaw: shortestYaw(info.yaw), fromPitch: pitch,
      direction, target: roomMap[room].exits[direction],
      duration: Math.max(0.8, aligned.distanceTo(end) / movement.travelSpeed),
    };
    menu.open = false;
    status.textContent = `Moving through the ${direction} hallway.`;
    busy(); invalidate();
  }
  function turn(quarters: number) {
    if (!active || animation || lost) return;
    animation = { kind: 'turn', elapsed: 0, fromYaw: yaw, toYaw: yaw + quarters * Math.PI / 2, fromPitch: pitch };
    busy(); invalidate();
  }
  function pick(x: number, y: number): Direction | undefined {
    const rect = canvas.getBoundingClientRect();
    point.set((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(point, camera);
    const hit = raycaster.intersectObjects(hits, false)[0];
    return built.portals.find(portal => portal.target === hit?.object)?.direction;
  }
  canvas.addEventListener('pointerdown', event => {
    if (!active || lost || animation || event.button !== 0) return;
    canvas.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0 };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!active || lost || animation) return;
    if (!drag || drag.id !== event.pointerId) {
      canvas.classList.toggle('is-over-hallway', Boolean(pick(event.clientX, event.clientY)));
      return;
    }
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    drag.distance += Math.abs(dx) + Math.abs(dy);
    yaw -= dx * 0.003;
    pitch = THREE.MathUtils.clamp(pitch - dy * 0.003, -0.55, 0.55);
    drag.x = event.clientX; drag.y = event.clientY;
    invalidate();
  });
  canvas.addEventListener('pointerup', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const clicked = drag.distance < 7;
    drag = undefined;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (clicked) { const direction = pick(event.clientX, event.clientY); if (direction) go(direction); }
  });
  canvas.addEventListener('pointercancel', () => { drag = undefined; });
  canvas.addEventListener('pointerleave', () => canvas.classList.remove('is-over-hallway'));
  // Keyboard users use the same real buttons. WASD/free movement is removed.
  root.querySelectorAll<HTMLButtonElement>('[data-turn]').forEach(button => button.addEventListener('click', () => turn(Number(button.dataset.turn))));
  root.querySelectorAll<HTMLButtonElement>('[data-hallway]').forEach(button => button.addEventListener('click', () => {
    const direction = button.dataset.hallway as Direction;
    if (directions.includes(direction)) { go(direction); canvas.focus({ preventScroll: true }); }
  }));
  document.addEventListener('pointerdown', event => { if (!menu.contains(event.target as Node)) menu.open = false; });
  addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => { drag = undefined; if (!document.hidden) invalidate(); });
  reduced.addEventListener('change', invalidate);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); lost = true; animation = undefined; busy();
    panel.classList.remove('is-rendered');
    const message = root.querySelector<HTMLElement>('[data-depths-message]')!;
    message.hidden = false; message.textContent = 'Graphics were interrupted. Return above and reload to try again.';
  });
  updateRoom();
  resize();
  return { enter, pause };
}
