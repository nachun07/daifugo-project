export type Suit = '♠' | '♥' | '♦' | '♣' | 'JOKER';
export type Rank = '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A' | '2' | 'JOKER';

export type Card = { suit: Suit; rank: Rank; id: string };

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS: Rank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

export type PlayerRank = '大富豪' | '富豪' | '平民' | '貧民' | '大貧民';

export type Play = { player: number; cards: Card[] };

export type GameState = {
  hands: Card[][]
  pile: Play[]
  currentPlayer: number
  revolution: boolean
  elevenBack: boolean // Temporary revolution until the field clears
  finished: number[]
  playerRanks: (PlayerRank | null)[]
  exchangeDone: boolean
  passCount: number
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push({ suit: s, rank: r, id: `${r}${s}` });
    }
  }
  // Add 1 Joker
  deck.push({ suit: 'JOKER', rank: 'JOKER', id: 'JOKER' });
  return shuffle(deck);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function initGame(playerCountOrNames: number | string[], lastRanks: (PlayerRank | null)[] = []): GameState {
  const playerCount = typeof playerCountOrNames === 'number' ? playerCountOrNames : playerCountOrNames.length;
  const deck = createDeck();
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  let i = 0;
  for (const c of deck) {
    hands[i % playerCount].push(c);
    i++;
  }
  
  // Sort hands
  hands.forEach(h => sortHand(h, false));

  return { 
    hands, 
    pile: [], 
    currentPlayer: 0, 
    revolution: false, 
    elevenBack: false,
    finished: [],
    playerRanks: lastRanks.length ? lastRanks : Array(playerCount).fill('平民'),
    exchangeDone: lastRanks.length === 0, // No exchange on first game
    passCount: 0
  };
}

export function rankIndex(r: Rank, revolution: boolean = false): number {
  if (r === 'JOKER') return 99; // Strongest
  const idx = RANKS.indexOf(r);
  if (revolution) {
    // 3 is strongest after JOKER, 2 is weakest
    // Normal: 3(0), 4(1), ... 2(12)
    // Rev: 2(0), A(1), ... 3(12)
    return 12 - idx;
  }
  return idx;
}

export function sortHand(hand: Card[], revolution: boolean) {
  hand.sort((a, b) => {
    const scoreA = rankIndex(a.rank, revolution);
    const scoreB = rankIndex(b.rank, revolution);
    if (scoreA !== scoreB) return scoreA - scoreB;
    return SUITS.indexOf(a.suit as any) - SUITS.indexOf(b.suit as any);
  });
}

// Check if cards have the same rank (considering Joker as wildcard)
function getBaseRank(cards: Card[]): Rank | null {
  const nonJokers = cards.filter(c => c.rank !== 'JOKER');
  if (nonJokers.length === 0) return 'JOKER';
  const first = nonJokers[0].rank;
  return nonJokers.every(c => c.rank === first) ? first : null;
}

function isKaidan(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  const nonJokers = cards.filter(c => c.rank !== 'JOKER');
  if (nonJokers.length === 0) return true; // Unusual but okay
  
  // All same suit (excluding Joker)
  const suit = nonJokers[0].suit;
  if (!nonJokers.every(c => c.suit === suit)) return false;

  const indices = nonJokers.map(c => RANKS.indexOf(c.rank)).sort((a, b) => a - b);
  // Check if they are contiguous, accounting for Jokers
  let jokersLeft = cards.length - nonJokers.length;
  for (let i = 1; i < indices.length; i++) {
    const gap = indices[i] - indices[i-1] - 1;
    if (gap < 0) return false; // Duplicate rank in Kaidan
    jokersLeft -= gap;
    if (jokersLeft < 0) return false;
  }
  return true;
}

export function isLegalPlay(state: GameState, hand: Card[], selected: Card[]): boolean {
  if (selected.length === 0) return false;
  
  const isRev = state.revolution !== state.elevenBack; // XOR logic for 11back

  // Single play Special: Spade 3 beats Joker
  if (state.pile.length > 0) {
    const lastPlay = state.pile[state.pile.length - 1].cards;
    if (lastPlay.length === 1 && lastPlay[0].rank === 'JOKER' && selected.length === 1 && selected[0].id === '3♠') {
      return true;
    }
  }

  if (state.pile.length === 0) {
    return getBaseRank(selected) !== null || isKaidan(selected);
  }

  const lastPlay = state.pile[state.pile.length - 1].cards;
  if (lastPlay.length !== selected.length) return false;

  const lastBase = getBaseRank(lastPlay);
  const selectedBase = getBaseRank(selected);

  if (lastBase && selectedBase) {
    const lastScore = rankIndex(lastBase, isRev);
    const selectedScore = rankIndex(selectedBase, isRev);
    return selectedScore > lastScore;
  }

  if (isKaidan(lastPlay) && isKaidan(selected)) {
    // For Kaidan, max rank determines strength
    const lastMax = Math.max(...lastPlay.map(c => rankIndex(c.rank, isRev)));
    const selectedMax = Math.max(...selected.map(c => rankIndex(c.rank, isRev)));
    return selectedMax > lastMax;
  }

  return false;
}

