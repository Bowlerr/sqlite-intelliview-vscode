// enhanced-diagram.js - D3.js ER Diagram

/**
 * D3.js ER Diagram Manager
 * High-performance, interactive database diagrams using D3.js
 */
class DiagramManager {
  constructor() {
    this.currentDiagram = null;
    this.data = null;

    this.init();
  }

  init() {
    this.setupEventListeners();
    console.log("D3.js diagram manager initialized");
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
    console.log("=== DiagramManager.render called ===");
    console.log("Render data:", data);

    this.data = data;

    // Cleanup previous diagram
    if (this.currentDiagram && this.currentDiagram.destroy) {
      console.log("Destroying previous diagram");
      this.currentDiagram.destroy();
    }

    const container = document.getElementById("diagram-container");
    if (!container) {
      console.error("Diagram container not found!");
      return;
    }

    // Clear container
    container.innerHTML = "";
    container.classList.add("has-diagram");

    // Stop loading messages if they're running
    stopLoadingMessages();

    console.log("Container cleared, starting D3 render...");

    try {
      this.renderWithD3(data);
      console.log("D3 render completed successfully");
    } catch (error) {
      console.error("Error rendering D3 diagram:", error);
      console.error("Error stack:", error.stack);
      this.showError(`Failed to render diagram: ${error.message}`);
    }
  }

