/**
 * Zod validation middleware factory.
 *
 * Usage:
 *   import { validate } from '../middleware/validate.middleware.js';
 *   import { loginSchema } from '../utils/validators/auth.validators.js';
 *
 *   router.post('/login', validate(loginSchema), loginController);
 *
 * On failure: returns 400 { status: 'error', code: 'VALIDATION_ERROR', message, details }
 * where details is an array of { field, message } objects.
 */

import * as R from '../utils/response.js';

export const validate = (schema, target = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[target]);

  if (!result.success) {
    const details = result.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return R.error(res, 400, 'VALIDATION_ERROR', 'Invalid request', details);
  }

  // Replace with parsed (coerced/stripped) data
  req[target] = result.data;
  next();
};
