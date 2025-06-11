//const BACKEND_WS_URL = "ws://localhost:3000";
const BACKEND_WS_URL = "wss://reimagined-pancake-7p7pqrjpv64fgxg-3000.app.github.dev/";
const socket = new WebSocket(BACKEND_WS_URL);

// Game state
let gameState = {
  grid: 5, // 5x5 grid of dots
  lines: new Set(),
  squares: new Map(),
  currentPlayer: 1,
  scores: { 1: 0, 2: 0 },
  gameActive: false,
  playerId: null,
  hoveredLine: null,
  touchHoldTimer: null,
  touchStarted: false,
  gameMode: 'single', // default
};

// DOM elements
const gameBoard = document.getElementById("gameBoard");
const score1 = document.getElementById("score1");
const score2 = document.getElementById("score2");
const score1Mobile = document.getElementById("score1Mobile");
const score2Mobile = document.getElementById("score2Mobile");

const gameStatus = document.getElementById("gameStatus");
const gameStatusMobile = document.getElementById("gameStatusMobile");
const connectionDot = document.getElementById("connectionDot");
const connectionDotDesktop = document.getElementById("connectionDotDesktop");

// Get player score box elements for highlighting
const player1Box = document.querySelector(".game-info .player1");
const player2Box = document.querySelector(".game-info .player2");
const player1BoxMobile = document.querySelector(".game-info-compact .player1");
const player2BoxMobile = document.querySelector(".game-info-compact .player2");

// Background music variables
let backgroundMusic = null;
let backgroundMusicEnabled = false;
let hasUserInteracted = false;
let musicStartAttempts = 0;
let maxMusicAttempts = 3;

function updateGameStatus(message) {
  if (gameStatus) gameStatus.textContent = message;
  if (gameStatusMobile) gameStatusMobile.textContent = message;
}

function updateConnectionStatus(connected) {
  if (connectionDot) {
    if (connected) {
      connectionDot.classList.add("connected");
    } else {
      connectionDot.classList.remove("connected");
    }
  }
  if (connectionDotDesktop) {
    if (connected) {
      connectionDotDesktop.classList.add("connected");
    } else {
      connectionDotDesktop.classList.remove("connected");
    }
  }
}

function updateUI() {
  // Update scores with null checks
  if (score1) score1.textContent = gameState.scores[1];
  if (score2) score2.textContent = gameState.scores[2];
  if (score1Mobile) score1Mobile.textContent = gameState.scores[1];
  if (score2Mobile) score2Mobile.textContent = gameState.scores[2];

  // Update player turn indicators with transitions for smoother UI feedback
  if (player1Box) {
    player1Box.classList.toggle("current-turn", gameState.gameActive && gameState.currentPlayer === 1);
  }
  if (player2Box) {
    player2Box.classList.toggle("current-turn", gameState.gameActive && gameState.currentPlayer === 2);
  }
  if (player1BoxMobile) {
    player1BoxMobile.classList.toggle("current-turn", gameState.gameActive && gameState.currentPlayer === 1);
  }
  if (player2BoxMobile) {
    player2BoxMobile.classList.toggle("current-turn", gameState.gameActive && gameState.currentPlayer === 2);
  }

  updateCursorStyles();

  // If it's AI's turn in single player mode, trigger AI move
  if (gameState.gameMode === 'single' && 
      gameState.gameActive && 
      gameState.currentPlayer === 2) {
    setTimeout(aiMakeMove, 600);
  }
}

function updateCursorStyles() {
  const availableLines = document.querySelectorAll('.line.available');
  availableLines.forEach(line => {
    const lineGroup = line.parentElement;
    if (lineGroup) {
      if (gameState.gameActive && gameState.currentPlayer === gameState.playerId) {
        lineGroup.style.cursor = "pointer";
        lineGroup.classList.remove("disabled");
        line.classList.remove("disabled");
        line.style.opacity = "0.7";
      } else {
        lineGroup.style.cursor = "not-allowed";
        lineGroup.classList.add("disabled");
        line.classList.add("disabled");
        line.style.opacity = "0.3";
      }
    }
  });
}

// Initialize game board
function initializeBoard() {
  gameBoard.innerHTML = "";
  const boardSize = 400;
  const boardPadding = 24; // px margin from edge
  const spacing = (boardSize - 2 * boardPadding) / (gameState.grid - 1);

  // Create dots
  for (let row = 0; row < gameState.grid; row++) {
    for (let col = 0; col < gameState.grid; col++) {
      const dot = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      dot.setAttribute("cx", boardPadding + col * spacing);
      dot.setAttribute("cy", boardPadding + row * spacing);
      dot.setAttribute("r", 6);
      dot.classList.add("dot");
      dot.setAttribute("data-row", row);
      dot.setAttribute("data-col", col);
      gameBoard.appendChild(dot);
    }
  }

  // Create potential lines (horizontal and vertical)
  createPotentialLines(boardPadding, spacing);
  createSquareAreas(boardPadding, spacing);
}

