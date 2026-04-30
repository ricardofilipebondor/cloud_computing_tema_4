import type { TelemetryClient } from "applicationinsights";

let initialized = false;
let client: TelemetryClient | null = null;

function getConnectionString(): string | undefined {
  const value = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING?.trim();
  return value ? value : undefined;
}

function ensureInitialized() {
  if (initialized) {
    return;
  }

  const connectionString = getConnectionString();
  if (!connectionString) {
    initialized = true;
    return;
  }

  // applicationinsights is CommonJS; require prevents ESM interop pitfalls in Next runtime.
  const appInsights = require("applicationinsights") as typeof import("applicationinsights");

  try {
    const existingClient = appInsights.defaultClient as Partial<TelemetryClient> | undefined;
    if (!existingClient || typeof existingClient.trackException !== "function") {
      appInsights
        .setup(connectionString)
        .setAutoCollectRequests(true)
        .setAutoCollectDependencies(true)
        .setAutoCollectExceptions(true)
        .setAutoCollectPerformance(true, true)
        .setAutoCollectConsole(true, true)
        .setUseDiskRetryCaching(true)
        .start();
    }

    const defaultClient = appInsights.defaultClient as Partial<TelemetryClient> | undefined;
    client =
      defaultClient && typeof defaultClient.trackException === "function" && typeof defaultClient.trackEvent === "function"
        ? (defaultClient as TelemetryClient)
        : null;
    initialized = true;
  } catch {
    client = null;
    initialized = true;
  }
}

export function getTelemetryClient() {
  ensureInitialized();
  return client;
}

export function trackException(error: unknown, properties?: Record<string, any>) {
  try {
    const aiClient = getTelemetryClient() as Partial<TelemetryClient> | null | undefined;
    if (!aiClient) return;
    if (typeof aiClient?.trackException !== "function") {
      console.error("Application Insights client unavailable; trackException fallback:", {
        error,
        properties
      });
      return;
    }

    aiClient.trackException?.({
      exception: error instanceof Error ? error : new Error(String(error)),
      properties
    });
  } catch (telemetryError) {
    console.error("Application Insights trackException failed:", telemetryError);
    console.error("Original application error:", error, properties);
  }
}

export function trackEvent(name: string, properties?: Record<string, string>) {
  try {
    const aiClient = getTelemetryClient() as Partial<TelemetryClient> | null | undefined;
    if (!aiClient) return;
    if (typeof aiClient?.trackEvent !== "function") {
      return;
    }

    aiClient.trackEvent?.({ name, properties });
  } catch (telemetryError) {
    console.error("Application Insights trackEvent failed:", telemetryError);
  }
}
