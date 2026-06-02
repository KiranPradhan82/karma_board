import { z } from 'zod';

export const createClientSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  company: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

export const updateClientSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  email: z.string().email('Please enter a valid email address').optional(),
  company: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const notifyClientSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  type: z.enum(['STARTED', 'UPDATE', 'COMPLETED']),
  message: z.string().max(500, 'Message must be under 500 characters').optional(),
});

export const updateClientProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
});

export const newInlineClientSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  company: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type NotifyClientInput = z.infer<typeof notifyClientSchema>;
export type UpdateClientProfileInput = z.infer<typeof updateClientProfileSchema>;
export type NewInlineClientInput = z.infer<typeof newInlineClientSchema>;
