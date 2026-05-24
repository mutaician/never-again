import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { getRequiredEnv, type Env } from './env'

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

export type Auth0Profile = {
  email: string | null
  name: string | null
  sub: string
}

export async function verifyAuth0Token(
  env: Env,
  token: string,
): Promise<Auth0Profile> {
  const domain = getRequiredEnv(env, 'AUTH0_DOMAIN')
  const audience = getRequiredEnv(env, 'AUTH0_AUDIENCE')
  const issuer = `https://${domain}/`
  const jwks = getJwks(domain)

  const { payload } = await jwtVerify(token, jwks, {
    audience,
    issuer,
  })

  return profileFromPayload(payload)
}

function getJwks(domain: string) {
  const cached = jwksCache.get(domain)
  if (cached) return cached

  const jwks = createRemoteJWKSet(
    new URL(`https://${domain}/.well-known/jwks.json`),
  )

  jwksCache.set(domain, jwks)
  return jwks
}

function profileFromPayload(payload: JWTPayload): Auth0Profile {
  if (!payload.sub) {
    throw new Error('Auth0 token is missing sub')
  }

  return {
    email: typeof payload.email === 'string' ? payload.email : null,
    name: typeof payload.name === 'string' ? payload.name : null,
    sub: payload.sub,
  }
}
