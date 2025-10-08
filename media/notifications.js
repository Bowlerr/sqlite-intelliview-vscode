// @ts-check

/**
 * Notification system for user feedback
 */

/**
 * Show loading overlay
 * @param {string} message - Loading message
 */
function showLoading(message) {
  hideLoading();
  const loading = document.createElement("div");
  loading.className = "loading-overlay";
  loading.innerHTML = `
    <div class="loading-spinner"></div>
    <div class="loading-message">${message}</div>
  `;
  document.body.appendChild(loading);
}

/**
 * Hide loading overlay
 */
function hideLoading() {
  document.querySelectorAll(".loading-overlay").forEach((el) => el.remove());
}

/**
 * Show success notification
 * @param {string} message - Success message
 */
function showSuccess(message) {
  showNotification(message, "success");
}

/**
 * Show error notification
 * @param {string} message - Error message
 */
function showError(message) {
  showNotification(message, "error");
}

/**
 * Show notification
 * @param {string} message - Notification message
 * @param {string} type - Notification type (info, success, error)
 * @param {number} duration - Duration in milliseconds
 */
function showNotification(message, type = "info", duration = 5000) {
  // Create or get notification container
  let container = document.querySelector(".notification-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "notification-container";
    document.body.appendChild(container);
  }

  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.innerHTML = message;
  notification.style.zIndex = "2000";
  notification.setAttribute("role", "alert");
  notification.setAttribute("aria-live", "polite");

  // Add close button
  const closeBtn = document.createElement("button");
  closeBtn.className = "close-btn";
  closeBtn.innerHTML = "×";
  closeBtn.title = "Close notification (Escape)";
  closeBtn.setAttribute("aria-label", "Close notification");
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    removeNotification(notification);
  });
  notification.appendChild(closeBtn);

  // Add to container (will stack automatically)
  container.appendChild(notification);

  // Auto remove after specified duration
  const timeoutId = setTimeout(() => {
    removeNotification(notification);
  }, duration);

  // Allow manual close by clicking notification
  notification.addEventListener("click", () => {
    clearTimeout(timeoutId);
    removeNotification(notification);
  });

  // Add keyboard listener for Escape key
  const escapeHandler = (e) => {
    if (e.key === "Escape") {
      clearTimeout(timeoutId);
      removeNotification(notification);
      document.removeEventListener("keydown", escapeHandler);
    }
  };
  document.addEventListener("keydown", escapeHandler);
}

/**
 * Remove notification with animation
 * @param {HTMLElement} notification - Notification element to remove
 */
function removeNotification(notification) {
  if (!notification || !notification.parentNode) {
    return;
  }

  // Add exit animation
  notification.style.animation = "slideOutToRight 0.3s ease-in forwards";

  // Remove after animation
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();

      // Remove container if empty
      const container = document.querySelector(".notification-container");
      if (container && container.children.length === 0) {
        container.remove();
      }
    }
  }, 300);
}

/**
 * Close all notifications
 */
function closeAllNotifications() {
  const container = document.querySelector(".notification-container");
  if (container) {
    const notifications = container.querySelectorAll(".notification");
    notifications.forEach((notification) => {
      removeNotification(/** @type {HTMLElement} */ (notification));
    });
  }
}

/**
 * Show keyboard shortcuts help
 */
function showKeyboardShortcuts() {
  const helpContent = `
    <div class="shortcuts-help">
      <h3>Keyboard Shortcuts</h3>
      <div class="shortcuts-list">
        <div class="shortcut-item">
          <kbd>Ctrl+Enter</kbd> / <kbd>Cmd+Enter</kbd>
          <span>Execute query</span>
        </div>
        <div class="shortcut-item">
          <kbd>Ctrl+K</kbd> / <kbd>Cmd+K</kbd>
          <span>Clear query</span>
        </div>
        <div class="shortcut-item">
          <kbd>Ctrl+F</kbd> / <kbd>Cmd+F</kbd>
          <span>Search in table</span>
        </div>
        <div class="shortcut-item">
          <kbd>Escape</kbd>
          <span>Close notifications</span>
        </div>
      </div>
      <div class="table-features">
        <h4>Table Features</h4>
        <ul>
          <li>Click column headers to sort</li>
          <li>Use 📌 to pin columns</li>
          <li>Use ⚙ to filter columns</li>
          <li>Use 💾 to export data</li>
          <li>Search across all table data</li>
          <li>Drag column/row edges to resize</li>
        </ul>
      </div>
    </div>
  `;

  showNotification(helpContent, "info", 10000);
}

/**
 * Add help button to interface
 */
function addHelpButton() {
  // Help buttons are now added directly in HTML, no need to create them dynamically
  if (window.debug) {
    window.debug.debug("Help buttons are available in the header");
  }
}

/**
 * Show connection help information
 */
function showConnectionHelp() {
  const helpMessage = `
    <div class="help-content">
      <h3>Database Connection Help</h3>
      <p><strong>SQLCipher Key:</strong> Enter the encryption key for SQLCipher-encrypted databases.</p>
      <p><strong>Connection Tips:</strong></p>
      <ul>
        <li>For unencrypted databases, the extension will connect automatically</li>
        <li>For encrypted databases, enter your SQLCipher key and click "Connect with Key"</li>
        <li>Keys are case-sensitive and must match exactly</li>
        <li>The key is not stored - you'll need to re-enter it each time</li>
      </ul>
      <p><strong>Common Issues:</strong></p>
      <ul>
        <li>If connection fails, check that the file is a valid SQLite database</li>
        <li>For encrypted databases, verify the key is correct</li>
        <li>Large databases may take a few moments to connect</li>
      </ul>
    </div>
  `;

  showNotification(helpMessage, "info", 15000);
}

// Make showNotification available globally for browser context
if (typeof window !== "undefined") {
  window.showNotification = showNotification;
}

// Export functions for use in other modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    showLoading,
    hideLoading,
    showSuccess,
    showError,
    showNotification,
    showKeyboardShortcuts,
    addHelpButton,
    showConnectionHelp,
    removeNotification,
    closeAllNotifications,
  };
}
