import { Hono } from 'hono'
import { successResponse } from '../lib/response.js'

const health = new Hono()

health.get('/', (c) => {
  return c.json(
    successResponse({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    })
  )
})

export default health
