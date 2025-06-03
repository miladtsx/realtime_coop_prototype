const GameState = require('./GameState');
const crypto = require('crypto');

/**
 * Game Manager Class
 * Follows Single Responsibility Principle - only manages game instances
 * Follows Open/Closed Principle - easily extensible for different game types
 */
class GameManager {
  constructor(config) {
    this.config = config;
    this.games = new Map();
    this.playerGameMap = new Map(); // playerId -> gameId
    this.waitingQueue = [];
    this.gameIdLength = config.game.gameIdLength || 9;
  }

  /**
   * Join a player to a game
   */
  joinPlayer(websocket) {
    // Check if player is already in a game
    const existingGameId = this.findPlayerGame(websocket);
    if (existingGameId) {
      const game = this.games.get(existingGameId);
      const playerId = this.getPlayerIdInGame(websocket, game);
      return { gameId: existingGameId, playerId, reconnected: true };
    }

    // Find existing game waiting for players
    let gameId = this.findWaitingGame();
    let playerId;

    if (gameId) {
      // Join existing game
      const game = this.games.get(gameId);
      playerId = game.players.size + 1;
      
      try {
        game.addPlayer(playerId, websocket);
        this.playerGameMap.set(this.getWebSocketId(websocket), gameId);
        
        // Remove from waiting queue if game is now full
        if (game.players.size === 2) {
          this.waitingQueue = this.waitingQueue.filter(id => id !== gameId);
        }
      } catch (error) {
        throw new Error(`Failed to join game: ${error.message}`);
      }
    } else {
      // Create new game
      gameId = this.generateGameId();
      const game = new GameState(this.config.game.gridSize);
      playerId = 1;
      
      try {
        game.addPlayer(playerId, websocket);
        this.games.set(gameId, game);
        this.playerGameMap.set(this.getWebSocketId(websocket), gameId);
        this.waitingQueue.push(gameId);
      } catch (error) {
        throw new Error(`Failed to create game: ${error.message}`);
      }
    }

    return { gameId, playerId, reconnected: false };
  }

  /**
   * Handle player move
   */
  handleMove(websocket, moveData) {
    const gameId = this.findPlayerGame(websocket);
    if (!gameId) {
      throw new Error('Player not in any game');
    }

    const game = this.games.get(gameId);
    if (!game) {
      throw new Error('Game not found');
    }

    const playerId = this.getPlayerIdInGame(websocket, game);
    if (!playerId) {
      throw new Error('Player not found in game');
    }

    // Validate move data
    if (!moveData.lineId || typeof moveData.lineId !== 'string') {
      throw new Error('Invalid move data');
    }

    try {
      const result = game.placeLine(moveData.lineId, playerId);
      
      // Broadcast move to all players
      game.broadcast({
        type: 'move-made',
        lineId: moveData.lineId,
        player: playerId,
        completedSquares: result.completedSquares,
        scores: result.scores,
        currentPlayer: result.currentPlayer,
        gameEnded: result.gameEnded
      });

      // Handle game end
      if (result.gameEnded) {
        this.handleGameEnd(gameId, game);
      }

      return result;
    } catch (error) {
      throw new Error(`Invalid move: ${error.message}`);
    }
  }

  /**
   * Reset game
   */
  resetGame(websocket) {
    const gameId = this.findPlayerGame(websocket);
    if (!gameId) {
      throw new Error('Player not in any game');
    }

    const game = this.games.get(gameId);
    if (!game) {
      throw new Error('Game not found');
    }

    const playerId = this.getPlayerIdInGame(websocket, game);
    if (!playerId) {
      throw new Error('Player not found in game');
    }

    // Determine winner (other player wins by forfeit)
    const otherPlayer = game.getOtherPlayer(playerId);
    
    // Send personalized messages to each player
    for (const [pid, ws] of game.players) {
      if (pid === playerId) {
        // Message to the player who reset
        ws.send(JSON.stringify({
          type: 'game-ended-by-reset',
          winner: otherPlayer,
          reason: 'You reset the game'
        }));
      } else {
        // Message to the other player
        ws.send(JSON.stringify({
          type: 'game-ended-by-reset',
          winner: pid,
          reason: 'The other player reset the game'
        }));
      }
    }

    // Reset the game
    game.reset();

    // Notify players that game is reset and ready
    game.broadcast({
      type: 'game-reset'
    });
  }

