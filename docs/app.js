const BACKEND_WS_URL = "https://reimagined-pancake-7p7pqrjpv64fgxg-3000.app.github.dev/";

const socket = new WebSocket(BACKEND_WS_URL);

// DOM elements
const clickButton = document.getElementById("clickButton");
const clickCountLabel = document.getElementById("clickCount");

// Shared counter from backend
let clickCount = 0;

// Update the displayed count
function updateCounter() {
  clickCountLabel.textContent = `Clicks: ${clickCount}`;
}

// Send click message to backend
function handleButtonClick() {
  socket.send(JSON.stringify({ type: "click" }));

  // Animate
  clickButton.style.transform = "scale(0.95)";
  setTimeout(() => {
    clickButton.style.transform = "scale(1)";
  }, 100);
}

// Setup event listeners
document.addEventListener("DOMContentLoaded", () => {
  clickButton.addEventListener("click", handleButtonClick);
  updateCounter();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    handleButtonClick();
  }
});

// Handle WebSocket messages
socket.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    if (data.type === "count") {
      clickCount = data.value;
      updateCounter();
    }
  } catch (err) {
    console.error("Invalid message from server:", event.data);
  }
};

// Optional: log connection status
socket.onopen = () => console.log("Connected to server");
socket.onerror = (e) => console.error("WebSocket error", e);
socket.onclose = () => console.warn("WebSocket connection closed");
