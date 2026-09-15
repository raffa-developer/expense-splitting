export const uuidPattern =
  "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

export const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", pattern: uuidPattern }
  }
} as const;

export const groupMemberParamsSchema = {
  type: "object",
  required: ["id", "userId"],
  properties: {
    id: { type: "string", pattern: uuidPattern },
    userId: { type: "string", pattern: uuidPattern }
  }
} as const;
