# CONNECT THE DOTS Game

A real-time multiplayer implementation of the classic Dots and Lines (also known as Dots and Boxes) strategy game.

## How to Play

1. **Objective**: Complete more squares than your opponent by drawing lines between dots
2. **Gameplay**:
   - Players take turns clicking on the dashed lines between dots to draw them
   - When you complete a square (all 4 sides), you score a point and get another turn
   - The game ends when all possible squares are completed
   - Player with the most squares wins!

## Features

- **Real-time Multiplayer**: Uses WebSocket for instant synchronization between players
- **Responsive Design**: Works on both desktop and mobile devices
- **Persian/English Support**: Game title in Persian with English instructions
- **Visual Feedback**: Different colors for each player's lines and completed squares
- **Turn-based System**: Clear indication of whose turn it is
- **Game Reset**: Players can reset and start a new game anytime

## Technical Implementation

### Frontend
- **HTML5 SVG**: Game board rendered using scalable vector graphics
- **CSS3**: Modern styling with gradients and responsive design
- **Vanilla JavaScript**: Game logic and WebSocket communication

### Backend
- **Node.js + Express**: Web server
- **WebSocket (ws)**: Real-time bidirectional communication
- **Game State Management**: Server-side game logic and validation

### Game State
- 5x5 grid of dots (configurable)
- Line tracking using Set data structure
- Square completion detection algorithm
- Turn management and scoring system

## File Structure

```
docs/
├── dots-lines.html     # Game interface
├── dots-lines.css      # Styling and responsive design
├── dots-lines.js       # Client-side game logic
└── index.html          # Main menu (updated)

backend/
└── index.js            # Server with dots-lines game handling
```

## Game Flow

1. **Connection**: Player connects to WebSocket server
2. **Matchmaking**: Server pairs players or waits for second player
3. **Game Start**: Both players receive game-start message
4. **Turn System**: Players alternate drawing lines
5. **Square Detection**: Server validates moves and detects completed squares
6. **Scoring**: Players who complete squares get points and continue their turn
7. **Game End**: When all squares are completed, winner is announced

## WebSocket Messages

### Client to Server
- `{ type: "join", game: "dots-lines" }` - Join game queue
- `{ type: "move", game: "dots-lines", lineId: "horizontal-1-2", player: 1 }` - Make move
- `{ type: "reset", game: "dots-lines" }` - Reset current game

### Server to Client
- `{ type: "player-assigned", playerId: 1, gameId: "abc123" }` - Player assignment
- `{ type: "game-start" }` - Game begins
- `{ type: "move-made", lineId: "horizontal-1-2", player: 1 }` - Move broadcast
- `{ type: "game-reset" }` - Game reset notification
- `{ type: "player-disconnected" }` - Opponent disconnected

## Responsive Design

- **Desktop**: Full game info panel with detailed player statistics
- **Mobile**: Compact view with essential information only
- **Touch-friendly**: Optimized for touch interaction on mobile devices

## Future Enhancements

- [ ] Different grid sizes (3x3, 4x4, 6x6)
- [ ] AI opponent for single-player mode
- [ ] Game history and statistics
- [ ] Custom player names and avatars
- [ ] Tournament mode for multiple players
- [ ] Sound effects and animations
- [ ] Spectator mode
- [ ] Game replay system

## Running the Game

1. Start the backend server: `node backend/index.js`
2. Open `docs/index.html` in a web browser
3. Click "Play Dots & Lines" to start
4. Share the URL with a friend to play together!

The game automatically handles player matchmaking and synchronization.
