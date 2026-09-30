# Cardhouse: plan (Big 7, project 04)

An online card room built for phones. Your hand fills most of the screen. Swipe left and right to move through your cards, and swipe up to see your chips and everything else at the table: the pot, the community cards, other players and the dealer.

**Status:** built. Steps 1–6 are done: all five games play online, and the Terms, Privacy Policy, Cookie Policy and Big 7 page are updated. See the Cardhouse section of the README for how it works now. What's still open: the nine-card rules (§8), testing on real iPhone and Android phones, and optional sounds.

## 1. Games

| Game | Players | Opponent | Version 1 rules |
|---|---|---|---|
| **Blackjack** | 1–5 at one table | Dealer | 6-deck shoe; dealer stands on soft 17; blackjack pays 3:2; double down on any two cards; split once; no insurance. |
| **Three Card Poker** | 1–6 | Dealer | Ante then Play (or fold). The dealer qualifies with Queen-high. Hand ranks differ from normal poker: straight flush > three of a kind > straight > flush > pair > high card. Pair Plus side bet comes later. |
| **Five Card Draw** | 2–6 | Each other | Antes; a betting round; discard and draw up to 3 cards (4 if keeping an Ace); a second betting round; showdown. |
| **Nine-card poker** | 2–6 | Each other | **Rules to confirm (see §8).** Placeholder: each player gets 9 cards and makes their best 5-card hand, with two betting rounds. |
| **Texas Hold'em** | 2–9 | Each other | No-limit; small and big blinds; pre-flop, flop, turn and river betting; side pots for all-ins; best 5 of 7 cards. |

## 2. Chips: play money only

- Chips are **free and worthless**. There's no buying chips, no cashing out and no prizes. In the UK, any real-money stake, or chips that can be bought or exchanged for something of value, would need a Gambling Commission licence under the Gambling Act 2005. Play money with nothing of value stays outside that.
- Everyone gets a free daily top-up, for example back to 1,000 chips.
- The Terms and every game table state "Play money only, no real-money gambling".

## 3. Phone experience

```
┌──────────────────────┐
│  Hold'em · Pot 240   │  ← thin status bar (game, pot, whose turn)
│                      │
│   ┌────┐ ┌────┐      │
│   │ A♠ │ │ K♥ │  ◀ ▶ │  ← your hand fills ~75% of the screen
│   │    │ │    │      │     swipe left/right to move through cards
│   └────┘ └────┘      │     tap a card to select it (discards, holds)
│                      │
│  [Fold][Call][Raise] │  ← actions in the thumb zone
│  ───── swipe up ──── │
└──────────────────────┘
        ⇡ swipe up
┌──────────────────────┐
│ Your chips: 1,240    │  ← bottom sheet: chips, bet slider
│ Board: 9♣ 9♦ K♠ 2♥   │  ← community cards (Hold'em)
│ Bob  ● 800   bet 40  │  ← other players: stack, bet, cards
│ Ana  ● 1,020 folded  │     (face-down until a showdown)
│ Dealer: 7♦ ▢         │  ← the dealer's cards (Blackjack, Three Card Poker)
└──────────────────────┘
```

- **Swiping between cards uses CSS scroll snapping** (`scroll-snap-type: x mandatory`). The browser provides native momentum and snapping, so no gesture library is needed.
- **Swipe-up sheet:** pointer events on the handle, plus a button for anyone who doesn't swipe. It holds chips and the bet amount (with a native `<input type="range">`), the pot, the board, opponents and the dealer, depending on the game.
- **Extras:** `navigator.vibrate` gives a small buzz when it's your turn. The Screen Wake Lock API stops the screen sleeping mid-hand. A web app manifest lets people add it to their home screen in portrait, full screen.
- **Accessibility:** every card has a text label ("Ace of spades"). Turn changes and results are announced to screen readers. Suits use shape and colour, not colour alone. Cards stay large, with a four-colour deck option.
- **Desktop:** the same layout, centred, with arrow keys to move between cards.

## 4. How it's built

The setup reuses what already runs Hearthvale, so there's no new hosting.

