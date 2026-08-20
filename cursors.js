const svgDataCursor = (body, hotX, hotY) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${body}</svg>`)}") ${hotX} ${hotY}, crosshair`;

export const CURSOR_COMMENT_ON_MODEL = svgDataCursor(
  '<defs><filter id="cmPinShadow" x="-45%" y="-45%" width="190%" height="190%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#000000" flood-opacity="0.26"/></filter></defs><g filter="url(#cmPinShadow)"><circle cx="16" cy="16" r="11" fill="#6c5ce7"/><rect x="14.625" y="6.833" width="2.75" height="18.334" fill="#ffffff"/><rect x="6.833" y="14.625" width="18.334" height="2.75" fill="#ffffff"/></g>',
  16, 16,
);
export const CURSOR_COMMENT_IDLE = svgDataCursor(
  '<circle cx="16" cy="16" r="11" fill="none" stroke="#6c5ce7" stroke-width="1.5"/><rect x="14.625" y="6.833" width="2.75" height="18.334" fill="#6c5ce7"/><rect x="6.833" y="14.625" width="18.334" height="2.75" fill="#6c5ce7"/>',
  16, 16,
);
export const CURSOR_ORBIT_ROTATE = svgDataCursor(
  '<path d="M8.5 17.5a7.5 7.5 0 1 1 6.2-13.2" fill="none" stroke="#171717" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.5 4.8L23.5 2l0.3 4.5z" fill="#171717" stroke="#171717" stroke-width="0.25" stroke-linejoin="round"/>',
  16, 16,
);
export const CURSOR_ORBIT_PAN = svgDataCursor(
  '<path d="M16 4.5l-2.8 4h5.6L16 4.5zM16 27.5l2.8-4h-5.6l2.8 4zM4.5 16l4 2.8v-5.6l-4 2.8zM27.5 16l-4-2.8v5.6l4-2.8z" fill="#171717"/><line x1="16" y1="9" x2="16" y2="23" stroke="#171717" stroke-width="1.5" stroke-linecap="round"/><line x1="9" y1="16" x2="23" y2="16" stroke="#171717" stroke-width="1.5" stroke-linecap="round"/>',
  16, 16,
);
export const CURSOR_ANNOTATE_ON_MODEL = svgDataCursor(
  '<path d="M22 4L28 10L10 28L4 28L4 22Z" fill="#6c5ce7"/>' +
  '<path d="M4 28L4 22L6 26Z" fill="#4a3abd"/>' +
  '<path d="M22 4L28 10L30 8L24 2Z" fill="#a29bfe"/>' +
  '<line x1="24" y1="7" x2="10" y2="23" stroke="rgba(255,255,255,0.3)" stroke-width="1.2" stroke-linecap="round"/>',
  4, 28,
);
export const CURSOR_ANNOTATE_IDLE = svgDataCursor(
  '<path d="M22 4L28 10L10 28L4 28L4 22Z" fill="none" stroke="#6c5ce7" stroke-width="1.5" stroke-linejoin="round"/>' +
  '<path d="M22 4L28 10L30 8L24 2Z" fill="none" stroke="#6c5ce7" stroke-width="1.5" stroke-linejoin="round"/>',
  4, 28,
);
