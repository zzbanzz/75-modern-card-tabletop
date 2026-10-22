import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  JOKERS,
  SUITS,
  SUIT_LABEL,
  canPlay,
  cardLabel,
  cardSrc,
  createDeck,
  isWild,
  resolveMatchup,
  shuffle,
  type Card,
  type Suit,
} from "@/lib/deck";

export const Route = createFileRoute("/")({ component: Home });

type Mode = "eights" | "war";

type Eights = {
  kind: "eights";
  code: string;
  draw: Card[];
  discard: Card[];
  you: Card[];
  bot: Card[];
  lead: Suit | null;
  turn: "you" | "bot";
  pending: boolean;
  afterSuit: "you" | "bot";
  seconds: number;
  log: string;
  winner: "you" | "bot" | null;
};

type War = {
  kind: "war";
  code: string;
  you: Card[];
  bot: Card[];
  yours: Card | null;
  theirs: Card | null;
  pot: Card[];
  log: string;
  winner: "you" | "bot" | null;
};

const MODE_COPY: Record<Mode, { name: string; blurb: string }> = {
  eights: {
    name: "Crazy Eights",
    blurb: "Match the suit or the rank. Eights and jokers are wild — name the suit that follows. Empty your hand.",
  },
  war: {
    name: "War",
    blurb: "Flip one card each. Ace beats everything. A zero and a face destroy each other. Zero loses to 1–10. A joker beats numbers by faking a face, and loses to a real one.",
  },
};

const SUIT_INK: Record<Suit, string> = {
  plugs: "#6d28d9",
  gears: "#1a1208",
  hearts: "#b42318",
  briefcases: "#1a1208",
  caps: "#9f1239",
};

function roomCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < 4; i++) s += letters[Math.floor(Math.random() * letters.length)];
  return s;
}

function topOf(discard: Card[]) {
  return discard[discard.length - 1] ?? null;
}

function recycle(draw: Card[], discard: Card[]) {
  if (draw.length > 0 || discard.length < 2) return { draw, discard };
  const top = discard[discard.length - 1];
  return { draw: shuffle(discard.slice(0, -1)), discard: [top] };
}

function favoriteSuit(hand: Card[]): Suit {
  const counts = Object.fromEntries(SUITS.map((s) => [s, 0])) as Record<Suit, number>;
  for (const card of hand) {
    if (card.suit !== "joker") counts[card.suit] += 1;
  }
  return SUITS.slice().sort((a, b) => counts[b] - counts[a])[0];
}

function dealEights(): Eights {
  const deck = shuffle(createDeck());
  const you = deck.splice(0, 7);
  const bot = deck.splice(0, 7);
  const first = deck.pop()!;
  const wild = isWild(first);
  return {
    kind: "eights",
    code: roomCode(),
    draw: deck,
    discard: [first],
    you,
    bot,
    lead: null,
    turn: "you",
    pending: wild,
    afterSuit: "you",
    seconds: 60,
    log: wild ? "Opening card is wild. Name the suit." : "Your lead. Match suit or rank.",
    winner: null,
  };
}

function dealWar(): War {
  const deck = shuffle(createDeck());
  const mid = Math.floor(deck.length / 2);
  return {
    kind: "war",
    code: roomCode(),
    you: deck.slice(0, mid),
    bot: deck.slice(mid),
    yours: null,
    theirs: null,
    pot: [],
    log: "Flip when you are ready.",
    winner: null,
  };
}

function finishPlay(state: Eights, who: "you" | "bot", hand: Card[], card: Card, draw: Card[]): Eights {
  const discard = [...state.discard, card];
  const other = who === "you" ? "bot" : "you";
  if (hand.length === 0) {
    return {
      ...state,
      draw,
      discard,
      you: who === "you" ? hand : state.you,
      bot: who === "bot" ? hand : state.bot,
      pending: false,
      winner: who,
      log: who === "you" ? "You emptied your hand." : "The table emptied theirs.",
      seconds: 60,
    };
  }
  if (isWild(card)) {
    if (who === "bot") {
      const suit = favoriteSuit(hand);
      return {
        ...state,
        draw,
        discard,
        bot: hand,
        lead: suit,
        turn: "you",
        pending: false,
        seconds: 60,
        log: `They played ${cardLabel(card)} and called ${SUIT_LABEL[suit]}.`,
      };
    }
    return {
      ...state,
      draw,
      discard,
      you: hand,
      pending: true,
      afterSuit: "bot",
      lead: null,
      log: `${cardLabel(card)} is wild. Name the suit.`,
    };
  }
  return {
    ...state,
    draw,
    discard,
    you: who === "you" ? hand : state.you,
    bot: who === "bot" ? hand : state.bot,
    lead: null,
    turn: other,
    pending: false,
    seconds: 60,
    log: `${who === "you" ? "You" : "They"} played ${cardLabel(card)}.`,
  };
}

