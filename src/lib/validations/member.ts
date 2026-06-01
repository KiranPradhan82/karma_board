import { z } from 'zod';

export const createMemberSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  jobTitle: z.string().optional(),
  phone: z.string().optional(),
  skills: z.string().optional(),
  role: z.enum(['SUPERADMIN', 'ADMIN', 'MEMBER']).default('MEMBER'),
});

export const updateMemberSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  email: z.string().email('Please enter a valid email address').optional(),
  jobTitle: z.string().optional(),
  phone: z.string().optional(),
  skills: z.string().optional(),
  role: z.enum(['SUPERADMIN', 'ADMIN', 'MEMBER']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE']).optional(),
  joinDate: z.string().optional(),
});

export const assignTeamMemberSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  role: z.enum(['LEAD', 'DEVELOPER', 'MARKETER', 'VIEWER', 'MEMBER']).default('MEMBER'),
});

export const bulkAssignSchema = z.object({
  members: z
    .array(
      z.object({
        userId: z.string().min(1, 'User ID is required'),
        role: z.enum(['LEAD', 'DEVELOPER', 'MARKETER', 'VIEWER', 'MEMBER']).default('MEMBER'),
      })
    )
    .min(1, 'At least one member is required'),
});

export const bulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1, 'At least one ID is required'),
});

export const changeProjectRoleSchema = z.object({
  role: z.enum(['LEAD', 'DEVELOPER', 'MARKETER', 'VIEWER', 'MEMBER']),
});

export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type AssignTeamMemberInput = z.infer<typeof assignTeamMemberSchema>;
export type BulkAssignInput = z.infer<typeof bulkAssignSchema>;
export type BulkDeleteInput = z.infer<typeof bulkDeleteSchema>;
export type ChangeProjectRoleInput = z.infer<typeof changeProjectRoleSchema>;
