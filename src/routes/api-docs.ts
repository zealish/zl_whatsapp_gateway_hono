import { Hono } from 'hono'
import { swaggerUI } from '@hono/swagger-ui'
import { createOpenApiSpec } from '../openapi/spec.js'
import type { Config } from '../config.js'

export function createApiDocsRoutes(config: Config): Hono {
  const routes = new Hono()

  if (!config.DOCS_ENABLED) {
    routes.all('/*', (c) => {
      return c.json({ error: 'API Reference disabled' }, 404)
    })
    return routes
  }

  const spec = createOpenApiSpec(config)

  // Serve the OpenAPI spec as JSON
  routes.get('/openapi.json', (c) => {
    return c.json(spec)
  })

  // Serve Swagger UI
  routes.get('/', swaggerUI({ url: `/reference/openapi.json` }))

  return routes
}
