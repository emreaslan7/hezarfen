/**
 * Vanilla port of the Obsidian UI "SplitShowcase" block interaction.
 *
 * The original React component tracks `hoveredIndex ?? focusedIndex` and
 * writes the result to Tailwind class strings. Here the active index is
 * written to the container's `data-active` attribute so CSS can react to it.
 *
 * Behavior:
 *   - hovering a card marks it active; the card shifts away from the divider,
 *     fully rounds up and lifts above the divider, while the divider fades out
 *   - keyboard focus behaves like hover (`focus` / `blur`)
 *   - with no hover and no focus the attribute is removed and the two cards
 *     sit flush against the dotted divider again
 *
 * Reduced motion is handled entirely in CSS (`prefers-reduced-motion` media
 * query), so the JS state stays identical whether motion is allowed or not.
 */

function setupShowcase(container) {
  const cards = Array.from(container.querySelectorAll('.split-card'));
  if (!cards.length) return;

  const indexOf = (target) => cards.indexOf(target);

  let hoveredIndex = null;
  let focusedIndex = null;

  const apply = () => {
    const activeIndex = hoveredIndex ?? focusedIndex;

    if (activeIndex === null) {
      container.removeAttribute('data-active');
      return;
    }
    container.setAttribute('data-active', String(activeIndex));
  };

  cards.forEach((card) => {
    const index = indexOf(card);
    const shift = card.dataset.shift || '0';

    card.addEventListener('mouseenter', () => {
      hoveredIndex = index;
      apply();
    });

    card.addEventListener('mouseleave', () => {
      if (hoveredIndex === index) hoveredIndex = null;
      apply();
    });

    card.addEventListener('focus', () => {
      focusedIndex = index;
      apply();
    });

    card.addEventListener('blur', () => {
      if (focusedIndex === index) focusedIndex = null;
      apply();
    });

    // Expose the authored shift distance so CSS needs no per-card overrides.
    card.style.setProperty('--split-shift', `${shift}px`);
  });

  apply();
}

export function initSplitShowcase(root = document) {
  const showcases = root.querySelectorAll('.split-showcase');
  showcases.forEach(setupShowcase);
  return showcases.length;
}

export default initSplitShowcase;