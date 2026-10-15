/** Local visual feedback; saving and releasing the swarm happen immediately. */
export function createFihReleaseFeedback(canvas: HTMLCanvasElement, ripple: HTMLElement) {
  const frame = canvas.parentElement!;
  let active: Animation[] = [];

  function cancel() {
    const previous = active;
    active = [];
    delete frame.dataset.releasing;
    for (const animation of previous) animation.cancel();
  }

  function play() {
    cancel();
    if (document.hidden || !canvas.animate || !ripple.animate) return;
    const width = frame.clientWidth || 340;
    const height = frame.clientHeight || 255;
    const departure = canvas.animate([
      { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1, offset: 0 },
      { transform: "translate3d(-8px, 2px, 0) scale(1)", opacity: 1, offset: .1 },
      { transform: `translate3d(${width * .7}px, ${-height * .65}px, 80px) scale(.85)`, opacity: .9, offset: .5 },
      { transform: `translate3d(${width * 1.2}px, ${-height}px, 100px) scale(.65)`, opacity: 0, offset: .68 },
      { transform: "translate3d(0, 0, 0) scale(1)", opacity: 0, offset: .69 },
      { transform: "translate3d(0, 0, 0) scale(1)", opacity: 0, offset: .82 },
      { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1, offset: 1 },
    ], { duration: 1400, easing: "ease-in-out" });
    const rings = ripple.animate([
      { transform: "translate(-50%, -50%) rotateX(50deg) scale(.2)", opacity: 0, offset: 0 },
      { transform: "translate(-50%, -50%) rotateX(50deg) scale(.7)", opacity: .8, offset: .2 },
      { transform: "translate(-50%, -50%) rotateX(50deg) scale(3)", opacity: 0, offset: 1 },
    ], { duration: 1100, delay: 100, easing: "ease-out" });
    const current = [departure, rings];
    active = current;
    frame.dataset.releasing = "";
    void Promise.all(current.map((animation) => animation.finished)).then(() => {
      if (active !== current) return;
      active = [];
      delete frame.dataset.releasing;
    }, () => {
      if (active === current) cancel();
    });
  }

  return { play, cancel };
}
