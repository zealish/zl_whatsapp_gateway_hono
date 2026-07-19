import { Hono } from 'hono'
import { successResponse } from '../lib/response.js'
import { NotFoundError } from '../lib/errors.js'
import type { QueueDB } from '../webhook/queue-db.js'

/**
 * DLQ inspection and replay routes.
 * Allows operators to view and retry failed webhook deliveries.
 */
export function createDLQRoutes(db: QueueDB): Hono {
  const routes = new Hono()

  // GET /dlq — list all dead letters
  routes.get('/', (c) => {
    const instanceId = c.req.query('instanceId')
    const rows = db.getDLQ(instanceId ?? undefined)
    return c.json(successResponse(rows))
  })

  // POST /dlq/:id/replay — re-enqueue a dead letter
  routes.post('/:id/replay', (c) => {
    const id = c.req.param('id')
    const ok = db.replayDLQ(id)
    if (!ok) {
      throw new NotFoundError('Dead letter', id)
    }
    return c.json(successResponse({ replayed: true, id }))
  })

  // DELETE /dlq/:id — discard a dead letter
  routes.delete('/:id', (c) => {
    const id = c.req.param('id')
    const ok = db.deleteDLQ(id)
    if (!ok) {
      throw new NotFoundError('Dead letter', id)
    }
    return c.json(successResponse({ deleted: true, id }))
  })

  return routes
}
