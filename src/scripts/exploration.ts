type WorldModule = Pick<typeof import('./world'), 'createWorld'>;
export function bindExploration(root: HTMLElement, loadWorld: () => Promise<WorldModule> = () => import('./world')) {
  const landing = root.querySelector<HTMLElement>('[data-landing]')!;
  const panel = root.querySelector<HTMLElement>('[data-depths-panel]')!;
  const button = root.querySelector<HTMLButtonElement>('[data-descend]')!;
  const message = root.querySelector<HTMLElement>('[data-depths-message]')!;
  const returnButton = root.querySelector<HTMLButtonElement>('[data-return]')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let world: Awaited<ReturnType<typeof import('./world')['createWorld']>> | undefined;
  let loading: Promise<void> | undefined;
  let open = false, visited = false;
  let overflow = '', scrollPosition = 0;
  button.hidden = false;

  function setControls(enabled: boolean) {
    panel.querySelectorAll<HTMLButtonElement>('[data-turn], [data-hallway]').forEach(control => { control.disabled = !enabled; });
  }
  async function load() {
    setControls(false);
    message.hidden = false;
    message.textContent = 'Opening the depths…';
    try {
      const module = await loadWorld();
      world = module.createWorld(root);
      message.hidden = true;
    } catch (error) {
      message.textContent = 'The interactive room could not load. You can return above or use the navigation.';
      console.warn('Room graphics could not start.', error);
    } finally { loading = undefined; }
  }
  async function descend() {
    if (open) return;
    open = true;
    overflow = document.body.style.overflow;
    scrollPosition = scrollY;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('depths-open');
    landing.inert = true;
    panel.hidden = false;
    returnButton.focus({ preventScroll: true });
    if (!reduced.matches) panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, easing: 'ease-out' });
    if (!world) { loading ??= load(); await loading; }
    // A quick Return above during loading must not reopen or animate the scene.
    if (!open || !world) return;
    world.enter(!visited);
    visited = true;
    button.innerHTML = 'Return below <span aria-hidden="true">↓</span>';
    panel.querySelector<HTMLCanvasElement>('canvas')!.focus({ preventScroll: true });
  }
  function returnAbove() {
    if (!open) return;
    open = false;
    world?.pause();
    panel.hidden = true;
    landing.inert = false;
    document.body.classList.remove('depths-open');
    document.body.style.overflow = overflow;
    scrollTo({ top: scrollPosition, behavior: 'instant' });
    button.focus({ preventScroll: true });
  }
  button.addEventListener('click', () => void descend());
  returnButton.addEventListener('click', returnAbove);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !open) return;
    const menu = panel.querySelector<HTMLDetailsElement>('[data-hallway-menu]')!;
    if (menu.open) { menu.open = false; menu.querySelector('summary')!.focus(); }
    else returnAbove();
  });
  // This link can be used from normal inner-page navigation. Scrolling itself
  // has no relationship to room state or camera position.
  if (location.hash === '#explore') void descend();
  addEventListener('hashchange', () => { if (location.hash === '#explore') void descend(); });
}
