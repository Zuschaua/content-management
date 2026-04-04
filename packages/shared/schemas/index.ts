import { z } from "zod";

export const createClientSchema = z.object({
  name: z.string().min(1).max(255),
  websiteUrl: z.string().url().max(2048),
  niche: z.string().max(255).optional(),
  industry: z.string().max(255).optional(),
  contactInfo: z
    .object({
      email: z.string().email().optional(),
      phone: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  notes: z.string().optional(),
});

export const updateClientSchema = createClientSchema.partial().extend({
  active: z.boolean().optional(),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const articleStatusValues = [
  "suggested",
  "approved",
  "writing",
  "written",
  "proofreading",
  "ready",
] as const;

export type ArticleStatus = (typeof articleStatusValues)[number];

export const validTransitions: Record<ArticleStatus, ArticleStatus[]> = {
  suggested: ["approved"],
  approved: ["writing", "suggested"],
  writing: ["written"],
  written: ["proofreading", "approved"],
  proofreading: ["ready", "written"],
  ready: [],
};

export function canTransition(
  from: ArticleStatus,
  to: ArticleStatus
): boolean {
  return validTransitions[from]?.includes(to) ?? false;
}
