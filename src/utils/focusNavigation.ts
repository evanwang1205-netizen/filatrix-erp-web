export function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function scrollElementIntoView(
  element: Element | null | undefined,
  options: ScrollIntoViewOptions = { block: 'center' },
) {
  if (!element) return;
  element.scrollIntoView({
    ...options,
    behavior: prefersReducedMotion() ? 'auto' : (options.behavior ?? 'smooth'),
  });
}
