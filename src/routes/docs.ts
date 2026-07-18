import { Hono } from 'hono'
import { swaggerUI } from '@hono/swagger-ui'
import { openApiSpec } from '../openapi/spec.js'
import { config } from '../config.js'

export function createDocsRoutes(): Hono {
  const routes = new Hono()

  if (!config.DOCS_ENABLED) {
    routes.all('/*', (c) => {
      return c.json({ error: 'Docs disabled' }, 404)
    })
    return routes
  }

  // Serve the OpenAPI spec as JSON
  routes.get('/openapi.json', (c) => {
    return c.json(openApiSpec)
  })

  // Serve Swagger UI
  routes.get('/', swaggerUI({ url: '/docs/openapi.json' }))

  return routes
}