function createPotentialLines(boardPadding = 0, spacing = 100) {
  // Horizontal lines
  for (let row = 0; row < gameState.grid; row++) {
    for (let col = 0; col < gameState.grid - 1; col++) {
      const lineGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "line");
      hitArea.setAttribute("x1", boardPadding + col * spacing);
      hitArea.setAttribute("y1", boardPadding + row * spacing);
      hitArea.setAttribute("x2", boardPadding + (col + 1) * spacing);
      hitArea.setAttribute("y2", boardPadding + row * spacing);
      hitArea.setAttribute("stroke", "transparent");
      hitArea.setAttribute("stroke-width", "20");
      hitArea.setAttribute("stroke-linecap", "round");
      hitArea.classList.add("hit-area");
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", boardPadding + col * spacing);
      line.setAttribute("y1", boardPadding + row * spacing);
      line.setAttribute("x2", boardPadding + (col + 1) * spacing);
      line.setAttribute("y2", boardPadding + row * spacing);
      line.classList.add("line", "available");
      line.setAttribute("data-type", "horizontal");
      line.setAttribute("data-row", row);
      line.setAttribute("data-col", col);
      line.style.pointerEvents = "none";
      setupLineEvents(lineGroup, line);
      lineGroup.appendChild(hitArea);
      lineGroup.appendChild(line);
      gameBoard.appendChild(lineGroup);
    }
  }
  // Vertical lines
  for (let row = 0; row < gameState.grid - 1; row++) {
    for (let col = 0; col < gameState.grid; col++) {
      const lineGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "line");
      hitArea.setAttribute("x1", boardPadding + col * spacing);
      hitArea.setAttribute("y1", boardPadding + row * spacing);
      hitArea.setAttribute("x2", boardPadding + col * spacing);
      hitArea.setAttribute("y2", boardPadding + (row + 1) * spacing);
      hitArea.setAttribute("stroke", "transparent");
      hitArea.setAttribute("stroke-width", "20");
      hitArea.setAttribute("stroke-linecap", "round");
      hitArea.classList.add("hit-area");
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", boardPadding + col * spacing);
      line.setAttribute("y1", boardPadding + row * spacing);
      line.setAttribute("x2", boardPadding + col * spacing);
      line.setAttribute("y2", boardPadding + (row + 1) * spacing);
      line.classList.add("line", "available");
      line.setAttribute("data-type", "vertical");
      line.setAttribute("data-row", row);
      line.setAttribute("data-col", col);
      line.style.pointerEvents = "none";
      setupLineEvents(lineGroup, line);
      lineGroup.appendChild(hitArea);
      lineGroup.appendChild(line);
      gameBoard.appendChild(lineGroup);
    }
  }
}

function createSquareAreas(boardPadding = 0, spacing = 100) {
  for (let row = 0; row < gameState.grid - 1; row++) {
    for (let col = 0; col < gameState.grid - 1; col++) {
      const square = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect",
      );
      // Use the exact same formula as dots/lines for alignment
      square.setAttribute("x", boardPadding + col * spacing);
      square.setAttribute("y", boardPadding + row * spacing);
      square.setAttribute("width", spacing);
      square.setAttribute("height", spacing);
      square.classList.add("square");
      square.setAttribute("data-row", row);
      square.setAttribute("data-col", col);
      square.style.display = "none";
      gameBoard.appendChild(square);
    }
  }
}

function setupLineEvents(lineGroup, line) {
  // Mouse events
  lineGroup.addEventListener("click", (e) => handleLineClick(e, line));
  lineGroup.addEventListener("mouseenter", (e) => handleLineHover(e, line, true));
  lineGroup.addEventListener("mouseleave", (e) => handleLineHover(e, line, false));
  
  // Touch events
  lineGroup.addEventListener("touchstart", (e) => handleTouchStart(e, line));
  lineGroup.addEventListener("touchend", (e) => handleTouchEnd(e, line));
  lineGroup.addEventListener("touchcancel", (e) => handleTouchCancel(e, line));
  
  // Prevent default touch behavior
  lineGroup.addEventListener("touchmove", (e) => e.preventDefault());
  
  lineGroup.style.cursor = "pointer";
}

function handleLineHover(event, line, isEntering) {
  if (!gameState.gameActive || !line.classList.contains("available")) {
    return;
  }
  
  if (gameState.currentPlayer !== gameState.playerId) {
    return;
  }
  
  if (isEntering) {
    gameState.hoveredLine = line;
    line.classList.add("hovered");
  } else {
    gameState.hoveredLine = null;
    line.classList.remove("hovered");
  }
}

function handleTouchStart(event, line) {
  event.preventDefault();
  
  if (!gameState.gameActive || !line.classList.contains("available")) {
    return;
  }
  
  if (gameState.currentPlayer !== gameState.playerId) {
    // Provide feedback that it's not their turn
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
    // Play error sound
    playSound('error');
    return;
  }
  
  // Clear any existing timer
  if (gameState.touchHoldTimer) {
    clearTimeout(gameState.touchHoldTimer);
  }
  
  // Immediately handle the line selection on touch start
  gameState.touchStarted = true;
  
  // Provide immediate haptic feedback
  if (navigator.vibrate) {
    navigator.vibrate(50);
  }
  
  // Immediately call handleLineClick for single tap selection
  handleLineClick(event, line);
}

