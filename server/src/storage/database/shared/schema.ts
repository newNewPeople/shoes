import { pgTable, uuid, varchar, text, jsonb, timestamp, vector } from 'drizzle-orm/pg-core';

export const shoes = pgTable('shoes', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  name: varchar('name', { length: 255 }),
  // 货号（如 933C-6, SC706, 56658-31）
  productCode: varchar('product_code', { length: 100 }),
  // 码段（如 40-45）
  sizeRange: varchar('size_range', { length: 50 }),
  // 系列名（如 双层系列）
  seriesName: varchar('series_name', { length: 100 }),
  imageKey: varchar('image_key', { length: 512 }).notNull(),
  description: text('description'),
  features: jsonb('features'),
  embedding: vector('embedding', { dimensions: 2048 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});