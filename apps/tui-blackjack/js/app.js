/**
 * BLACKJACK TERMINAL v1.0
 * Self-contained TUI Blackjack game
 * Works on file:// (direct double-click) and http:// (web server)
 */

(function () {
  'use strict';

  // --- AUDIO SYNTHESIZER ---
  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      try {
        if (typeof localStorage !== 'undefined') {
          const stored = localStorage.getItem('tui_blackjack_sfx');
          if (stored !== null) this.enabled = stored === 'true';
        }
      } catch (e) {}
    }

    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    toggle() {
      this.enabled = !this.enabled;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('tui_blackjack_sfx', this.enabled.toString());
        }
      } catch (e) {}
      if (this.enabled) this.playKey();
      return this.enabled;
    }

    playTone(freq, type = 'square', duration = 0.08, volume = 0.15, startTime = 0) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + startTime);

        gain.gain.setValueAtTime(volume, this.ctx.currentTime + startTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + startTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(this.ctx.currentTime + startTime);
        osc.stop(this.ctx.currentTime + startTime + duration);
      } catch (e) {}
    }

    playKey() {
      this.playTone(1200, 'sine', 0.03, 0.05);
    }

    playCard() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;

      try {
        const bufferSize = Math.floor(this.ctx.sampleRate * 0.05);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1200, this.ctx.currentTime);
        filter.Q.setValueAtTime(2, this.ctx.currentTime);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start();
        this.playTone(280, 'square', 0.04, 0.07);
      } catch (e) {}
    }

    playChip() {
      this.playTone(1800, 'sine', 0.04, 0.1);
      this.playTone(2400, 'sine', 0.06, 0.08, 0.02);
    }

    playWin() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        this.playTone(freq, 'square', 0.1, 0.12, idx * 0.08);
      });
    }

    playBlackjack() {
      const notes = [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.51];
      notes.forEach((freq, idx) => {
        this.playTone(freq, 'triangle', 0.14, 0.18, idx * 0.09);
      });
    }

    playBust() {
      const notes = [280, 230, 190, 150];
      notes.forEach((freq, idx) => {
        this.playTone(freq, 'sawtooth', 0.12, 0.15, idx * 0.09);
      });
    }

    playPush() {
      this.playTone(440, 'triangle', 0.1, 0.1);
      this.playTone(440, 'triangle', 0.1, 0.1, 0.12);
    }
  }

  const sound = new SoundEngine();

  // --- DECK & CARDS ---
  const SUITS = [
    { symbol: '♠', name: 'spades', isRed: false },
    { symbol: '♣', name: 'clubs', isRed: false },
    { symbol: '♥', name: 'hearts', isRed: true },
    { symbol: '♦', name: 'diamonds', isRed: true },
  ];

  const RANKS = [
    { symbol: '2', values: [2] },
    { symbol: '3', values: [3] },
    { symbol: '4', values: [4] },
    { symbol: '5', values: [5] },
    { symbol: '6', values: [6] },
    { symbol: '7', values: [7] },
    { symbol: '8', values: [8] },
    { symbol: '9', values: [9] },
    { symbol: '10', values: [10] },
    { symbol: 'J', values: [10] },
    { symbol: 'Q', values: [10] },
    { symbol: 'K', values: [10] },
    { symbol: 'A', values: [1, 11] },
  ];

  class Card {
    constructor(rank, suit, isHidden = false) {
      this.rank = rank.symbol;
      this.values = rank.values;
      this.suit = suit.symbol;
      this.suitName = suit.name;
      this.isRed = suit.isRed;
      this.isHidden = isHidden;
    }

    get displayName() {
      return `${this.rank}${this.suit}`;
    }
  }

  class Shoe {
    constructor(deckCount = 1) {
      this.deckCount = deckCount;
      this.cards = [];
      this.totalCards = deckCount * 52;
      this.reset();
    }

    reset() {
      this.cards = [];
      for (let d = 0; d < this.deckCount; d++) {
        for (const suit of SUITS) {
          for (const rank of RANKS) {
            this.cards.push(new Card(rank, suit));
          }
        }
      }
      this.shuffle();
    }

    shuffle() {
      for (let i = this.cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
      }
    }

    draw(isHidden = false) {
      if (this.cards.length === 0) {
        this.reset();
      }
      const card = this.cards.pop();
      card.isHidden = isHidden;
      return card;
    }

    get remaining() {
      return this.cards.length;
    }

    get countString() {
      return `${this.cards.length}/${this.totalCards}`;
    }
  }

  // --- GAME LOGIC ---
  const GamePhase = {
    BETTING: 'BETTING',
    PLAYERTURN: 'PLAYERTURN',
    SPLIT_1: 'SPLIT_1',
    SPLIT_2: 'SPLIT_2',
    DEALERTURN: 'DEALERTURN',
    ROUNDOVER: 'ROUNDOVER',
  };

  class BlackjackGame {
    constructor() {
      this.deckCount = 1;
      this.shoe = new Shoe(this.deckCount);

      this.bankroll = this.loadBankroll();
      this.bet = 0; // Starts at $0 as requested
      this.phase = GamePhase.BETTING;

      this.dealerHand = [];
      this.playerHands = [[]];
      this.activeHandIndex = 0;
      this.handBets = [0];
      this.handResults = [];

      this.stats = this.loadStats();
      this.historyMessage = 'Place your bet and press [DEAL] or [Space].';
    }

    loadBankroll() {
      if (typeof localStorage === 'undefined') return 1000;
      try {
        const saved = localStorage.getItem('tui_blackjack_bank');
        const val = saved ? parseInt(saved, 10) : 1000;
        return isNaN(val) || val <= 0 ? 1000 : val;
      } catch {
        return 1000;
      }
    }

    saveBankroll() {
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.setItem('tui_blackjack_bank', this.bankroll.toString());
      } catch {}
    }

    loadStats() {
      const defaultStats = { played: 0, won: 0, lost: 0, pushed: 0, blackjacks: 0 };
      if (typeof localStorage === 'undefined') return defaultStats;
      try {
        const saved = localStorage.getItem('tui_blackjack_stats');
        return saved ? { ...defaultStats, ...JSON.parse(saved) } : defaultStats;
      } catch {
        return defaultStats;
      }
    }

    saveStats() {
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.setItem('tui_blackjack_stats', JSON.stringify(this.stats));
      } catch {}
    }

    resetBankroll() {
      this.bankroll = 1000;
      this.bet = 0;
      this.saveBankroll();
    }

    adjustBet(delta) {
      if (this.phase !== GamePhase.BETTING && this.phase !== GamePhase.ROUNDOVER) return false;
      const newBet = Math.max(0, Math.min(this.bet + delta, this.bankroll));
      this.bet = newBet;
      return true;
    }

    clearBet() {
      if (this.phase !== GamePhase.BETTING && this.phase !== GamePhase.ROUNDOVER) return false;
      this.bet = 0;
      return true;
    }

    allIn() {
      if (this.phase !== GamePhase.BETTING && this.phase !== GamePhase.ROUNDOVER) return false;
      this.bet = this.bankroll;
      return true;
    }

    calculateScore(hand, includeHidden = false) {
      const visibleCards = hand.filter(card => includeHidden || !card.isHidden);
      if (visibleCards.length === 0) return { total: 0, isBust: false, isBlackjack: false };

      let total = 0;
      let aces = 0;

      for (const card of visibleCards) {
        if (card.rank === 'A') {
          aces++;
        } else if (['K', 'Q', 'J', '10'].includes(card.rank)) {
          total += 10;
        } else {
          total += parseInt(card.rank, 10);
        }
      }

      for (let i = 0; i < aces; i++) {
        if (total + 11 + (aces - 1 - i) <= 21) {
          total += 11;
        } else {
          total += 1;
        }
      }

      return {
        total,
        isBust: total > 21,
        isBlackjack: visibleCards.length === 2 && total === 21 && hand.length === 2,
      };
    }

    get playerHand() {
      return this.playerHands[this.activeHandIndex] || [];
    }

    get playerScore() {
      return this.calculateScore(this.playerHand).total;
    }

    get dealerScore() {
      if (this.dealerHand.length === 0) return 0;
      const hasHidden = this.dealerHand.some(c => c.isHidden);
      if (hasHidden) return '?';
      return this.calculateScore(this.dealerHand, true).total;
    }

    get dealerUpcard() {
      return this.dealerHand.find(c => !c.isHidden);
    }

    canDouble() {
      const hand = this.playerHand;
      const currentBet = this.handBets[this.activeHandIndex] || this.bet;
      return (
        (this.phase === GamePhase.PLAYERTURN || this.phase === GamePhase.SPLIT_1 || this.phase === GamePhase.SPLIT_2) &&
        hand.length === 2 &&
        this.bankroll >= currentBet
      );
    }

    canSplit() {
      if (this.phase !== GamePhase.PLAYERTURN) return false;
      if (this.playerHands.length > 1) return false;
      const hand = this.playerHands[0];
      return hand.length === 2 && hand[0].rank === hand[1].rank && this.bankroll >= this.bet;
    }

    canSurrender() {
      return this.phase === GamePhase.PLAYERTURN && this.playerHands.length === 1 && this.playerHands[0].length === 2;
    }

    startRound() {
      if (this.phase !== GamePhase.BETTING && this.phase !== GamePhase.ROUNDOVER) {
        return false;
      }

      if (this.bankroll < 5) {
        this.resetBankroll();
        this.historyMessage = 'Bankroll recharged to $1000 by casino credit.';
      }

      if (this.bet <= 0) {
        this.historyMessage = 'Please place a bet before dealing! Use [+5], [+25], or type bet amount.';
        return false;
      }

      if (this.bankroll < this.bet) {
        this.bet = this.bankroll;
      }

      if (this.shoe.remaining < 12) {
        this.shoe.reset();
      }

      this.bankroll -= this.bet;
      this.saveBankroll();

      this.playerHands = [[]];
      this.dealerHand = [];
      this.activeHandIndex = 0;
      this.handBets = [this.bet];
      this.handResults = [];

      // Deal 2 cards each
      this.playerHands[0].push(this.shoe.draw(false));
      this.dealerHand.push(this.shoe.draw(false));
      this.playerHands[0].push(this.shoe.draw(false));
      this.dealerHand.push(this.shoe.draw(true)); // hole card

      this.stats.played++;
      this.saveStats();

      const pScore = this.calculateScore(this.playerHands[0]);
      const dUp = this.dealerUpcard;

      if (pScore.isBlackjack) {
        this.revealDealerHole();
        const dScore = this.calculateScore(this.dealerHand, true);
        if (dScore.isBlackjack) {
          this.handResults[0] = 'PUSH';
          this.bankroll += this.bet;
          this.stats.pushed++;
          this.historyMessage = 'Push! Both dealer and player have Blackjack. Bet returned.';
        } else {
          this.handResults[0] = 'BLACKJACK';
          const winAmount = Math.floor(this.bet * 2.5);
          this.bankroll += winAmount;
          this.stats.won++;
          this.stats.blackjacks++;
          this.historyMessage = `BLACKJACK! Natural 21 pays 3:2! +$${winAmount - this.bet}`;
        }
        this.phase = GamePhase.ROUNDOVER;
        this.saveBankroll();
        this.saveStats();
        return { event: 'NATURAL_BLACKJACK' };
      }

      this.phase = GamePhase.PLAYERTURN;
      this.historyMessage = `Dealt hand. Your score: ${pScore.total}. Dealer showing: ${dUp ? dUp.rank : '?'}`;
      return { event: 'DEALT' };
    }

    hit() {
      if (this.phase !== GamePhase.PLAYERTURN && this.phase !== GamePhase.SPLIT_1 && this.phase !== GamePhase.SPLIT_2) {
        return null;
      }

      const hand = this.playerHand;
      const newCard = this.shoe.draw(false);
      hand.push(newCard);

      const score = this.calculateScore(hand);

      if (score.isBust) {
        this.handResults[this.activeHandIndex] = 'BUST';
        this.historyMessage = `Bust with ${score.total}! Hand lost: -$${this.handBets[this.activeHandIndex]}`;
        this.stats.lost++;
        this.saveStats();

        if (this.playerHands.length > 1 && this.activeHandIndex === 0) {
          this.activeHandIndex = 1;
          this.phase = GamePhase.SPLIT_2;
          const h2Score = this.calculateScore(this.playerHands[1]);
          this.historyMessage += ` | Now playing Hand 2 (Score: ${h2Score.total})`;
          return { event: 'BUST_NEXT_HAND', card: newCard };
        }

        const allBust = this.handResults.every(r => r === 'BUST');
        if (allBust) {
          this.revealDealerHole();
          this.phase = GamePhase.ROUNDOVER;
          this.saveBankroll();
          return { event: 'BUST_ALL', card: newCard };
        } else {
          return this.finishDealerTurn();
        }
      }

      if (score.total === 21) {
        this.historyMessage = `21! Automatically standing.`;
        return this.stand();
      }

      this.historyMessage = `Hit: ${newCard.displayName}. Your score: ${score.total}.`;
      return { event: 'HIT', card: newCard };
    }

    stand() {
      if (this.phase !== GamePhase.PLAYERTURN && this.phase !== GamePhase.SPLIT_1 && this.phase !== GamePhase.SPLIT_2) {
        return null;
      }

      if (this.playerHands.length > 1 && this.activeHandIndex === 0) {
        this.activeHandIndex = 1;
        this.phase = GamePhase.SPLIT_2;
        const h2Score = this.calculateScore(this.playerHands[1]);
        this.historyMessage = `Stood on Hand 1. Now playing Hand 2 (Score: ${h2Score.total})`;
        return { event: 'STAND_NEXT_HAND' };
      }

      return this.finishDealerTurn();
    }

    doubleDown() {
      if (!this.canDouble()) return null;

      const currentBet = this.handBets[this.activeHandIndex];
      this.bankroll -= currentBet;
      this.handBets[this.activeHandIndex] *= 2;
      this.saveBankroll();

      const newCard = this.shoe.draw(false);
      this.playerHand.push(newCard);

      const score = this.calculateScore(this.playerHand);
      if (score.isBust) {
        this.handResults[this.activeHandIndex] = 'BUST';
        this.historyMessage = `Doubled: ${newCard.displayName}. Bust with ${score.total}! Lost $${this.handBets[this.activeHandIndex]}`;
        this.stats.lost++;
        this.saveStats();

        if (this.playerHands.length > 1 && this.activeHandIndex === 0) {
          this.activeHandIndex = 1;
          this.phase = GamePhase.SPLIT_2;
          return { event: 'BUST_NEXT_HAND', card: newCard };
        }

        this.revealDealerHole();
        this.phase = GamePhase.ROUNDOVER;
        return { event: 'BUST_ALL', card: newCard };
      }

      this.historyMessage = `Doubled: ${newCard.displayName}. Final score: ${score.total}.`;
      return this.stand();
    }

    split() {
      if (!this.canSplit()) return null;

      this.bankroll -= this.bet;
      this.saveBankroll();

      const card1 = this.playerHands[0][0];
      const card2 = this.playerHands[0][1];

      this.playerHands = [
        [card1, this.shoe.draw(false)],
        [card2, this.shoe.draw(false)],
      ];
      this.handBets = [this.bet, this.bet];
      this.activeHandIndex = 0;
      this.phase = GamePhase.SPLIT_1;

      const score1 = this.calculateScore(this.playerHands[0]).total;
      this.historyMessage = `Split hand into two! Playing Hand 1 (Score: ${score1}).`;
      return { event: 'SPLIT' };
    }

    surrender() {
      if (!this.canSurrender()) return null;

      const refund = Math.floor(this.bet / 2);
      this.bankroll += refund;
      this.saveBankroll();
      this.revealDealerHole();

      this.stats.lost++;
      this.saveStats();

      this.phase = GamePhase.ROUNDOVER;
      this.historyMessage = `Surrendered. Half bet ($${refund}) returned.`;
      return { event: 'SURRENDER' };
    }

    revealDealerHole() {
      for (const c of this.dealerHand) {
        c.isHidden = false;
      }
    }

    finishDealerTurn() {
      this.phase = GamePhase.DEALERTURN;
      this.revealDealerHole();

      let dScore = this.calculateScore(this.dealerHand, true);
      while (dScore.total < 17) {
        const card = this.shoe.draw(false);
        this.dealerHand.push(card);
        dScore = this.calculateScore(this.dealerHand, true);
      }

      const results = [];
      for (let i = 0; i < this.playerHands.length; i++) {
        if (this.handResults[i] === 'BUST') {
          results.push(`Hand ${i + 1}: BUST (-$${this.handBets[i]})`);
          continue;
        }

        const pScore = this.calculateScore(this.playerHands[i]).total;
        const bet = this.handBets[i];

        if (dScore.isBust) {
          this.handResults[i] = 'WIN';
          this.bankroll += bet * 2;
          this.stats.won++;
          results.push(`Dealer busts! Win +$${bet}`);
        } else if (pScore > dScore.total) {
          this.handResults[i] = 'WIN';
          this.bankroll += bet * 2;
          this.stats.won++;
          results.push(`Win (${pScore} vs ${dScore.total}) +$${bet}`);
        } else if (pScore < dScore.total) {
          this.handResults[i] = 'LOSE';
          this.stats.lost++;
          results.push(`Dealer wins (${dScore.total} vs ${pScore}) -$${bet}`);
        } else {
          this.handResults[i] = 'PUSH';
          this.bankroll += bet;
          this.stats.pushed++;
          results.push(`Push (${pScore} vs ${dScore.total})`);
        }
      }

      this.saveBankroll();
      this.saveStats();
      this.phase = GamePhase.ROUNDOVER;

      const summary = results.join(' | ');
      const dealerSummary = dScore.isBust ? `Dealer busts at ${dScore.total}.` : `Dealer stands at ${dScore.total}.`;
      this.historyMessage = `${dealerSummary} ${summary}`;

      return { event: 'ROUND_FINISHED', dealerScore: dScore.total, results };
    }
  }

  // --- UI RENDERER ---
  class TerminalUI {
    constructor(game) {
      this.game = game;

      this.deckVal = document.getElementById('deck-val');
      this.phaseVal = document.getElementById('phase-val');
      this.betVal = document.getElementById('bet-val');
      this.bankVal = document.getElementById('bank-val');
      this.statsVal = document.getElementById('stats-val');

      this.dealerCardsRow = document.getElementById('dealer-cards');
      this.dealerScoreTag = document.getElementById('dealer-score');

      this.playerCardsRow = document.getElementById('player-cards');
      this.playerScoreTag = document.getElementById('player-score');
      this.splitContainer = document.getElementById('split-container');

      this.messageText = document.getElementById('message-text');
      this.actionButtons = document.getElementById('action-buttons');
      this.cmdInput = document.getElementById('cmd-input');

      this.sfxToggle = document.getElementById('sfx-toggle');
      this.crtToggle = document.getElementById('crt-toggle');
      this.themeToggle = document.getElementById('theme-toggle');

      this.currentThemeIndex = 0;
      this.themes = ['green', 'amber', 'cyan', 'classic'];

      this.initSettings();
    }

    initSettings() {
      if (this.sfxToggle) {
        this.sfxToggle.textContent = `[SFX: ${sound.enabled ? 'ON' : 'OFF'}]`;
      }

      try {
        const crtSaved = localStorage.getItem('tui_blackjack_crt');
        if (crtSaved === 'false') {
          document.body.classList.add('no-crt');
          if (this.crtToggle) this.crtToggle.textContent = '[CRT: OFF]';
        } else {
          if (this.crtToggle) this.crtToggle.textContent = '[CRT: ON]';
        }

        const themeSaved = localStorage.getItem('tui_blackjack_theme') || 'green';
        document.body.setAttribute('data-theme', themeSaved);
        this.currentThemeIndex = this.themes.indexOf(themeSaved);
        if (this.currentThemeIndex === -1) this.currentThemeIndex = 0;
        if (this.themeToggle) {
          this.themeToggle.textContent = `[THEME: ${this.themes[this.currentThemeIndex].toUpperCase()}]`;
        }
      } catch (e) {}
    }

    toggleTheme() {
      this.currentThemeIndex = (this.currentThemeIndex + 1) % this.themes.length;
      const theme = this.themes[this.currentThemeIndex];
      document.body.setAttribute('data-theme', theme);
      try {
        localStorage.setItem('tui_blackjack_theme', theme);
      } catch (e) {}
      if (this.themeToggle) {
        this.themeToggle.textContent = `[THEME: ${theme.toUpperCase()}]`;
      }
      sound.playKey();
    }

    toggleCrt() {
      const isNoCrt = document.body.classList.toggle('no-crt');
      try {
        localStorage.setItem('tui_blackjack_crt', (!isNoCrt).toString());
      } catch (e) {}
      if (this.crtToggle) {
        this.crtToggle.textContent = `[CRT: ${isNoCrt ? 'OFF' : 'ON'}]`;
      }
      sound.playKey();
      return isNoCrt;
    }

    toggleSfx() {
      const enabled = sound.toggle();
      if (this.sfxToggle) {
        this.sfxToggle.textContent = `[SFX: ${enabled ? 'ON' : 'OFF'}]`;
      }
      return enabled;
    }

    renderCard(card) {
      if (card.isHidden) {
        return `
          <div class="tui-card card-facedown" title="Hidden card">
            <div class="card-ascii-back">+---+
| # |
| # |</div>
          </div>
        `;
      }

      const suitClass = card.isRed ? 'suit-red' : '';
      return `
        <div class="tui-card ${suitClass}">
          <div class="card-top">${card.rank}<span class="suit-symbol">${card.suit}</span></div>
          <div class="card-center suit-symbol">${card.suit}</div>
          <div class="card-bottom">${card.rank}<span class="suit-symbol">${card.suit}</span></div>
        </div>
      `;
    }

    render() {
      const game = this.game;

      if (this.deckVal) this.deckVal.textContent = game.shoe.countString;
      if (this.phaseVal) this.phaseVal.textContent = game.phase;
      if (this.betVal) this.betVal.textContent = `$${game.bet}`;
      if (this.bankVal) this.bankVal.textContent = `$${game.bankroll}`;
      if (this.statsVal) {
        this.statsVal.textContent = `W:${game.stats.won} L:${game.stats.lost} P:${game.stats.pushed} BJ:${game.stats.blackjacks}`;
      }

      // Dealer Hand
      const dScore = game.dealerScore;
      if (this.dealerScoreTag) {
        this.dealerScoreTag.textContent = `(Score: ${dScore})`;
      }
      if (this.dealerCardsRow) {
        if (game.dealerHand.length === 0) {
          this.dealerCardsRow.innerHTML = `<div class="empty-cards-placeholder">[ WAITING FOR BET & DEAL ]</div>`;
        } else {
          this.dealerCardsRow.innerHTML = game.dealerHand.map(c => this.renderCard(c)).join('');
        }
      }

      // Player Hand
      if (game.playerHands.length > 1) {
        if (this.playerCardsRow) this.playerCardsRow.style.display = 'none';
        if (this.splitContainer) {
          this.splitContainer.style.display = 'flex';
          this.splitContainer.innerHTML = game.playerHands.map((hand, idx) => {
            const score = game.calculateScore(hand).total;
            const isActive = game.activeHandIndex === idx && (game.phase === GamePhase.SPLIT_1 || game.phase === GamePhase.SPLIT_2);
            const activeClass = isActive ? 'active-hand-indicator' : '';
            const betAmount = game.handBets[idx] || game.bet;
            const resultBadge = game.handResults[idx] ? `[${game.handResults[idx]}]` : '';

            return `
              <div class="hand-section ${activeClass}">
                <div class="hand-label">
                  [HAND ${idx + 1}] <span class="score-tag">(Score: ${score})</span>
                  <span class="score-tag">$${betAmount} ${resultBadge}</span>
                </div>
                <div class="hand-cards-row">
                  ${hand.map(c => this.renderCard(c)).join('')}
                </div>
              </div>
            `;
          }).join('');
        }
        if (this.playerScoreTag) this.playerScoreTag.textContent = '';
      } else {
        if (this.splitContainer) this.splitContainer.style.display = 'none';
        if (this.playerCardsRow) {
          this.playerCardsRow.style.display = 'flex';
          const singleHand = game.playerHands[0] || [];
          if (singleHand.length === 0) {
            this.playerCardsRow.innerHTML = `<div class="empty-cards-placeholder">[ PLACE BET TO RECEIVE HAND ]</div>`;
            if (this.playerScoreTag) this.playerScoreTag.textContent = `(Score: 0)`;
          } else {
            this.playerCardsRow.innerHTML = singleHand.map(c => this.renderCard(c)).join('');
            if (this.playerScoreTag) this.playerScoreTag.textContent = `(Score: ${game.playerScore})`;
          }
        }
      }

      // Message Banner
      if (this.messageText) {
        this.messageText.textContent = game.historyMessage;
      }

      // Action buttons
      this.renderButtons();
    }

    renderButtons() {
      const game = this.game;
      const isBetting = game.phase === GamePhase.BETTING || game.phase === GamePhase.ROUNDOVER;
      const isPlayerTurn = game.phase === GamePhase.PLAYERTURN || game.phase === GamePhase.SPLIT_1 || game.phase === GamePhase.SPLIT_2;

      let html = '';

      if (isBetting) {
        html = `
          <button class="tui-btn" data-action="bet-plus-5">[+$5]</button>
          <button class="tui-btn" data-action="bet-plus-25">[+$25]</button>
          <button class="tui-btn" data-action="bet-plus-50">[+$50]</button>
          <button class="tui-btn" data-action="bet-plus-100">[+$100]</button>
          <button class="tui-btn" data-action="bet-clear">[CLEAR $0]</button>
          <button class="tui-btn" data-action="bet-all-in">[ALL-IN]</button>
          <button class="tui-btn btn-deal" data-action="deal"><strong>[ DEAL (Space) ]</strong></button>
        `;
      } else if (isPlayerTurn) {
        const canDouble = game.canDouble();
        const canSplit = game.canSplit();
        const canSurrender = game.canSurrender();

        html = `
          <button class="tui-btn" data-action="hit">[ H: HIT ]</button>
          <button class="tui-btn" data-action="stand">[ S: STAND ]</button>
          <button class="tui-btn" data-action="double" ${!canDouble ? 'disabled' : ''}>[ D: DOUBLE ]</button>
          <button class="tui-btn" data-action="split" ${!canSplit ? 'disabled' : ''}>[ P: SPLIT ]</button>
          <button class="tui-btn" data-action="surrender" ${!canSurrender ? 'disabled' : ''}>[ R: SURRENDER ]</button>
        `;
      } else {
        html = `
          <button class="tui-btn" disabled>[ DEALER PLAYING... ]</button>
        `;
      }

      if (this.actionButtons) {
        this.actionButtons.innerHTML = html;
      }
    }
  }

  // --- INITIALIZATION & EVENT WIRING ---
  window.addEventListener('DOMContentLoaded', () => {
    const game = new BlackjackGame();
    const ui = new TerminalUI(game);

    const helpModal = document.getElementById('help-modal');
    const closeHelpBtn = document.getElementById('close-help-btn');
    const openHelpBtn = document.getElementById('help-toggle');

    if (openHelpBtn && helpModal) {
      openHelpBtn.addEventListener('click', () => {
        sound.playKey();
        helpModal.showModal();
      });
    }

    if (closeHelpBtn && helpModal) {
      closeHelpBtn.addEventListener('click', () => {
        sound.playKey();
        helpModal.close();
      });
    }

    if (ui.themeToggle) {
      ui.themeToggle.addEventListener('click', () => ui.toggleTheme());
    }
    if (ui.crtToggle) {
      ui.crtToggle.addEventListener('click', () => ui.toggleCrt());
    }
    if (ui.sfxToggle) {
      ui.sfxToggle.addEventListener('click', () => ui.toggleSfx());
    }

    const resetBankBtn = document.getElementById('reset-bank-toggle');
    if (resetBankBtn) {
      resetBankBtn.addEventListener('click', () => {
        game.resetBankroll();
        game.historyMessage = 'Bankroll reset to $1000. Bet reset to $0.';
        sound.playChip();
        ui.render();
      });
    }

    function executeAction(action, param) {
      sound.init();

      switch (action) {
        case 'deal': {
          if (game.phase !== GamePhase.BETTING && game.phase !== GamePhase.ROUNDOVER) {
            game.historyMessage = 'Hand is already in progress! Choose [H] Hit, [S] Stand, or [D] Double.';
            break;
          }
          if (game.bet <= 0) {
            // Default first bet to $25 if player presses Deal without selecting
            game.adjustBet(25);
          }
          sound.playChip();
          const res = game.startRound();
          if (res) {
            sound.playCard();
            if (res.event === 'NATURAL_BLACKJACK') {
              sound.playBlackjack();
            }
          }
          break;
        }
        case 'hit': {
          if (game.phase !== GamePhase.PLAYERTURN && game.phase !== GamePhase.SPLIT_1 && game.phase !== GamePhase.SPLIT_2) {
            game.historyMessage = 'Cannot hit before dealing! Place a bet and press [DEAL] or [Space].';
            break;
          }
          const res = game.hit();
          if (res) {
            sound.playCard();
            if (res.event === 'BUST_ALL') {
              sound.playBust();
            } else if (res.event === 'ROUND_FINISHED') {
              checkAndPlayEndSounds();
            }
          }
          break;
        }
        case 'stand': {
          if (game.phase !== GamePhase.PLAYERTURN && game.phase !== GamePhase.SPLIT_1 && game.phase !== GamePhase.SPLIT_2) {
            game.historyMessage = 'Cannot stand before dealing! Place a bet and press [DEAL] or [Space].';
            break;
          }
          sound.playKey();
          const res = game.stand();
          if (res && res.event === 'ROUND_FINISHED') {
            sound.playCard();
            checkAndPlayEndSounds();
          }
          break;
        }
        case 'double': {
          if (game.phase !== GamePhase.PLAYERTURN && game.phase !== GamePhase.SPLIT_1 && game.phase !== GamePhase.SPLIT_2) {
            game.historyMessage = 'Cannot double down before dealing! Place a bet and press [DEAL] or [Space].';
            break;
          }
          if (!game.canDouble()) {
            game.historyMessage = 'Cannot double down (requires initial 2 cards and sufficient bankroll).';
            break;
          }
          sound.playChip();
          const res = game.doubleDown();
          if (res) {
            sound.playCard();
            if (res.event === 'BUST_ALL') {
              sound.playBust();
            } else if (res.event === 'ROUND_FINISHED') {
              checkAndPlayEndSounds();
            }
          }
          break;
        }
        case 'split': {
          if (game.phase !== GamePhase.PLAYERTURN) {
            game.historyMessage = 'Cannot split now (only available on initial dealt pair).';
            break;
          }
          if (!game.canSplit()) {
            game.historyMessage = 'Cannot split (requires two cards of matching rank and sufficient bankroll).';
            break;
          }
          sound.playChip();
          const res = game.split();
          if (res) sound.playCard();
          break;
        }
        case 'surrender': {
          if (!game.canSurrender()) {
            game.historyMessage = 'Surrender is only allowed on your initial 2 cards.';
            break;
          }
          sound.playKey();
          game.surrender();
          sound.playBust();
          break;
        }
        case 'bet-plus-5':
          if (game.phase !== GamePhase.BETTING && game.phase !== GamePhase.ROUNDOVER) {
            game.historyMessage = 'Cannot change bet during an active hand!';
            break;
          }
          game.adjustBet(5);
          game.historyMessage = `Bet increased to $${game.bet}. Press [DEAL] or [Space] to play.`;
          sound.playChip();
          break;
        case 'bet-plus-25':
          if (game.phase !== GamePhase.BETTING && game.phase !== GamePhase.ROUNDOVER) {
            game.historyMessage = 'Cannot change bet during an active hand!';
            break;
          }
          game.adjustBet(25);
          game.historyMessage = `Bet increased to $${game.bet}. Press [DEAL] or [Space] to play.`;
          sound.playChip();
          break;
        case 'bet-plus-50':
          if (game.phase !== GamePhase.BETTING && game.phase !== GamePhase.ROUNDOVER) {
            game.historyMessage = 'Cannot change bet during an active hand!';
            break;
          }
          game.adjustBet(50);
          game.historyMessage = `Bet increased to $${game.bet}. Press [DEAL] or [Space] to play.`;
          sound.playChip();
          break;
        case 'bet-plus-100':
          if (game.phase !== GamePhase.BETTING && game.phase !== GamePhase.ROUNDOVER) {
            game.historyMessage = 'Cannot change bet during an active hand!';
            break;
          }
          game.adjustBet(100);
          game.historyMessage = `Bet increased to $${game.bet}. Press [DEAL] or [Space] to play.`;
          sound.playChip();
          break;
        case 'bet-clear':
          if (game.phase !== GamePhase.BETTING && game.phase !== GamePhase.ROUNDOVER) {
            game.historyMessage = 'Cannot clear bet during an active hand!';
            break;
          }
          game.clearBet();
          game.historyMessage = 'Bet cleared to $0. Place a bet to begin.';
          sound.playChip();
          break;
        case 'bet-all-in':
          if (game.phase !== GamePhase.BETTING && game.phase !== GamePhase.ROUNDOVER) {
            game.historyMessage = 'Cannot change bet during an active hand!';
            break;
          }
          game.allIn();
          game.historyMessage = `ALL-IN! Bet set to $${game.bet}. Press [DEAL] to play!`;
          sound.playChip();
          break;
        case 'bet-set':
          if (game.phase !== GamePhase.BETTING && game.phase !== GamePhase.ROUNDOVER) {
            game.historyMessage = 'Cannot change bet during an active hand!';
            break;
          }
          if (typeof param === 'number') {
            game.bet = Math.max(0, Math.min(param, game.bankroll));
            game.historyMessage = `Bet set to $${game.bet}. Press [DEAL] or [Space] to play.`;
            sound.playChip();
          }
          break;
      }

      ui.render();
    }

    function checkAndPlayEndSounds() {
      setTimeout(() => {
        const hasWin = game.handResults.some(r => r === 'WIN');
        const hasPush = game.handResults.some(r => r === 'PUSH');
        if (hasWin) {
          sound.playWin();
        } else if (hasPush) {
          sound.playPush();
        } else {
          sound.playBust();
        }
      }, 250);
    }

    if (ui.actionButtons) {
      ui.actionButtons.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn || btn.disabled) return;
        executeAction(btn.dataset.action);
      });
    }

    if (ui.cmdInput) {
      ui.cmdInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const raw = ui.cmdInput.value.trim().toLowerCase();
          ui.cmdInput.value = '';
          if (!raw) return;
          parseCommand(raw);
        }
      });
    }

    function parseCommand(cmd) {
      sound.playKey();

      if (cmd === 'help' || cmd === '?') {
        if (helpModal) helpModal.showModal();
        game.historyMessage = 'Command Manual opened. Press [Esc] or click [CLOSE] to return.';
        ui.render();
        return;
      }

      if (cmd === 'deal' || cmd === 'd' || cmd === 'start' || cmd === 'next') {
        executeAction('deal');
        return;
      }

      if (cmd === 'hit' || cmd === 'h') {
        executeAction('hit');
        return;
      }

      if (cmd === 'stand' || cmd === 's' || cmd === 'stay') {
        executeAction('stand');
        return;
      }

      if (cmd === 'double' || cmd === 'dd') {
        executeAction('double');
        return;
      }

      if (cmd === 'split' || cmd === 'sp') {
        executeAction('split');
        return;
      }

      if (cmd === 'surrender' || cmd === 'sur') {
        executeAction('surrender');
        return;
      }

      if (cmd.startsWith('bet ')) {
        const amount = parseInt(cmd.replace('bet ', '').replace('$', '').trim(), 10);
        if (!isNaN(amount) && amount >= 0) {
          executeAction('bet-set', amount);
        } else {
          game.historyMessage = `Invalid bet amount: '${cmd}'. Use e.g. 'bet 50'.`;
          ui.render();
        }
        return;
      }

      if (cmd === 'allin' || cmd === 'all-in') {
        executeAction('bet-all-in');
        return;
      }

      if (cmd === 'clear' || cmd === 'zero') {
        executeAction('bet-clear');
        return;
      }

      if (cmd === 'reset') {
        game.resetBankroll();
        game.historyMessage = 'Bankroll reset to $1000. Bet reset to $0.';
        ui.render();
        return;
      }

      if (cmd === 'crt') {
        const isNoCrt = ui.toggleCrt();
        game.historyMessage = `CRT scanlines turned ${isNoCrt ? 'OFF' : 'ON'}.`;
        ui.render();
        return;
      }

      if (cmd === 'sfx' || cmd === 'sound' || cmd === 'mute') {
        const enabled = ui.toggleSfx();
        game.historyMessage = `Sound effects ${enabled ? 'ENABLED' : 'MUTED'}.`;
        ui.render();
        return;
      }

      if (cmd.startsWith('theme')) {
        const parts = cmd.split(' ');
        if (parts[1] && ui.themes.includes(parts[1])) {
          document.body.setAttribute('data-theme', parts[1]);
          try {
            localStorage.setItem('tui_blackjack_theme', parts[1]);
          } catch (e) {}
          ui.currentThemeIndex = ui.themes.indexOf(parts[1]);
          if (ui.themeToggle) ui.themeToggle.textContent = `[THEME: ${parts[1].toUpperCase()}]`;
          game.historyMessage = `Theme switched to ${parts[1].toUpperCase()} phosphor.`;
        } else {
          ui.toggleTheme();
          game.historyMessage = `Theme switched to ${ui.themes[ui.currentThemeIndex].toUpperCase()} phosphor.`;
        }
        ui.render();
        return;
      }

      game.historyMessage = `Unknown command: '${cmd}'. Type 'help' for manual.`;
      ui.render();
    }

    window.addEventListener('keydown', (e) => {
      if (document.activeElement === ui.cmdInput) return;
      if (helpModal && helpModal.open) {
        if (e.key === 'Escape') helpModal.close();
        return;
      }

      const key = e.key.toUpperCase();

      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        if (game.phase === GamePhase.BETTING || game.phase === GamePhase.ROUNDOVER) {
          executeAction('deal');
        }
        return;
      }

      if (game.phase === GamePhase.PLAYERTURN || game.phase === GamePhase.SPLIT_1 || game.phase === GamePhase.SPLIT_2) {
        if (key === 'H') executeAction('hit');
        else if (key === 'S') executeAction('stand');
        else if (key === 'D') executeAction('double');
        else if (key === 'P') executeAction('split');
        else if (key === 'R' || key === 'U') executeAction('surrender');
      } else if (game.phase === GamePhase.BETTING || game.phase === GamePhase.ROUNDOVER) {
        if (key === '1') executeAction('bet-plus-5');
        else if (key === '2') executeAction('bet-plus-25');
        else if (key === '3') executeAction('bet-plus-50');
        else if (key === '4') executeAction('bet-plus-100');
        else if (key === 'C') executeAction('bet-clear');
        else if (key === 'A') executeAction('bet-all-in');
      }

      if (key === 'T') ui.toggleTheme();
      else if (key === 'O') ui.toggleCrt();
      else if (key === 'M') ui.toggleSfx();
      else if (e.key === '?') {
        if (helpModal) helpModal.showModal();
      }
    });

    // Initial render with default zero / complete deck state
    ui.render();
  });
})();
