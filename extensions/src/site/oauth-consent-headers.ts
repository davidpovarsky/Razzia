/** Root host must apply these to the actual consent HTML/HEAD route before send.
 * This additive policy does not activate an issuer or configure a listener.
 */
export const oauthConsentSecurityHeaders = Object.freeze({
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
})
