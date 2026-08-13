import { Buffer } from 'node:buffer'
import { createError, defineEventHandler, getQuery } from 'h3'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const logoUrl = String(query.url || '')

  if (!logoUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A logo URL is required',
    })
  }

  const response = await fetch(logoUrl)
  const contentType = response.headers.get('content-type') || 'application/octet-stream'
  const body = Buffer.from(await response.arrayBuffer()).toString('base64')
  const imageDataUrl = contentType.startsWith('image/')
    ? `data:${contentType};base64,${body}`
    : null

  return {
    url: logoUrl,
    status: response.status,
    contentType,
    imageDataUrl,
  }
})
