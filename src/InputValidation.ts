import type { z } from 'zod';

/** Preserve the public TypeError contract while retaining structured Zod issues as the cause. */
export function parseInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
  name = 'input',
): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues
      .map(
        (issue) =>
          `${name}${issue.path.length ? `.${issue.path.join('.')}` : ''}: ${issue.message}`,
      )
      .join('; ');
    throw new TypeError(message, { cause: result.error });
  }
  return result.data;
}
