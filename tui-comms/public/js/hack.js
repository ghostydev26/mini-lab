/**
 * ============================================================================
 * ROBCO HACKING MINIGAME (hack.js)
 * Authentic Fallout 3/NV/4 terminal bracket-matching password puzzle
 * ============================================================================
 */

class RobCoHackGame {
  constructor() {
    this.wordPool = [
      'ACCESS', 'ATOMIC', 'BUNKER', 'MUTANT', 'RADIUS', 'SILVER',
      'VAULTS', 'SECTOR', 'TURRET', 'BEACON', 'SYSTEM', 'ENERGY',
      'PISTOL', 'ROBOTS', 'GHOULS', 'RAIDER', 'SECURE', 'CYPHER',
      'SERVER', 'MATRIX', 'DEFEND', 'PLASMA', 'VISION', 'SIGNAL'
    ];

    this.numLines = 16;
    this.charsPerLine = 12;
    this.wordLength = 6;
    this.wordsInPuzzle = 10;
    this.maxAttempts = 4;
    this.attemptsLeft = 4;
    this.targetWord = '';
    this.words = [];
    this.gridData = []; // Array of { addr, raw, tokens: [{type, text, val, id}] }
    this.dudsRemoved = new Set();
    this.usedBrackets = new Set();
    this.isLocked = false;
    this.isWon = false;

    // DOM References
    this.overlay = null;
    this.leftCol = null;
    this.rightCol = null;
    this.attemptsEl = null;
    this.logEl = null;
    this.selectedWordEl = null;
  }

  init(domElements) {
    this.overlay = domElements.overlay;
    this.leftCol = domElements.leftCol;
    this.rightCol = domElements.rightCol;
    this.attemptsEl = domElements.attemptsEl;
    this.logEl = domElements.logEl;
    this.selectedWordEl = domElements.selectedWordEl;

    if (domElements.closeBtn) {
      domElements.closeBtn.addEventListener('click', () => {
        window.robcoAudio.playKeyClick();
        this.close();
      });
    }
  }

  start() {
    this.attemptsLeft = this.maxAttempts;
    this.dudsRemoved.clear();
    this.usedBrackets.clear();
    this.isLocked = false;
    this.isWon = false;

    this.logEl.innerHTML = '';
    this.selectedWordEl.textContent = '';
    this.addLog('ROBCO INDUSTRIES (TM) TERMLINK');
    this.addLog('PASSWORD REQUIRED');
    this.addLog('HINT: BRACKET PAIRS REMOVE DUDS');

    this.generatePuzzle();
    this.render();
    this.overlay.classList.add('active');

    window.robcoAudio.playBootHum();
  }

  close() {
    this.overlay.classList.remove('active');
  }

  generatePuzzle() {
    // 1. Pick distinct words of same length
    const shuffledPool = [...this.wordPool].sort(() => 0.5 - Math.random());
    this.words = shuffledPool.slice(0, this.wordsInPuzzle);
    this.targetWord = this.words[Math.floor(Math.random() * this.words.length)];

    const totalLines = this.numLines * 2; // Left and right columns
    const totalChars = totalLines * this.charsPerLine;

    // 2. Distribute words evenly across memory space
    const charArray = new Array(totalChars);
    const symbols = '!@#$%^&*()[]{}<>\\/|:;\'",.?_+=~-';

    for (let i = 0; i < totalChars; i++) {
      charArray[i] = symbols[Math.floor(Math.random() * symbols.length)];
    }

    // Place words at intervals
    const interval = Math.floor(totalChars / this.words.length);
    this.wordPlacements = [];

    this.words.forEach((word, idx) => {
      const minPos = idx * interval;
      const maxPos = minPos + interval - this.wordLength - 2;
      const startPos = Math.max(0, Math.min(totalChars - this.wordLength, Math.floor(minPos + Math.random() * (maxPos - minPos + 1))));
      
      for (let c = 0; c < this.wordLength; c++) {
        charArray[startPos + c] = word[c];
      }
      this.wordPlacements.push({ word, start: startPos, end: startPos + this.wordLength });
    });

    // 3. Construct lines with addresses
    let baseAddr = 0xF000 + Math.floor(Math.random() * 0x0800);
    this.gridData = [];

    for (let line = 0; line < totalLines; line++) {
      const addrHex = '0x' + (baseAddr + line * 12).toString(16).toUpperCase();
      const lineStart = line * this.charsPerLine;
      const lineChars = charArray.slice(lineStart, lineStart + this.charsPerLine);
      
      this.gridData.push({
        lineIndex: line,
        addr: addrHex,
        chars: lineChars,
        lineStart
      });
    }
  }

