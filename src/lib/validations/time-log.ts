import { z } from "zod";

export const clockInSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  notes: z.string().max(500, "Notes must be under 500 characters").optional(),
});

export const clockOutSchema = z.object({
  notes: z.string().max(500, "Notes must be under 500 characters").optional(),
});

export type ClockInInput = z.infer<typeof clockInSchema>;
export type ClockOutInput = z.infer<typeof clockOutSchema>;
