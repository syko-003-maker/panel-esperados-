// Simple in-memory health state for the worker
// This is imported by both the worker and the health check endpoint

export class WorkerHealth {
  private static lastActivityTime = Date.now();
  private static lastJobProcessedTime = Date.now();
  private static isProcessing = false;
  private static lastErrorTime = 0;
  private static lastErrorMessage = "";
  private static staleThresholdMs = 5 * 60 * 1000; // 5 minutes

  static recordActivity() {
    this.lastActivityTime = Date.now();
  }

  static recordJobProcessed() {
    this.lastJobProcessedTime = Date.now();
    this.isProcessing = false;
  }

  static recordJobStart() {
    this.isProcessing = true;
  }

  static recordError(message: string) {
    this.lastErrorTime = Date.now();
    this.lastErrorMessage = message;
  }

  static getStatus() {
    const now = Date.now();
    const timeSinceLastActivity = now - this.lastActivityTime;
    const isStale = timeSinceLastActivity > this.staleThresholdMs;

    return {
      lastActivityTime: new Date(this.lastActivityTime).toISOString(),
      lastJobProcessedTime: new Date(this.lastJobProcessedTime).toISOString(),
      timeSinceLastActivityMs: timeSinceLastActivity,
      isStale,
      isProcessing: this.isProcessing,
      lastError: this.lastErrorMessage,
      lastErrorTime: this.lastErrorTime > 0 ? new Date(this.lastErrorTime).toISOString() : null,
    };
  }
}