function drawOne(state: Eights, who: "you" | "bot"): Eights {
  const pile = recycle(state.draw, state.discard);
  const hand = who === "you" ? state.you : state.bot;
  const top = topOf(pile.discard);
  if (!top || pile.draw.length === 0) {
    return {
      ...state,
      turn: who === "you" ? "bot" : "you",
      seconds: 60,
      log: `${who === "you" ? "You" : "They"} cannot play, and the deck is spent.`,
    };
  }
  const [drawn, ...rest] = pile.draw;
  const next = [...hand, drawn];
  if (canPlay(drawn, top, state.lead)) {
    return finishPlay(
      { ...state, discard: pile.discard },
      who,
      next.filter((c) => c.id !== drawn.id),
      drawn,
      rest,
    );
  }
  return {
    ...state,
    draw: rest,
    discard: pile.discard,
    you: who === "you" ? next : state.you,
    bot: who === "bot" ? next : state.bot,
    turn: who === "you" ? "bot" : "you",
    seconds: 60,
    log: `${who === "you" ? "You" : "They"} drew and still could not play.`,
  };
}

function autoYou(state: Eights): Eights {
  if (state.winner) return state;
  if (state.pending) {
    const suit: Suit = "plugs";
    return {
      ...state,
      lead: suit,
      pending: false,
      turn: state.afterSuit,
      seconds: 60,
      log: `Time. Suit set to ${SUIT_LABEL[suit]}.`,
    };
  }
  const top = topOf(state.discard);
  const legal = state.you.find((c) => top && canPlay(c, top, state.lead));
  if (legal) return finishPlay(state, "you", state.you.filter((c) => c.id !== legal.id), legal, state.draw);
  return drawOne(state, "you");
}

function botAct(state: Eights): Eights {
  if (state.winner || state.turn !== "bot" || state.pending) return state;
  const top = topOf(state.discard);
  if (!top) return state;
  const legal = state.bot.filter((c) => canPlay(c, top, state.lead));
  const pick = legal.find((c) => !isWild(c)) ?? legal[0];
  if (!pick) return drawOne(state, "bot");
  return finishPlay(state, "bot", state.bot.filter((c) => c.id !== pick.id), pick, state.draw);
}