function handleTouchEnd(event, line) {
  event.preventDefault();
  
  // Clear timer if any
  if (gameState.touchHoldTimer) {
    clearTimeout(gameState.touchHoldTimer);
    gameState.touchHoldTimer = null;
  }
  
  // Clean up touch state
  gameState.touchStarted = false;
  
  // Remove any preview states
  line.classList.remove("touch-preview");
  gameState.hoveredLine = null;
}

function handleTouchCancel(event, line) {
  event.preventDefault();
  
  // Clear timer and preview state
  if (gameState.touchHoldTimer) {
    clearTimeout(gameState.touchHoldTimer);
    gameState.touchHoldTimer = null;
  }
  
  // Clean up touch state
  gameState.touchStarted = false;
  line.classList.remove("touch-preview");
  gameState.hoveredLine = null;
}

function handleLineClick(event, line) {
  if (!gameState.gameActive || !line || !line.classList.contains("available")) {
    return;
  }

  // Check if it's the player's turn
  const isValidTurn = gameState.gameMode === 'single' 
    ? (event.ai || gameState.currentPlayer === 1) // Allow AI moves or player 1's moves in single player
    : (gameState.currentPlayer === gameState.playerId); // In multiplayer, check against server-assigned ID

  if (!isValidTurn) {
    // Provide visual feedback by briefly highlighting the current player's box
    const currentPlayerBox = gameState.currentPlayer === 1 ? player1Box : player2Box;
    const currentPlayerBoxMobile = gameState.currentPlayer === 1 ? player1BoxMobile : player2BoxMobile;
    
    if (currentPlayerBox) {
      currentPlayerBox.style.animation = "shake 0.5s ease-in-out";
      setTimeout(() => currentPlayerBox.style.animation = "", 500);
    }
    if (currentPlayerBoxMobile) {
      currentPlayerBoxMobile.style.animation = "shake 0.5s ease-in-out";
      setTimeout(() => currentPlayerBoxMobile.style.animation = "", 500);
    }
    return;
  }

  const type = line.getAttribute("data-type");
  const row = parseInt(line.getAttribute("data-row"));
  const col = parseInt(line.getAttribute("data-col"));
  const lineId = `${type}-${row}-${col}`;

  // Clear any hover/preview states
  line.classList.remove("hovered", "touch-preview");
  gameState.hoveredLine = null;
  
  // Provide immediate visual feedback
  line.classList.remove("available");
  line.classList.add(`player${gameState.currentPlayer}`);
  line.style.opacity = "0.8";
  
  // Disable the entire line group
  const lineGroup = line.parentElement;
  if (lineGroup) {
    lineGroup.style.pointerEvents = "none";
    lineGroup.style.cursor = "default";
  }

  // Play move sound
  playSound('move');

  // --- SINGLE PLAYER LOGIC ---
  if (gameState.gameMode === 'single') {
    // Update game state
    gameState.lines.add(lineId);
    
    // Check for completed squares
    const completedSquares = checkForCompletedSquares(lineId);
    let scored = false;
    
    if (completedSquares.length > 0) {
      completedSquares.forEach((squareKey) => {
        const [srow, scol] = squareKey.split("-").map(Number);
        completeSquare(srow, scol, gameState.currentPlayer);
      });
      scored = true;
      // Play completion sound and haptic feedback
      playSound('complete');
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100, 50, 100]);
      }
    }

    // Switch turns if no squares were completed
    if (!scored) {
      gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
    }

    updateUI(); // This will trigger AI move if it's AI's turn
    checkGameEnd();
    return;
  }

  // --- MULTIPLAYER LOGIC ---
  socket.send(
    JSON.stringify({
      type: "move",
      game: "dots-lines",
      lineId: lineId,
      player: gameState.playerId,
    })
  );
}

// Background music functions
function initializeBackgroundMusic() {
  backgroundMusic = new Audio('./background.mp3');
  backgroundMusic.loop = true;
  backgroundMusic.volume = 0.3;
  backgroundMusic.preload = 'auto';
  
  // Set up event listeners for when the audio can play
  backgroundMusic.addEventListener('canplaythrough', () => {
    updateGameStatus('🎵 Music ready - click anywhere to start');
    if (backgroundMusicEnabled && hasUserInteracted) {
      setTimeout(() => playBackgroundMusic(), 200);
    }
  });
  
  // Add play event listener
  backgroundMusic.addEventListener('play', () => {
    updateBackgroundMusicStatus();
  });
  
  // Add pause event listener
  backgroundMusic.addEventListener('pause', () => {
    updateBackgroundMusicStatus();
  });
  
  // Add error handling
  backgroundMusic.addEventListener('error', (e) => {
    console.error('Background music error:', e);
  });
  
  // Add load event
  backgroundMusic.addEventListener('loadeddata', () => {
    if (backgroundMusicEnabled && hasUserInteracted) {
      setTimeout(() => playBackgroundMusic(), 200);
    }
  });
  
  // Add loadstart event
  backgroundMusic.addEventListener('loadstart', () => {
    updateGameStatus('Loading background music...');
  });
}

