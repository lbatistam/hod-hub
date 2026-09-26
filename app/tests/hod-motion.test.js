import test from 'node:test';
import assert from 'node:assert/strict';

const reducedMotionPreference = { matches: false };
globalThis.window = { matchMedia: () => reducedMotionPreference };
globalThis.document = { documentElement: {} };
globalThis.getComputedStyle = () => ({ zoom: '1' });

const {
  animateButtonFeedback,
  animateChartBars,
  animateDataReady,
  animateLayout,
  captureLayout
} = await import('../src/app/hod-motion.js');

function animatedNode(extra = {}) {
  const calls = [];
  return {
    calls,
    animate(frames, options) {
      calls.push({ frames, options });
      return { cancel() {}, finished: Promise.resolve(), playState: 'finished' };
    },
    ...extra
  };
}

test('feedback de ponteiro permanece breve', () => {
  const button = animatedNode();
  animateButtonFeedback(button);
  assert.equal(button.calls.length, 1);
  assert.equal(button.calls[0].options.duration, 150);
  assert.deepEqual(button.calls[0].frames.map(frame => frame.transform), [
    'scale(0.975)',
    'scale(1)'
  ]);
});

test('movimento reduzido elimina transformações programáticas', () => {
  const button = animatedNode();
  reducedMotionPreference.matches = true;
  try {
    animateButtonFeedback(button);
    assert.equal(button.calls.length, 0);
  } finally {
    reducedMotionPreference.matches = false;
  }
});

test('região de dados só anima na primeira apresentação', () => {
  const region = animatedNode();
  animateDataReady(region);
  animateDataReady(region);
  assert.equal(region.calls.length, 1);
  assert.equal(region.calls[0].options.duration, 200);
});

test('Kanban move cards existentes sem animar entradas de filtro', () => {
  const card = animatedNode({
    dataset: { flipId: 'old' },
    getBoundingClientRect: () => ({ left: 40, top: 0 })
  });
  const newcomer = animatedNode({
    dataset: { flipId: 'new' },
    getBoundingClientRect: () => ({ left: 0, top: 0 })
  });
  const root = {
    nodes: [card],
    querySelectorAll() { return this.nodes; }
  };
  const state = captureLayout(root);
  card.getBoundingClientRect = () => ({ left: 0, top: 0 });
  root.nodes = [card, newcomer];
  animateLayout(state);
  assert.equal(card.calls[0].options.duration, 240);
  assert.equal(newcomer.calls.length, 0);
});

test('gráficos têm uma entrada curta e contabilizam barras presentes', () => {
  const bar = animatedNode({ classList: { contains: () => true } });
  const root = { querySelectorAll: () => [bar] };
  assert.equal(animateChartBars(root), 1);
  assert.equal(bar.calls[0].options.duration, 250);
});
