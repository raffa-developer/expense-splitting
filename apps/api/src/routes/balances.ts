import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { getCurrentUser } from "../plugins/auth.js";
import { idParamSchema } from "../schemas.js";
import { getGroupBalances } from "../services/balances.js";
import { assertGroupMember, findGroupOr404 } from "../services/groups.js";

export function registerBalanceRoutes(app: FastifyInstance, pool: Pool): void {
  app.get<{ Params: { id: string } }>(
    "/api/groups/:id/balances",
    { schema: { params: idParamSchema } },
    async (request) => {
      const group = await findGroupOr404(pool, request.params.id);
      await assertGroupMember(pool, group.id, getCurrentUser(request).id);

      const { total, balances } = await getGroupBalances(pool, group.id);

      return { currency: group.currency, total, balances };
    }
  );
}
