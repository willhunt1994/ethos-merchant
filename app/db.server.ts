import { statSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

function prismaSchemaMtimeMs(): number {
  try {
    return statSync(join(process.cwd(), "prisma/schema.prisma")).mtimeMs;
  } catch {
    return 0;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var prismaGlobalSchemaMtime: number | undefined;
}

if (process.env.NODE_ENV !== "production") {
  const schemaMtime = prismaSchemaMtimeMs();
  const stale =
    !global.prismaGlobal || global.prismaGlobalSchemaMtime !== schemaMtime;
  if (stale) {
    void global.prismaGlobal?.$disconnect();
    global.prismaGlobal = new PrismaClient();
    global.prismaGlobalSchemaMtime = schemaMtime;
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;