function playBackgroundMusic() {
  if (backgroundMusic && backgroundMusicEnabled && hasUserInteracted) {
    // Reset to beginning if ended
    if (backgroundMusic.ended) {
      backgroundMusic.currentTime = 0;
    }
    
    musicStartAttempts++;
    
    const playPromise = backgroundMusic.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        musicStartAttempts = 0; // Reset attempts on success
        updateGameStatus('🎵 Background music playing');
        updateBackgroundMusicStatus();
      }).catch(e => {
        
        // Retry after a short delay if we haven't exceeded max attempts
        if (musicStartAttempts < maxMusicAttempts) {
          console.log(`Retrying in 1 second... (attempt ${musicStartAttempts}/${maxMusicAttempts})`);
          setTimeout(() => {
            if (backgroundMusicEnabled && hasUserInteracted) {
              playBackgroundMusic();
            }
          }, 1000);
        } else {
          console.log('Max music start attempts reached');
          musicStartAttempts = 0;
        }
        
        if (e.name === 'NotAllowedError') {
          console.log('User interaction required to play background music');
        }
      });
    }
  }
}

function pauseBackgroundMusic() {
  if (backgroundMusic) {
    backgroundMusic.pause();
    updateBackgroundMusicStatus();
  }
}

function toggleBackgroundMusic(enabled) {
  backgroundMusicEnabled = enabled;
  
  if (enabled && hasUserInteracted) {
    // Reset attempt counter when manually toggling
    musicStartAttempts = 0;
    setTimeout(() => playBackgroundMusic(), 100);
  } else {
    pauseBackgroundMusic();
  }
  updateBackgroundMusicStatus();
}

function updateBackgroundMusicStatus() {
  const toggle = document.getElementById('backgroundMusicEnabled');
  if (toggle) {
    toggle.checked = backgroundMusicEnabled;
  }
  
  const musicStatus = document.getElementById('musicStatus');
  if (musicStatus) {
    if (backgroundMusicEnabled && backgroundMusic && !backgroundMusic.paused) {
      musicStatus.textContent = '🎵';
      musicStatus.classList.add('playing');
    } else {
      musicStatus.textContent = '🔇';
      musicStatus.classList.remove('playing');
    }
  }
}

function setBackgroundMusicVolume(volume) {
  if (backgroundMusic) {
    backgroundMusic.volume = volume / 100; // Convert percentage to 0-1 range
  }
}

