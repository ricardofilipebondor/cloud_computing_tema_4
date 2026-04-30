import { app, InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import sql, { config as SqlConfig } from "mssql";
import { trackEvent, trackException } from "../application-insights";

type TaskMessage = {
  taskId: string;
  title: string;
};

type DbTaskRow = {
  id: string;
  fileUrl: string | null;
};

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue;
  }
  return value.toLowerCase() === "true";
}

function parseSqlServerPrismaUrl(databaseUrl: string): SqlConfig {
  if (!databaseUrl.startsWith("sqlserver://")) {
    throw new Error("DATABASE_URL must start with sqlserver://");
  }

  const raw = databaseUrl.slice("sqlserver://".length);
  const [hostPart, ...paramParts] = raw.split(";");
  const [server, portString] = hostPart.split(":");
  const params = new Map<string, string>();

  for (const part of paramParts) {
    if (!part.includes("=")) {
      continue;
    }
    const [key, ...valueParts] = part.split("=");
    params.set(key.trim().toLowerCase(), valueParts.join("=").trim());
  }

  const database = params.get("database");
  const user = params.get("user");
  const password = params.get("password");

  if (!server || !database || !user || !password) {
    throw new Error("DATABASE_URL is missing required SQL Server fields.");
  }

  return {
    server,
    port: portString ? Number(portString) : 1433,
    database,
    user: decodeURIComponent(user),
    password: decodeURIComponent(password),
    options: {
      encrypt: parseBoolean(params.get("encrypt"), true),
      trustServerCertificate: parseBoolean(params.get("trustservercertificate"), false)
    }
  };
}

function isTextFile(blobName: string, contentType?: string): boolean {
  if (contentType) {
    const normalized = contentType.toLowerCase();
    if (
      normalized.startsWith("text/") ||
      normalized === "application/json" ||
      normalized === "application/xml"
    ) {
      return true;
    }
  }

  const extension = blobName.includes(".") ? blobName.split(".").pop()?.toLowerCase() : "";
  return ["txt", "md", "csv", "json", "xml", "log"].includes(extension ?? "");
}

function summarizeText(rawText: string): string | null {
  const normalized = rawText.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  const targetSentenceCount = getSummaryConfig(normalized.length).targetSentences;
  if (sentences.length <= targetSentenceCount) {
    return normalizeSummary(normalized.slice(0, getSummaryConfig(normalized.length).maxChars));
  }

  return normalizeSummary(sentences.slice(0, targetSentenceCount).join(" "));
}

function normalizeSummary(summary: string): string {
  const compact = summary.replace(/\s+/g, " ").trim();
  if (!compact) {
    return compact;
  }

  // If model output ends mid-word/sentence, trim safely and close with punctuation.
  const endsWithPunctuation = /[.!?]$/.test(compact);
  if (endsWithPunctuation) {
    return compact;
  }

  const withoutPartialWord = compact.replace(/\s+\S*$/, "").trim();
  if (!withoutPartialWord) {
    return `${compact}.`;
  }

  return /[.!?]$/.test(withoutPartialWord) ? withoutPartialWord : `${withoutPartialWord}.`;
}

function getSummaryConfig(textLength: number): { targetSentences: number; maxChars: number; maxOutputTokens: number } {
  if (textLength < 600) {
    return { targetSentences: 4, maxChars: 520, maxOutputTokens: 260 };
  }
  if (textLength < 1800) {
    return { targetSentences: 4, maxChars: 700, maxOutputTokens: 340 };
  }
  if (textLength < 5000) {
    return { targetSentences: 5, maxChars: 950, maxOutputTokens: 480 };
  }
  return { targetSentences: 6, maxChars: 1300, maxOutputTokens: 620 };
}

function parseTaskMessage(message: TaskMessage | string): TaskMessage {
  if (typeof message !== "string") {
    return message;
  }

  const parseJson = (value: string): TaskMessage | null => {
    try {
      return JSON.parse(value) as TaskMessage;
    } catch {
      return null;
    }
  };

  const direct = parseJson(message);
  if (direct) {
    return direct;
  }

  // Some queue pipelines deliver base64-encoded payloads depending on host settings.
  const decoded = Buffer.from(message, "base64").toString("utf-8");
  const fromBase64 = parseJson(decoded);
  if (fromBase64) {
    return fromBase64;
  }

  throw new Error("Could not parse queue message payload as JSON.");
}

