// Run-seed name generator. Picks an adjective + noun so seeds feel like
// playful place names ("sneezy sands", "drunken comet") instead of opaque
// hex. Deterministic from a seed if one is provided; random by default.

const ADJECTIVES = [
  'sneezy', 'drunken', 'rumbling', 'fizzy', 'cosmic', 'misty', 'crooked', 'woolen',
  'grumpy', 'bashful', 'drowsy', 'sleepy', 'itchy', 'jolly', 'twisty', 'crumbly',
  'wobbly', 'shivering', 'gleaming', 'murky', 'blistered', 'velvet', 'glassy',
  'ragged', 'howling', 'whispering', 'molten', 'frozen', 'dusty', 'squeaky',
  'lonely', 'rusty', 'silvered', 'murmuring', 'tumbling', 'lumbering', 'lazy',
  'snapping', 'curdled', 'tangled', 'feathered', 'smokey', 'peppered', 'salted',
  'sour', 'sweet', 'bitter', 'brittle', 'vacant', 'hollow', 'forgotten',
  'bruised', 'hungry', 'restless', 'reckless', 'thirsty', 'secret', 'quiet',
];

const NOUNS = [
  'sands', 'comet', 'nebula', 'rift', 'hollow', 'gully', 'fjord', 'plateau',
  'basin', 'reef', 'shelf', 'pocket', 'trench', 'vein', 'crater', 'ridge',
  'shoals', 'meadow', 'thicket', 'grove', 'marsh', 'moor', 'glacier', 'canyon',
  'cove', 'hatch', 'lantern', 'kettle', 'anvil', 'jamboree', 'quarry', 'furnace',
  'caldera', 'orchard', 'vineyard', 'footprint', 'echo', 'passage', 'spire',
  'spiral', 'lattice', 'bazaar', 'ember', 'lullaby', 'verse', 'tide', 'drift',
  'husk', 'silhouette', 'mirror', 'carousel', 'parlor', 'barrow', 'hamlet',
];

/**
 * Generate a readable run seed like "sneezy-sands" or "drunken-comet".
 * Pass an optional RNG function (0..1) for determinism.
 */
export function generateRunSeedName(rand: () => number = Math.random): string {
  const adj = ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(rand() * NOUNS.length)];
  return `${adj}-${noun}`;
}
