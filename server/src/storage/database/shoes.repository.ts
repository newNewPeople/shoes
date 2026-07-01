import { Injectable } from '@nestjs/common';
import { count, desc, eq } from 'drizzle-orm';
import { getDb } from '@/storage/database/drizzle';
import { shoes } from '@/storage/database/shared/schema';

export interface ShoeInsertInput {
  name?: string | null;
  productCode?: string | null;
  sizeRange?: string | null;
  seriesName?: string | null;
  imageKey: string;
  description?: string | null;
  features?: Record<string, unknown> | null;
  embedding?: number[] | null;
}

export interface ShoeRow {
  id: string;
  name: string | null;
  productCode: string | null;
  sizeRange: string | null;
  seriesName: string | null;
  imageKey: string;
  description: string | null;
  features: Record<string, unknown> | null;
  embedding: number[] | null;
  createdAt: Date;
}

function parseEmbedding(raw: unknown): number[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      if (trimmed.startsWith('[')) {
        return JSON.parse(trimmed) as number[];
      }
      return trimmed.split(',').map(Number);
    } catch {
      return null;
    }
  }
  return null;
}

function mapRow(row: typeof shoes.$inferSelect): ShoeRow {
  return {
    id: row.id,
    name: row.name,
    productCode: row.productCode,
    sizeRange: row.sizeRange,
    seriesName: row.seriesName,
    imageKey: row.imageKey,
    description: row.description,
    features: row.features as Record<string, unknown> | null,
    embedding: parseEmbedding(row.embedding),
    createdAt: row.createdAt,
  };
}

@Injectable()
export class ShoesRepository {
  async insert(input: ShoeInsertInput): Promise<ShoeRow> {
    const db = getDb();
    const [row] = await db
      .insert(shoes)
      .values({
        name: input.name ?? null,
        productCode: input.productCode ?? null,
        sizeRange: input.sizeRange ?? null,
        seriesName: input.seriesName ?? null,
        imageKey: input.imageKey,
        description: input.description ?? null,
        features: input.features ?? null,
        embedding: input.embedding ?? null,
      })
      .returning();

    return mapRow(row);
  }

  async countAll(): Promise<number> {
    const db = getDb();
    const [result] = await db.select({ value: count() }).from(shoes);
    return Number(result?.value ?? 0);
  }

  async listPaginated(page: number, pageSize: number): Promise<ShoeRow[]> {
    const db = getDb();
    const offset = (page - 1) * pageSize;
    const rows = await db
      .select()
      .from(shoes)
      .orderBy(desc(shoes.createdAt))
      .limit(pageSize)
      .offset(offset);

    return rows.map(row => ({ ...mapRow(row), embedding: null }));
  }

  async findAllForSearch(seriesName?: string): Promise<ShoeRow[]> {
    const db = getDb();
    const query = db.select().from(shoes);
    const rows = seriesName?.trim()
      ? await query.where(eq(shoes.seriesName, seriesName.trim()))
      : await query;

    return rows.map(mapRow);
  }

  async findImageKeyById(id: string): Promise<string | null> {
    const db = getDb();
    const [row] = await db
      .select({ imageKey: shoes.imageKey })
      .from(shoes)
      .where(eq(shoes.id, id))
      .limit(1);
    return row?.imageKey ?? null;
  }

  async deleteById(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db.delete(shoes).where(eq(shoes.id, id)).returning({ id: shoes.id });
    return result.length > 0;
  }
}
