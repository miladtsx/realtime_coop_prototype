const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.get("/", (_, res) => res.send("WebSocket Server Running"));

let clickCount = 0; //TODO use global Cache Server: Redis

wss.on("connection", (ws) => {
  // Send current count to the new client
  ws.send(JSON.stringify({ type: "count", value: clickCount }));

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === "click") {
        clickCount++;
        broadcast({ type: "count", value: clickCount });
      }
    } catch (err) {
      console.error("Invalid message:", message);
    }
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
