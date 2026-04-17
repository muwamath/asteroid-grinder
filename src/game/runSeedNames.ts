// Run-seed name generator. Picks an adjective + noun so seeds feel like
// playful place names ("sneezy sands", "orbital tabby") instead of opaque
// hex. Three flavors of nouns: astronomy, cat breeds, and worldy places.

const ADJECTIVES = [
  // whimsical
  'sneezy', 'burpy', 'wobbly', 'squishy', 'jiggly', 'piffling', 'bumbling',
  'flustered', 'bashful', 'drowsy', 'grumpy', 'ticklish', 'dizzy', 'giggly',
  'snuggly', 'goofy', 'silly', 'squiggly', 'noodle', 'doodle', 'puddle',
  'floppy', 'flailing', 'hiccupping', 'sniffling', 'sputtering', 'mumbling',
  'harrumphing', 'kerfuffled', 'discombobulated', 'befuddled', 'tootling',
  // astronomy
  'cosmic', 'galactic', 'orbital', 'eclipsing', 'heliocentric', 'lunar',
  'solar', 'stellar', 'interstellar', 'nebular', 'celestial', 'gravitational',
  'comet-streaked', 'meteoric', 'asteroidal', 'supernova', 'quasar', 'pulsar',
  'retrograde', 'perihelion', 'zodiacal', 'equinoxial', 'penumbral',
  'astrocartographic', 'horologium',
  // evocative / moody
  'whispering', 'gleaming', 'howling', 'murmuring', 'shivering', 'tumbling',
  'lumbering', 'snapping', 'curdled', 'tangled', 'rusty', 'crooked', 'velvet',
  'glassy', 'molten', 'frozen', 'murky', 'smokey', 'peppered', 'salted',
  'secret', 'forgotten', 'bruised', 'hollow', 'vacant', 'hungry', 'restless',
];

const NOUNS = [
  // astronomy
  'comet', 'nebula', 'pulsar', 'quasar', 'binary', 'singularity', 'horizon',
  'eclipse', 'apogee', 'perigee', 'corona', 'chromosphere', 'exosphere',
  'magnetosphere', 'ionosphere', 'heliopause', 'oort', 'kuiper', 'lagrange',
  'parsec', 'lightyear', 'accretion', 'transit', 'occultation', 'zenith',
  'nadir', 'azimuth', 'meridian', 'terminator', 'syzygy', 'opposition',
  'conjunction', 'libration', 'nutation', 'apsis',
  // cats (breeds + cat-y things)
  'tabby', 'siamese', 'persian', 'maine-coon', 'ragdoll', 'bengal', 'sphynx',
  'munchkin', 'calico', 'tuxedo', 'tortoiseshell', 'norwegian', 'burmese',
  'abyssinian', 'chartreux', 'bombay', 'himalayan', 'manx', 'scottish-fold',
  'cornish-rex', 'devon-rex', 'russian-blue', 'mittens', 'whiskers', 'furball',
  'kitten', 'hairball', 'mackerel', 'mouser',
  // worldy places
  'sands', 'hollow', 'fjord', 'plateau', 'basin', 'reef', 'shelf', 'pocket',
  'trench', 'crater', 'ridge', 'shoals', 'meadow', 'thicket', 'grove',
  'marsh', 'moor', 'glacier', 'canyon', 'cove', 'hatch', 'lantern', 'kettle',
  'anvil', 'jamboree', 'quarry', 'furnace', 'caldera', 'orchard', 'vineyard',
  'lullaby', 'verse', 'tide', 'drift', 'husk', 'silhouette', 'mirror',
  'carousel', 'parlor', 'barrow', 'hamlet', 'bazaar', 'ember', 'spiral',
  'lattice', 'spire',
];

/**
 * Generate a readable run seed like "sneezy-sands" or "orbital-tabby".
 * Pass an optional RNG function (0..1) for determinism.
 */
export function generateRunSeedName(rand: () => number = Math.random): string {
  const adj = ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(rand() * NOUNS.length)];
  return `${adj}-${noun}`;
}
