/**
 * Maps a Zwift activity's numeric `worldId` to the in-game world's display
 * name - extra context for "where did I ride", which doesn't come through
 * anywhere else on an activity.
 *
 * IDs confirmed against public, actively-maintained Zwift route/world
 * references (whatsonzwift.com, Zwift Insider, the zwift-mobile-api docs).
 * Not every id is included - some are event-only maps (e.g. Crit City,
 * Bologna TT) whose numeric id isn't consistently documented. Anything
 * missing from this table falls back to a generic "World #N" label rather
 * than guessing, so a wrong/unconfirmed id never gets shown.
 */
const WORLD_NAMES: Record<number, string> = {
  1: "Watopia",
  2: "Richmond",
  3: "London",
  4: "New York",
  5: "Innsbruck",
  7: "Yorkshire",
  9: "Makuri Islands",
  10: "France",
  11: "Paris",
  13: "Scotland",
};

export function worldName(worldId: unknown): string | null {
  if (typeof worldId !== "number") return null;
  return WORLD_NAMES[worldId] ?? `World #${worldId}`;
}
