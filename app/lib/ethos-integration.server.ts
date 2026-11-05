export type EthosImportAttachment = {
  storageKey: string;
  filename: string;
  contentType: string;
  label?: string | null;
  category?: string | null;
};

export type EthosImportQuantityTier = {
  minQty: number;
  maxQty: number;
  price: number;
};

export type EthosImportVariant = {
  shopifyVariantGid: string;
  color: string;
  size: string;
  supplierSku?: string | null;
  quantity: number;
  ethosPrice: number;
  quantityTierPricing?: EthosImportQuantityTier[];
};

export type EthosImportProductPayload = {
  supplierSlug: string;
  shopDomain: string;
  shopifyProductGid: string;
  title: string;
  productType?: string | null;
  ethosPrice?: number;
  variants: EthosImportVariant[];
  attachments: EthosImportAttachment[];
};

export type EthosImportProductResult =
  | { ok: true; itemCode: string; productId: number; variantCount: number; cadCount: number }
  | { ok: false; error: string; status?: number };

function integrationBaseUrl(): string | null {
  const raw = process.env.ETHOS_INTEGRATION_API_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

function integrationApiKey(): string | null {
  return process.env.ETHOS_INTEGRATION_API_KEY?.trim() || null;
}

export function getEthosIntegrationConfigError(): string | null {
  if (!integrationBaseUrl()) {
    return "ETHOS_INTEGRATION_API_URL is not configured";
  }
  if (!integrationApiKey()) {
    return "ETHOS_INTEGRATION_API_KEY is not configured";
  }
  return null;
}

export async function importProductToEthos(
  payload: EthosImportProductPayload,
  options?: { previewStub?: boolean },
): Promise<EthosImportProductResult> {
  if (options?.previewStub) {
    const suffix = payload.shopifyProductGid.match(/\/(\d+)$/)?.[1] ?? "preview";
    return {
      ok: true,
      itemCode: `PREVIEW-${suffix}`,
      productId: 0,
      variantCount: payload.variants.length,
      cadCount: payload.attachments.length,
    };
  }

  const configError = getEthosIntegrationConfigError();
  if (configError) {
    return { ok: false, error: configError, status: 503 };
  }

  const url = `${integrationBaseUrl()}/integrations/shopify/v1/import-product`;
  const apiKey = integrationApiKey()!;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Network error";
    return { ok: false, error: `Could not reach Ethos API: ${message}` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: `Ethos API returned non-JSON (${response.status})`, status: response.status };
  }

  const parsed = body as {
    ok?: boolean;
    error?: string;
    itemCode?: string;
    productId?: number;
    variantCount?: number;
    cadCount?: number;
  };

  if (!response.ok || parsed.ok === false) {
    return {
      ok: false,
      error: parsed.error ?? `Ethos API error (${response.status})`,
      status: response.status,
    };
  }

  if (!parsed.itemCode) {
    return { ok: false, error: "Ethos API response missing itemCode", status: response.status };
  }

  return {
    ok: true,
    itemCode: parsed.itemCode,
    productId: parsed.productId ?? 0,
    variantCount: parsed.variantCount ?? payload.variants.length,
    cadCount: parsed.cadCount ?? payload.attachments.length,
  };
}

export type EthosSyncProductPayload = {
  supplierSlug: string;
  itemCode: string;
  label?: string | null;
  productType?: string | null;
  productStatus?: "available" | "sample" | "discontinued";
  active?: boolean;
};

export type EthosSyncInventoryVariant = {
  color: string;
  size: string;
  quantity?: number;
  locationQuantities?: Record<string, number>;
  mergeLocationQuantities?: boolean;
};

export type EthosSyncResult = { ok: true } | { ok: false; error: string; status?: number };

async function postEthosIntegration(
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
): Promise<EthosSyncResult> {
  const configError = getEthosIntegrationConfigError();
  if (configError) {
    return { ok: false, error: configError, status: 503 };
  }

  const url = `${integrationBaseUrl()}${path}`;
  const apiKey = integrationApiKey()!;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Network error";
    return { ok: false, error: `Could not reach Ethos API: ${message}` };
  }

  let parsed: { ok?: boolean; error?: string };
  try {
    parsed = (await response.json()) as { ok?: boolean; error?: string };
  } catch {
    return { ok: false, error: `Ethos API returned non-JSON (${response.status})`, status: response.status };
  }

  if (!response.ok || parsed.ok === false) {
    return {
      ok: false,
      error: parsed.error ?? `Ethos API error (${response.status})`,
      status: response.status,
    };
  }

  return { ok: true };
}

export async function syncProductToEthos(payload: EthosSyncProductPayload): Promise<EthosSyncResult> {
  return postEthosIntegration("/integrations/shopify/v1/sync-product", "PATCH", payload);
}

export async function syncInventoryToEthos(
  supplierSlug: string,
  itemCode: string,
  variants: EthosSyncInventoryVariant[],
): Promise<EthosSyncResult & { updatedCount?: number }> {
  const configError = getEthosIntegrationConfigError();
  if (configError) {
    return { ok: false, error: configError, status: 503 };
  }

  const url = `${integrationBaseUrl()}/integrations/shopify/v1/sync-inventory`;
  const apiKey = integrationApiKey()!;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ supplierSlug, itemCode, variants }),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Network error";
    return { ok: false, error: `Could not reach Ethos API: ${message}` };
  }

  const parsed = (await response.json()) as { ok?: boolean; error?: string; updatedCount?: number };
  if (!response.ok || parsed.ok === false) {
    return {
      ok: false,
      error: parsed.error ?? `Ethos API error (${response.status})`,
      status: response.status,
    };
  }

  return { ok: true, updatedCount: parsed.updatedCount };
}
