const TRANSLATOR_API_VERSION = "3.0";

type AzureTranslationResponse = Array<{
  translations: Array<{
    text: string;
    to: string;
  }>;
}>;

function getTranslatorConfig() {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const endpoint = process.env.AZURE_TRANSLATOR_ENDPOINT;
  const region = process.env.AZURE_TRANSLATOR_REGION;

  if (!key || !endpoint) {
    throw new Error("Missing Azure Translator configuration.");
  }

  return {
    key,
    endpoint: endpoint.replace(/\/+$/, ""),
    region
  };
}

export async function translateTextsWithAzure(texts: string[], to: string, from?: string): Promise<string[]> {
  const sanitizedTexts = texts.map((text) => text.trim()).filter(Boolean);
  if (sanitizedTexts.length === 0) {
    return [];
  }

  const { key, endpoint, region } = getTranslatorConfig();
  const params = new URLSearchParams({
    "api-version": TRANSLATOR_API_VERSION,
    to
  });

  if (from?.trim()) {
    params.set("from", from.trim());
  }

  const response = await fetch(`${endpoint}/translate?${params.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": key,
      ...(region ? { "Ocp-Apim-Subscription-Region": region } : {})
    },
    body: JSON.stringify(sanitizedTexts.map((text) => ({ text })))
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Azure Translator failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as AzureTranslationResponse;
  return data.map((item) => item.translations?.[0]?.text ?? "");
}
