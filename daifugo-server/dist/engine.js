"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDeck = createDeck;
exports.shuffle = shuffle;
exports.initGame = initGame;
exports.isLegalPlay = isLegalPlay;
exports.applyPlay = applyPlay;
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
function createDeck() {
    const deck = [];
    for (const s of SUITS) {
        for (const r of RANKS) {
            deck.push({ suit: s, rank: r, id: `${r}${s}` });
        }
    }
    return shuffle(deck);
}
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function initGame(playerCountOrNames) {
    const playerCount = typeof playerCountOrNames === 'number' ? playerCountOrNames : playerCountOrNames.length;
    const deck = createDeck();
    const hands = Array.from({ length: playerCount }, () => []);
    let i = 0;
    for (const c of deck) {
        hands[i % playerCount].push(c);
        i++;
    }
    return { hands, pile: [], currentPlayer: 0, revolution: false, finished: [] };
}
function rankIndex(r) {
    return RANKS.indexOf(r);
}
function isSameRank(cards) {
    if (cards.length === 0)
        return false;
    const r = cards[0].rank;
    return cards.every(c => c.rank === r);
}
function isSequence(cards) {
    if (cards.length < 2)
        return false;
    const suit = cards[0].suit;
    if (!cards.every(c => c.suit === suit))
        return false;
    const indices = cards.map(c => rankIndex(c.rank)).sort((a, b) => a - b);
    for (let i = 1; i < indices.length; i++) {
        if (indices[i] !== indices[i - 1] + 1)
            return false;
    }
    return true;
}
function isLegalPlay(state, hand, selected) {
    if (selected.length === 0)
        return false;
    for (const s of selected) {
        if (!hand.find(h => h.id === s.id))
            return false;
    }
    if (state.pile.length === 0)
        return true;
    const last = state.pile[state.pile.length - 1].cards;
    if (last.length !== selected.length)
        return false;
    if (isSameRank(selected) && isSameRank(last)) {
        const selRank = rankIndex(selected[0].rank);
        const lastRank = rankIndex(last[0].rank);
        if (state.revolution)
            return selRank < lastRank;
        return selRank > lastRank;
    }
    if (isSequence(selected) && isSequence(last)) {
        const selMax = Math.max(...selected.map(c => rankIndex(c.rank)));
        const lastMax = Math.max(...last.map(c => rankIndex(c.rank)));
        if (state.revolution)
            return selMax < lastMax;
        return selMax > lastMax;
    }
    return false;
}
function applyPlay(state, playerIndex, cards) {
    const newHands = state.hands.map(h => [...h]);
    for (const c of cards) {
        const idx = newHands[playerIndex].findIndex(x => x.id === c.id);
        if (idx >= 0)
            newHands[playerIndex].splice(idx, 1);
    }
    const newPile = [...state.pile, { player: playerIndex, cards }];
    let revolution = state.revolution;
    if (cards.length === 4 && cards.every(c => c.rank === cards[0].rank)) {
        revolution = !revolution;
    }
    const has8 = cards.some(c => c.rank === '8');
    const finished = [...state.finished];
    if (newHands[playerIndex].length === 0)
        finished.push(playerIndex);
    const nextPlayer = (playerIndex + 1) % newHands.length;
    const newState = {
        hands: newHands,
        pile: has8 ? [] : newPile,
        currentPlayer: has8 ? nextPlayer : nextPlayer,
        revolution,
        finished
    };
    return newState;
}
