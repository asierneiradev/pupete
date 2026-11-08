import { afterAll, beforeEach } from "vitest";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://pupete:pupete@127.0.0.1:5544/pupete_test";
process.env.APP_SECRET = "test-secret-test-secret-test-secret-0123";
process.env.APP_URL = "https://pupete.test";
process.env.UPLOAD_DIR = "./data/test-uploads";

const { db } = await import("@/lib/db");
const { resetRateLimits } = await import("@/lib/rate-limit");

beforeEach(async () => {
  await db.$executeRawUnsafe(
    `TRUNCATE "PushSubscription","ChatMessage","Assignment","Exclusion","WishLink","Wish","Participant","Game","Session","User" RESTART IDENTITY CASCADE`,
  );
  resetRateLimits();
});

afterAll(async () => {
  await db.$disconnect();
});
