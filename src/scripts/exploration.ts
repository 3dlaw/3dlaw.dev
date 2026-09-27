type WorldModule = Pick<typeof import('./world'), 'createWorld'>;

// Owns the surface/scene lifecycle; the renderer never depends on page scroll.
export function bindExploration(root: HTMLElement, loadWorld: () => Promise<WorldModule> = () => import('./world')) {
  const panel = root.querySelector<HTMLDialogElement>('[data-depths-panel]')!;
  const button = root.querySelector<HTMLButtonElement>('[data-descend]')!;
  const message = root.querySelector<HTMLElement>('[data-depths-message]')!;
  const canvas = root.querySelector<HTMLCanvasElement>('[data-room-canvas]')!;
  const directory = root.querySelector<HTMLDialogElement>('[data-directory]')!;
  const controls = root.querySelector<HTMLDialogElement>('[data-controls]')!;
  const drawers = [directory, controls];
  const abort = new AbortController();
  const signal = abort.signal;
  let world: ReturnType<WorldModule['createWorld']> | undefined;
  let loading: Promise<void> | undefined;
  let open = false, visited = false, disposed = false, request = 0;
  let overflow = '', scrollPosition = 0;
  button.hidden = false;

  async function load() {
    message.hidden = false;
    message.textContent = 'Opening the depths…';
    try {
      const module = await loadWorld();
      if (disposed) return;
      world = module.createWorld(root);
      message.hidden = true;
    } catch (error) {
      message.textContent = 'The interactive room could not start. The Directory still has links to every page.';
      console.warn('The depths could not start.', error);
    } finally { loading = undefined; }
  }
  async function descend() {
    if (open || disposed) return;
    open = true;
    const thisRequest = ++request;
    overflow = document.body.style.overflow;
    scrollPosition = scrollY;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('depths-open');
    panel.showModal();
    root.querySelector<HTMLButtonElement>('[data-return]')!.focus({ preventScroll: true });
    if (!world) { loading ??= load(); await loading; }
    // Each opening has its own identity. Old imports cannot enter a later visit.
    if (!open || thisRequest !== request || !world) return;
    world.enter(!visited);
    visited = true;
    root.querySelector<HTMLElement>('[data-descend-label]')!.textContent = 'Return below';
    if (drawers.some(drawer => drawer.open)) world.suspend(true);
    else canvas.focus({ preventScroll: true });
  }
  function returnAbove() {
    if (!open) return;
    open = false;
    request++;
    world?.pause();
    drawers.forEach(drawer => { if (drawer.open) drawer.close(); });
    panel.close();
    document.body.classList.remove('depths-open');
    document.body.style.overflow = overflow;
    scrollTo({ top: scrollPosition, behavior: 'instant' });
    button.focus({ preventScroll: true });
  }
  function showDrawer(drawer: HTMLDialogElement) {
    if (!open || drawer.open) return;
    drawers.forEach(other => { if (other !== drawer && other.open) other.close(); });
    world?.suspend(true);
    drawer.showModal();
  }
  function closeDrawer(drawer: HTMLDialogElement) {
    if (drawer.open) drawer.close();
  }
  button.addEventListener('click', () => void descend(), { signal });
  root.querySelectorAll<HTMLButtonElement>('[data-return]').forEach(control => control.addEventListener('click', returnAbove, { signal }));
  root.querySelectorAll<HTMLButtonElement>('[data-open-directory]').forEach(control => control.addEventListener('click', () => showDrawer(directory), { signal }));
  root.querySelector<HTMLButtonElement>('[data-open-controls]')!.addEventListener('click', () => showDrawer(controls), { signal });
  for (const drawer of drawers) {
    drawer.querySelectorAll<HTMLButtonElement>('[data-close-drawer]').forEach(control => control.addEventListener('click', () => closeDrawer(drawer), { signal }));
    drawer.addEventListener('cancel', event => { event.preventDefault(); event.stopPropagation(); closeDrawer(drawer); }, { signal });
    drawer.addEventListener('close', () => {
      if (!open) return;
      const covered = drawers.some(other => other.open);
      world?.suspend(covered);
      if (!covered && world) canvas.focus({ preventScroll: true });
    }, { signal });
    drawer.addEventListener('click', event => {
      if (event.target !== drawer) return;
      const rect = drawer.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDrawer(drawer);
    }, { signal });
  }
  panel.addEventListener('cancel', event => {
    event.preventDefault();
    if (event.target !== panel || !open || world?.escapeCaptured()) return;
    returnAbove();
  }, { signal });
  const openFromLink = () => { if (location.hash === '#explore') void descend(); };
  addEventListener('hashchange', openFromLink, { signal });
  openFromLink();
  // Useful if this component is later mounted through client-side navigation.
  return { dispose() { returnAbove(); disposed = true; request++; abort.abort(); world?.dispose(); } };
}
