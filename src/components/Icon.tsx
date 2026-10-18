/* LUMA icon set — ported from the existing dashboard icon registry (24px grid, 1.5 stroke). */
const PATHS = {
  grid: "<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"/>",
  report: "<path d=\"M7 3h7l5 5v12a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z\"/><path d=\"M14 3v5h5M9 13h6M9 17h4\"/>",
  trend: "<path d=\"M3 17l6-6 4 4 8-8\"/><path d=\"M21 7h-5M21 7v5\"/>",
  users: "<circle cx=\"9\" cy=\"8\" r=\"3.4\"/><path d=\"M2.5 20a6.5 6.5 0 0113 0\"/><path d=\"M16 5.2a3.4 3.4 0 010 6M21.5 20a6.5 6.5 0 00-4-6\"/>",
  calendar: "<rect x=\"3\" y=\"4\" width=\"18\" height=\"17\" rx=\"2.5\"/><path d=\"M3 9h18M8 2v4M16 2v4\"/>",
  wallet: "<rect x=\"3\" y=\"6\" width=\"18\" height=\"13\" rx=\"2.5\"/><path d=\"M3 10h18M16 14h2\"/>",
  commission: "<path d=\"M12 2l2 4 4 1-3 3 .6 4.4L12 16l-3.6 2.4L9 14 6 11l4-1z\"/><path d=\"M5 21l2-3M19 21l-2-3\"/>",
  pulse: "<path d=\"M2 12h4l2-6 4 14 3-9 2 1h5\"/>",
  box: "<path d=\"M12 2l8 4.5v9L12 20l-8-4.5v-9z\"/><path d=\"M12 2v18M4 6.5l8 4.5 8-4.5\"/>",
  gear: "<circle cx=\"12\" cy=\"12\" r=\"3.2\"/><path d=\"M12 2v3M12 19v3M5 5l2 2M17 17l2 2M2 12h3M19 12h3M5 19l2-2M17 7l2-2\"/>",
  star: "<path d=\"M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6L12 17.8 6.7 19.6l1.1-6L3.4 9.4l6-.8z\"/>",
  check: "<path d=\"M20 6L9 17l-5-5\"/>",
  user: "<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21a8 8 0 0116 0\"/>",
  globe: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18\"/>",
  image: "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2.5\"/><circle cx=\"8.5\" cy=\"8.5\" r=\"1.8\"/><path d=\"M21 16l-5-5L5 21\"/>",
  services: "<path d=\"M4 7h16M4 7l1.5 13h13L20 7M4 7l2-4h12l2 4M9 11v5M15 11v5\"/>",
  chart: "<path d=\"M4 20V4M4 20h16\"/><rect x=\"7\" y=\"12\" width=\"3\" height=\"5\"/><rect x=\"12\" y=\"8\" width=\"3\" height=\"9\"/><rect x=\"17\" y=\"5\" width=\"3\" height=\"12\"/>",
  loyalty: "<path d=\"M12 2l2 4 4 1-3 3 .6 4.4L12 16l-3.6 2.4L9 14 6 11l4-1z\"/><path d=\"M5 21l2-3M19 21l-2-3\"/>",
  affiliate: "<circle cx=\"6\" cy=\"12\" r=\"2.6\"/><circle cx=\"18\" cy=\"6\" r=\"2.6\"/><circle cx=\"18\" cy=\"18\" r=\"2.6\"/><path d=\"M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6\"/>",
  tools: "<path d=\"M14.5 5.5a3.5 3.5 0 00-4.6 4.6l-6 6 2 2 6-6a3.5 3.5 0 004.6-4.6l-2.2 2.2-1.8-.4-.4-1.8z\"/>",
  shield: "<path d=\"M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z\"/><path d=\"M9 12l2 2 4-4\"/>",
  board: "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M9 3v18M15 3v18M3 9h18\"/>",
  staff: "<circle cx=\"9\" cy=\"8\" r=\"3.4\"/><path d=\"M2.5 20a6.5 6.5 0 0113 0\"/><path d=\"M16 5.2a3.4 3.4 0 010 6M21.5 20a6.5 6.5 0 00-4-6\"/>",
  scissors: "<circle cx=\"6\" cy=\"6\" r=\"3\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><path d=\"M8.5 8L20 18M8.5 16L20 6\"/>",
  pin: "<path d=\"M12 21s-7-6-7-11a7 7 0 0114 0c0 5-7 11-7 11z\"/><circle cx=\"12\" cy=\"10\" r=\"2.5\"/>",
  clock: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>",
  walk: "<circle cx=\"13\" cy=\"4\" r=\"2\"/><path d=\"M9 21l2-7-3-2 1-4 4 2 2 3M11 14l-2 7M14 13l2 4\"/>",
  chair: "<path d=\"M6 19v-7a3 3 0 013-3h6a3 3 0 013 3v7M6 14h12M8 19v2M16 19v2\"/>",
  bag: "<path d=\"M6 7h12l1 13a1 1 0 01-1 1H6a1 1 0 01-1-1z\"/><path d=\"M9 7a3 3 0 016 0\"/>",
  ticket: "<path d=\"M3 9a2 2 0 012-2h14a2 2 0 012 2 2 2 0 000 4 2 2 0 01-2 2H5a2 2 0 01-2-2 2 2 0 000-4z\"/><path d=\"M14 7v10\" stroke-dasharray=\"1 2\"/>",
  invoice: "<path d=\"M6 2h9l4 4v15l-2.2-1.4L14.6 21l-2.6-1.5L9.4 21 7.2 19.6 5 21V4a2 2 0 012-2z\"/><path d=\"M9 8h6M9 12h6M9 16h3\"/>",
  mega: "<path d=\"M3 11v3a1 1 0 001 1h2l8 4V6L6 10H4a1 1 0 00-1 1z\"/><path d=\"M16 9a3 3 0 010 6M18.5 6.5a6 6 0 010 11\"/>",
  boxes: "<path d=\"M3 7l9-4 9 4v10l-9 4-9-4z\"/><path d=\"M3 7l9 4 9-4M12 11v10\"/>",
  plus: "<path d=\"M12 5v14M5 12h14\"/>",
  flower: "<circle cx=\"12\" cy=\"12\" r=\"2.1\"/><circle cx=\"12\" cy=\"6.4\" r=\"2.5\"/><circle cx=\"17.3\" cy=\"10.2\" r=\"2.5\"/><circle cx=\"15.3\" cy=\"16.4\" r=\"2.5\"/><circle cx=\"8.7\" cy=\"16.4\" r=\"2.5\"/><circle cx=\"6.7\" cy=\"10.2\" r=\"2.5\"/>",
  idcard: "<rect x=\"2.5\" y=\"5\" width=\"19\" height=\"14\" rx=\"2\"/><circle cx=\"16.5\" cy=\"10.5\" r=\"1.9\"/><path d=\"M13.8 15.5a2.7 2.7 0 015.4 0M5 9h5M5 12.5h5M5 16h3\"/>",
  clipboard: "<rect x=\"5\" y=\"4.5\" width=\"14\" height=\"17\" rx=\"2\"/><rect x=\"9\" y=\"2.5\" width=\"6\" height=\"3.6\" rx=\"1.2\"/><path d=\"M9 11h6M9 14.5h6M9 18h3\"/>",
  palette: "<path d=\"M12 3a9 9 0 100 18c1.6 0 2.1-1.1 1.4-2.2-.8-1.3.2-2.8 1.9-2.8H18a3.5 3.5 0 003.5-3.5A9 9 0 0012 3z\"/><circle cx=\"7.6\" cy=\"10.5\" r=\"1.05\"/><circle cx=\"12\" cy=\"7.6\" r=\"1.05\"/><circle cx=\"16.4\" cy=\"10.5\" r=\"1.05\"/>",
  upload: "<path d=\"M12 15.5V5M8.2 8.5L12 5l3.8 3.5\"/><path d=\"M4.5 15.5V18a2.5 2.5 0 002.5 2.5h10a2.5 2.5 0 002.5-2.5v-2.5\"/>",
  ban: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M5.9 5.9l12.2 12.2\"/>",
  x: "<path d=\"M6 6l12 12M18 6L6 18\"/>",
  chevronDown: "<path d=\"M6 9l6 6 6-6\"/>",
  chevronStart: "<path d=\"M15 6l-6 6 6 6\"/>",
  chevronEnd: "<path d=\"M9 6l6 6-6 6\"/>",
  arrowUp: "<path d=\"M12 19V5M6 11l6-6 6 6\"/>",
  arrowDown: "<path d=\"M12 5v14M6 13l6 6 6-6\"/>",
  eye: "<path d=\"M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>",
  eyeOff: "<path d=\"M3 3l18 18M10.6 5.1A10.4 10.4 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 004.4-1\"/><path d=\"M9.9 9.9a3 3 0 004.2 4.2\"/>",
  trash: "<path d=\"M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13\"/>",
  copy: "<rect x=\"8\" y=\"8\" width=\"12\" height=\"12\" rx=\"2\"/><path d=\"M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2\"/>",
  undo: "<path d=\"M9 14L4 9l5-5\"/><path d=\"M4 9h10a6 6 0 010 12h-3\"/>",
  redo: "<path d=\"M15 14l5-5-5-5\"/><path d=\"M20 9H10a6 6 0 000 12h3\"/>",
  desktop: "<rect x=\"3\" y=\"4\" width=\"18\" height=\"12\" rx=\"2\"/><path d=\"M8 20h8M12 16v4\"/>",
  mobile: "<rect x=\"7\" y=\"2.5\" width=\"10\" height=\"19\" rx=\"2.2\"/><path d=\"M11 18.5h2\"/>",
  drag: "<circle cx=\"9\" cy=\"6\" r=\"1\"/><circle cx=\"15\" cy=\"6\" r=\"1\"/><circle cx=\"9\" cy=\"12\" r=\"1\"/><circle cx=\"15\" cy=\"12\" r=\"1\"/><circle cx=\"9\" cy=\"18\" r=\"1\"/><circle cx=\"15\" cy=\"18\" r=\"1\"/>",
  bell: "<path d=\"M6 16V11a6 6 0 0112 0v5l1.5 2h-15z\"/><path d=\"M10 20a2 2 0 004 0\"/>",
  search: "<circle cx=\"11\" cy=\"11\" r=\"6.5\"/><path d=\"M20 20l-4.3-4.3\"/>",
  logout: "<path d=\"M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3\"/><path d=\"M10 8l-4 4 4 4M6 12h10\"/>",
  link: "<path d=\"M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1\"/><path d=\"M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1\"/>",
  lock: "<rect x=\"5\" y=\"11\" width=\"14\" height=\"10\" rx=\"2\"/><path d=\"M8 11V8a4 4 0 018 0v3\"/>",
  alert: "<path d=\"M12 3l10 18H2z\"/><path d=\"M12 10v5M12 18v.01\"/>",
  info: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v6M12 7.5v.01\"/>",
  sparkle: "<path d=\"M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z\"/><path d=\"M19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z\"/>",
  layers: "<path d=\"M12 3l9 5-9 5-9-5z\"/><path d=\"M3 13l9 5 9-5\"/>",
  text: "<path d=\"M5 6V4h14v2M12 4v16M9 20h6\"/>",
  button: "<rect x=\"3\" y=\"8\" width=\"18\" height=\"8\" rx=\"4\"/><path d=\"M9 12h6\"/>",
  list: "<path d=\"M9 6h11M9 12h11M9 18h11\"/><circle cx=\"4.5\" cy=\"6\" r=\"1\"/><circle cx=\"4.5\" cy=\"12\" r=\"1\"/><circle cx=\"4.5\" cy=\"18\" r=\"1\"/>",
  faq: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.2-1.5 2.5M12 17v.01\"/>",
  phone: "<path d=\"M5 3h4l2 5-2.5 1.5a11 11 0 006 6L16 13l5 2v4a2 2 0 01-2 2A16 16 0 013 5a2 2 0 012-2z\"/>",
  heart: "<path d=\"M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z\"/>",
  gift: "<rect x=\"3\" y=\"8\" width=\"18\" height=\"4\" rx=\"1\"/><path d=\"M5 12v8h14v-8M12 8v12\"/><path d=\"M12 8c-2-3-6-3-6 0M12 8c2-3 6-3 6 0\"/>",
  download: "<path d=\"M12 4v11M8 11l4 4 4-4\"/><path d=\"M4.5 16V18a2.5 2.5 0 002.5 2.5h10a2.5 2.5 0 002.5-2.5v-2\"/>",
  menu: "<path d=\"M4 7h16M4 12h16M4 17h16\"/>",
  home: "<path d=\"M3 11l9-7 9 7\"/><path d=\"M5 10v10h14V10\"/>",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, label, className }: { name: IconName; size?: number; label?: string; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      // static, trusted path data from this file only
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  );
}
