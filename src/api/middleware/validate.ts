import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Express middleware that validates req.body against a Zod schema.
 * Returns 400 with the first validation error on failure.
 * Replaces req.body with the parsed (and typed) result on success.
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const firstError = result.error.errors[0];
      const path = firstError.path.length > 0 ? `${firstError.path.join('.')}: ` : '';
      return res.status(400).json({ error: `${path}${firstError.message}` });
    }
    req.body = result.data;
    next();
  };
}