async function summarizeWithGemini(text: string, context: InvocationContext): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  const summaryConfig = getSummaryConfig(text.length);
  const configuredModel = (process.env.GEMINI_MODEL || "").trim().replace(/^models\//, "");
  const modelsToTry = [
    configuredModel,
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-1.5-flash-8b"
  ].filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);

  if (!apiKey) {
    return null;
  }

  for (const model of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text:
                    `Summarize this task attachment in ${summaryConfig.targetSentences} complete, clear sentences. ` +
                    "Keep key actionable details (who/what/when if present), avoid generic wording, and never end mid-sentence.\n\n" +
                    text.slice(0, 8000)
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: summaryConfig.maxOutputTokens
          }
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        context.warn(`Gemini summary request failed for model ${model}: ${response.status} ${errorBody}`);
        if (response.status === 404) {
          continue;
        }
        return null;
      }

      const payload = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };
      const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join(" ").trim();
      if (content) {
        return normalizeSummary(content).slice(0, summaryConfig.maxChars);
      }
    } catch (error) {
      context.warn(`Gemini summary request failed for model ${model}, using local summarizer.`, error);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

function getBlobNameFromUrl(fileUrl: string, containerName: string): string | null {
  try {
    const parsedUrl = new URL(fileUrl);
    const path = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ""));
    const prefix = `${containerName}/`;
    if (!path.startsWith(prefix)) {
      return null;
    }
    return path.slice(prefix.length);
  } catch {
    return null;
  }
}

async function readTextFromAttachment(fileUrl: string, context: InvocationContext): Promise<string | null> {
  const storageConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
  const containerName = process.env.AZURE_BLOB_CONTAINER || "uploads";
  if (!storageConnectionString) {
    context.warn("No storage connection string available for summarization.");
    return null;
  }

  const blobName = getBlobNameFromUrl(fileUrl, containerName);
  if (!blobName) {
    context.warn(`Skipping summary, cannot parse blob name from URL: ${fileUrl}`);
    return null;
  }

  const blobService = BlobServiceClient.fromConnectionString(storageConnectionString);
  const blobClient = blobService.getContainerClient(containerName).getBlobClient(blobName);
  const properties = await blobClient.getProperties();
  if (!isTextFile(blobName, properties.contentType)) {
    return null;
  }

  const downloadResponse = await blobClient.download();
  if (!downloadResponse.readableStreamBody) {
    return null;
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of downloadResponse.readableStreamBody) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(buffer);
    totalBytes += buffer.length;
    if (totalBytes > 200_000) {
      break;
    }
  }

  return Buffer.concat(chunks).toString("utf-8");
}

async function buildSummaryFromAttachment(fileUrl: string, context: InvocationContext): Promise<string | null> {
  const text = await readTextFromAttachment(fileUrl, context);
  if (!text) {
    context.log("Summary skipped: attachment is missing, unreadable, or not text.");
    return null;
  }

  const geminiSummary = await summarizeWithGemini(text, context);
  if (geminiSummary) {
    context.log("Summary generated with Gemini.");
    return geminiSummary;
  }

  context.log("Summary generated with local fallback summarizer.");
  return summarizeText(text);
}

async function handler(message: TaskMessage | string, context: InvocationContext): Promise<void> {
  const parsed = parseTaskMessage(message);

  context.log(`Processing queued task: ${parsed.taskId} (${parsed.title})`);
  trackEvent("TaskProcessingStarted", { taskId: parsed.taskId });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for function processing.");
  }

  const sqlConfig = parseSqlServerPrismaUrl(databaseUrl);
  const pool = await sql.connect(sqlConfig);
  try {
    const taskResult = await pool
      .request()
      .input("taskId", sql.NVarChar(191), parsed.taskId)
      .query<DbTaskRow>("SELECT [id], [fileUrl] FROM [Task] WHERE [id] = @taskId");

    const task = taskResult.recordset[0];
    let summary: string | null = null;
    if (task?.fileUrl) {
      try {
        summary = await buildSummaryFromAttachment(task.fileUrl, context);
      } catch (error) {
        context.error(`Failed to summarize attachment for task ${parsed.taskId}`, error);
      }
    }

    await pool
      .request()
      .input("taskId", sql.NVarChar(191), parsed.taskId)
      .input("summary", sql.NVarChar(sql.MAX), summary)
      .query("UPDATE [Task] SET [processed] = 1, [summary] = @summary WHERE [id] = @taskId");
    context.log(`Task ${parsed.taskId} marked as processed.`);
    trackEvent("TaskProcessed", {
      taskId: parsed.taskId,
      hasSummary: summary ? "true" : "false"
    });
  } finally {
    await pool.close();
  }
}

app.storageQueue("taskProcessor", {
  connection: "Storage",
  queueName: process.env.AZURE_QUEUE_NAME || "tasksqueue",
  handler: async (message, context) => {
    try {
      await handler(message as TaskMessage | string, context);
    } catch (error) {
      const taskId =
        typeof message === "string" ? "unknown" : ((message as { taskId?: string }).taskId ?? "unknown");
      trackException(error, {
        functionName: "taskProcessor",
        taskId
      });
      throw error;
    }
  }
});
