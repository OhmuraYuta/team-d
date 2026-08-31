import { Pool, QueryResult, QueryResultRow } from "pg";

declare global {
  var _postgresPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set in environment variables");
}

export const pool =
  globalThis._postgresPool ||
  new Pool({
    connectionString,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis._postgresPool = pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}
