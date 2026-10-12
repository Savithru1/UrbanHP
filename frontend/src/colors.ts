/** The colour each kind of issue is outlined in: clear on a photo, and readable as a dot on the light page. */
const COLORS: Record<string, string> = {
  pothole: '#f0624d',
  road_crack: '#e2a416',
  road_obstruction: '#e8853a',
  fallen_tree: '#3fa565',
  broken_streetlight: '#d4b106',
  fallen_wire: '#9068dc',
  water_leak: '#3a86df',
  waterlogging: '#26a3b8',
  open_manhole: '#df5a90',
  garbage: '#a8855a',
  damaged_sign: '#6468d8',
};

export const colorOf = (issueType: string) => COLORS[issueType] ?? '#3a86df';

/** The issue types by name, for choosing one by hand (mirrors backend/app/taxonomy.py). */
export const ISSUE_LABELS: Record<string, string> = {
  pothole: 'Pothole',
  road_crack: 'Road crack',
  road_obstruction: 'Road obstruction',
  fallen_tree: 'Fallen tree',
  broken_streetlight: 'Broken street light',
  fallen_wire: 'Fallen / hanging wire',
  water_leak: 'Water leak',
  waterlogging: 'Waterlogging',
  open_manhole: 'Open manhole',
  garbage: 'Garbage dump',
  damaged_sign: 'Damaged sign',
};