export function applyPlay(state: GameState, playerIndex: number, cards: Card[]): GameState {
  const isRev = state.revolution !== state.elevenBack;
  const newHands = state.hands.map(h => [...h]);
  const hand = newHands[playerIndex];

  // Remove cards from hand
  for (const c of cards) {
    const idx = hand.findIndex(h => h.id === c.id);
    if (idx >= 0) hand.splice(idx, 1);
  }

  let nextPlayer = (playerIndex + 1) % state.hands.length;
  let newPile = [...state.pile, { player: playerIndex, cards }];
  let revolution = state.revolution;
  let elevenBack = state.elevenBack;
  let resetPile = false;
  let finished = [...state.finished];
  const playerRank = state.playerRanks[playerIndex];

  // --- Special Rules ---

  // 8-giri
  if (cards.some(c => c.rank === '8')) {
    resetPile = true;
    nextPlayer = playerIndex;
    elevenBack = false;
  }

  // Revolution
  if (cards.length >= 4 && getBaseRank(cards) !== 'JOKER' && getBaseRank(cards) !== null) {
    revolution = !revolution;
  }

  // 11-back
  if (cards.some(c => c.rank === 'J')) {
    elevenBack = true;
  }

  // --- Win / Finish Check ---
  if (hand.length === 0) {
    // Check Kinshi-agari (Illegal Finish)
    const base = getBaseRank(cards);
    let isIllegal = false;
    if (base === 'JOKER') isIllegal = true;
    if (!isRev && base === '2') isIllegal = true;
    if (isRev && base === '3') isIllegal = true;
    if (cards.some(c => c.rank === '8')) isIllegal = true;

    if (isIllegal) {
      // Penalize: Instant Dai-Binmin
      // For now, we signal this by putting them at the VERY end of finished
    }

    if (!finished.includes(playerIndex)) {
      finished.push(playerIndex);
      
      // Miyako-ochi Check:
      // If a non-Daifugo wins 1st, and there's a Daifugo in the game who hasn't finished
      const daifugoIndex = state.playerRanks.findIndex(r => r === '大富豪');
      if (finished.length === 1 && playerIndex !== daifugoIndex && daifugoIndex !== -1) {
        // Miyako-ochi triggers for the former Daifugo
        // They will be forced to the end of the ranking
      }
    }
  }

  // Find next valid player
  while (finished.includes(nextPlayer) && finished.length < state.hands.length) {
    nextPlayer = (nextPlayer + 1) % state.hands.length;
  }

  return {
    ...state,
    hands: newHands,
    pile: resetPile ? [] : newPile,
    currentPlayer: nextPlayer,
    revolution,
    elevenBack,
    finished,
    passCount: 0
  };
}

export function finalizeGame(state: GameState): PlayerRank[] {
  const newRanks: (PlayerRank | null)[] = Array(state.hands.length).fill(null);
  const order = state.finished;
  
  // Fill remaining (losers) in order of remaining hand size (simplified for now)
  const remaining = state.hands
    .map((h, i) => ({ i, size: h.length }))
    .filter(x => !order.includes(x.i))
    .sort((a, b) => a.size - b.size)
    .map(x => x.i);
  
  const fullOrder = [...order, ...remaining];
  
  if (fullOrder.length === 4) {
    newRanks[fullOrder[0]] = '大富豪';
    newRanks[fullOrder[1]] = '富豪';
    newRanks[fullOrder[2]] = '貧民';
    newRanks[fullOrder[3]] = '大貧民';
  } else if (fullOrder.length >= 5) {
     newRanks[fullOrder[0]] = '大富豪';
     newRanks[fullOrder[1]] = '富豪';
     newRanks[fullOrder[fullOrder.length - 2]] = '貧民';
     newRanks[fullOrder[fullOrder.length - 1]] = '大貧民';
     for (let i = 2; i < fullOrder.length - 2; i++) newRanks[fullOrder[i]] = '平民';
  }

  return newRanks as PlayerRank[];
}

export function handlePass(state: GameState): GameState {
  const activePlayers = state.hands.length - state.finished.length;
  const newPassCount = state.passCount + 1;
  
  let nextPlayer = (state.currentPlayer + 1) % state.hands.length;
  while (state.finished.includes(nextPlayer)) {
    nextPlayer = (nextPlayer + 1) % state.hands.length;
  }

  // If everyone else passed
  if (newPassCount >= activePlayers - 1) {
    return {
      ...state,
      pile: [],
      currentPlayer: nextPlayer,
      elevenBack: false, // 11back clears when field clears
      passCount: 0
    };
  }

  return {
    ...state,
    currentPlayer: nextPlayer,
    passCount: newPassCount
  };
}
