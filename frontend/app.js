// Click counter functionality
let clickCount = 0;

// Get references to DOM elements
const clickButton = document.getElementById('clickButton');
const clickCountLabel = document.getElementById('clickCount');

// Function to update the counter display
function updateCounter() {
    clickCountLabel.textContent = `Clicks: ${clickCount}`;
}

// Function to handle button clicks
function handleButtonClick() {
    clickCount++;
    updateCounter();
    
    // Add a small animation effect
    clickButton.style.transform = 'scale(0.95)';
    setTimeout(() => {
        clickButton.style.transform = 'scale(1)';
    }, 100);
}

// Add event listener when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize the counter display
    updateCounter();
    
    // Add click event listener to the button
    clickButton.addEventListener('click', handleButtonClick);
});

// Optional: Add keyboard support (Enter key)
document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        handleButtonClick();
    }
});