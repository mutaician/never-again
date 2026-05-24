import { StrictMode } from 'react'
import { Auth0Provider } from '@auth0/auth0-react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN
const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID
const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE
const auth0RedirectUri =
  import.meta.env.VITE_AUTH0_REDIRECT_URI || window.location.origin

const auth0AuthorizationParams = {
  redirect_uri: auth0RedirectUri,
  ...(auth0Audience ? { audience: auth0Audience } : {}),
}

const app = auth0Domain && auth0ClientId ? (
  <Auth0Provider
    authorizationParams={auth0AuthorizationParams}
    clientId={auth0ClientId}
    domain={auth0Domain}
  >
    <App authEnabled />
  </Auth0Provider>
) : (
  <App authEnabled={false} />
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>{app}</StrictMode>,
)
