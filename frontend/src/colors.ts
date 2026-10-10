/** How each kind of issue is drawn: the box colour and the fill of its outline. */
const COLORS: Record<string, { box: string; fill: string }> = {
  pothole: { box: '#ff3b30', fill: '#e83fe0' },
  road_crack: { box: '#ff9500', fill: '#ffcc00' },
  road_obstruction: { box: '#ff6b00', fill: '#ff8a3d' },
  fallen_tree: { box: '#30d158', fill: '#30d158' },
  broken_streetlight: { box: '#ffd60a', fill: '#ffd60a' },
  fallen_wire: { box: '#bf5af2', fill: '#bf5af2' },
  water_leak: { box: '#0a84ff', fill: '#0a84ff' },
  waterlogging: { box: '#64d2ff', fill: '#64d2ff' },
  open_manhole: { box: '#ff375f', fill: '#ff375f' },
  garbage: { box: '#c69c6d', fill: '#c69c6d' },
  damaged_sign: { box: '#5e5ce6', fill: '#5e5ce6' },
};

export function colorOf(issueType: string) {
  return COLORS[issueType] ?? { box: '#ff3b30', fill: '#ff3b30' };
}
