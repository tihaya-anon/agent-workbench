import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Return both layers so callers can query through Drizzle and still close the underlying client.
export const createDatabase = (databaseUrl: string) => {
  const client = postgres(databaseUrl);
  const db = drizzle(client, { schema });

  return { client, db };
};

export type Database = ReturnType<typeof createDatabase>["db"];
