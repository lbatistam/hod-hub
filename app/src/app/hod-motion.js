const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const easeOut = 'cubic-bezier(0.16, 1, 0.3, 1)';
const activeAnimations = new WeakMap();

export function motionReduced() {
  return reducedMotion.matches;
}

function play(node, frames, options) {
  if (!node?.animate || motionReduced()) {
    return null;
  }
  activeAnimations.get(node)?.cancel();
  const animation = node.animate(frames, { fill: 'backwards', ...options });
  activeAnimations.set(node, animation);
  animation.finished
    .catch(() => {})
    .finally(() => {
      if (activeAnimations.get(node) === animation) {
        activeAnimations.delete(node);
      }
    });
  return animation;
}

export function captureLayout(root) {
  if (!root || motionReduced()) {
    return null;
  }
  const positions = new Map();
  root.querySelectorAll('[data-flip-id]').forEach(node => {
    positions.set(node.dataset.flipId, node.getBoundingClientRect());
  });
  return { root, positions };
}

export function animateLayout(state) {
  if (!state || motionReduced()) {
    return;
  }
  let entering = 0;
  state.root.querySelectorAll('[data-flip-id]').forEach(node => {
    const before = state.positions.get(node.dataset.flipId);
    activeAnimations.get(node)?.cancel();
    const after = node.getBoundingClientRect();
    if (!before) {
      play(
        node,
        [
          { opacity: 0, transform: 'translateY(6px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ],
        { duration: 260, delay: Math.min(entering++ * 12, 84), easing: easeOut }
      );
      return;
    }
    // DOMRects include the app's interface zoom; CSS transforms use unzoomed units.
    const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const dx = (before.left - after.left) / zoom;
    const dy = (before.top - after.top) / zoom;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
      return;
    }
    play(node, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
      duration: 360,
      easing: easeOut
    });
  });
}

export function animateToast(node, visible) {
  node?.classList.toggle('show', visible);
}

export function animatePanel(node, visible) {
  if (!node) {
    return;
  }
  activeAnimations.get(node)?.cancel();
  node.dataset.motionState = visible ? 'open' : 'closed';
  if (visible) {
    node.hidden = false;
  } else if (node.hidden) {
    return;
  }
  if (motionReduced() || !node.animate) {
    node.hidden = !visible;
    node.style.pointerEvents = '';
    return;
  }
  node.style.pointerEvents = visible ? '' : 'none';
  let frames;
  if (visible) {
    frames = [
      { opacity: 0, transform: 'translateY(-5px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ];
  } else {
    frames = [
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(-4px)' }
    ];
  }
  const animation = play(node, frames, { duration: visible ? 280 : 180, easing: easeOut });
  animation?.finished
    .catch(() => {})
    .then(() => {
      if (
        animation.playState !== 'finished' ||
        node.dataset.motionState !== (visible ? 'open' : 'closed')
      ) {
        return;
      }
      node.hidden = !visible;
      node.style.pointerEvents = '';
    });
}

export function animateButtonFeedback(node) {
  play(node, [{ transform: 'scale(0.975)' }, { transform: 'scale(1)' }], {
    duration: 190,
    easing: easeOut
  });
}

export function animateDataReady(targets) {
  const nodes = (Array.isArray(targets) ? targets : [targets]).filter(Boolean);
  nodes.forEach((node, index) => {
    play(node, [{ opacity: 0.82 }, { opacity: 1 }], {
      duration: 300,
      delay: Math.min(index * 24, 96),
      easing: easeOut
    });
  });
}

export function animateChartBars(root = document) {
  root.querySelectorAll('.vbar, .bar-fill').forEach((node, index) => {
    const vertical = node.classList.contains('vbar');
    play(
      node,
      [
        {
          transform: vertical ? 'scaleY(0.18)' : 'scaleX(0.18)',
          transformOrigin: vertical ? 'bottom' : 'left'
        },
        { transform: 'scale(1)', transformOrigin: vertical ? 'bottom' : 'left' }
      ],
      { duration: 420, delay: Math.min(index * 14, 98), easing: easeOut }
    );
  });
}
