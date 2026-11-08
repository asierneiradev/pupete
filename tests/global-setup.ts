import { execSync } from "node:child_process";

/** Aplica las migraciones a la base de datos de tests (pupete_test); setup.ts vacía las tablas antes de cada test. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://pupete:pupete@127.0.0.1:5544/pupete_test";
  process.env.DATABASE_URL = url;
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