  render() {
    this.renderAttempts();
    this.leftCol.innerHTML = '';
    this.rightCol.innerHTML = '';

    const half = this.numLines;
    this.gridData.forEach((row, idx) => {
      const lineDiv = this.createLineElement(row);
      if (idx < half) {
        this.leftCol.appendChild(lineDiv);
      } else {
        this.rightCol.appendChild(lineDiv);
      }
    });
  }

  renderAttempts() {
    this.attemptsEl.innerHTML = '';
    for (let i = 0; i < this.maxAttempts; i++) {
      const block = document.createElement('span');
      block.className = 'attempt-block';
      if (i >= this.attemptsLeft) {
        block.style.background = 'transparent';
        block.style.border = '1px solid var(--phosphor-dim)';
      }
      this.attemptsEl.appendChild(block);
    }
  }

  createLineElement(row) {
    const lineEl = document.createElement('div');
    lineEl.className = 'memory-line';

    const addrEl = document.createElement('span');
    addrEl.className = 'memory-address';
    addrEl.textContent = row.addr;
    lineEl.appendChild(addrEl);

    const dataEl = document.createElement('span');
    dataEl.className = 'memory-data';

    // Parse tokens (words, bracket pairs, or individual symbols)
    const tokens = this.parseLineTokens(row);

    tokens.forEach(tok => {
      const span = document.createElement('span');
      span.className = 'hack-char';
      span.textContent = tok.text;
      span.dataset.type = tok.type;
      span.dataset.val = tok.val;
      span.dataset.id = tok.id;

      span.addEventListener('mouseenter', () => {
        if (this.isLocked || this.isWon) return;
        this.selectedWordEl.textContent = tok.val;
        span.classList.add('highlight');
        window.robcoAudio.playKeyClick();
      });

      span.addEventListener('mouseleave', () => {
        this.selectedWordEl.textContent = '';
        span.classList.remove('highlight');
      });

      span.addEventListener('click', () => {
        if (this.isLocked || this.isWon) return;
        this.handleTokenClick(tok);
      });

      dataEl.appendChild(span);
    });

    lineEl.appendChild(dataEl);
    return lineEl;
  }

  parseLineTokens(row) {
    const tokens = [];
    const chars = [...row.chars];
    let i = 0;

    while (i < chars.length) {
      const absPos = row.lineStart + i;

      // Check if absPos matches any word
      const wordMatch = this.wordPlacements.find(wp => wp.start <= absPos && absPos < wp.end);
      if (wordMatch) {
        const wordOffset = absPos - wordMatch.start;
        const remainingInWord = wordMatch.word.length - wordOffset;
        const availableInLine = chars.length - i;
        const chunkLen = Math.min(remainingInWord, availableInLine);
        const chunkText = wordMatch.word.substring(wordOffset, wordOffset + chunkLen);

        const isDud = this.dudsRemoved.has(wordMatch.word);
        tokens.push({
          type: 'WORD',
          text: isDud ? '.'.repeat(chunkLen) : chunkText,
          val: isDud ? '........' : wordMatch.word,
          id: `w_${wordMatch.word}`
        });

        i += chunkLen;
        continue;
      }

      // Check for bracket pairs within this single line
      const ch = chars[i];
      const matchMap = { '(': ')', '[': ']', '{': '}', '<': '>' };
      if (matchMap[ch]) {
        const closer = matchMap[ch];
        const closeIdx = chars.indexOf(closer, i + 1);

        // Valid bracket pair if closing is found and contains no words
        if (closeIdx !== -1) {
          const bracketLen = closeIdx - i + 1;
          const sliceText = chars.slice(i, closeIdx + 1).join('');
          const bracketId = `b_${row.lineStart + i}`;
          const isUsed = this.usedBrackets.has(bracketId);

          if (!/[A-Z]/.test(sliceText)) {
            tokens.push({
              type: 'BRACKET',
              text: isUsed ? '.'.repeat(bracketLen) : sliceText,
              val: isUsed ? '........' : sliceText,
              id: bracketId,
              lineStart: row.lineStart + i,
              length: bracketLen
            });
            i += bracketLen;
            continue;
          }
        }
      }

      // Plain symbol token
      tokens.push({
        type: 'CHAR',
        text: chars[i],
        val: chars[i],
        id: `c_${absPos}`
      });
      i++;
    }

    return tokens;
  }

