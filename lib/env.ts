const requiredEnv = [
  "DATABASE_URL",
  "AZURE_STORAGE_CONNECTION_STRING",
  "AZURE_QUEUE_NAME",
  "AZURE_BLOB_CONTAINER"
] as const;

export function validateEnv() {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
