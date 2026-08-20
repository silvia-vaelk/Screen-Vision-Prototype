/* Verified design tokens pulled from the Figma variables (file 30Oysac7WqQ5MjvFlXdHoZ,
   node 1:3891). Single source of truth for the bottom-nav redesign — see
   Figma_Redesign/DESIGN_SPEC.md §5. Reference these everywhere so the accent /
   surfaces / red are correct in one place. */
export const DS = {
  accent:      'var(--color-background-accent-default)',   // #6530F7
  surface:     'var(--color-surface-content-default)',     // white (light) / greys-800 (dark)
  base:        'var(--color-surface-float-default)',       // theme-responsive: white (light) / greys-800 (dark)
  white:       'var(--color-icon-inverse-light)',          // #FFFFFF — use only for text ON a colored button
  textDefault: 'var(--color-text-default)',
  red:         'var(--color-brand-raspberry)',             // #FA5050
  green:       'var(--color-brand-mint)',                  // #92F5B5
  borderLight: 'var(--color-border-default)',
  iconDim:       'var(--color-icon-subtle)',
  iconFaint:     'var(--color-icon-disabled)',
  chevronDim:    'var(--color-text-subtle)',
  divider:       'var(--color-overlay-medium)',
  menuHint:      'var(--color-text-subtle)',
  rowHover:      'var(--color-overlay-subtle)',
  rowSelected:   'var(--color-overlay-subtle)',
  redTint:       'rgba(250,80,80,0.14)',
  headerDivider: 'var(--color-overlay-divider)',
  plate:         'var(--color-panel-halo)',
  shadowLg: '0 4px 6px -2px rgba(16,24,40,0.03), 0 12px 16px -4px rgba(16,24,40,0.08)',
  font: "'Inter', sans-serif",
  mono: "'DM Mono', monospace",
};