  /**
   * Handle player disconnect
   */
  handleDisconnect(websocket) {
    const gameId = this.findPlayerGame(websocket);
    if (!gameId) {
      return;
    }

    const game = this.games.get(gameId);
    if (!game) {
      return;
    }

    const playerId = this.getPlayerIdInGame(websocket, game);
    
    // Notify other players
    game.broadcast({
      type: 'player-disconnected',
      playerId: playerId
    }, playerId);

    // Remove player from game
    game.removePlayer(playerId);
    this.playerGameMap.delete(this.getWebSocketId(websocket));

    // Clean up empty games
    if (game.players.size === 0) {
      this.games.delete(gameId);
      this.waitingQueue = this.waitingQueue.filter(id => id !== gameId);
    } else {
      // Add to waiting queue if not full
      if (game.players.size === 1 && !this.waitingQueue.includes(gameId)) {
        this.waitingQueue.push(gameId);
      }
    }
  }

  /**
   * Get game statistics
   */
  getStats() {
    const activeGames = Array.from(this.games.values()).filter(game => game.isActive).length;
    const waitingGames = this.waitingQueue.length;
    const totalPlayers = Array.from(this.games.values())
      .reduce((total, game) => total + game.players.size, 0);

    return {
      totalGames: this.games.size,
      activeGames,
      waitingGames,
      totalPlayers,
      timestamp: new Date()
    };
  }

  /**
   * Clean up old inactive games
   */
  cleanup(maxAgeMs = 3600000) { // 1 hour default
    const now = new Date();
    const gamesToDelete = [];

    for (const [gameId, game] of this.games) {
      const age = now - game.createdAt;
      const inactive = !game.isActive && (!game.lastMoveAt || now - game.lastMoveAt > maxAgeMs);
      
      if (age > maxAgeMs || inactive) {
        gamesToDelete.push(gameId);
      }
    }

    gamesToDelete.forEach(gameId => {
      const game = this.games.get(gameId);
      if (game) {
        // Notify remaining players
        game.broadcast({
          type: 'game-cleanup',
          reason: 'Game timeout'
        });

        // Clean up player mappings
        for (const websocket of game.players.values()) {
          this.playerGameMap.delete(this.getWebSocketId(websocket));
        }
      }

      this.games.delete(gameId);
      this.waitingQueue = this.waitingQueue.filter(id => id !== gameId);
    });

    return gamesToDelete.length;
  }

  // Private methods

  /**
   * Find game waiting for players
   */
  findWaitingGame() {
    return this.waitingQueue.find(gameId => {
      const game = this.games.get(gameId);
      return game && game.players.size < 2;
    });
  }

  /**
   * Find which game a player is in
   */
  findPlayerGame(websocket) {
    const wsId = this.getWebSocketId(websocket);
    return this.playerGameMap.get(wsId);
  }

  /**
   * Get player ID in a specific game
   */
  getPlayerIdInGame(websocket, game) {
    for (const [playerId, ws] of game.players) {
      if (ws === websocket) {
        return playerId;
      }
    }
    return null;
  }

  /**
   * Generate unique game ID
   */
  generateGameId() {
    let gameId;
    do {
      gameId = crypto.randomBytes(this.gameIdLength)
        .toString('base64')
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, this.gameIdLength);
    } while (this.games.has(gameId));
    
    return gameId;
  }

  /**
   * Get unique WebSocket identifier
   */
  getWebSocketId(websocket) {
    if (!websocket._gameSocketId) {
      websocket._gameSocketId = crypto.randomUUID();
    }
    return websocket._gameSocketId;
  }

  /**
   * Handle game end
   */
  handleGameEnd(gameId, game) {
    const winner = game.getWinner();
    
    // Send personalized messages to each player
    for (const [playerId, ws] of game.players) {
      let reason;
      if (winner === 0) {
        reason = 'Tie game';
      } else if (winner === playerId) {
        reason = 'YOU won!';
      } else {
        reason = 'The other player won!';
      }
      
      ws.send(JSON.stringify({
        type: 'game-ended',
        winner: winner,
        scores: game.scores,
        reason: reason
      }));
    }

    // Game remains in memory for potential restart
    // Will be cleaned up by periodic cleanup
  }
}

module.exports = GameManager;