// enhanced-diagram.js - D3.js ER Diagram Manager

/**
 * D3.js ER Diagram Manager
 * Interactive database diagrams using D3.js
 */
class DiagramManager {
  constructor() {
    this.currentDiagram = null;
    this.data = null;

    this.init();
  }

  init() {
    this.setupEventListeners();
    if (window.debug) {
      window.debug.info("DiagramManager", "D3.js diagram manager initialized");
    }
  }

  setupEventListeners() {
    // Set up diagram button listeners
    const generateBtn = document.getElementById("generate-diagram");
    if (generateBtn) {
      generateBtn.addEventListener("click", () => {
        requestERDiagram();
      });
    }

    const exportBtn = document.getElementById("export-diagram");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        this.exportDiagram();
      });
    }

    // Handle window resize for diagram
    window.addEventListener("resize", () => {
      if (this.currentDiagram && this.currentDiagram.handleResize) {
        this.currentDiagram.handleResize();
      }
    });
  }

  render(data) {
    if (window.debug) {
      window.debug.debug(
        "DiagramManager",
        "=== DiagramManager.render called ==="
      );
      window.debug.debug("DiagramManager", "Render data:", data);
    }

    this.data = data;

    // Cleanup previous diagram
    if (this.currentDiagram && this.currentDiagram.destroy) {
      if (window.debug) {
        window.debug.debug("Destroying previous diagram");
      }
      this.currentDiagram.destroy();
    }

    const container = document.getElementById("diagram-container");
    if (!container) {
      if (window.debug) {
        window.debug.error("DiagramManager", "Diagram container not found!");
      }
      return;
    }

    // Clear container
    container.innerHTML = "";
    container.classList.add("has-diagram");

    // Stop loading messages if they're running
    stopLoadingMessages();

    if (window.debug) {
      window.debug.debug("Container cleared, starting D3 render...");
    }

    try {
      this.renderWithD3(data);
      if (window.debug) {
        window.debug.debug("D3 render completed successfully");
      }
    } catch (error) {
      if (window.debug) {
        window.debug.error(
          "DiagramManager",
          "Error rendering D3 diagram:",
          error
        );
        window.debug.error("DiagramManager", "Error stack:", error.stack);
      }
      this.showError(`Failed to render diagram: ${error.message}`);
    }
  }

  renderWithD3(data) {
    if (window.debug) {
      window.debug.debug("=== renderWithD3 called ===");
      window.debug.debug(`D3 data: ${JSON.stringify(data)}`);
    }

    // Check if D3 is available
    if (typeof d3 === "undefined") {
      if (window.debug) {
        window.debug.error("DiagramManager", "D3.js is not loaded!");
      }
      this.showError(
        "D3.js library is not available. Please check if D3.js is properly loaded."
      );
      return;
    }

    const container = document.getElementById("diagram-container");
    container.innerHTML =
      '<div id="d3-diagram" style="width: 100%; height: 100%;"></div>';

    if (window.debug) {
      window.debug.debug(
        `Checking for D3ERDiagram class: ${typeof D3ERDiagram}`
      );
    }

    // Create D3 diagram
    if (typeof D3ERDiagram !== "undefined") {
      if (window.debug) {
        window.debug.debug("Creating new D3ERDiagram instance...");
      }

      // Check if D3ERDiagram constructor works
      try {
        this.currentDiagram = new D3ERDiagram("d3-diagram", {
          width: 800,
          height: 600,
        });
        if (window.debug) {
          window.debug.debug("D3ERDiagram created:", this.currentDiagram);
        }
      } catch (error) {
        if (window.debug) {
          window.debug.error("Error creating D3ERDiagram:", error);
        }
        this.showError(`Failed to create D3 diagram: ${error.message}`);
        return;
      }

      // Check if render method exists
      if (!this.currentDiagram.render) {
        if (window.debug) {
          window.debug.error("D3ERDiagram render method not found!");
        }
        this.showError("D3ERDiagram render method is not available.");
        return;
      }

      if (window.debug) {
        window.debug.debug("Calling render on D3ERDiagram...");
      }
      try {
        this.currentDiagram.render(data);
        if (window.debug) {
          window.debug.debug("D3ERDiagram render complete");
        }
      } catch (error) {
        if (window.debug) {
          window.debug.error("Error during D3ERDiagram render:", error);
        }
        this.showError(`Failed to render D3 diagram: ${error.message}`);
        return;
      }

      // Force SVG to fill container
      setTimeout(() => {
        if (this.currentDiagram && this.currentDiagram.updateSVGDimensions) {
          this.currentDiagram.updateSVGDimensions();
        }
      }, 200);

      this.addD3Controls();
      if (window.debug) {
        window.debug.debug("D3 controls added");
      }
    } else {
      if (window.debug) {
        window.debug.error("D3ERDiagram class not found!");
      }
      this.showError("D3ERDiagram class not available");
    }
  }

  addD3Controls() {
    const container = document.getElementById("diagram-container");
    const diagramPanel = document.getElementById("diagram-panel");

    if (!container || !this.currentDiagram) {
      return;
    }

    // Remove any existing controls first
    const existingControls = container.querySelector(
      ".diagram-controls-overlay"
    );
    if (existingControls) {
      existingControls.remove();
    }

    const controls = document.createElement("div");
    controls.className = "diagram-controls-overlay";

    // Only show controls if diagram panel is active
    if (!diagramPanel || !diagramPanel.classList.contains("active")) {
      controls.style.display = "none";
    }

    controls.innerHTML = `
            <button onclick="window.diagramManager.currentDiagram.zoomIn()">Zoom In</button>
            <button onclick="window.diagramManager.currentDiagram.zoomOut()">Zoom Out</button>
            <button onclick="window.diagramManager.currentDiagram.resetZoom()">Reset</button>
            <button onclick="window.diagramManager.currentDiagram.fitToViewport()">Fit</button>
            <button onclick="window.diagramManager.currentDiagram.exportAsPNG()">Export PNG</button>
        `;

    container.appendChild(controls);
  }

  showError(message) {
    const container = document.getElementById("diagram-container");
    if (!container) {
      return;
    }

    container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">⚠️</div>
                <div class="error-title">Diagram Error</div>
                <div class="error-message">${message}</div>
                <div class="error-actions">
                    <button onclick="window.requestERDiagram && window.requestERDiagram()" class="retry-button">Retry</button>
                </div>
            </div>
        `;
  }

  // Export current diagram
  exportDiagram() {
    if (this.currentDiagram && this.currentDiagram.exportAsPNG) {
      this.currentDiagram.exportAsPNG();
    } else {
      if (window.debug) {
        window.debug.warn("Export not available - D3 diagram not initialized");
      }
    }
  }
}

// Initialize the diagram manager
let diagramManager = null;
let isInitialized = false;

function initializeDiagram() {
  if (isInitialized) {
    if (window.debug) {
      window.debug.debug("Diagram already initialized, skipping...");
    }
    return;
  }

  if (window.debug) {
    window.debug.debug("Initializing D3.js diagram functionality...");
  }
  diagramManager = new DiagramManager();
  window.diagramManager = diagramManager;

  // Set up event listeners for diagram controls
  setupDiagramEventListeners();

  isInitialized = true;
  if (window.debug) {
    window.debug.debug("D3.js diagram initialization complete");
  }
}

// Add diagram button event listeners
function setupDiagramEventListeners() {
  if (window.debug) {
    window.debug.debug("Setting up diagram event listeners...");
  }

  // Add a small delay to ensure DOM is fully ready
  setTimeout(() => {
    const generateBtn = document.getElementById("generate-diagram");
    if (window.debug) {
      window.debug.debug("Generate button found:", generateBtn);
    }
    if (generateBtn) {
      // Remove any existing listeners first
      generateBtn.removeEventListener("click", requestERDiagram);
      generateBtn.addEventListener("click", requestERDiagram);
      if (window.debug) {
        window.debug.debug("Generate button event listener added");
      }
    } else {
      if (window.debug) {
        window.debug.error("Generate button not found!");
      }
    }

    // Note: Auto-generation removed - users must manually click "Generate ER Diagram" button
  }, 100);
}

// Enhanced diagram request function
function requestERDiagram() {
  if (window.debug) {
    window.debug.debug("=== REQUESTING ER DIAGRAM ===");
    window.debug.debug("requestERDiagram function called!");
  }

  // Check connection state first
  const currentState =
    typeof getCurrentState === "function" ? getCurrentState() : {};

  // If there's a connection error, show error instead of loading
  if (currentState.connectionError) {
    if (window.debug) {
      window.debug.debug(
        "Connection error detected, showing error instead of loading"
      );
    }
    showDiagramError(
      "Cannot generate diagram: " + currentState.connectionError
    );
    return;
  }

  // If not connected, show connection required error
  if (!currentState.isConnected) {
    if (window.debug) {
      window.debug.debug(
        "Not connected to database, showing connection required error"
      );
    }
    showDiagramError(
      "Please connect to the database first. If the database is encrypted, enter the correct password."
    );
    return;
  }

  const generateBtn = document.getElementById("generate-diagram");
  if (generateBtn) {
    generateBtn.disabled = true;
    generateBtn.textContent = "Generating...";
  }

  // Show loading state only if connected
  showDiagramLoading();

  // Check if vscode API is available
  const vscode = window.vscode;
  if (window.debug) {
    window.debug.debug(`vscode API available: ${!!vscode}`);
  }

  if (vscode) {
    const message = {
      type: "generateERDiagram",
      key: window.appState?.encryptionKey || "",
    };

    if (window.debug) {
      window.debug.debug("Sending message to extension:", message);
      window.debug.debug("App state:", window.appState);
    }
    vscode.postMessage(message);
  } else {
    if (window.debug) {
      window.debug.error("vscode API not available");
    }
    showDiagramError("Extension API not available");
  }
}

// Enhanced diagram data handler
function handleERDiagramData(data) {
  if (window.debug) {
    window.debug.debug("=== HANDLING ER DIAGRAM DATA ===");
  }
  if (window.debug) {
    window.debug.debug("handleERDiagramData called with:", data);
  }

  const generateBtn = document.getElementById("generate-diagram");
  if (generateBtn) {
    generateBtn.disabled = false;
    generateBtn.textContent = "Generate ER Diagram";
  }

  try {
    if (window.debug) {
      window.debug.debug("Checking diagramManager:", diagramManager);
    }
    if (diagramManager) {
      if (window.debug) {
        window.debug.debug("Calling diagramManager.render with data:", data);
      }
      diagramManager.render(data);
      if (window.debug) {
        window.debug.debug("diagramManager.render completed");
      }
    } else {
      if (window.debug) {
        window.debug.error("Diagram manager not initialized");
      }
      showDiagramError("Diagram manager not initialized");
    }
  } catch (error) {
    if (window.debug) {
      window.debug.error("Error handling ER diagram data:", error);
      window.debug.error("Error stack:", error.stack);
    }
    showDiagramError("Failed to render diagram: " + error.message);
  }
}

// Diagram loading and error functions
function showDiagramLoading() {
  const container = document.getElementById("diagram-container");
  if (container) {
    container.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <div class="loading-text">Generating diagram...</div>
            </div>
        `;

    // Optional: start simple message rotation
    startLoadingMessages();
  }
}