| Part | Where | Why |
|---|---|---|
| Game rules engine | `packages/cards/`: plain TypeScript, no UI | Deck, shuffle, hand ranking and one state machine per game. Easy to unit-test. |
| Game server | A new `/cards` WebSocket path on the existing backend (`apps/server`, `api.bigtomdev.fyi`) | Same machine, tunnel and rate limiting; nothing new to host. |
| App | `apps/cardhouse/` (Vite + TypeScript, no framework, like the other apps) | Served at `bigtomdev.fyi/cardhouse/`, built by `npm run build:vercel`. |

- **The server is authoritative.** It shuffles with `crypto.randomInt`, deals, checks every action and pays out. The phone only sends intentions ("raise 80"). **Other players' face-down cards and the deck order never leave the server**, so they can't be seen in the browser.
- **Rooms:** create a table and share a 5-letter code or link. No account is needed: players pick a nickname. A seat token in `sessionStorage` lets a player rejoin after a dropped connection.
- **Turn timer:** 30 seconds, after which the player auto-checks or folds, so one idle phone can't stall a table.
- **State:** tables live in the server's memory, and chip balances are kept against the seat token. Deliberate limit: a server restart ends the tables in progress. Move to SQLite if that ever matters.
- **Validation:** every message is checked with zod (already used), with per-socket rate limits (already built).

## 5. Build order

Each step ends with something testable.

1. **Card engine** (`packages/cards`). Deck and shuffle; 5-card hand ranking; best 5 from 7 or 9 cards; 3-card ranking.
   *Done when:* tests pass for every hand category, ties, kickers, and the wheel straight (A-2-3-4-5).
2. **Blackjack, single player, plus the phone layout.** The card carousel, the swipe-up sheet, and dealer logic on the server.
   *Done when:* a full hand plays on a phone-sized screen, and a 10,000-hand simulation keeps the chip total exactly balanced.
3. **Rooms and lobby.** Create and join by code, seats, rejoining after a drop, turn timers.
   *Done when:* two phones play at the same table and one can refresh mid-hand without losing its seat.
4. **Texas Hold'em.** The shared betting engine: blinds, raises, minimum raise, all-ins, side pots, split pots.
   *Done when:* scripted tests cover a three-way all-in with side pots and a split pot, and chips always add up.
5. **Five Card Draw, Three Card Poker and the nine-card variant.** These reuse the betting engine and the dealer logic.
   *Done when:* each game plays a full round in tests and on a phone.
6. **Polish and launch.** Deal and flip animations (CSS transforms), optional sounds, haptics, the manifest and accessibility checks. Also: a "Play money only" notice, updates to the Terms and Privacy Policy, the Big 7 slot 04 section and a link-preview image.
   *Done when:* it's usable on a real iPhone and Android phone, the accessibility checks pass, and the legal pages are updated.

## 6. Testing

- **Engine:** plain `node:test` files, like the server's existing tests. Known hands must rank correctly, and chip totals must be identical before and after every simulated hand.
- **Server:** scripted multi-seat games, including a disconnect and rejoin mid-hand.
- **Screens:** Playwright at phone sizes (390×844 and 360×800), checking swipe, sheet and action flows. The same tool was used for Homebase.

## 7. Legal and privacy

- **Terms:** play money only; no real-money gambling; age 13+ in line with the other sites; acceptable use (no collusion, bots or abuse in names).
- **Privacy:** nicknames and seats exist only while a table is running. The seat token is in `sessionStorage`, which is strictly necessary, so no cookie banner is needed. There's no chat in version 1, which avoids moderation duties.

## 8. Questions to settle before step 5

1. **"Nine-card poker":** this isn't a standard game name. Which rules do you mean? Options: best 5 of 9 cards dealt to you; a stud-style game with some cards face up; or a nine-card house game you already play. The placeholder in §1 stays until you decide.
2. **Five Card Draw betting:** fixed-limit or no-limit? Proposed default: no-limit, matching Hold'em.
3. **Chat or emotes at tables?** Proposed: a few preset emotes only, with no free-text chat, which avoids moderation.
4. **Discord login:** optional, reusing Hearthvale's login so chip balances follow the player. Proposed: after launch, if people ask for it.
