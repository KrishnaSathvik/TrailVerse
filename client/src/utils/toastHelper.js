/**
 * Toast Helper Utility
 * Provides a convenient wrapper around the ToastContext
 * Compatible with the existing showToast(message, type, duration) API
 */

/**
 * Create a toast helper from the ToastContext
 * @param {Object} toastContext - The toast context from useToast()
 * @returns {Object} Helper methods for showing toasts
 */
export function createToastHelper(toastContext) {
  if (!toastContext || !toastContext.showToast) {
    // Return no-op functions if toast context is not available
    return {
      success: () => {},
      error: () => {},
      warn: () => {},
      info: () => {}
    };
  }

  const { showToast } = toastContext;

  return {
    /**
     * Show a success toast
     * @param {string} message - Toast message
     * @param {number} duration - Duration in ms (default 3000)
     */
    success: (message, duration = 3000) => {
      showToast(message, 'success', duration);
    },

    /**
     * Show an error toast
     * @param {string} message - Toast message
     * @param {number} duration - Duration in ms (default 3000)
     */
    error: (message, duration = 3000) => {
      showToast(message, 'error', duration);
    },

    /**
     * Show a warning toast
     * @param {string} message - Toast message
     * @param {number} duration - Duration in ms (default 3000)
     */
    warn: (message, duration = 3000) => {
      showToast(message, 'warning', duration);
    },

    /**
     * Show an info toast
     * @param {string} message - Toast message
     * @param {number} duration - Duration in ms (default 3000)
     */
    info: (message, duration = 3000) => {
      showToast(message, 'info', duration);
    }
  };
}

