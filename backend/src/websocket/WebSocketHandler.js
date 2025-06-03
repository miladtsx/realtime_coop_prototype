const MessageValidator = require('./MessageValidator');

/**
 * WebSocket Handler Class
 * Follows Single Responsibility Principle - only handles WebSocket connections
 * Provides robust error handling and connection management
 */
class WebSocketHandler {
  constructor(gameManager, config) {
    this.gameManager = gameManager;
    this.config = config;
    this.validator = new MessageValidator();
    this.connections = new Map();
    this.pingInterval = null;
    
    this.setupPingInterval();
  }

  /**
   * Handle new WebSocket connection
   */
  handleConnection(ws, request) {
    const connectionId = this.generateConnectionId();
    const clientIp = this.getClientIp(request);
    
    const connectionData = {
      id: connectionId,
      ws: ws,
      ip: clientIp,
      connectedAt: new Date(),
      lastPing: new Date(),
      isAlive: true
    };

    this.connections.set(connectionId, connectionData);
    ws.connectionId = connectionId;
    ws.isAlive = true;

    console.log(`WebSocket connected: ${connectionId} from ${clientIp}`);

    // Setup WebSocket event handlers
    ws.on('message', (message) => this.handleMessage(ws, message));
    ws.on('close', (code, reason) => this.handleClose(ws, code, reason));
    ws.on('error', (error) => this.handleError(ws, error));
    ws.on('pong', () => this.handlePong(ws));

    // Send welcome message
    this.sendMessage(ws, {
      type: 'connected',
      connectionId: connectionId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(ws, message) {
    try {
      // Rate limiting check
      const rateLimitResult = this.validator.validateRateLimit(
        ws.connectionId,
        this.config.rateLimit.maxRequests,
        this.config.rateLimit.windowMs
      );

      if (!rateLimitResult.valid) {
        this.sendError(ws, rateLimitResult.error, rateLimitResult.code);
        if (rateLimitResult.code === 'RATE_LIMIT_EXCEEDED') {
          this.closeConnection(ws, 1008, 'Rate limit exceeded');
        }
        return;
      }

      // Validate message format
      const validation = this.validator.validateMessage(message);
      if (!validation.valid) {
        this.sendError(ws, validation.error, validation.code);
        return;
      }

      const data = this.validator.sanitizeMessage(validation.data);
      
      // Update connection activity
      const connection = this.connections.get(ws.connectionId);
      if (connection) {
        connection.lastPing = new Date();
      }

      // Route message to appropriate handler
      this.routeMessage(ws, data);

    } catch (error) {
      console.error('Error handling message:', error);
      this.sendError(ws, 'Internal server error', 'INTERNAL_ERROR');
    }
  }

  /**
   * Route validated message to appropriate handler
   */
  routeMessage(ws, data) {
    try {
      switch (data.type) {
        case 'join':
          this.handleJoin(ws, data);
          break;
          
        case 'move':
          this.handleMove(ws, data);
          break;
          
        case 'reset':
          this.handleReset(ws, data);
          break;
          
        case 'ping':
          this.handlePingMessage(ws, data);
          break;
          
        default:
          this.sendError(ws, `Unhandled message type: ${data.type}`, 'UNHANDLED_TYPE');
      }
    } catch (error) {
      console.error(`Error handling ${data.type} message:`, error);
      this.sendError(ws, error.message, 'HANDLER_ERROR');
    }
  }

  /**
   * Handle join game request
   */
  handleJoin(ws, data) {
    try {
      const result = this.gameManager.joinPlayer(ws);
      
      this.sendMessage(ws, {
        type: 'player-assigned',
        playerId: result.playerId,
        gameId: result.gameId,
        reconnected: result.reconnected
      });

      // If game has 2 players, start the game
      if (!result.reconnected) {
        // Check if game should start
        setTimeout(() => {
          try {
            const gameId = this.gameManager.findPlayerGame(ws);
            if (gameId) {
              const game = this.gameManager.games.get(gameId);
              if (game && game.isActive && game.players.size === 2) {
                game.broadcast({
                  type: 'game-start',
                  timestamp: new Date().toISOString()
                });
              }
            }
          } catch (error) {
            console.error('Error starting game:', error);
          }
        }, 100);
      }

    } catch (error) {
      this.sendError(ws, error.message, 'JOIN_ERROR');
    }
  }

  /**
   * Handle player move
   */
  handleMove(ws, data) {
    try {
      this.gameManager.handleMove(ws, data);
    } catch (error) {
      this.sendError(ws, error.message, 'MOVE_ERROR');
    }
  }

  /**
   * Handle game reset
   */
  handleReset(ws, data) {
    try {
      this.gameManager.resetGame(ws);
    } catch (error) {
      this.sendError(ws, error.message, 'RESET_ERROR');
    }
  }

  /**
   * Handle ping message
   */
  handlePingMessage(ws, data) {
    this.sendMessage(ws, {
      type: 'pong',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle WebSocket close
   */
  handleClose(ws, code, reason) {
    console.log(`WebSocket closed: ${ws.connectionId} (${code}: ${reason})`);
    
    try {
      this.gameManager.handleDisconnect(ws);
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
    
    this.connections.delete(ws.connectionId);
  }

  /**
   * Handle WebSocket error
   */
  handleError(ws, error) {
    console.error(`WebSocket error for ${ws.connectionId}:`, error);
    
    // Close connection on critical errors
    if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND') {
      this.closeConnection(ws, 1006, 'Connection error');
    }
  }

  /**
   * Handle pong response
   */
  handlePong(ws) {
    ws.isAlive = true;
    const connection = this.connections.get(ws.connectionId);
    if (connection) {
      connection.isAlive = true;
      connection.lastPing = new Date();
    }
  }

  /**
   * Send message to WebSocket client
   */
  sendMessage(ws, message) {
    if (ws.readyState === 1) { // WebSocket.OPEN
      try {
        ws.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error(`Failed to send message to ${ws.connectionId}:`, error);
        return false;
      }
    }
    return false;
  }

  /**
   * Send error message to client
   */
  sendError(ws, message, code = 'UNKNOWN_ERROR') {
    this.sendMessage(ws, {
      type: 'error',
      error: message,
      code: code,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Close WebSocket connection
   */
  closeConnection(ws, code = 1000, reason = 'Normal closure') {
    if (ws.readyState === 1) {
      try {
        ws.close(code, reason);
      } catch (error) {
        console.error(`Error closing connection ${ws.connectionId}:`, error);
      }
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(message, excludeConnectionId = null) {
    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    for (const [connectionId, connection] of this.connections) {
      if (excludeConnectionId && connectionId === excludeConnectionId) continue;
      
      if (connection.ws.readyState === 1) {
        try {
          connection.ws.send(messageStr);
          sentCount++;
        } catch (error) {
          console.error(`Failed to broadcast to ${connectionId}:`, error);
        }
      }
    }

    return sentCount;
  }

  /**
   * Setup ping interval for connection health check
   */
  setupPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.pingInterval = setInterval(() => {
      this.pingConnections();
    }, this.config.websocket.pingInterval);
  }

  /**
   * Ping all connections to check health
   */
  pingConnections() {
    const deadConnections = [];

    for (const [connectionId, connection] of this.connections) {
      if (!connection.isAlive) {
        deadConnections.push(connectionId);
      } else {
        connection.isAlive = false;
        try {
          connection.ws.ping();
        } catch (error) {
          console.error(`Failed to ping connection ${connectionId}:`, error);
          deadConnections.push(connectionId);
        }
      }
    }

    // Clean up dead connections
    deadConnections.forEach(connectionId => {
      const connection = this.connections.get(connectionId);
      if (connection) {
        console.log(`Removing dead connection: ${connectionId}`);
        this.closeConnection(connection.ws, 1001, 'Connection timeout');
        this.handleClose(connection.ws, 1001, 'Connection timeout');
      }
    });
  }

  /**
   * Get connection statistics
   */
  getStats() {
    const now = new Date();
    const connections = Array.from(this.connections.values());
    
    return {
      totalConnections: connections.length,
      aliveConnections: connections.filter(c => c.isAlive).length,
      avgConnectionTime: connections.length > 0 
        ? connections.reduce((sum, c) => sum + (now - c.connectedAt), 0) / connections.length
        : 0,
      timestamp: now
    };
  }

  /**
   * Clean up resources
   */
  cleanup() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Close all connections
    for (const connection of this.connections.values()) {
      this.closeConnection(connection.ws, 1001, 'Server shutdown');
    }

    this.connections.clear();
    this.validator.cleanupRateLimit();
  }

  // Private helper methods

  /**
   * Generate unique connection ID
   */
  generateConnectionId() {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Extract client IP from request
   */
  getClientIp(request) {
    return request.headers['x-forwarded-for'] || 
           request.headers['x-real-ip'] || 
           request.connection.remoteAddress || 
           request.socket.remoteAddress ||
           'unknown';
  }
}

module.exports = WebSocketHandler;