import * as THREE from 'three';
import { roomPalettes } from '../data/room-design';
import { directions, directionInfo, entranceRoom, roomMap, type Direction } from '../data/room-map';
import { movement, ease, stepWalker, passageAt, spawnAt, approachPoint, type Walker } from '../data/room-movement';
import { transitionFrame } from '../data/room-transition';
import { buildRoomScene } from './room-scenes';

type Travel = {
  kind: 'travel'; elapsed: number; duration: number; target: string; arrival?: Direction;
  from: { x: number; z: number }; to: { x: number; z: number }; swapped: boolean;
};
type Animation = Travel | { kind: 'entry'; elapsed: number; duration: number };
const walkingKeys = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
type RoomRenderer = Pick<THREE.WebGLRenderer, 'setPixelRatio' | 'setSize' | 'render' | 'dispose' | 'outputColorSpace' | 'toneMapping' | 'toneMappingExposure'>;

export function createWorld(root: HTMLElement, makeRenderer: (canvas: HTMLCanvasElement) => RoomRenderer = canvas => new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })) {
  const panel = root.querySelector<HTMLDialogElement>('[data-depths-panel]')!;
  const canvas = root.querySelector<HTMLCanvasElement>('[data-room-canvas]')!;
  const darkness = root.querySelector<HTMLElement>('[data-darkness]')!;
  const status = root.querySelector<HTMLElement>('[data-room-status]')!;
  const message = root.querySelector<HTMLElement>('[data-depths-message]')!;
  const directory = root.querySelector<HTMLDialogElement>('[data-directory]')!;
  const lockButton = root.querySelector<HTMLButtonElement>('[data-mouse-look]')!;
  const gentleCheckbox = root.querySelector<HTMLInputElement>('[data-reduced-motion]')!;
  const sensitivityInput = root.querySelector<HTMLInputElement>('[data-sensitivity]')!;
  const reticle = root.querySelector<HTMLElement>('[data-reticle]')!;
  const aimLabel = root.querySelector<HTMLElement>('[data-aim-label]')!;
  const controls = [...root.querySelectorAll<HTMLButtonElement>('[data-hallway], [data-teleport], [data-portal], [data-move]')];
  const portalButtons = new Map(directions.map(direction => [direction, root.querySelector<HTMLButtonElement>(`[data-portal="${direction}"]`)!]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  gentleCheckbox.checked = reduced.matches;
  let gentleOverride = false;
  const gentle = () => gentleCheckbox.checked;
  const abort = new AbortController();
  const signal = abort.signal;
  let built = buildRoomScene(roomMap[entranceRoom]);
  let renderer: RoomRenderer;
  try {
    renderer = makeRenderer(canvas);
  } catch (error) { built.dispose(); throw error; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  const camera = new THREE.PerspectiveCamera(movement.fieldOfView, 1, 0.06, 35);
  camera.rotation.order = 'YXZ';
  const initial = spawnAt();
  let walker: Walker = { x: initial.x, z: initial.z, vx: 0, vz: 0 };
  let yaw = initial.yaw, pitch = 0, room = entranceRoom;
  let active = false, suspended = false, lost = false, disposed = false, frame = 0, previous = 0;
  let animation: Animation | undefined;
  let hover: Direction | undefined;
  let unlockedAt = -Infinity;
  let pointer: { x: number; y: number } | undefined;
  let drag: { id: number; x: number; y: number; startX: number; startY: number; moved: boolean } | undefined;
  const keys = new Set<string>();
  const touchKeys = new Map<number, string>();
  const raycaster = new THREE.Raycaster();
  const screenPoint = new THREE.Vector2();
  const projected = new THREE.Vector3();
  const rayDirection = new THREE.Vector3();
  let hits = [...built.solids, ...built.portals.map(portal => portal.target)];
  let width = 1, height = 1;

  function locked() { return document.pointerLockElement === canvas; }
  function clearInput() {
    keys.clear(); touchKeys.clear(); walker.vx = 0; walker.vz = 0;
    if (drag && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
    drag = undefined;
    canvas.classList.remove('is-dragging');
  }
  function releaseMouse() { if (locked()) document.exitPointerLock(); }
  function updateControls() {
    const busy = Boolean(animation) || lost;
    panel.classList.toggle('is-busy', Boolean(animation));
    panel.setAttribute('aria-busy', String(Boolean(animation)));
    controls.forEach(control => { control.disabled = busy || control.dataset.teleport === room; });
    lockButton.disabled = busy || !canvas.requestPointerLock;
    root.querySelectorAll<HTMLButtonElement>('[data-teleport]').forEach(button => {
      if (button.dataset.teleport === room) button.setAttribute('aria-current','location');
      else button.removeAttribute('aria-current');
    });
  }
  function updateRoom() {
    const current = roomMap[room];
    root.dataset.currentRoom = room;
    panel.style.setProperty('--room-accent', roomPalettes[current.palette].accent);
    root.querySelector<HTMLElement>('[data-room-name]')!.textContent = current.title;
    root.querySelector<HTMLElement>('[data-room-subtitle]')!.textContent = current.subtitle;
    root.querySelector<HTMLElement>('[data-info-title]')!.textContent = current.title;
    root.querySelector<HTMLElement>('[data-info-description]')!.textContent = current.description;
    const page = root.querySelector<HTMLAnchorElement>('[data-room-page]')!;
    page.href = `${root.dataset.base || '/'}${current.page.path}`;
    page.replaceChildren(document.createTextNode(`${current.page.label} ↗`));
    for (const direction of directions) {
      const target = roomMap[current.exits[direction].room];
      const button = portalButtons.get(direction)!;
      button.querySelector<HTMLElement>('[data-portal-title]')!.textContent = target.title;
      button.setAttribute('aria-label', `Enter ${target.title}`);
      const menuButton = root.querySelector<HTMLButtonElement>(`[data-hallway="${direction}"]`)!;
      menuButton.querySelector<HTMLElement>('[data-exit-title]')!.textContent = target.title;
      menuButton.setAttribute('aria-label', `${directionInfo[direction].label}: enter ${target.title}`);
    }
    status.textContent = `Entered ${current.title}. Walk around, choose a passage, or open the Directory.`;
    updateControls();
  }
  function updateCamera() {
    camera.position.set(walker.x, movement.eyeHeight, walker.z);
    camera.rotation.set(pitch, yaw, 0);
    camera.updateMatrixWorld(true);
  }
  function select(direction: Direction | undefined) {
    if (hover !== direction) {
      hover = direction;
      built.setHover(direction);
      for (const [name, button] of portalButtons) button.classList.toggle('is-selected', name === direction);
    }
    canvas.classList.toggle('is-over-hallway', Boolean(direction) && !locked());
    aimLabel.textContent = direction ? `${roomMap[roomMap[room].exits[direction].room].title} · E` : '';
  }
  function pick(x: number, y: number): Direction | undefined {
    const rect = canvas.getBoundingClientRect();
    screenPoint.set((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2);
    raycaster.setFromCamera(screenPoint, camera);
    const hit = raycaster.intersectObjects(hits, false)[0];
    return built.portals.find(portal => portal.target === hit?.object)?.direction;
  }
  function projectLabels() {
    for (const portal of built.portals) {
      const button = portalButtons.get(portal.direction)!;
      projected.copy(portal.anchor).project(camera);
      let visible = !animation && !suspended && !lost && projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .91 && Math.abs(projected.y) < .78;
      if (visible) {
        // A doorway's center must be visible: no labels through room corners.
        rayDirection.copy(portal.target.position).sub(camera.position).normalize();
        raycaster.set(camera.position, rayDirection);
        visible = raycaster.intersectObjects(hits, false)[0]?.object === portal.target;
      }
      button.hidden = !visible || locked();
      if (visible) {
        const margin = button.offsetWidth / 2 + 16;
        button.style.left = `${THREE.MathUtils.clamp((projected.x + 1) * width / 2, margin, width - margin)}px`;
        button.style.top = `${(1 - projected.y) * height / 2}px`;
      }
    }
  }
  function advance(dt: number) {
    if (!animation) return;
    animation.elapsed += dt;
    const progress = Math.min(1, animation.elapsed / animation.duration);
    if (animation.kind === 'entry') {
      darkness.style.opacity = String(1 - ease(progress));
      if (progress >= 1) animation = undefined;
    } else {
      const state = transitionFrame(progress);
      if (!animation.swapped && !gentle()) {
        walker.x = THREE.MathUtils.lerp(animation.from.x, animation.to.x, state.approach);
        walker.z = THREE.MathUtils.lerp(animation.from.z, animation.to.z, state.approach);
      }
      darkness.style.opacity = String(state.opacity);
      if (state.swap && !animation.swapped) {
        // Always paint at least one fully black frame for the swap, including
        // reduced-motion timelines and frames that skip over the hold interval.
        darkness.style.opacity = '1';
        const nextRoom = roomMap[animation.target];
        let destination;
        try { destination = buildRoomScene(nextRoom); }
        catch (error) { fail(error); return; }
        built.dispose();
        built = destination;
        hits = [...built.solids, ...built.portals.map(portal => portal.target)];
        room = nextRoom.id;
        const spawn = spawnAt(animation.arrival);
        walker = { x: spawn.x, z: spawn.z, vx: 0, vz: 0 };
        yaw = spawn.yaw; pitch = 0;
        animation.swapped = true;
        clearInput(); select(undefined); pointer = undefined;
        updateRoom();
        return;
      }
      if (state.complete) animation = undefined;
    }
    if (!animation) { darkness.style.opacity = '0'; updateControls(); }
  }
  function fail(error: unknown) {
    lost = true; animation = undefined; clearInput(); releaseMouse(); updateControls();
    panel.classList.remove('is-rendered');
    darkness.style.opacity = '1'; message.hidden = false;
    message.textContent = 'Graphics were interrupted. You can still use the Directory, or return above and reload.';
    console.warn('Room rendering was interrupted.', error);
  }
  function render(now: number) {
    frame = 0;
    if (!active || suspended || lost || disposed || document.hidden) return;
    const dt = Math.min(Math.max((now - previous) / 1000, 0), .05);
    previous = now;
    advance(dt);
    if (lost) return;
    if (!animation) {
      const focused = document.activeElement === canvas || locked() || touchKeys.size > 0;
      if (focused) {
        const held = (code: string) => keys.has(code);
        const touch = (name: string) => [...touchKeys.values()].includes(name);
        yaw += (Number(held('ArrowLeft')) - Number(held('ArrowRight'))) * movement.keyboardTurnSpeed * dt;
        walker = stepWalker(walker, {
          forward: Number(held('KeyW') || held('ArrowUp') || touch('forward')) - Number(held('KeyS') || held('ArrowDown') || touch('back')),
          strafe: Number(held('KeyD') || touch('right')) - Number(held('KeyA') || touch('left')),
        }, yaw, dt);
        const doorway = passageAt(walker);
        if (doorway) go(doorway);
      }
    }
    updateCamera();
    if (animation?.kind === 'entry' && !gentle()) camera.position.y += .18 * (1 - ease(animation.elapsed / animation.duration));
    camera.updateMatrixWorld(true);
    if (!animation) {
      if (locked()) select(pick(width / 2, height / 2));
      else if (pointer && !drag) select(pick(pointer.x, pointer.y));
    }
    projectLabels();
    try { renderer.render(built.scene, camera); panel.classList.add('is-rendered'); }
    catch (error) { fail(error); return; }
    if (animation || keys.size || touchKeys.size || Math.hypot(walker.vx,walker.vz) > .001) frame = requestAnimationFrame(render);
  }
  function invalidate() {
    if (active && !suspended && !lost && !disposed && !document.hidden && !frame) {
      previous = performance.now(); frame = requestAnimationFrame(render);
    }
  }
  function resize() {
    width = Math.max(1, panel.clientWidth || innerWidth);
    height = Math.max(1, panel.clientHeight || innerHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    invalidate();
  }
  function enter(firstVisit: boolean) {
    active = true; suspended = false; clearInput();
    if (firstVisit) {
      animation = { kind: 'entry', elapsed: 0, duration: gentle() ? .2 : movement.entrySeconds };
      darkness.style.opacity = '1';
    }
    resize(); updateControls(); invalidate();
  }
  function pause() {
    active = false; clearInput(); releaseMouse(); pointer = undefined; select(undefined);
    cancelAnimationFrame(frame); frame = 0;
    // The room, camera, and exact transition progress survive Return above.
  }
  function suspend(value: boolean) {
    suspended = value; clearInput(); releaseMouse(); pointer = undefined; select(undefined);
    if (value) { cancelAnimationFrame(frame); frame = 0; }
    else invalidate();
  }
  function travel(target: string, arrival?: Direction, direction?: Direction) {
    if (!active || animation || lost || !roomMap[target] || target === room) return;
    if (directory.open) directory.close();
    suspended = false;
    clearInput(); select(undefined);
    const from = { x: walker.x, z: walker.z };
    // Only a small, collision-safe approach. Reorientation happens under black.
    const to = direction && !gentle() ? approachPoint(walker, direction) : from;
    animation = { kind: 'travel', elapsed: 0, duration: gentle() ? .26 : movement.transitionSeconds, target, arrival, from, to, swapped: false };
    status.textContent = `Entering ${roomMap[target].title}.`;
    canvas.focus({ preventScroll: true });
    updateControls(); invalidate();
  }
  function go(direction: Direction) {
    const exit = roomMap[room].exits[direction];
    travel(exit.room, exit.arrival, direction);
  }
  function rotate(dx: number, dy: number) {
    const sensitivity = movement.lookSensitivity * Number(sensitivityInput.value);
    yaw -= dx * sensitivity;
    pitch = THREE.MathUtils.clamp(pitch - dy * sensitivity, -movement.maxPitch, movement.maxPitch);
    invalidate();
  }
  canvas.addEventListener('pointerdown', event => {
    if (!active || suspended || animation || lost || event.button !== 0) return;
    canvas.focus({ preventScroll: true });
    if (locked()) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    canvas.setPointerCapture(event.pointerId);
  }, { signal });
  canvas.addEventListener('pointermove', event => {
    if (!active || suspended || animation || lost) return;
    if (locked()) { rotate(event.movementX, event.movementY); return; }
    pointer = { x: event.clientX, y: event.clientY };
    if (drag && drag.id === event.pointerId) {
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY) > 5) drag.moved = true;
      if (drag.moved) { rotate(dx,dy); canvas.classList.add('is-dragging'); select(undefined); }
      drag.x = event.clientX; drag.y = event.clientY;
    } else { select(pick(event.clientX,event.clientY)); invalidate(); }
  }, { signal });
  canvas.addEventListener('pointerup', event => {
    if (!active || suspended || animation || lost) return;
    if (locked()) { if (event.button === 0 && hover) go(hover); return; }
    if (!drag || drag.id !== event.pointerId) return;
    const clicked = !drag.moved;
    drag = undefined; canvas.classList.remove('is-dragging');
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (clicked) { const direction = pick(event.clientX,event.clientY); if (direction) go(direction); }
    invalidate();
  }, { signal });
  canvas.addEventListener('pointercancel', () => { clearInput(); invalidate(); }, { signal });
  canvas.addEventListener('lostpointercapture', () => { drag = undefined; canvas.classList.remove('is-dragging'); }, { signal });
  canvas.addEventListener('pointerleave', () => { if (!drag && !locked()) { pointer = undefined; select(undefined); invalidate(); } }, { signal });
  canvas.addEventListener('blur', () => { if (!locked()) clearInput(); }, { signal });
  document.addEventListener('keydown', event => {
    if (!active || suspended || animation || lost || (document.activeElement !== canvas && !locked())) return;
    if (walkingKeys.has(event.code)) {
      event.preventDefault();
      // A key held through a transition must be released before it can walk again.
      if (event.repeat && !keys.has(event.code)) return;
      keys.add(event.code); invalidate();
    } else if ((event.code === 'KeyE' || event.code === 'Enter') && !event.repeat) {
      event.preventDefault(); const direction = locked() ? hover : pick(width/2,height/2); if (direction) go(direction);
    } else if (event.code === 'Tab' && locked()) releaseMouse();
  }, { signal });
  document.addEventListener('keyup', event => { keys.delete(event.code); invalidate(); }, { signal });
  for (const [direction, button] of portalButtons) {
    button.addEventListener('click', () => go(direction), { signal });
    button.addEventListener('pointerenter', () => { select(direction); invalidate(); }, { signal });
    button.addEventListener('focus', () => { select(direction); invalidate(); }, { signal });
  }
  root.querySelectorAll<HTMLButtonElement>('[data-hallway]').forEach(button => button.addEventListener('click', () => {
    const direction = button.dataset.hallway as Direction;
    if (directions.includes(direction)) go(direction);
  }, { signal }));
  root.querySelectorAll<HTMLButtonElement>('[data-teleport]').forEach(button => button.addEventListener('click', () => travel(button.dataset.teleport!), { signal }));
  root.querySelectorAll<HTMLButtonElement>('[data-move]').forEach(button => {
    button.addEventListener('pointerdown', event => {
      if (!active || suspended || animation || lost) return;
      event.preventDefault(); canvas.focus({ preventScroll: true });
      button.setPointerCapture(event.pointerId); touchKeys.set(event.pointerId, button.dataset.move!); invalidate();
    }, { signal });
    for (const type of ['pointerup','pointercancel','lostpointercapture'] as const) button.addEventListener(type, event => { touchKeys.delete(event.pointerId); invalidate(); }, { signal });
  });
  lockButton.addEventListener('click', async () => {
    if (locked()) { releaseMouse(); return; }
    if (!active || suspended || animation || lost || !canvas.requestPointerLock) return;
    canvas.focus({ preventScroll: true });
    try { await canvas.requestPointerLock(); }
    catch { status.textContent = 'Mouse look is unavailable. Click and drag to look around.'; }
  }, { signal });
  document.addEventListener('pointerlockchange', () => {
    const isLocked = locked();
    if (!isLocked) unlockedAt = performance.now();
    clearInput(); pointer = undefined;
    lockButton.setAttribute('aria-pressed',String(isLocked));
    lockButton.textContent = isLocked ? 'Release mouse' : 'Mouse look';
    reticle.hidden = !isLocked;
    if (isLocked) canvas.focus({ preventScroll: true });
    invalidate();
  }, { signal });
  document.addEventListener('pointerlockerror', () => { status.textContent = 'Mouse look is unavailable. Click and drag to look around.'; }, { signal });
  gentleCheckbox.addEventListener('change', () => { gentleOverride = true; }, { signal });
  reduced.addEventListener('change', () => { if (!gentleOverride) gentleCheckbox.checked = reduced.matches; }, { signal });
  addEventListener('blur', () => { clearInput(); releaseMouse(); }, { signal });
  addEventListener('resize', resize, { passive: true, signal });
  document.addEventListener('visibilitychange', () => {
    clearInput();
    if (document.hidden) { releaseMouse(); cancelAnimationFrame(frame); frame = 0; }
    else invalidate();
  }, { signal });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); fail('WebGL context lost'); }, { signal });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false; message.hidden = true; darkness.style.opacity = '0'; updateControls(); invalidate();
  }, { signal });
  updateCamera(); updateRoom();
  return {
    enter, pause, suspend,
    escapeCaptured() { return locked() || performance.now() - unlockedAt < 300; },
    dispose() { if (disposed) return; pause(); disposed = true; abort.abort(); built.dispose(); renderer.dispose(); },
  };
}
