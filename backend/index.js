const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.get("/", (_, res) => res.send("WebSocket Server Running"));



// Dots and Lines game state
const dotsLinesGames = new Map();
const waitingPlayers = [];

// Game configuration
const GRID_SIZE = 5;

wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.game === "dots-lines") {
        handleDotsLinesMessage(ws, data);
      }
    } catch (err) {
      console.error("Invalid message:", message);
    }
  });

  ws.on("close", () => {
    handlePlayerDisconnect(ws);
  });
});

function broadcast(message) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

function handleDotsLinesMessage(ws, data) {
  switch (data.type) {
    case "join":
      handlePlayerJoin(ws);
      break;
      
    case "move":
      handlePlayerMove(ws, data);
      break;
  }
}

function handlePlayerJoin(ws) {
  // Find existing game with only one player or create new game
  let gameId = null;
  let playerId = null;
  
  // Check if player is already in a game
  for (const [id, game] of dotsLinesGames.entries()) {
    if (game.player1 === ws) {
      playerId = 1;
      gameId = id;
      break;
    } else if (game.player2 === ws) {
      playerId = 2;
      gameId = id;
      break;
    }
  }
  
  if (!gameId) {
    // Look for a game waiting for a second player
    for (const [id, game] of dotsLinesGames.entries()) {
      if (!game.player2) {
        game.player2 = ws;
        ws.gameId = id;
        ws.playerId = 2;
        playerId = 2;
        gameId = id;
        
        // Start the game
        game.player1.send(JSON.stringify({ type: "game-start" }));
        game.player2.send(JSON.stringify({ type: "game-start" }));
        break;
      }
    }
    
    // If no waiting game, create new one
    // Create new one
    if (!gameId) {
      gameId = generateGameId();
      dotsLinesGames.set(gameId, {
        player1: ws,
        player2: null,
        lines: new Set(),
        squares: new Map(),
        currentPlayer: 1,
        scores: { 1: 0, 2: 0 }
      });
      ws.gameId = gameId;
      ws.playerId = 1;
      playerId = 1;
    }
  }
  
  ws.send(JSON.stringify({ 
    type: "player-assigned", 
    playerId: playerId,
    gameId: gameId 
  }));
}

function handlePlayerMove(ws, data) {
  const game = dotsLinesGames.get(ws.gameId);
  if (!game || !game.player2) return;
  
  // Check if it's the player's turn
  if (game.currentPlayer !== ws.playerId) return;
  
  // Check if line already exists
  if (game.lines.has(data.lineId)) return;
  
  // Add the line
  game.lines.add(data.lineId);
  
  // Check for completed squares
  const completedSquares = checkForCompletedSquares(game, data.lineId);
  let scoredThisTurn = false;
  
  // Process completed squares
  completedSquares.forEach(squareKey => {
    if (!game.squares.has(squareKey)) {
      game.squares.set(squareKey, ws.playerId);
      game.scores[ws.playerId]++;
      scoredThisTurn = true;
    }
  });
  
  // Switch turns only if no squares were completed
  if (!scoredThisTurn) {
    game.currentPlayer = game.currentPlayer === 1 ? 2 : 1;
  }
  
  // Broadcast the move to both players
  const moveMessage = {
    type: "move-made",
    lineId: data.lineId,
    player: ws.playerId,
    completedSquares: completedSquares,
    scores: game.scores,
    currentPlayer: game.currentPlayer
  };
  
  game.player1.send(JSON.stringify(moveMessage));
  if (game.player2) {
    game.player2.send(JSON.stringify(moveMessage));
  }
}

function handlePlayerDisconnect(ws) {
  if (ws.gameId) {
    const game = dotsLinesGames.get(ws.gameId);
    if (game) {
      // Notify the other player
      const disconnectMessage = { type: "player-disconnected" };
      
      if (game.player1 === ws && game.player2) {
        game.player2.send(JSON.stringify(disconnectMessage));
      } else if (game.player2 === ws && game.player1) {
        game.player1.send(JSON.stringify(disconnectMessage));
      }
      
      // Remove the game
      dotsLinesGames.delete(ws.gameId);
    }
  }
}

function checkForCompletedSquares(game, lineId) {
  const [type, row, col] = lineId.split("-").map((val, idx) => idx === 0 ? val : parseInt(val));
  const completedSquares = [];

  if (type === "horizontal") {
    // Check square above
    if (row > 0) {
      const squareKey = `${row - 1}-${col}`;
      if (isSquareComplete(game, row - 1, col)) {
        completedSquares.push(squareKey);
      }
    }
    // Check square below
    if (row < GRID_SIZE - 1) {
      const squareKey = `${row}-${col}`;
      if (isSquareComplete(game, row, col)) {
        completedSquares.push(squareKey);
      }
    }
  } else if (type === "vertical") {
    // Check square to the left
    if (col > 0) {
      const squareKey = `${row}-${col - 1}`;
      if (isSquareComplete(game, row, col - 1)) {
        completedSquares.push(squareKey);
      }
    }
    // Check square to the right
    if (col < GRID_SIZE - 1) {
      const squareKey = `${row}-${col}`;
      if (isSquareComplete(game, row, col)) {
        completedSquares.push(squareKey);
      }
    }
  }

  return completedSquares;
}

function isSquareComplete(game, row, col) {
  const requiredLines = [
    `horizontal-${row}-${col}`,
    `horizontal-${row + 1}-${col}`,
    `vertical-${row}-${col}`,
    `vertical-${row}-${col + 1}`
  ];

  return requiredLines.every(lineId => game.lines.has(lineId));
}

function generateGameId() {
  return Math.random().toString(36).substr(2, 9);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