// Audio feedback functions
function playSound(type) {
  // Create audio context if not exists
  if (typeof window.audioContext === 'undefined') {
    try {
      window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      return; // Audio not supported
    }
  }
  
  const ctx = window.audioContext;
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  // Different sounds for different actions
  switch(type) {
    case 'move':
      oscillator.frequency.setValueAtTime(800, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      break;
    case 'preview':
      oscillator.frequency.setValueAtTime(600, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.05, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      break;
    case 'error':
      oscillator.frequency.setValueAtTime(200, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      break;
    case 'complete':
      oscillator.frequency.setValueAtTime(523, ctx.currentTime); // C5
      oscillator.frequency.setValueAtTime(659, ctx.currentTime + 0.1); // E5
      oscillator.frequency.setValueAtTime(784, ctx.currentTime + 0.2); // G5
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      break;
  }
  
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.3);
}

function drawLine(lineId, player) {
  const [type, row, col] = lineId.split("-");
  const line = document.querySelector(
    `[data-type="${type}"][data-row="${row}"][data-col="${col}"]`,
  );

  if (line) {
    line.classList.remove("available", "hovered", "touch-preview");
    line.classList.add(`player${player}`);
    line.style.opacity = "1";
    
    // Disable the entire line group
    const lineGroup = line.parentElement;
    if (lineGroup) {
      lineGroup.style.pointerEvents = "none";
      lineGroup.style.cursor = "default";
    }
    
    gameState.lines.add(lineId);
  }
}

function checkForCompletedSquares(lineId) {
  const [type, row, col] = lineId
    .split("-")
    .map((val, idx) => (idx === 0 ? val : parseInt(val)));
  const completedSquares = [];

  if (type === "horizontal") {
    // Check square above
    if (row > 0) {
      const squareKey = `${row - 1}-${col}`;
      if (isSquareComplete(row - 1, col)) {
        completedSquares.push(squareKey);
      }
    }
    // Check square below
    if (row < gameState.grid - 1) {
      const squareKey = `${row}-${col}`;
      if (isSquareComplete(row, col)) {
        completedSquares.push(squareKey);
      }
    }
  } else if (type === "vertical") {
    // Check square to the left
    if (col > 0) {
      const squareKey = `${row}-${col - 1}`;
      if (isSquareComplete(row, col - 1)) {
        completedSquares.push(squareKey);
      }
    }
    // Check square to the right
    if (col < gameState.grid - 1) {
      const squareKey = `${row}-${col}`;
      if (isSquareComplete(row, col)) {
        completedSquares.push(squareKey);
      }
    }
  }

  return completedSquares;
}

function isSquareComplete(row, col) {
  const requiredLines = [
    `horizontal-${row}-${col}`,
    `horizontal-${row + 1}-${col}`,
    `vertical-${row}-${col}`,
    `vertical-${row}-${col + 1}`,
  ];

  return requiredLines.every((lineId) => gameState.lines.has(lineId));
}

function completeSquare(row, col, player) {
  const squareKey = `${row}-${col}`;
  gameState.squares.set(squareKey, player);
  gameState.scores[player]++;

  const square = document.querySelector(
    `[data-row="${row}"][data-col="${col}"].square`,
  );
  if (square) {
    square.style.display = "block";
    square.classList.add(`player${player}`);
  }

  // Color the border lines of the completed square
  const borderLines = [
    { type: 'horizontal', r: row, c: col },
    { type: 'horizontal', r: row + 1, c: col },
    { type: 'vertical', r: row, c: col },
    { type: 'vertical', r: row, c: col + 1 },
  ];
  borderLines.forEach(({ type, r, c }) => {
    const line = document.querySelector(
      `[data-type="${type}"][data-row="${r}"][data-col="${c}"]`
    );
    if (line) {
      line.classList.remove('available', 'hovered', 'touch-preview', 'player1', 'player2');
      line.classList.add(`player${player}`);
      line.style.opacity = '1';
    }
  });
}



function checkGameEnd() {
  const totalSquares = (gameState.grid - 1) * (gameState.grid - 1);
  const completedSquares = gameState.squares.size;

  if (completedSquares === totalSquares) {
    gameState.gameActive = false;
    const winner =
      gameState.scores[1] > gameState.scores[2]
        ? 1
        : gameState.scores[2] > gameState.scores[1]
          ? 2
          : 0;

    if (winner === 0) {
      updateGameStatus("Game Over - It's a tie!");
      showCelebration("It's a Tie!", "Great game everyone!");
    } else if (winner === gameState.playerId) {
      updateGameStatus("Game Over - YOU won!");
      showCelebration("You Win!", "Congratulations!");
    } else {
      updateGameStatus("Game Over - You lost!");
      showCelebration("You Lose!", "Better luck next time!");
    }
    
    // Remove highlighting from all player boxes when game ends
    if (player1Box) player1Box.classList.remove("current-turn");
    if (player2Box) player2Box.classList.remove("current-turn");
    if (player1BoxMobile) player1BoxMobile.classList.remove("current-turn");
    if (player2BoxMobile) player2BoxMobile.classList.remove("current-turn");
  }
}

function showCelebration(title, subtitle) {
  // Create celebration overlay
  const overlay = document.createElement('div');
  overlay.className = 'celebration-overlay';
  
  // Create background pulse effect
  const backgroundPulse = document.createElement('div');
  backgroundPulse.className = 'celebration-background-pulse';
  overlay.appendChild(backgroundPulse);
  
  // Create confetti
  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.left = Math.random() * 100 + '%';
    confetti.style.animationDelay = Math.random() * 3 + 's';
    confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
    overlay.appendChild(confetti);
  }
  
  // Create fireworks
  for (let i = 0; i < 4; i++) {
    const firework = document.createElement('div');
    firework.className = 'fireworks';
    overlay.appendChild(firework);
  }
  
  // Create celebration content
  const content = document.createElement('div');
  content.className = 'celebration-content';
  
  const titleElement = document.createElement('h1');
  titleElement.className = 'celebration-title winner-glow';
  titleElement.textContent = title;
  
  const subtitleElement = document.createElement('p');
  subtitleElement.className = 'celebration-subtitle';
  subtitleElement.textContent = subtitle;
  
  const closeButton = document.createElement('button');
  closeButton.className = 'celebration-close';
  closeButton.textContent = 'Continue';
  closeButton.onclick = () => {
    overlay.classList.remove('active');
    setTimeout(() => {
      document.body.removeChild(overlay);
    }, 300);
  };
  
  content.appendChild(titleElement);
  content.appendChild(subtitleElement);
  content.appendChild(closeButton);
  overlay.appendChild(content);
  
  // Add to DOM and show
  document.body.appendChild(overlay);
  
  // Trigger celebration sound and vibration
  playSound('complete');
  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200, 100, 200, 100, 500]);
  }
  
  // Show overlay with slight delay for DOM update
  setTimeout(() => {
    overlay.classList.add('active');
  }, 10);
  
  // Auto-close after 5 seconds
  setTimeout(() => {
    if (overlay.classList.contains('active')) {
      closeButton.click();
    }
  }, 5000);
}

// --- GAME MODE SUPPORT ---
// Add gameMode to state: 'single' (vs AI) or 'multi' (online)
gameState.gameMode = 'single'; // default

// Store socket reference only for multiplayer
let multiplayerSocket = null;

// Utility: get selected mode from UI
function getSelectedGameMode() {
  const single = document.getElementById('modeSingle');
  return single && single.checked ? 'single' : 'multi';
}

