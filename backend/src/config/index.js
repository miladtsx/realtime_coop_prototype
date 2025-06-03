const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

/**
 * Configuration management following Dependency Inversion Principle
 * All configuration is centralized and can be easily mocked for testing
 */
class Config {
  constructor() {
    this.server = {
      port: this.getPort(),
      host: process.env.HOST || 'localhost',
      corsOrigin: process.env.CORS_ORIGIN || '*'
    };

    this.game = {
      gridSize: parseInt(process.env.GRID_SIZE) || 5,
      maxPlayersPerGame: 2,
      gameIdLength: 9
    };

    this.websocket = {
      pingInterval: parseInt(process.env.WS_PING_INTERVAL) || 30000,
      closeTimeout: parseInt(process.env.WS_CLOSE_TIMEOUT) || 3000
    };

    this.rateLimit = {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000,
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX) || 50
    };
  }

  getPort() {
    const port = parseInt(process.env.PORT) || 3000;
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error('Invalid port number');
    }
    return port;
  }

  validate() {
    if (this.game.gridSize < 2 || this.game.gridSize > 20) {
      throw new Error('Grid size must be between 2 and 20');
    }
    return true;
  }
}

// Export singleton instance
const config = new Config();
config.validate();

module.exports = config;