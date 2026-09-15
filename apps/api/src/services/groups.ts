import type { Pool } from "pg";
import { AppError } from "../errors.js";

export interface GroupRow {
  id: string;
  name: string;
  currency: string;
  created_at: Date;
}

export async function findGroupOr404(pool: Pool, id: string): Promise<GroupRow> {
  const { rows } = await pool.query<GroupRow>(
    `SELECT id, name, currency, created_at FROM groups WHERE id = $1`,
    [id]
  );

  const group = rows[0];
  if (!group) {
    throw new AppError(404, "GROUP_NOT_FOUND", "Group not found");
  }
  return group;
}

export async function assertGroupMember(
  pool: Pool,
  groupId: string,
  userId: string
): Promise<void> {
  const { rows } = await pool.query(
    `SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`,
    [groupId, userId]
  );

  if (rows.length === 0) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "You are not a member of this group"
    );
  }
}