function Home() {
  const [mode, setMode] = useState<Mode>("eights");
  const [screen, setScreen] = useState<"home" | "table" | "deck">("home");
  const [eights, setEights] = useState<Eights | null>(null);
  const [war, setWar] = useState<War | null>(null);

  useEffect(() => {
    if (screen !== "table" || !eights || eights.winner || eights.turn !== "bot" || eights.pending) return;
    const t = window.setTimeout(() => setEights((s) => (s ? botAct(s) : s)), 800);
    return () => window.clearTimeout(t);
  }, [screen, eights]);

  useEffect(() => {
    if (screen !== "table" || !eights || eights.winner || eights.turn !== "you") return;
    const t = window.setInterval(() => {
      setEights((s) => {
        if (!s || s.winner || s.turn !== "you") return s;
        if (s.seconds > 1) return { ...s, seconds: s.seconds - 1 };
        return autoYou(s);
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [screen, eights?.turn, eights?.winner, eights?.pending]);

  function sit() {
    if (mode === "eights") {
      setEights(dealEights());
      setWar(null);
    } else {
      setWar(dealWar());
      setEights(null);
    }
    setScreen("table");
  }

  return (
    <main className="min-h-screen bg-bg text-cream">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
        <div>
          <p className="font-display text-xl tracking-tight text-cream">Tabletop 75</p>
          <p className="text-xs text-cream-dim">Five suits · ranks 0–A · five jokers</p>
        </div>
        <nav className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setScreen("home")}
            className={`rounded-full px-3 py-1.5 ${screen === "home" ? "bg-cream text-ink" : "text-cream-dim"}`}
          >
            Lobby
          </button>
          <button
            type="button"
            onClick={() => setScreen("deck")}
            className={`rounded-full px-3 py-1.5 ${screen === "deck" ? "bg-cream text-ink" : "text-cream-dim"}`}
          >
            All 80
          </button>
          {(eights || war) && (
            <button
              type="button"
              onClick={() => setScreen("table")}
              className={`rounded-full px-3 py-1.5 ${screen === "table" ? "bg-cream text-ink" : "text-cream-dim"}`}
            >
              Table
            </button>
          )}
        </nav>
      </header>

      {screen === "home" && <Lobby mode={mode} setMode={setMode} onSit={sit} />}
      {screen === "deck" && <Gallery />}
      {screen === "table" && eights && (
        <EightsTable
          state={eights}
          onPlay={(id) =>
            setEights((s) => {
              if (!s || s.winner || s.turn !== "you" || s.pending) return s;
              const top = topOf(s.discard);
              const card = s.you.find((c) => c.id === id);
              if (!card || !top || !canPlay(card, top, s.lead)) {
                return { ...s, log: card ? `${cardLabel(card)} does not match.` : s.log };
              }
              return finishPlay(s, "you", s.you.filter((c) => c.id !== id), card, s.draw);
            })
          }
          onDraw={() =>
            setEights((s) => {
              if (!s || s.winner || s.turn !== "you" || s.pending) return s;
              const top = topOf(s.discard);
              if (top && s.you.some((c) => canPlay(c, top, s.lead))) {
                return { ...s, log: "You still have a legal card." };
              }
              return drawOne(s, "you");
            })
          }
          onSuit={(suit) =>
            setEights((s) => {
              if (!s || !s.pending) return s;
              return {
                ...s,
                lead: suit,
                pending: false,
                turn: s.afterSuit,
                seconds: 60,
                log: `Suit is ${SUIT_LABEL[suit]}.`,
              };
            })
          }
          onAgain={() => setEights(dealEights())}
        />
      )}
      {screen === "table" && war && (
        <WarTable
          state={war}
          onFlip={() =>
            setWar((s) => {
              if (!s || s.winner) return s;
              if (s.you.length === 0 || s.bot.length === 0) {
                return { ...s, winner: s.you.length === 0 ? "bot" : "you" };
              }
              const yours = s.you[0];
              const theirs = s.bot[0];
              const you = s.you.slice(1);
              const bot = s.bot.slice(1);
              const result = resolveMatchup(yours, theirs);
              const fought = [...s.pot, yours, theirs];
              if (result.winner === "a") {
                const nextYou = [...you, ...fought];
                return {
                  ...s,
                  you: nextYou,
                  bot,
                  yours,
                  theirs,
                  pot: [],
                  log: result.reason,
                  winner: bot.length === 0 && nextYou.length > 0 ? "you" : null,
                };
              }
              if (result.winner === "b") {
                const nextBot = [...bot, ...fought];
                return {
                  ...s,
                  you,
                  bot: nextBot,
                  yours,
                  theirs,
                  pot: [],
                  log: result.reason,
                  winner: you.length === 0 ? "bot" : null,
                };
              }
              if (result.winner === "mutual") {
                return {
                  ...s,
                  you,
                  bot,
                  yours,
                  theirs,
                  pot: [],
                  log: result.reason + " Both cards leave the deck.",
                  winner: you.length === 0 ? "bot" : bot.length === 0 ? "you" : null,
                };
              }
              return {
                ...s,
                you,
                bot,
                yours,
                theirs,
                pot: fought,
                log: result.reason + " They stay in the pot.",
                winner: you.length === 0 ? "bot" : bot.length === 0 ? "you" : null,
              };
            })
          }
          onAgain={() => setWar(dealWar())}
        />
      )}
    </main>
  );
}

function Lobby({ mode, setMode, onSit }: { mode: Mode; setMode: (m: Mode) => void; onSit: () => void }) {
  const queens = SUITS.map((suit) => `${suit}-Q`);
  return (
    <section className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <div className="felt relative overflow-hidden rounded-[2rem] px-4 py-8 shadow-[inset_0_0_0_1px_rgba(244,239,228,0.18)]">
        <p className="text-center text-[11px] uppercase tracking-[0.28em] text-cream/80">The court</p>
        <div className="mt-4 flex justify-center">
          {queens.map((id, i) => (
            <img
              key={id}
              src={cardSrc(id)}
              alt={id.replace("-", " ")}
              className="card-shell -ml-10 h-64 w-auto first:ml-0 sm:h-80"
              style={{ transform: `rotate(${(i - 2) * 6}deg)`, zIndex: i }}
            />
          ))}
        </div>
        <div className="mt-6 flex justify-center gap-2">
          {JOKERS.map((id) => (
            <img key={id} src={cardSrc(id)} alt={id} className="card-shell h-20 w-auto sm:h-24" />
          ))}
        </div>
      </div>

      <div className="space-y-5">
        <h1 className="font-display text-4xl leading-none text-cream sm:text-5xl">
          Sit down.
          <span className="block text-gold">The art is on the table.</span>
        </h1>
        <p className="max-w-md text-cream-dim">
          A local room for this deck — plugs, gears, hearts, briefcases, and caps. Pick a game, then deal. No account, no waiting on a network.
        </p>
        <label className="block text-sm text-cream-dim">
          Game
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            className="mt-1 w-full rounded-xl border border-cream/20 bg-felt-deep px-3 py-3 text-base text-cream"
          >
            <option value="eights">Crazy Eights</option>
            <option value="war">War</option>
          </select>
        </label>
        <p className="text-sm leading-relaxed text-cream-dim">{MODE_COPY[mode].blurb}</p>
        <button
          type="button"
          onClick={onSit}
          className="w-full rounded-full bg-gold px-5 py-3 text-base font-semibold text-ink"
        >
          Open room · {MODE_COPY[mode].name}
        </button>
      </div>
    </section>
  );
}

function EightsTable({
  state,
  onPlay,
  onDraw,
  onSuit,
  onAgain,
}: {
  state: Eights;
  onPlay: (id: string) => void;
  onDraw: () => void;
  onSuit: (suit: Suit) => void;
  onAgain: () => void;
}) {
  const top = topOf(state.discard);
  const legal = (card: Card) => !!top && canPlay(card, top, state.lead) && state.turn === "you" && !state.pending && !state.winner;
  return (
    <section className="mx-auto max-w-6xl px-3 pb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>
          Room <span className="font-display text-gold">{state.code}</span>
          <span className="text-cream-dim"> · Crazy Eights · you deal</span>
        </p>
        <p className="text-cream-dim">
          {state.winner
            ? state.winner === "you"
              ? "You win"
              : "They win"
            : state.turn === "you"
              ? `Your turn · ${state.seconds}s`
              : "Their turn"}
          {state.lead ? ` · ${SUIT_LABEL[state.lead]}` : ""}
        </p>
      </div>

      <div className="felt rounded-[2rem] px-3 py-6 sm:px-8">
        <div className="flex justify-center">
          <div className="flex">
            {state.bot.map((card, i) => (
              <img
                key={card.id}
                src="/cards/back.jpg"
                alt=""
                className="card-shell -ml-7 h-24 w-[4.1rem] object-cover first:ml-0"
                style={{ zIndex: i }}
              />
            ))}
          </div>
        </div>
        <p className="mt-2 text-center text-xs tracking-wide text-cream/80">{state.bot.length} in their hand</p>

        <div className="mt-6 flex items-end justify-center gap-6">
          <button type="button" onClick={onDraw} className="text-center" aria-label="Draw a card">
            <img src="/cards/back-purple.jpg" alt="Draw pile" className="card-shell h-40 w-auto sm:h-52" />
            <span className="mt-1 block text-xs text-cream/80">{state.draw.length} left</span>
          </button>
          {top && (
            <div className="text-center">
              <img src={cardSrc(top.id)} alt={cardLabel(top)} className="card-shell h-40 w-auto sm:h-52" />
              <span className="mt-1 block text-xs text-cream/80">
                {state.lead ? `Lead ${SUIT_LABEL[state.lead]}` : cardLabel(top)}
              </span>
            </div>
          )}
        </div>

        <p className="mx-auto mt-4 max-w-lg text-center text-sm text-cream">{state.log}</p>

        {state.pending && !state.winner && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {SUITS.map((suit) => (
              <button
                key={suit}
                type="button"
                onClick={() => onSuit(suit)}
                className="rounded-full bg-cream px-3 py-2 text-sm font-semibold"
                style={{ color: SUIT_INK[suit] }}
              >
                {SUIT_LABEL[suit]}
              </button>
            ))}
          </div>
        )}

        {state.winner && (
          <div className="mt-4 text-center">
            <button type="button" onClick={onAgain} className="rounded-full bg-gold px-4 py-2 font-semibold text-ink">
              Deal again
            </button>
          </div>
        )}
      </div>

      <div className="hand-scroll mt-4 flex gap-2 overflow-x-auto px-1 pb-2">
        {state.you.map((card) => {
          const ok = legal(card);
          return (
            <button
              key={card.id}
              type="button"
              disabled={!ok}
              onClick={() => onPlay(card.id)}
              aria-label={cardLabel(card)}
              className={`card-shell w-[4.7rem] shrink-0 overflow-hidden sm:w-[5.6rem] ${ok ? "-translate-y-2 ring-2 ring-gold" : "opacity-80"}`}
            >
              <img src={cardSrc(card.id)} alt="" className="aspect-[5/7] w-full object-cover" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function WarTable({
  state,
  onFlip,
  onAgain,
}: {
  state: War;
  onFlip: () => void;
  onAgain: () => void;
}) {
  return (
    <section className="mx-auto max-w-3xl px-4 pb-12">
      <div className="mb-3 flex items-center justify-between text-sm">
        <p>
          Room <span className="font-display text-gold">{state.code}</span>
          <span className="text-cream-dim"> · War</span>
        </p>
        <p className="text-cream-dim">
          You {state.you.length} · Them {state.bot.length}
        </p>
      </div>
      <div className="felt rounded-[2rem] px-4 py-8 text-center">
        <div className="flex items-end justify-center gap-6">
          <Pile label="You" card={state.yours} count={state.you.length} />
          <Pile label="Them" card={state.theirs} count={state.bot.length} />
        </div>
        <p className="mx-auto mt-6 max-w-md text-sm text-cream">{state.log}</p>
        {state.pot.length > 0 && <p className="mt-1 text-xs text-gold">{state.pot.length} cards in the pot</p>}
        <div className="mt-6">
          {state.winner ? (
            <button type="button" onClick={onAgain} className="rounded-full bg-gold px-5 py-3 font-semibold text-ink">
              {state.winner === "you" ? "You took the deck" : "They took the deck"} · again
            </button>
          ) : (
            <button type="button" onClick={onFlip} className="rounded-full bg-gold px-6 py-3 font-semibold text-ink">
              Flip
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function Pile({ label, card, count }: { label: string; card: Card | null; count: number }) {
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-[0.2em] text-cream/70">{label}</p>
      {card ? (
        <img src={cardSrc(card.id)} alt={cardLabel(card)} className="card-shell mx-auto h-52 w-auto sm:h-64" />
      ) : (
        <img src="/cards/back-red.jpg" alt="" className="card-shell mx-auto h-52 w-auto opacity-80 sm:h-64" />
      )}
      <p className="mt-2 text-xs text-cream/80">{count} remaining</p>
    </div>
  );
}

function Gallery() {
  return (
    <section className="mx-auto max-w-6xl space-y-8 px-4 pb-16">
      {SUITS.map((suit) => (
        <div key={suit}>
          <h2 className="font-display text-2xl" style={{ color: suit === "gears" || suit === "briefcases" ? "#e7d7a8" : SUIT_INK[suit] }}>
            {SUIT_LABEL[suit]}
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-8">
            {["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"].map((rank) => {
              const id = `${suit}-${rank}`;
              return <img key={id} src={cardSrc(id)} alt={id} className="card-shell w-full" />;
            })}
          </div>
        </div>
      ))}
      <div>
        <h2 className="font-display text-2xl text-gold">Jokers</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {JOKERS.map((id) => (
            <img key={id} src={cardSrc(id)} alt={id} className="card-shell w-full" />
          ))}
        </div>
      </div>
      <div>
        <h2 className="font-display text-2xl text-cream">Backs</h2>
        <div className="mt-3 grid max-w-md grid-cols-3 gap-2">
          {["back-blue", "back-purple", "back-red"].map((id) => (
            <img key={id} src={cardSrc(id)} alt={id} className="card-shell w-full" />
          ))}
        </div>
      </div>
    </section>
  );
}