  renderWithD3(data) {
    console.log("=== renderWithD3 called ===");
    console.log("D3 data:", data);

    // Check if D3 is available
    if (typeof d3 === "undefined") {
      console.error("D3.js is not loaded!");
      this.showError(
        "D3.js library is not available. Please check if D3.js is properly loaded."
      );
      return;
    }

    const container = document.getElementById("diagram-container");
    container.innerHTML =
      '<div id="d3-diagram" style="width: 100%; height: 100%;"></div>';

    console.log("Checking for D3ERDiagram class:", typeof D3ERDiagram);

    // Create D3 diagram
    if (typeof D3ERDiagram !== "undefined") {
      console.log("Creating new D3ERDiagram instance...");

      // Check if D3ERDiagram constructor works
      try {
        this.currentDiagram = new D3ERDiagram("d3-diagram", {
          width: 800,
          height: 600,
        });
        console.log("D3ERDiagram created:", this.currentDiagram);
      } catch (error) {
        console.error("Error creating D3ERDiagram:", error);
        this.showError(`Failed to create D3 diagram: ${error.message}`);
        return;
      }

      // Check if render method exists
      if (!this.currentDiagram.render) {
        console.error("D3ERDiagram render method not found!");
        this.showError("D3ERDiagram render method is not available.");
        return;
      }

      console.log("Calling render on D3ERDiagram...");
      try {
        this.currentDiagram.render(data);
        console.log("D3ERDiagram render complete");
      } catch (error) {
        console.error("Error during D3ERDiagram render:", error);
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
      console.log("D3 controls added");
    } else {
      console.error("D3ERDiagram class not found!");
      this.showError("D3ERDiagram class not available");
    }
  }

  prepareVisData(data) {
    const nodes = data.tables.map((table) => ({
      id: table.name,
      label: this.createTableLabel(table),
      title: this.createTableTooltip(table),
    }));

    const edges = [];
    data.relationships.forEach((rel) => {
      rel.foreignKeys.forEach((fk) => {
        edges.push({
          from: rel.table,
          to: fk.referencedTable,
          label: `${fk.column} → ${fk.referencedColumn}`,
        });
      });
    });

    return { nodes, edges };
  }

  createTableLabel(table) {
    let label = `${table.name}\n`;
    table.columns.forEach((col) => {
      const pk = col.primaryKey ? " 🔑" : "";
      label += `${col.name}: ${col.type}${pk}\n`;
    });
    return label;
  }

  createTableTooltip(table) {
    let tooltip = `<b>${table.name}</b><br>`;
    table.columns.forEach((col) => {
      const pk = col.primaryKey ? " (PK)" : "";
      const nn = col.notNull ? " NOT NULL" : "";
      tooltip += `${col.name}: ${col.type}${pk}${nn}<br>`;
    });
    return tooltip;
  }

  sanitizeTableName(name) {
    return name.replace(/[^a-zA-Z0-9_]/g, "_");
  }

  addMermaidInteractivity() {
    const diagramDiv = document.getElementById("mermaid-diagram");
    if (!diagramDiv) {
      return;
    }

    // Add panzoom if available
    if (typeof Panzoom !== "undefined") {
      const svg = diagramDiv.querySelector("svg");
      if (svg) {
        const panzoom = Panzoom(svg, {
          maxScale: 5,
          minScale: 0.1,
          startScale: 1,
        });
        diagramDiv.addEventListener("wheel", panzoom.zoomWithWheel);
      }
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

  addVisControls() {
    const container = document.getElementById("diagram-container");
    if (!container || !this.currentDiagram) {
      return;
    }

    const controls = document.createElement("div");
    controls.className = "diagram-controls-overlay";
    controls.innerHTML = `
            <button onclick="window.diagramManager.currentDiagram.fit()">Fit View</button>
            <button onclick="window.diagramManager.currentDiagram.setOptions({physics: {enabled: !window.diagramManager.currentDiagram.physics.enabled}})">Toggle Physics</button>
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
      // Fallback export logic
      this.exportAsPNG();
    }
  }

  exportAsPNG() {
    const container = document.getElementById("diagram-container");
    if (!container) {
      return;
    }

    const svg = container.querySelector("svg");
    if (!svg) {
      return;
    }

    // Implementation similar to existing export function
    // ... (reuse existing export logic)
  }
}

// Initialize the diagram manager
let diagramManager = null;
let isInitialized = false;

function initializeEnhancedDiagram() {
  if (isInitialized) {
    console.log("Enhanced diagram already initialized, skipping...");
    return;
  }

  console.log("Initializing enhanced diagram functionality...");
  diagramManager = new DiagramManager();
  window.diagramManager = diagramManager;

  // Set up event listeners for diagram controls
  setupDiagramEventListeners();

  isInitialized = true;
  console.log("Enhanced diagram initialization complete");
}

// Legacy function for compatibility with main.js
function initializeDiagram() {
  console.log(
    "Legacy initializeDiagram called, delegating to enhanced version..."
  );
  initializeEnhancedDiagram();
}

// Add diagram button event listeners
function setupDiagramEventListeners() {
  console.log("Setting up diagram event listeners...");

  // Add a small delay to ensure DOM is fully ready
  setTimeout(() => {
    const generateBtn = document.getElementById("generate-diagram");
    console.log("Generate button found:", generateBtn);
    if (generateBtn) {
      // Remove any existing listeners first
      generateBtn.removeEventListener("click", requestERDiagram);
      generateBtn.addEventListener("click", requestERDiagram);
      console.log("Generate button event listener added");
    } else {
      console.error("Generate button not found!");
    }

    // Note: Auto-generation removed - users must manually click "Generate ER Diagram" button
  }, 100);
}

// Enhanced diagram request function
function requestERDiagram() {
  console.log("=== REQUESTING ER DIAGRAM ===");
  console.log("requestERDiagram function called!");

  // Check connection state first
  const currentState =
    typeof getCurrentState === "function" ? getCurrentState() : {};

  // If there's a connection error, show error instead of loading
  if (currentState.connectionError) {
    console.log("Connection error detected, showing error instead of loading");
    showDiagramError(
      "Cannot generate diagram: " + currentState.connectionError
    );
    return;
  }

  // If not connected, show connection required error
  if (!currentState.isConnected) {
    console.log("Not connected to database, showing connection required error");
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
  console.log("vscode API available:", !!vscode);

  if (vscode) {
    const message = {
      type: "generateERDiagram",
      key: window.appState?.encryptionKey || "",
    };

    console.log("Sending message to extension:", message);
    console.log("App state:", window.appState);
    vscode.postMessage(message);
  } else {
    console.error("vscode API not available");
    showDiagramError("Extension API not available");
  }
}

// Enhanced diagram data handler
function handleERDiagramData(data) {
  console.log("=== HANDLING ER DIAGRAM DATA ===");
  console.log("handleERDiagramData called with:", data);

  const generateBtn = document.getElementById("generate-diagram");
  if (generateBtn) {
    generateBtn.disabled = false;
    generateBtn.textContent = "Generate ER Diagram";
  }

  try {
    console.log("Checking diagramManager:", diagramManager);
    if (diagramManager) {
      console.log("Calling diagramManager.render with data:", data);
      diagramManager.render(data);
      console.log("diagramManager.render completed");
    } else {
      console.error("Diagram manager not initialized");
      showDiagramError("Diagram manager not initialized");
    }
  } catch (error) {
    console.error("Error handling ER diagram data:", error);
    console.error("Error stack:", error.stack);
    showDiagramError("Failed to render diagram: " + error.message);
  }
}

// Keep existing functions for compatibility
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
        console.log("Retry button clicked");
        if (window.requestERDiagram) {
          window.requestERDiagram();
        } else {
          console.error("requestERDiagram function not found");
        }
      });
    }
  }
}

// Export enhanced functions
window.initializeDiagram = initializeDiagram;
window.initializeEnhancedDiagram = initializeEnhancedDiagram;
window.requestERDiagram = requestERDiagram;
window.handleERDiagramData = handleERDiagramData;
window.showDiagramLoading = showDiagramLoading;
window.showDiagramError = showDiagramError;

// Debug function to manually test button
window.testGenerateButton = function () {
  const btn = document.getElementById("generate-diagram");
  console.log("Test: Button found:", btn);
  if (btn) {
    btn.click();
  }
};

// Note: Initialization is handled by main.js calling initializeDiagram()
// No auto-initialization here to avoid conflicts
