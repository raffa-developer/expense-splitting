import { Pool, types } from "pg";

types.setTypeParser(types.builtins.INT8, (value) => Number(value));

export function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: 10
  });
}
