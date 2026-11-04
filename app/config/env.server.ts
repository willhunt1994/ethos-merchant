import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SHOPIFY_API_KEY: z.string().min(1),
  SHOPIFY_API_SECRET: z.string().min(1),
  SCOPES: z.string().min(1),
  SHOPIFY_APP_URL: z.string().url(),
  ETHOS_INTEGRATION_API_URL: z.string().url().optional(),
  ETHOS_INTEGRATION_API_KEY: z.string().min(1).optional(),
  LOCAL_PREVIEW: z
    .enum(["0", "1", "true", "false"])
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

export function getAppEnv(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }
  cached = parsed.data;
  return cached;
}

export function isLocalPreviewEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const raw = process.env.LOCAL_PREVIEW;
  return raw === "1" || raw === "true";
}
