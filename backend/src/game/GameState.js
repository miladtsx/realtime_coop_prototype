/**
 * Game State Management Class
 * Follows Single Responsibility Principle - only manages game state
 */
class GameState {
  constructor(gridSize = 5) {
    this.gridSize = gridSize;
    this.lines = new Set();
    this.squares = new Map();
    this.currentPlayer = 1;
    this.scores = { 1: 0, 2: 0 };
    this.isActive = false;
    this.players = new Map(); // playerId -> websocket
    this.createdAt = new Date();
    this.lastMoveAt = null;
  }

  /**
   * Add a player to the game
   */
  addPlayer(playerId, websocket) {
    if (this.players.size >= 2) {
      throw new Error('Game is full');
    }
    
    this.players.set(playerId, websocket);
    
    // Start game when we have 2 players
    if (this.players.size === 2) {
      this.isActive = true;
    }
    
    return this.players.size;
  }

  /**
   * Remove a player from the game
   */
  removePlayer(playerId) {
    const removed = this.players.delete(playerId);
    if (removed && this.isActive) {
      this.isActive = false;
    }
    return removed;
  }

  /**
   * Check if a line can be placed
   */
  canPlaceLine(lineId, playerId) {
    if (!this.isActive) {
      return { valid: false, reason: 'Game not active' };
    }

    if (this.currentPlayer !== playerId) {
      return { valid: false, reason: 'Not your turn' };
    }

    if (this.lines.has(lineId)) {
      return { valid: false, reason: 'Line already exists' };
    }

    if (!this.isValidLineId(lineId)) {
      return { valid: false, reason: 'Invalid line ID' };
    }

    return { valid: true };
  }

  /**
   * Place a line and return completed squares
   */
  placeLine(lineId, playerId) {
    const validation = this.canPlaceLine(lineId, playerId);
    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    this.lines.add(lineId);
    this.lastMoveAt = new Date();

    const completedSquares = this.findCompletedSquares(lineId);
    let scoredThisTurn = false;

    // Process completed squares
    completedSquares.forEach(squareKey => {
      if (!this.squares.has(squareKey)) {
        this.squares.set(squareKey, playerId);
        this.scores[playerId]++;
        scoredThisTurn = true;
      }
    });

    // Switch turns only if no squares were completed
    if (!scoredThisTurn) {
      this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
    }

    return {
      completedSquares,
      scores: { ...this.scores },
      currentPlayer: this.currentPlayer,
      gameEnded: this.isGameComplete()
    };
  }

  /**
   * Reset game state
   */
  reset() {
    this.lines.clear();
    this.squares.clear();
    this.currentPlayer = 1;
    this.scores = { 1: 0, 2: 0 };
    this.lastMoveAt = null;
    
    // Game remains active if we have players
    this.isActive = this.players.size === 2;
  }

  /**
   * Check if game is complete
   */
  isGameComplete() {
    const totalSquares = (this.gridSize - 1) * (this.gridSize - 1);
    return this.squares.size === totalSquares;
  }

  /**
   * Get game winner
   */
  getWinner() {
    if (!this.isGameComplete()) {
      return null;
    }

    if (this.scores[1] > this.scores[2]) return 1;
    if (this.scores[2] > this.scores[1]) return 2;
    return 0; // Tie
  }

  /**
   * Get game state snapshot
   */
  getSnapshot() {
    return {
      gridSize: this.gridSize,
      lines: Array.from(this.lines),
      squares: Object.fromEntries(this.squares),
      currentPlayer: this.currentPlayer,
      scores: { ...this.scores },
      isActive: this.isActive,
      playerCount: this.players.size,
      isComplete: this.isGameComplete(),
      winner: this.getWinner(),
      createdAt: this.createdAt,
      lastMoveAt: this.lastMoveAt
    };
  }

  /**
   * Validate line ID format
   */
  isValidLineId(lineId) {
    const parts = lineId.split('-');
    if (parts.length !== 3) return false;

    const [type, row, col] = parts;
    const rowNum = parseInt(row);
    const colNum = parseInt(col);

    if (isNaN(rowNum) || isNaN(colNum)) return false;
    if (rowNum < 0 || colNum < 0) return false;

    if (type === 'horizontal') {
      return rowNum < this.gridSize && colNum < this.gridSize - 1;
    } else if (type === 'vertical') {
      return rowNum < this.gridSize - 1 && colNum < this.gridSize;
    }

    return false;
  }

  /**
   * Find completed squares for a placed line
   */
  findCompletedSquares(lineId) {
    const [type, row, col] = lineId.split("-")
      .map((val, idx) => idx === 0 ? val : parseInt(val));
    const completedSquares = [];

    if (type === "horizontal") {
      // Check square above
      if (row > 0 && this.isSquareComplete(row - 1, col)) {
        completedSquares.push(`${row - 1}-${col}`);
      }
      // Check square below
      if (row < this.gridSize - 1 && this.isSquareComplete(row, col)) {
        completedSquares.push(`${row}-${col}`);
      }
    } else if (type === "vertical") {
      // Check square to the left
      if (col > 0 && this.isSquareComplete(row, col - 1)) {
        completedSquares.push(`${row}-${col - 1}`);
      }
      // Check square to the right
      if (col < this.gridSize - 1 && this.isSquareComplete(row, col)) {
        completedSquares.push(`${row}-${col}`);
      }
    }

    return completedSquares;
  }

  /**
   * Check if a square is complete
   */
  isSquareComplete(row, col) {
    const requiredLines = [
      `horizontal-${row}-${col}`,
      `horizontal-${row + 1}-${col}`,
      `vertical-${row}-${col}`,
      `vertical-${row}-${col + 1}`
    ];

    return requiredLines.every(lineId => this.lines.has(lineId));
  }

  /**
   * Get other player ID
   */
  getOtherPlayer(playerId) {
    return playerId === 1 ? 2 : 1;
  }

  /**
   * Broadcast message to all players
   */
  broadcast(message, excludePlayer = null) {
    const messageStr = JSON.stringify(message);
    
    for (const [playerId, websocket] of this.players) {
      if (excludePlayer && playerId === excludePlayer) continue;
      
      if (websocket.readyState === 1) { // WebSocket.OPEN
        try {
          websocket.send(messageStr);
        } catch (error) {
          console.error(`Failed to send message to player ${playerId}:`, error);
          // Remove disconnected player
          this.removePlayer(playerId);
        }
      }
    }
  }

  /**
   * Send message to specific player
   */
  sendToPlayer(playerId, message) {
    const websocket = this.players.get(playerId);
    if (websocket && websocket.readyState === 1) {
      try {
        websocket.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error(`Failed to send message to player ${playerId}:`, error);
        this.removePlayer(playerId);
        return false;
      }
    }
    return false;
  }
}

module.exports = GameState;