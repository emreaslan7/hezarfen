/**
 * SquigglyText — vanilla port of the React "squiggly text" component.
 * Ponytail: zero deps, native SVG feTurbulence/feDisplacementMap + CSS keyframes only.
 * The filter cycle is driven by CSS (`step-end` keyframes), not JS timers.
 *
 * Ponytail: fixed filter ids ("squiggly-0..N"), single instance assumed;
 * add a random id suffix here if a second instance is ever needed.
 *
 * @param {Object} options
 * @param {HTMLElement} [options.container=document.body]
 * @param {string}      [options.text='HEZARFEN']
 * @param {number}      [options.steps=5]       distinct displacement frames
 * @param {number}      [options.stepDuration=70] ms per frame
 * @param {number|number[]} [options.scale=[6,9]] max displacement px (tuple alternates per frame)
 * @param {number}      [options.baseFrequency=0.02]
 * @param {number}      [options.numOctaves=3]
 * @param {string}      [options.className='squiggly-title']
 * @returns {HTMLElement} the title element
 */
export function initSquigglyText(options = {}) {
  const {
    container = document.body,
    text = 'HEZARFEN',
    steps = 5,
    stepDuration = 70,
    scale = [6, 9],
    baseFrequency = 0.02,
    numOctaves = 3,
    className = 'squiggly-title'
  } = options;

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Hidden <svg><defs>: one displacement filter per step (different seed,
  // alternating scale like the original Lucas Bebber demo).
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('squiggly-defs');
  const defs = document.createElementNS(SVG_NS, 'defs');
  for (let i = 0; i < steps; i++) {
    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.id = `squiggly-${i}`;
    // Wider filter region so displaced glyphs don't clip at the edges.
    filter.setAttribute('x', '-20%');
    filter.setAttribute('y', '-20%');
    filter.setAttribute('width', '140%');
    filter.setAttribute('height', '140%');

    const turb = document.createElementNS(SVG_NS, 'feTurbulence');
    turb.setAttribute('type', 'turbulence');
    turb.setAttribute('baseFrequency', baseFrequency);
    turb.setAttribute('numOctaves', numOctaves);
    turb.setAttribute('result', 'noise');
    turb.setAttribute('seed', i);

    const disp = document.createElementNS(SVG_NS, 'feDisplacementMap');
    disp.setAttribute('in', 'SourceGraphic');
    disp.setAttribute('in2', 'noise');
    disp.setAttribute('scale', Array.isArray(scale) ? scale[i % scale.length] : scale);

    filter.append(turb, disp);
    defs.appendChild(filter);
  }
  svg.appendChild(defs);
  document.body.appendChild(svg);

  const el = document.createElement('h1');
  el.className = className;
  el.textContent = text;
  // Keyframes hold steps equidistant stops; duration = steps * stepDuration.
  el.style.animationDuration = `${(steps * stepDuration) / 1000}s`;
  container.appendChild(el);

  return el;
}