// Utility: set connection indicators for offline
function setOfflineUI() {
  if (connectionDot) connectionDot.style.opacity = 0.3;
  if (connectionDotDesktop) connectionDotDesktop.style.opacity = 0.3;
}

// Utility: set connection indicators for online
function setOnlineUI() {
  if (connectionDot) connectionDot.style.opacity = 1;
  if (connectionDotDesktop) connectionDotDesktop.style.opacity = 1;
}

// --- AI LOGIC ---
function aiMakeMove() {
  // Only act if it's AI's turn and single player mode is active
  if (gameState.gameMode !== 'single' || !gameState.gameActive || gameState.currentPlayer !== 2) {
    return;
  }

  // Find all available lines
  const availableLines = Array.from(document.querySelectorAll('.line.available'));
  if (availableLines.length === 0) return;

  // Try to find a move that completes a square (greedy)
  let bestLine = null;
  for (const line of availableLines) {
    const type = line.getAttribute('data-type');
    const row = parseInt(line.getAttribute('data-row'));
    const col = parseInt(line.getAttribute('data-col'));
    const lineId = `${type}-${row}-${col}`;
    
    // Simulate adding this line
    gameState.lines.add(lineId);
    const completed = checkForCompletedSquares(lineId);
    gameState.lines.delete(lineId);
    
    if (completed.length > 0) {
      bestLine = line;
      break;
    }
  }

  // If no greedy move, pick random
  const chosenLine = bestLine || availableLines[Math.floor(Math.random() * availableLines.length)];
  // Execute the move
  if (chosenLine) {
    handleLineClick({ ai: true }, chosenLine);
  }
}

// --- MODE SWITCH HANDLER ---
function handleModeChange() {
  gameState.gameMode = getSelectedGameMode();
  if (gameState.gameMode === 'single') {
    setOfflineUI();
    resetGame();
  } else {
    setOnlineUI();
    // Only connect if not already connected
    if (!multiplayerSocket || multiplayerSocket.readyState !== 1) {
      connectWebSocket();
    }
    resetGame();
  }
}

// Attach mode change listeners
const modeSingle = document.getElementById('modeSingle');
const modeMulti = document.getElementById('modeMulti');
if (modeSingle && modeMulti) {
  modeSingle.addEventListener('change', handleModeChange);
  modeMulti.addEventListener('change', handleModeChange);
}

// WebSocket handlers
socket.onopen = () => {
  updateConnectionStatus(true);
  updateGameStatus("Connected - Waiting for players...");

  // Join dots-lines game
  const joinMessage = {
    type: "join",
    game: "dots-lines",
  };
  socket.send(JSON.stringify(joinMessage));
};

socket.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case "player-assigned":
        gameState.playerId = data.playerId;
        updateGameStatus(`You are Player ${data.playerId}`);
        break;

      case "game-start":
        gameState.gameActive = true;
        gameState.currentPlayer = 1;
        gameState.lines.clear();
        gameState.squares.clear();
        gameState.scores = { 1: 0, 2: 0 };
        updateGameStatus("Game started!");
        initializeBoard();
        updateUI();
        break;

      case "move-made":
        drawLine(data.lineId, data.player);

        // Update game state from server
        if (data.completedSquares) {
          data.completedSquares.forEach((squareKey) => {
            const [row, col] = squareKey.split("-").map((n) => parseInt(n));
            completeSquare(row, col, data.player);
          });
        }

        // Update scores and current player from server
        if (data.scores) {
          gameState.scores = data.scores;
        }
        if (data.currentPlayer !== undefined) {
          gameState.currentPlayer = data.currentPlayer;
        }

        // Play completion sound if squares were completed
        if (data.completedSquares && data.completedSquares.length > 0) {
          playSound('complete');
          // Extra haptic feedback for completing squares
          if (navigator.vibrate) {
            navigator.vibrate([100, 50, 100, 50, 100]);
          }
        }

        updateUI();
        checkGameEnd();
        break;

      case "game-ended-by-reset":
        // End the current game and declare winner
        gameState.gameActive = false;
        const winnerMessage = data.winner === gameState.playerId 
          ? `You win! ${data.reason}` 
          : `You lose! ${data.reason}`;
        updateGameStatus(winnerMessage);
        showCelebration(
          data.winner === gameState.playerId ? "You Win!" : "You Lose!",
          data.reason
        );
        
        // Remove highlighting from all player boxes when game ends
        if (player1Box) player1Box.classList.remove("current-turn");
        if (player2Box) player2Box.classList.remove("current-turn");
        if (player1BoxMobile) player1BoxMobile.classList.remove("current-turn");
        if (player2BoxMobile) player2BoxMobile.classList.remove("current-turn");
        break;

      case "game-ended":
        // Handle normal game end
        gameState.gameActive = false;
        updateGameStatus(data.reason);
        showCelebration(
          data.winner === gameState.playerId ? "You Win!" : 
          data.winner === 0 ? "It's a Tie!" : "You Lose!",
          data.reason
        );
        
        // Remove highlighting from all player boxes when game ends
        if (player1Box) player1Box.classList.remove("current-turn");
        if (player2Box) player2Box.classList.remove("current-turn");
        if (player1BoxMobile) player1BoxMobile.classList.remove("current-turn");
        if (player2BoxMobile) player2BoxMobile.classList.remove("current-turn");
        break;

      case "game-reset":
        resetGame();
        break;

      case "player-disconnected":
        updateGameStatus("Other player disconnected");
        gameState.gameActive = false;
        break;
    }
  } catch (err) {
    console.error("Invalid message from server:", event.data);
  }
};