// Simple progress update function
function updateDiagramProgress(message) {
  const loadingText = document.querySelector(".loading-text");

  // Update loading text if provided
  if (message && loadingText) {
    loadingText.textContent = message;
  }
}

// Enhanced loading messages
const loadingMessages = [
  "Generating diagram...",
  "Analyzing database structure...",
  "Finalizing visualization...",
];

let messageIndex = 0;
let messageInterval;

function startLoadingMessages() {
  const loadingText = document.querySelector(".loading-text");
  if (!loadingText) {
    return;
  }

  messageInterval = setInterval(() => {
    if (messageIndex < loadingMessages.length) {
      loadingText.textContent = loadingMessages[messageIndex];
      messageIndex++;
    } else {
      clearInterval(messageInterval);
    }
  }, 800);
}

function stopLoadingMessages() {
  if (messageInterval) {
    clearInterval(messageInterval);
    messageInterval = null;
  }
  messageIndex = 0;
}

function showDiagramError(message) {
  const container = document.getElementById("diagram-container");
  if (container) {
    container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">⚠️</div>
                <div class="error-title">Error Generating Diagram</div>
                <div class="error-message">${message}</div>
                <div class="error-actions">
                    <button id="retry-diagram-btn" class="retry-button">Try Again</button>
                </div>
            </div>
        `;

    // Add click handler for the retry button
    const retryBtn = document.getElementById("retry-diagram-btn");
    if (retryBtn) {
      retryBtn.addEventListener("click", function () {
        if (window.debug) {
          window.debug.debug("Retry button clicked");
        }
        if (window.requestERDiagram) {
          window.requestERDiagram();
        } else {
          if (window.debug) {
            window.debug.error("requestERDiagram function not found");
          }
        }
      });
    }
  }
}

// Export D3 diagram functions
window.initializeDiagram = initializeDiagram;
window.requestERDiagram = requestERDiagram;
window.handleERDiagramData = handleERDiagramData;
window.showDiagramLoading = showDiagramLoading;
window.showDiagramError = showDiagramError;

// Debug function to manually test button
window.testGenerateButton = function () {
  const btn = document.getElementById("generate-diagram");
  if (window.debug) {
    window.debug.debug("Test: Button found:", btn);
  }
  if (btn) {
    btn.click();
  }
};

// Note: Initialization is handled by main.js calling initializeDiagram()
// No auto-initialization here to avoid conflicts
