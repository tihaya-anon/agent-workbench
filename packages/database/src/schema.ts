import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Minimal user table for early persistence tests; future domain tables should live beside it.
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