socket.onerror = (e) => {
  console.error("WebSocket error", e);
  console.error("Error details:", e);
  updateConnectionStatus(false);
  updateGameStatus("Connection error");
};

socket.onclose = (event) => {
  console.warn("WebSocket connection closed", event);
  console.warn("Close code:", event.code, "Close reason:", event.reason);
  updateConnectionStatus(false);
  updateGameStatus("Disconnected from server");
  gameState.gameActive = false;
};

// --- START OVERLAY & MODE MODAL LOGIC ---
(function() {
  const startOverlay = document.getElementById('startOverlay');
  const startGameBtn = document.getElementById('startGameBtn');
  const modeModal = document.getElementById('modeModal');
  const singleModeBtn = document.getElementById('singleModeBtn');
  const multiModeBtn = document.getElementById('multiModeBtn');
  const container = document.querySelector('.container');

  // Helper to blur/unblur game area
  function setGameBlur(active) {
    if (active) {
      container.classList.add('blur-when-inactive');
    } else {
      container.classList.remove('blur-when-inactive');
    }
  }

  // Show overlay and blur on load
  setGameBlur(true);
  startOverlay.classList.add('active');
  modeModal.classList.add('hidden');

  // Enable/disable multiplayer button based on websocket
  function updateMultiBtn() {
    if (typeof socket !== 'undefined' && socket.readyState === 1) {
      multiModeBtn.disabled = false;
    } else {
      multiModeBtn.disabled = true;
    }
  }

  if (typeof socket !== 'undefined') {
    socket.addEventListener('open', updateMultiBtn);
    socket.addEventListener('close', updateMultiBtn);
    socket.addEventListener('error', updateMultiBtn);
  }
  setInterval(updateMultiBtn, 1000);

  // Fade helpers
  function fadeOut(el, cb) {
    el.style.transition = 'opacity 0.4s';
    el.style.opacity = 0;
    setTimeout(() => {
      el.classList.add('hidden');
      el.style.transition = '';
      el.style.opacity = '';
      el.style.display = 'none'; // Ensure overlay is not blocking
      if (cb) cb();
    }, 400);
  }

  // Start button click: hide overlay and show modal instantly (no fade, no animation)
  startGameBtn.addEventListener('click', function() {
    startOverlay.classList.remove('active');
    startOverlay.classList.add('hidden');
    startOverlay.style.transition = 'none';
    startOverlay.style.opacity = '';
    modeModal.classList.remove('hidden');
    modeModal.style.transition = 'none';
    modeModal.style.opacity = '';
    setTimeout(updateMultiBtn, 100);
  });

  // Mode selection (keep fade for closing modal)
  singleModeBtn.addEventListener('click', function() {
    gameState.gameMode = 'single';
    gameState.playerId = 1;  // Always player 1 in single player
    gameState.currentPlayer = 1;
    gameState.gameActive = true;
    fadeOut(modeModal, () => setGameBlur(false));
    setOfflineUI();
    resetGame();
  });
  multiModeBtn.addEventListener('click', function() {
    if (multiModeBtn.disabled) return;
    gameState.gameMode = 'multi';
    fadeOut(modeModal, () => setGameBlur(false));
    setOnlineUI();
    resetGame();
  });

  setGameBlur(true);
})();

// --- PATCH: Ensure playerId is set in single player mode ---
function ensurePlayerIdForSinglePlayer() {
  if (gameState.gameMode === 'single') {
    gameState.playerId = 1;
  }
}

// Patch resetGame to set playerId for single player
const originalResetGame = resetGame;
resetGame = function() {
  ensurePlayerIdForSinglePlayer();
  originalResetGame();
};

// Patch mode change handler to set playerId
const originalHandleModeChange = handleModeChange;
handleModeChange = function() {
  originalHandleModeChange();
  ensurePlayerIdForSinglePlayer();
  updateUI();
};

// On DOMContentLoaded, set playerId if single player
const originalDOMContentLoaded = document.addEventListener;
document.addEventListener = function(type, listener, options) {
  if (type === 'DOMContentLoaded') {
    const wrappedListener = function(event) {
      ensurePlayerIdForSinglePlayer();
      listener(event);
    };
    originalDOMContentLoaded.call(document, type, wrappedListener, options);
  } else {
    originalDOMContentLoaded.call(document, type, listener, options);
  }
};

// --- END PATCH ---

