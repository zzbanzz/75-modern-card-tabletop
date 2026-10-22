export const SUITS = ["plugs", "gears", "hearts", "briefcases", "caps"] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;

export const JOKERS = ["joker-ace", "joker-wild", "joker-mirror", "joker-chaos", "joker-null"] as const;

export const SUIT_LABEL: Record<Suit, string> = {
  plugs: "Plugs",
  gears: "Gears",
  hearts: "Hearts",
  briefcases: "Briefcases",
  caps: "Caps",
};

export const JOKER_LABEL: Record<(typeof JOKERS)[number], string> = {
  "joker-ace": "Plug Joker",
  "joker-wild": "Gear Joker",
  "joker-mirror": "Briefcase Joker",
  "joker-chaos": "Cap Joker",
  "joker-null": "Heart Joker",
};

export type Card = {
  id: string;
  suit: Suit | "joker";
  rank: string;
  joker: boolean;
};

export function cardSrc(id: string) {
  return `/cards/${id}.jpg`;
}

export function cardLabel(card: Card) {
  if (card.joker) return JOKER_LABEL[card.id as (typeof JOKERS)[number]] ?? card.id;
  const suit = card.suit === "joker" ? "Joker" : SUIT_LABEL[card.suit];
  return `${card.rank} of ${suit}`;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${suit}-${rank}`, suit, rank, joker: false });
    }
  }
  for (const id of JOKERS) {
    deck.push({ id, suit: "joker", rank: "JOKER", joker: true });
  }
  return deck;
}

export function shuffle<T>(list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

export function isWild(card: Card) {
  return card.joker || card.rank === "8";
}

/** lead is the suit declared after an 8 or joker. Otherwise match the top card. */
export function canPlay(card: Card, top: Card | null, lead: Suit | null) {
  if (!top) return true;
  if (isWild(card)) return true;
  const suit = lead ?? (top.joker ? null : top.suit);
  if (suit && card.suit === suit) return true;
  if (!top.joker && card.rank === top.rank) return true;
  return false;
}

const FACE = new Set(["J", "Q", "K"]);
const NUMBER = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);

const RANK_VALUE: Record<string, number> = {
  "0": 0,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export type Matchup = { winner: "a" | "b" | "mutual" | "tie"; reason: string };

/** Ace beats everything. 0 and a face destroy each other. 0 loses to 1–10.
 *  A joker beats 1–10 by faking a face, and loses when a real face exposes it. */
export function resolveMatchup(a: Card, b: Card): Matchup {
  if (a.joker && b.joker) return { winner: "tie", reason: "Two jokers mirror each other." };
  if (!a.joker && a.rank === "A" && !b.joker && b.rank === "A") {
    return { winner: "tie", reason: "Ace against ace." };
  }
  if (!a.joker && a.rank === "A") return { winner: "a", reason: "Ace beats everything." };
  if (!b.joker && b.rank === "A") return { winner: "b", reason: "Ace beats everything." };

  const zero = (c: Card) => !c.joker && c.rank === "0";
  const face = (c: Card) => !c.joker && FACE.has(c.rank);
  const numbered = (c: Card) => !c.joker && NUMBER.has(c.rank);

  if ((zero(a) && face(b)) || (zero(b) && face(a))) {
    return { winner: "mutual", reason: "A zero and a face wipe each other out." };
  }
  if (zero(a) && numbered(b)) return { winner: "b", reason: "Zero loses to a numbered card." };
  if (zero(b) && numbered(a)) return { winner: "a", reason: "Zero loses to a numbered card." };
  if (zero(a) && zero(b)) return { winner: "tie", reason: "Zero against zero." };
  if ((a.joker && zero(b)) || (b.joker && zero(a))) {
    return { winner: "tie", reason: "The joker mirrors the zero." };
  }
  if (a.joker && numbered(b)) return { winner: "a", reason: "Joker fakes a face against a number." };
  if (b.joker && numbered(a)) return { winner: "b", reason: "Joker fakes a face against a number." };
  if (a.joker && face(b)) return { winner: "b", reason: "A real face exposes the joker." };
  if (b.joker && face(a)) return { winner: "a", reason: "A real face exposes the joker." };

  const va = RANK_VALUE[a.rank] ?? 0;
  const vb = RANK_VALUE[b.rank] ?? 0;
  if (va === vb) return { winner: "tie", reason: "Same rank." };
  return va > vb
    ? { winner: "a", reason: "Higher rank." }
    : { winner: "b", reason: "Higher rank." };
}
