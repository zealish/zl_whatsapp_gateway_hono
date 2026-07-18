import type { ContentfulStatusCode } from 'hono/utils/http-status'

export interface SuccessResponse<T> {
  success: true
  data: T
}

export interface ErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse

export function successResponse<T>(data: T): SuccessResponse<T> {
  return { success: true, data }
}

export function errorResponse(
  code: string,
  message: string,
  details?: unknown
): ErrorResponse {
  return {
    success: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  }
}

export function httpStatusForCode(code: string): ContentfulStatusCode {
  const map: Record<string, ContentfulStatusCode> = {
    VALIDATION_ERROR: 400,
    UNAUTHORIZED: 401,
    NOT_FOUND: 404,
    CONFLICT: 409,
    SERVICE_UNAVAILABLE: 503,
    INTERNAL_ERROR: 500,
  }
  return map[code] ?? 500
}
