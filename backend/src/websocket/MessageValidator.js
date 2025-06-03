/**
 * Message Validator Class
 * Follows Single Responsibility Principle - only validates incoming messages
 * Provides centralized validation with detailed error reporting
 */
class MessageValidator {
  constructor() {
    this.allowedTypes = new Set([
      'join',
      'move',
      'reset',
      'ping',
      'disconnect'
    ]);

    this.allowedGames = new Set([
      'dots-lines'
    ]);
  }

  /**
   * Validate incoming WebSocket message
   */
  validateMessage(message) {
    try {
      const data = typeof message === 'string' ? JSON.parse(message) : message;
      return this.validateMessageData(data);
    } catch (error) {
      return {
        valid: false,
        error: 'Invalid JSON format',
        code: 'INVALID_JSON'
      };
    }
  }

  /**
   * Validate parsed message data
   */
  validateMessageData(data) {
    // Check for required fields
    if (!data || typeof data !== 'object') {
      return {
        valid: false,
        error: 'Message must be an object',
        code: 'INVALID_FORMAT'
      };
    }

    // Validate message type
    if (!data.type || typeof data.type !== 'string') {
      return {
        valid: false,
        error: 'Message type is required and must be a string',
        code: 'MISSING_TYPE'
      };
    }

    if (!this.allowedTypes.has(data.type)) {
      return {
        valid: false,
        error: `Unknown message type: ${data.type}`,
        code: 'UNKNOWN_TYPE'
      };
    }

    // Validate game field for game-related messages
    if (['join', 'move', 'reset'].includes(data.type)) {
      if (!data.game || typeof data.game !== 'string') {
        return {
          valid: false,
          error: 'Game field is required for this message type',
          code: 'MISSING_GAME'
        };
      }

      if (!this.allowedGames.has(data.game)) {
        return {
          valid: false,
          error: `Unknown game type: ${data.game}`,
          code: 'UNKNOWN_GAME'
        };
      }
    }

    // Type-specific validation
    switch (data.type) {
      case 'move':
        return this.validateMoveMessage(data);
      case 'join':
        return this.validateJoinMessage(data);
      case 'reset':
        return this.validateResetMessage(data);
      case 'ping':
        return this.validatePingMessage(data);
      default:
        return { valid: true, data };
    }
  }

  /**
   * Validate move message
   */
  validateMoveMessage(data) {
    if (!data.lineId || typeof data.lineId !== 'string') {
      return {
        valid: false,
        error: 'lineId is required for move messages',
        code: 'MISSING_LINE_ID'
      };
    }

    // Validate line ID format
    const lineIdPattern = /^(horizontal|vertical)-\d+-\d+$/;
    if (!lineIdPattern.test(data.lineId)) {
      return {
        valid: false,
        error: 'Invalid lineId format. Expected: type-row-col',
        code: 'INVALID_LINE_ID'
      };
    }

    const [type, row, col] = data.lineId.split('-');
    const rowNum = parseInt(row);
    const colNum = parseInt(col);

    // Validate coordinates are reasonable (0-99 should cover any practical grid)
    if (rowNum < 0 || rowNum > 99 || colNum < 0 || colNum > 99) {
      return {
        valid: false,
        error: 'Line coordinates out of reasonable range',
        code: 'INVALID_COORDINATES'
      };
    }

    return { valid: true, data };
  }

  /**
   * Validate join message
   */
  validateJoinMessage(data) {
    // Join messages only need type and game, which are already validated
    return { valid: true, data };
  }

  /**
   * Validate reset message
   */
  validateResetMessage(data) {
    // Reset messages only need type and game, which are already validated
    return { valid: true, data };
  }

  /**
   * Validate ping message
   */
  validatePingMessage(data) {
    // Ping messages only need type
    return { valid: true, data };
  }

  /**
   * Sanitize message data to prevent injection attacks
   */
  sanitizeMessage(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = {};
    
    // Only copy known safe fields
    const allowedFields = ['type', 'game', 'lineId', 'timestamp'];
    
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        if (typeof data[field] === 'string') {
          // Basic string sanitization
          sanitized[field] = data[field]
            .replace(/[<>]/g, '') // Remove potential HTML
            .substring(0, 100); // Limit length
        } else if (typeof data[field] === 'number') {
          sanitized[field] = data[field];
        }
      }
    }

    return sanitized;
  }

  /**
   * Rate limiting validation
   */
  validateRateLimit(clientId, maxRequests = 10, windowMs = 60000) {
    if (!this.rateLimitMap) {
      this.rateLimitMap = new Map();
    }

    const now = Date.now();
    const clientData = this.rateLimitMap.get(clientId) || { count: 0, resetTime: now + windowMs };

    // Reset window if expired
    if (now > clientData.resetTime) {
      clientData.count = 0;
      clientData.resetTime = now + windowMs;
    }

    clientData.count++;
    this.rateLimitMap.set(clientId, clientData);

    if (clientData.count > maxRequests) {
      return {
        valid: false,
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: clientData.resetTime - now
      };
    }

    return { valid: true };
  }

  /**
   * Clean up old rate limit entries
   */
  cleanupRateLimit() {
    if (!this.rateLimitMap) return;

    const now = Date.now();
    for (const [clientId, data] of this.rateLimitMap) {
      if (now > data.resetTime) {
        this.rateLimitMap.delete(clientId);
      }
    }
  }
}

module.exports = MessageValidator;