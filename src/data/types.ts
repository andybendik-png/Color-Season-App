export type SeasonFamily = 'Spring' | 'Summer' | 'Autumn' | 'Winter';
export type SubSeasonId =
  | 'light-spring' | 'true-spring' | 'bright-spring'
  | 'light-summer' | 'true-summer' | 'soft-summer'
  | 'soft-autumn' | 'true-autumn' | 'deep-autumn'
  | 'deep-winter' | 'true-winter' | 'bright-winter';
export type ColourCategory =
  | 'neutral' | 'white' | 'grey' | 'blue' | 'green' | 'red' | 'pink'
  | 'purple' | 'yellow' | 'brown' | 'beige' | 'metallic';

/** Compact authoring format: [name, HEX, category]. All derived values are computed, never hand-typed. */
export type RawSwatch = [string, string, ColourCategory];

export const NEUTRAL_CATEGORIES: ColourCategory[] = ['neutral', 'white', 'grey', 'brown', 'beige', 'metallic'];
