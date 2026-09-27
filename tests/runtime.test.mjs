import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { bindExploration } from '../src/scripts/exploration.ts';
import { createWorld } from '../src/scripts/world.ts';
import { entranceRoom, roomMap } from '../src/data/room-map.ts';
import { movement, spawnAt } from '../src/data/room-movement.ts';

// Build first: these tests exercise the actual Astro output and controller with
// real Three.js geometry/raycasting. Only the GPU renderer and browser plumbing
// are replaced. This is deterministic integration testing, not visual/browser QA.
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function environment(t) {
  const dom = new JSDOM(html, { url: 'https://example.test/', pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  const root = document.querySelector('[data-exploration]');
  assert.ok(root?.querySelector('[data-directory]'), 'Run npm run build before the runtime tests.');
  const find = selector => {
    const element = root.querySelector(selector);
    assert.ok(element, `Missing component element ${selector}`);
    return element;
  };
  const canvas = find('[data-room-canvas]');
  const panel = find('[data-depths-panel]');
  let now = 0, nextFrame = 1, controller, locked = null;
  const frames = new Map();
  const snapshots = [];
  const restored = new Map();
  const requestFrame = callback => { const id = nextFrame++; frames.set(id, callback); return id; };
  const cancelFrame = id => frames.delete(id);
  const matchMedia = query => Object.assign(new window.EventTarget(), { matches: false, media: query });
  const globals = {
    window, document, location: window.location, AbortController: window.AbortController,
    HTMLElement: window.HTMLElement, HTMLDialogElement: window.HTMLDialogElement,
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, scrollY: 73,
    scrollTo: () => {}, matchMedia,
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
    requestAnimationFrame: requestFrame, cancelAnimationFrame: cancelFrame,
    performance: { now: () => now },
  };
  for (const [name, value] of Object.entries(globals)) {
    restored.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  window.matchMedia = matchMedia;
  window.requestAnimationFrame = requestFrame;
  window.cancelAnimationFrame = cancelFrame;
  const captures = new WeakMap();
  window.HTMLElement.prototype.setPointerCapture = function (id) {
    const ids = captures.get(this) ?? new Set(); ids.add(id); captures.set(this, ids);
  };
  window.HTMLElement.prototype.hasPointerCapture = function (id) { return captures.get(this)?.has(id) ?? false; };
  window.HTMLElement.prototype.releasePointerCapture = function (id) { captures.get(this)?.delete(id); };
  Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return this.matches('[data-portal]') ? 190 : 100; } });
  Object.defineProperty(panel, 'clientWidth', { configurable: true, value: 1280 });
  Object.defineProperty(panel, 'clientHeight', { configurable: true, value: 720 });
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 });
  const priorFocus = new WeakMap();
  window.HTMLDialogElement.prototype.showModal = function () {
    priorFocus.set(this, document.activeElement);
    this.open = true;
    this.querySelector('button:not([disabled]), [tabindex="0"]')?.focus();
  };
  window.HTMLDialogElement.prototype.close = function () {
    if (!this.open) return;
    this.open = false;
    priorFocus.get(this)?.focus();
    queueMicrotask(() => this.dispatchEvent(new window.Event('close')));
  };
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
  canvas.requestPointerLock = async () => { locked = canvas; document.dispatchEvent(new window.Event('pointerlockchange')); };
  document.exitPointerLock = () => { locked = null; document.dispatchEvent(new window.Event('pointerlockchange')); };
  let disposedRenderer = false;
  const renderer = {
    setPixelRatio() {}, setSize() {}, outputColorSpace: '', toneMapping: 0, toneMappingExposure: 1,
    render(scene, camera) {
      snapshots.push({ now, room: root.dataset.currentRoom, x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: camera.rotation.y, opacity: Number(find('[data-darkness]').style.opacity) });
      assert.ok(scene.children.length > 0, 'The actual scene is passed to the renderer.');
    },
    dispose() { disposedRenderer = true; },
  };
  const tick = (milliseconds = 1000 / 60) => {
    now += milliseconds;
    const pending = [...frames.values()]; frames.clear();
    for (const callback of pending) callback(now);
  };
  const advance = seconds => { for (let i = 0; i < Math.ceil(seconds * 60); i++) tick(); };
  const key = (code, type = 'keydown', repeat = false) => document.dispatchEvent(new window.KeyboardEvent(type, { code, repeat, bubbles: true, cancelable: true }));
  const cancel = dialog => dialog.dispatchEvent(new window.Event('cancel', { cancelable: true }));
  const pointer = (element, type, fields = {}) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, button: 0, clientX: 640, clientY: 360, movementX: 0, movementY: 0 }, fields);
    element.dispatchEvent(event);
  };
  const bind = loader => {
    controller = bindExploration(root, loader ?? (async () => ({ createWorld: element => createWorld(element, () => renderer) })));
    return controller;
  };
  const start = async () => {
    bind(); find('[data-descend]').click(); await flush(); advance(movement.entrySeconds + .15);
    assert.equal(document.activeElement, canvas);
    assert.equal(root.dataset.currentRoom, entranceRoom);
  };
  t.after(() => {
    controller?.dispose();
    dom.window.close();
    for (const [name, descriptor] of restored) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  return { window, document, root, canvas, panel, find, bind, start, tick, advance, key, cancel, pointer, snapshots, latest: () => snapshots.at(-1), rendererDisposed: () => disposedRenderer };
}

test('entry imports once and an old opening cannot enter a newer visit', async t => {
  const env = environment(t);
  const pending = deferred();
  const entered = [];
  let loads = 0, constructed = 0;
  env.bind(() => { loads++; return pending.promise; });
  env.find('[data-descend]').click();
  env.find('[data-return]').click();
  env.find('[data-descend]').click();
  pending.resolve({ createWorld() { constructed++; return { enter: first => entered.push(first), pause() {}, suspend() {}, dispose() {}, escapeCaptured: () => false }; } });
  await flush();
  assert.equal(loads, 1); assert.equal(constructed, 1); assert.deepEqual(entered, [true]);
  assert.equal(env.panel.open, true);
  env.find('[data-return]').click(); env.find('[data-descend]').click(); await flush();
  assert.deepEqual(entered, [true, false]);
});

test('disposing while the import is pending never constructs a renderer later', async t => {
  const env = environment(t);
  const pending = deferred();
  let constructed = 0;
  const controller = env.bind(() => pending.promise);
  env.find('[data-descend]').click(); controller.dispose();
  pending.resolve({ createWorld() { constructed++; throw new Error('must not construct'); } });
  await flush();
  assert.equal(constructed, 0); assert.equal(env.panel.open, false);
  assert.equal(env.document.body.style.overflow, '');
});

test('walking requires canvas focus and stops immediately on focus or window loss', async t => {
  const env = environment(t); await env.start();
  const start = env.latest();
  env.key('KeyW'); env.advance(.5);
  assert.ok(env.latest().z < start.z - .6);
  env.find('[data-open-directory]').focus();
  const blurred = env.latest(); env.advance(.3);
  near(env.latest().z, blurred.z);
  env.key('KeyW'); env.advance(.3); near(env.latest().z, blurred.z);
  env.canvas.focus(); env.key('KeyW', 'keyup'); env.key('KeyW'); env.advance(.2);
  assert.ok(env.latest().z < blurred.z);
  env.window.dispatchEvent(new env.window.Event('blur'));
  const windowBlurred = env.latest(); env.advance(.3); near(env.latest().z, windowBlurred.z);
});

test('a drawer pauses walking; Escape closes only the drawer and held keys stay released', async t => {
  const env = environment(t); await env.start();
  env.key('KeyW'); env.advance(.25);
  env.find('[data-open-directory]').click();
  const paused = env.latest(); env.advance(.5); near(env.latest().z, paused.z);
  const directory = env.find('[data-directory]'); assert.equal(directory.open, true);
  env.cancel(directory); await flush(); env.tick();
  assert.equal(directory.open, false); assert.equal(env.panel.open, true);
  assert.equal(env.document.activeElement, env.canvas);
  env.key('KeyW', 'keydown', true); env.advance(.3); near(env.latest().z, paused.z);
  env.key('KeyW', 'keyup'); env.key('KeyW'); env.advance(.2);
  assert.ok(env.latest().z < paused.z);
});

test('clicking a passage swaps under full darkness and follows explicit destination arrivals', async t => {
  const env = environment(t); await env.start();
  assert.equal(env.find('[data-portal="north"]').hidden, false);
  const first = env.snapshots.length;
  env.find('[data-portal="north"]').click(); env.advance(movement.transitionSeconds + .1);
  const exit = roomMap[entranceRoom].exits.north;
  assert.equal(env.root.dataset.currentRoom, exit.room);
  const firstDestinationFrame = env.snapshots.slice(first).find(frame => frame.room === exit.room);
  assert.ok(firstDestinationFrame); near(firstDestinationFrame.opacity, 1);
  const arrived = spawnAt(exit.arrival);
  near(env.latest().x, arrived.x); near(env.latest().z, arrived.z); near(env.latest().yaw, arrived.yaw);
  env.find('[data-open-directory]').click();
  const secondExit = roomMap[exit.room].exits.west;
  env.find('[data-hallway="west"]').click(); await flush(); env.advance(movement.transitionSeconds + .1);
  assert.equal(env.root.dataset.currentRoom, secondExit.room);
  const secondArrival = spawnAt(secondExit.arrival);
  near(env.latest().x, secondArrival.x); near(env.latest().z, secondArrival.z); near(env.latest().yaw, secondArrival.yaw);
  assert.equal(env.find('[data-room-name]').textContent, roomMap[secondExit.room].title);
  assert.equal(env.find('[data-directory]').open, false);
});

test('walking into darkness enters once and a held key cannot chain further passages', async t => {
  const env = environment(t); await env.start(); env.key('KeyW');
  for (let i = 0; i < 600 && env.root.dataset.currentRoom === entranceRoom; i++) env.tick();
  const target = roomMap[entranceRoom].exits.north.room;
  assert.equal(env.root.dataset.currentRoom, target, 'Walking crossed the physical threshold.');
  env.advance(movement.transitionSeconds);
  const arrived = env.latest();
  for (let i = 0; i < 360; i++) { env.key('KeyW', 'keydown', true); env.tick(); }
  assert.equal(env.root.dataset.currentRoom, target); near(env.latest().z, arrived.z);
  env.key('KeyW', 'keyup'); env.key('KeyW'); env.advance(.25);
  assert.ok(env.latest().z < arrived.z);
});

test('returning above preserves an interrupted transition and resumes from that progress', async t => {
  const env = environment(t); await env.start();
  env.find('[data-portal="north"]').click(); env.advance(.2);
  const paused = env.latest(); assert.ok(paused.opacity > 0 && paused.opacity < 1);
  env.find('[data-return]').click(); env.advance(5);
  assert.deepEqual(env.latest(), paused);
  env.find('[data-descend]').click(); await flush(); env.tick();
  assert.equal(env.root.dataset.currentRoom, entranceRoom);
  assert.ok(env.latest().opacity >= paused.opacity);
  env.advance(movement.transitionSeconds);
  assert.equal(env.root.dataset.currentRoom, roomMap[entranceRoom].exits.north.room);
  const arrived = env.latest();
  env.find('[data-return]').click(); env.advance(1); env.find('[data-descend]').click(); await flush(); env.tick();
  near(env.latest().x, arrived.x); near(env.latest().z, arrived.z); near(env.latest().yaw, arrived.yaw);
});

test('touch walking stops on cancellation and drag-look does not activate a passage', async t => {
  const env = environment(t); await env.start();
  const forward = env.find('[data-move="forward"]');
  const start = env.latest(); env.pointer(forward, 'pointerdown', { pointerId: 7 }); env.advance(.3);
  assert.ok(env.latest().z < start.z);
  env.pointer(forward, 'pointercancel', { pointerId: 7 }); env.advance(.4);
  const stopped = env.latest(); env.advance(.3); near(env.latest().z, stopped.z);
  env.pointer(env.canvas, 'pointerdown');
  env.pointer(env.canvas, 'pointermove', { clientX: 680, clientY: 365 }); env.tick();
  env.pointer(env.canvas, 'pointerup', { clientX: 680, clientY: 365 }); env.advance(1);
  assert.notEqual(env.latest().yaw, stopped.yaw);
  assert.equal(env.root.dataset.currentRoom, entranceRoom);
});

test('pointer-lock Escape protection keeps the room open until a separate close action', async t => {
  const env = environment(t); await env.start();
  env.find('[data-mouse-look]').click(); await flush(); env.tick();
  assert.equal(env.document.pointerLockElement, env.canvas);
  env.cancel(env.panel); assert.equal(env.panel.open, true);
  env.document.exitPointerLock(); env.cancel(env.panel); assert.equal(env.panel.open, true);
  env.advance(.4); env.cancel(env.panel); assert.equal(env.panel.open, false);
});

test('visible portal labels stay inside the viewport and the doorway behind the camera stays hidden', async t => {
  const env = environment(t); await env.start();
  assert.equal(env.find('[data-portal="south"]').hidden, true);
  for (const label of env.root.querySelectorAll('[data-portal]')) {
    if (label.hidden) continue;
    const left = Number.parseFloat(label.style.left);
    assert.ok(left - label.offsetWidth / 2 >= 15.9);
    assert.ok(left + label.offsetWidth / 2 <= 1264.1);
  }
});

test('gentle transitions do not approach and keep a skipped-frame swap concealed', async t => {
  const env = environment(t); await env.start();
  const start = env.latest();
  const gentle = env.find('[data-reduced-motion]');
  gentle.checked = true; gentle.dispatchEvent(new env.window.Event('change'));
  const first = env.snapshots.length;
  env.find('[data-portal="north"]').click();
  env.tick(24); env.tick(50); env.tick(50);
  near(env.latest().x,start.x); near(env.latest().z,start.z);
  assert.equal(env.root.dataset.currentRoom,entranceRoom);
  env.tick(50); // This deliberately skips the timeline's short black hold.
  const target = roomMap[entranceRoom].exits.north.room;
  assert.equal(env.root.dataset.currentRoom,target);
  const changed = env.snapshots.slice(first).find(frame => frame.room === target);
  assert.ok(changed); near(changed.opacity,1);
  env.advance(.2); near(env.latest().opacity,0);
});

test('graphics startup failure leaves ordinary navigation and Return above usable', async t => {
  const env = environment(t);
  t.mock.method(console,'warn',() => {});
  env.bind(async () => ({ createWorld() { throw new Error('Simulated graphics failure'); } }));
  env.find('[data-descend]').click(); await flush();
  assert.equal(env.panel.open,true);
  assert.equal(env.find('[data-depths-message]').hidden,false);
  assert.match(env.find('[data-depths-message]').textContent,/Directory/);
  env.find('[data-open-directory]').click();
  assert.equal(env.find('[data-directory]').open,true);
  assert.equal(env.find('[data-room-page]').getAttribute('href'),'/projects/');
  env.find('[data-return]').click();
  assert.equal(env.panel.open,false);
  assert.equal(env.find('[data-directory]').open,false);
  assert.equal(env.document.body.style.overflow,'');
});