  handleTokenClick(tok) {
    if (tok.type === 'WORD') {
      if (this.dudsRemoved.has(tok.val)) {
        return;
      }
      this.checkWordGuess(tok.val);
    } else if (tok.type === 'BRACKET') {
      if (this.usedBrackets.has(tok.id)) {
        return;
      }
      this.handleBracketClick(tok);
    } else {
      window.robcoAudio.playHackSound('select');
      this.addLog(`> ${tok.val}`);
      this.addLog('> ERROR: INVALID INPUT');
    }
  }

  checkWordGuess(word) {
    this.addLog(`> ${word}`);

    if (word === this.targetWord) {
      // SUCCESS!
      this.isWon = true;
      this.addLog('> EXACT MATCH!');
      this.addLog('> PLEASE WAIT WHILE SYSTEM');
      this.addLog('> IS ACCESSED.');
      this.addLog('> ACCESS GRANTED.');
      window.robcoAudio.playHackSound('win');

      // Grant Overseer privilege & announce in chat
      if (window.vaultProtocol) {
        window.vaultProtocol.sendBroadcast(`*** OVERSEER TERMINAL BYPASSED BY ${window.vaultProtocol.nodeId} ***`);
      }

      setTimeout(() => {
        this.close();
      }, 2500);
      return;
    }

    // Likeness calculation
    let likeness = 0;
    for (let i = 0; i < word.length; i++) {
      if (word[i] === this.targetWord[i]) likeness++;
    }

    this.attemptsLeft--;
    this.renderAttempts();
    window.robcoAudio.playHackSound('wrong');

    this.addLog('> ENTRY DENIED.');
    this.addLog(`> LIKENESS=${likeness}/${this.wordLength}`);

    if (this.attemptsLeft <= 0) {
      this.isLocked = true;
      this.addLog('> TERMINAL LOCKED OUT.');
      this.addLog('> PLEASE CONTACT AN ADMINISTRATOR.');
      
      let countdown = 8;
      const interval = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
          clearInterval(interval);
          this.start(); // Restart puzzle
        }
      }, 1000);
    }
  }

  handleBracketClick(tok) {
    this.usedBrackets.add(tok.id);
    this.addLog(`> ${tok.val}`);

    // 25% chance of resetting tries, 75% chance of dud removal
    const remainingDuds = this.words.filter(w => w !== this.targetWord && !this.dudsRemoved.has(w));

    if (this.attemptsLeft < this.maxAttempts && (Math.random() < 0.25 || remainingDuds.length === 0)) {
      this.attemptsLeft = this.maxAttempts;
      this.renderAttempts();
      this.addLog('> TRIES RESET.');
      window.robcoAudio.playHackSound('reset');
    } else if (remainingDuds.length > 0) {
      const dudToRemove = remainingDuds[Math.floor(Math.random() * remainingDuds.length)];
      this.dudsRemoved.add(dudToRemove);
      this.addLog('> DUD REMOVED.');
      window.robcoAudio.playHackSound('dud');
    } else {
      this.addLog('> NO ACTION TAKEN.');
      window.robcoAudio.playHackSound('select');
    }

    this.render();
  }

  addLog(msg) {
    const p = document.createElement('p');
    p.textContent = msg;
    this.logEl.appendChild(p);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }
}

// Global hack singleton
window.robcoHackGame = new RobCoHackGame();
