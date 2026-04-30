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
    return;
  }

  // applicationinsights is CommonJS; require keeps runtime import stable.
  const appInsights = require("applicationinsights") as typeof import("applicationinsights");

  try {
    appInsights
      .setup(connectionString)
      .setAutoCollectRequests(true)
      .setAutoCollectDependencies(true)
      .setAutoCollectExceptions(true)
      .setAutoCollectPerformance(true, true)
      .setAutoCollectConsole(true, true)
      .setUseDiskRetryCaching(true)
      .start();

    const defaultClient = appInsights.defaultClient as Partial<TelemetryClient> | undefined;
    client =
      defaultClient && typeof defaultClient.trackException === "function" && typeof defaultClient.trackEvent === "function"
        ? (defaultClient as TelemetryClient)
        : null;
    initialized = true;
  } catch {
    client = null;
  }
}

export function getTelemetryClient() {
  ensureInitialized();
  return client;
}

export function trackException(error: unknown, properties?: Record<string, string>) {
  const client = getTelemetryClient();
  if (!client || typeof client.trackException !== "function") {
    return;
  }

  client.trackException({
    exception: error instanceof Error ? error : new Error(String(error)),
    properties
  });
}

export function trackEvent(name: string, properties?: Record<string, string>) {
  const client = getTelemetryClient();
  if (!client || typeof client.trackEvent !== "function") {
    return;
  }

  client.trackEvent({ name, properties });
}
