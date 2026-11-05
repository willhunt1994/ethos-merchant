import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "../../db.server";

export function hashWebhookPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function runIdempotentWebhook(
  shopDomain: string,
  topic: string,
  payload: unknown,
  handler: () => Promise<void>,
): Promise<void> {
  const payloadHash = hashWebhookPayload(payload);

  try {
    await prisma.webhookEvent.create({
      data: { shopDomain, topic, payloadHash },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return;
    }
    throw e;
  }

  try {
    await handler();
    await prisma.webhookEvent.update({
      where: {
        shopDomain_topic_payloadHash: { shopDomain, topic, payloadHash },
      },
      data: { processedAt: new Date(), errorMessage: null },
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error(`[webhook ${topic}] ${shopDomain}:`, errorMessage);
    await prisma.webhookEvent.update({
      where: {
        shopDomain_topic_payloadHash: { shopDomain, topic, payloadHash },
      },
      data: { errorMessage },
    });
  }
}
