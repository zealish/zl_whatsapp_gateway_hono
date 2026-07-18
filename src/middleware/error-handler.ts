import type { ErrorHandler } from 'hono'
import { AppError } from '../lib/errors.js'
import { errorResponse, httpStatusForCode } from '../lib/response.js'

export const errorHandler: ErrorHandler = (err, c) => {
  const logger = c.get('logger')

  if (err instanceof AppError) {
    logger.warn(
      { err, code: err.code, statusCode: err.statusCode },
      err.message
    )
    return c.json(
      errorResponse(err.code, err.message),
      httpStatusForCode(err.code)
    )
  }

  logger.error({ err }, 'Unhandled error')
  return c.json(errorResponse('INTERNAL_ERROR', 'Internal server error'), 500)
}