function resetGame() {
  gameState.lines.clear();
  gameState.squares.clear();
  gameState.scores = { 1: 0, 2: 0 };
  gameState.currentPlayer = 1;
  gameState.gameActive = true;
  gameState.hoveredLine = null;
  
  // Set player ID for single player mode
  ensurePlayerIdForSinglePlayer();
  
  initializeBoard();
  updateUI();
  updateGameStatus(gameState.gameMode === 'single' ? "Game started - Your turn!" : "Waiting for opponent...");
}

// Initialize when page loads
document.addEventListener("DOMContentLoaded", () => {
  // Re-initialize DOM elements
  const gameBoard = document.getElementById("gameBoard");

  // Initialize connection status as disconnected
  updateConnectionStatus(false);
  updateGameStatus("Connecting to server...");
  
  // Only initialize if gameBoard exists
  if (gameBoard) {
    initializeBoard();
    updateUI();
  }

  // Initialize background music
  initializeBackgroundMusic();

  // Background music toggle
  const backgroundMusicToggle = document.getElementById('backgroundMusicEnabled');
  if (backgroundMusicToggle) {
    backgroundMusicToggle.addEventListener('change', (e) => {
      toggleBackgroundMusic(e.target.checked);
    });
    // Set initial state
    backgroundMusicToggle.checked = backgroundMusicEnabled;
  }

  // Volume control
  const volumeSlider = document.getElementById('audioVolume');
  const volumeValue = document.getElementById('volumeValue');
  if (volumeSlider && volumeValue) {
    volumeSlider.addEventListener('input', (e) => {
      const volume = e.target.value;
      volumeValue.textContent = volume;
      setBackgroundMusicVolume(volume);
    });
    // Set initial volume for background music
    setBackgroundMusicVolume(volumeSlider.value);
  }
  
  // Initialize music status indicator
  updateBackgroundMusicStatus();

  // Start background music on first user interaction
  function enableAudioOnInteraction(event) {
    if (!hasUserInteracted) {
      hasUserInteracted = true;
      
      // Remove the event listeners immediately
      document.removeEventListener('click', enableAudioOnInteraction, true);
      document.removeEventListener('keydown', enableAudioOnInteraction, true);
      document.removeEventListener('touchstart', enableAudioOnInteraction, true);
      
      // Remove game board listeners
      if (gameBoard) {
        gameBoard.removeEventListener('click', enableAudioOnInteraction, true);
        gameBoard.removeEventListener('touchstart', enableAudioOnInteraction, true);
      }
      
      // Start music if enabled
      if (backgroundMusicEnabled && backgroundMusic) {
        // Reset attempts on new user interaction
        musicStartAttempts = 0;
        updateGameStatus('🎵 Starting background music...');
        setTimeout(() => {
          playBackgroundMusic();
        }, 200);
      }
    }
  }

  // Add event listeners for user interaction with capture to catch early
  document.addEventListener('click', enableAudioOnInteraction, true);
  document.addEventListener('keydown', enableAudioOnInteraction, true);
  document.addEventListener('touchstart', enableAudioOnInteraction, true);
  
  // Also add listeners specifically to the game Board for immediate interaction
  if (gameBoard) {
    gameBoard.addEventListener('click', enableAudioOnInteraction, true);
    gameBoard.addEventListener('touchstart', enableAudioOnInteraction, true);
  }
  
  // Settings panel controls
  const settingsButton = document.createElement('button');
  settingsButton.textContent = '⚙️ Settings';
  settingsButton.className = 'btn secondary';
  settingsButton.style.marginLeft = '1rem';
  
  const gameControls = document.querySelector('.game-controls');
  if (gameControls) {
    gameControls.appendChild(settingsButton);
  }

  const settingsPanel = document.getElementById('settingsPanel');
  const closeSettingsButton = document.getElementById('closeSettings');

  settingsButton.addEventListener('click', () => {
    settingsPanel.classList.remove('hidden');
    // Trigger music on settings open if not already started
    if (!hasUserInteracted) {
      hasUserInteracted = true;
      console.log('User interaction detected via settings button');
      if (backgroundMusicEnabled && backgroundMusic) {
        musicStartAttempts = 0;
        setTimeout(() => {
          console.log('Starting background music from settings interaction...');
          playBackgroundMusic();
        }, 100);
      }
    }
  });

  closeSettingsButton.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
  });

  // Click outside to close settings
  settingsPanel.addEventListener('click', (e) => {
    if (e.target === settingsPanel) {
      settingsPanel.classList.add('hidden');
    }
  });

  // Help modal logic for both desktop and mobile help buttons
  const helpBtn = document.getElementById('helpBtn');
  const helpBtnMobile = document.getElementById('helpBtnMobile');
  const helpModal = document.getElementById('helpModal');
  const closeHelpModal = document.getElementById('closeHelpModal');
  if (helpBtn) {
    helpBtn.addEventListener('click', () => {
      helpModal.classList.remove('hidden');
    });
  }
  if (helpBtnMobile) {
    helpBtnMobile.addEventListener('click', () => {
      helpModal.classList.remove('hidden');
    });
  }
  if (closeHelpModal) {
    closeHelpModal.addEventListener('click', () => {
      helpModal.classList.add('hidden');
    });
  }
});
