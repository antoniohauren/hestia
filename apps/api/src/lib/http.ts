import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { ValidationTargets } from 'hono';
import type { ZodType } from 'zod';

/** zValidator that answers `{ error }` in pt-BR instead of raw zod issues. */
export const validate = <T extends ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue?.path.join('.');
      return c.json({ error: `Dados inválidos${field ? ` (${field})` : ''}: ${issue?.message ?? ''}`.trim() }, 400);
    }
  });

export function fail(status: 400 | 401 | 404 | 409 | 429, message: string): never {
  throw new HTTPException(status, { message });
}
