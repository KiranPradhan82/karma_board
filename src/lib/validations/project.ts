import { z } from "zod";

const priorities = ["HIGH", "MEDIUM", "LOW"] as const;
const projectStatuses = ["ACTIVE", "COMPLETED", "ON_HOLD", "ARCHIVED"] as const;

export const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(100, "Project name must be under 100 characters"),
  description: z.string().max(500, "Description must be under 500 characters").optional(),
  priority: z.enum(priorities).default("MEDIUM"),
  clientName: z.string().max(100).optional(),
  color: z
    .string()
    .regex(/^#([0-9A-Fa-f]{3}){1,2}$/, "Must be a valid hex color (e.g. #6366f1)")
    .optional(),
  deadline: z
    .string()
    .datetime({ message: "Must be a valid date" })
    .optional()
    .transform((v) => (v ? new Date(v).toISOString() : undefined)),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  priority: z.enum(priorities).optional(),
  status: z.enum(projectStatuses).optional(),
  clientName: z.string().max(100).nullable().optional(),
  color: z
    .string()
    .regex(/^#([0-9A-Fa-f]{3}){1,2}$/, "Must be a valid hex color")
    .nullable()
    .optional(),
  deadline: z
    .string()
    .datetime({ message: "Must be a valid date" })
    .nullable()
    .optional()
    .transform((v) => (v ? new Date(v).toISOString() : v === null ? null : undefined)),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const assignTeamMemberSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  role: z.enum(["LEAD", "DEVELOPER", "MARKETER", "VIEWER", "MEMBER"]),
});

export type AssignTeamMemberInput = z.infer<typeof assignTeamMemberSchema>;

export const bulkAssignSchema = z.object({
  members: z.array(assignTeamMemberSchema).min(1, "At least one member is required"),
});

export type BulkAssignInput = z.infer<typeof bulkAssignSchema>;

export const changeProjectRoleSchema = z.object({
  role: z.enum(["LEAD", "DEVELOPER", "MARKETER", "VIEWER", "MEMBER"]),
});

export type ChangeProjectRoleInput = z.infer<typeof changeProjectRoleSchema>;
