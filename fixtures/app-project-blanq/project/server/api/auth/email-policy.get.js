import { defineEventHandler, getQuery } from 'h3'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const email = String(query.email || '')
  const emailPattern = new RegExp('^([a-z0-9._-]+)+@', 'i')

  return {
    email,
    accepted: emailPattern.test(email),
  }
})
