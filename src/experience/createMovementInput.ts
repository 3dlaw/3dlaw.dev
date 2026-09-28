export function createMovementInput(canvas: HTMLCanvasElement) {
  const pressed = new Set<string>();
  const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
  let disposed = false;
  let requestingLock = false;

  const clear = () => pressed.clear();
  const isLocked = () => document.pointerLockElement === canvas;

  const releaseMouse = () => {
    clear();
    if (isLocked()) document.exitPointerLock();
  };

  const reportLockError = () => {
    if (disposed || !requestingLock) return;
    requestingLock = false;
    clear();
    console.warn('Mouse capture was not granted. Click the room to try again.');
  };

  const captureMouse = async (event: MouseEvent) => {
    if (disposed || event.button !== 0 || isLocked() || requestingLock) return;

    canvas.focus({ preventScroll: true });
    requestingLock = true;

    try {
      await canvas.requestPointerLock();
      if (disposed) releaseMouse();
    } catch {
      reportLockError();
    }
  };

  const onLockChange = () => {
    requestingLock = false;
    clear();
    if (isLocked()) canvas.focus({ preventScroll: true });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // Release controls without blocking the browser's normal key behavior.
    if (event.code === 'Escape' || event.code === 'Tab') {
      releaseMouse();
      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) {
      clear();
      return;
    }

    if (!isLocked() || !movementKeys.has(event.code)) return;

    event.preventDefault();
    pressed.add(event.code);
  };

  const onKeyUp = (event: KeyboardEvent) => {
    pressed.delete(event.code);
  };

  const onVisibilityChange = () => {
    if (document.hidden) releaseMouse();
  };

  canvas.addEventListener('click', captureMouse);
  canvas.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('blur', releaseMouse);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', releaseMouse);
  document.addEventListener('visibilitychange', onVisibilityChange);
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('pointerlockerror', reportLockError);

  return {
    getAxes() {
      if (!isLocked()) return { forward: 0, right: 0 };

      return {
        forward: Number(pressed.has('KeyW')) - Number(pressed.has('KeyS')),
        right: Number(pressed.has('KeyD')) - Number(pressed.has('KeyA')),
      };
    },

    dispose() {
      disposed = true;
      releaseMouse();
      canvas.removeEventListener('click', captureMouse);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('blur', releaseMouse);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseMouse);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('pointerlockerror', reportLockError);
    },
  };
}