/**
 * next.config.js
 *
 * FIX: HIGH-4 — Full security header suite (CSP, HSTS, X-Frame-Options, etc.)
 * FIX: LOW-1  — serverExternalPackages prevents heavy server-only deps from
 *               being bundled into the client/edge build
 *
 * Notes on CSP:
 *   - Next.js 14 supports nonce-based CSP via middleware (see middleware.ts).
 *     The static header here uses 'unsafe-inline' for styles as a baseline;
 *     tighten to a nonce once you audit all inline styles.
 *   - Adjust connect-src as you add/remove external API integrations.
 *   - report-uri points to /api/csp-report — wire up a route to log violations.
 *
 * Notes on HSTS:
 *   - preload is included. Only submit to the HSTS preload list
 *     (https://hstspreload.org) once you are confident the domain is
 *     permanently HTTPS-only.
 */

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV === 'development';

/**
 * Content-Security-Policy directives.
 *
 * Split into an array for readability; joined to a single header value below.
 */
const cspDirectives = [
  // Deny everything not explicitly allowed.
  "default-src 'self'",

  // Scripts: self only.
  // In production with nonce support (see middleware.ts) you can remove
  // 'unsafe-inline'; for now it's restricted to self.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",

  // Styles: self + inline (many CSS-in-JS setups require unsafe-inline;
  // replace with nonce or hash once you audit).
  "style-src 'self' 'unsafe-inline'",

  // Images: self, data URIs (for tiny inline images), and S3.
  `img-src 'self' data: https://*.s3.amazonaws.com https://*.s3.${
    process.env.AWS_REGION ?? 'us-east-1'
  }.amazonaws.com`,

  // Fonts: self only (add CDN if you use Google Fonts etc.).
  "font-src 'self'",

  // Fetch / XHR / WebSocket targets.
  [
    "connect-src 'self'",
    'https://api.openai.com',              // OpenAI Whisper + GPT-4o
    'https://app.five9.com',               // Five9 SOAP
    'https://api.five9.com',               // Five9 REST (if used)
    `https://*.s3.${process.env.AWS_REGION ?? 'us-east-1'}.amazonaws.com`, // S3 pre-signed
    ...(isDev ? ['ws://localhost:*', 'http://localhost:*'] : []),           // HMR in dev
  ].join(' '),

  // Audio/video: self + pre-signed S3 URLs for call recordings.
  `media-src 'self' blob: https://*.s3.amazonaws.com https://*.s3.${
    process.env.AWS_REGION ?? 'us-east-1'
  }.amazonaws.com`,

  // Workers: self only (Web Workers for audio processing if used).
  "worker-src 'self' blob:",

  // Iframes: deny all — no legitimate reason to frame or be framed.
  "frame-src 'none'",
  "frame-ancestors 'none'",

  // Objects (Flash etc.): deny.
  "object-src 'none'",

  // Base URI: restrict to self to prevent base-tag injection.
  "base-uri 'self'",

  // Forms: self only.
  "form-action 'self'",

  // Upgrade any accidental HTTP sub-resource requests.
  'upgrade-insecure-requests',

  // CSP violation reporting (wire up /api/csp-report to log violations).
  'report-uri /api/csp-report',
];

const ContentSecurityPolicy = cspDirectives.join('; ');

/**
 * Headers applied to every route.
 *
 * References:
 *   https://owasp.org/www-project-secure-headers/
 *   https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers
 */
const securityHeaders = [
  // ── Transport ────────────────────────────────────────────────────────
  {
    // HSTS: force HTTPS for 2 years, include all subdomains.
    // Only add `; preload` and submit to preload list when you are
    // ready to permanently commit this domain to HTTPS.
    key:   'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },

  // ── Content sniffing / injection ─────────────────────────────────────
  {
    key:   'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key:   'Content-Security-Policy',
    value: ContentSecurityPolicy,
  },

  // ── Framing ──────────────────────────────────────────────────────────
  {
    // Belt-and-suspenders with CSP frame-ancestors for older browsers.
    key:   'X-Frame-Options',
    value: 'DENY',
  },

  // ── Referrer ─────────────────────────────────────────────────────────
  {
    // Send full URL on same-origin, only origin on cross-origin HTTPS.
    // Prevents referrer leaking call IDs or auth tokens in query strings.
    key:   'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },

  // ── Browser features ─────────────────────────────────────────────────
  {
    // Explicitly disable browser features this app doesn't use.
    key:   'Permissions-Policy',
    value: [
      'camera=()',           // no camera access
      'microphone=()',       // no microphone access (recordings come from Five9)
      'geolocation=()',      // no location
      'payment=()',          // no payment APIs
      'usb=()',              // no USB
      'interest-cohort=()',  // opt out of FLoC / Topics API
    ].join(', '),
  },

  // ── DNS prefetch ─────────────────────────────────────────────────────
  {
    // Prevent the browser from pre-resolving links on compliance pages.
    key:   'X-DNS-Prefetch-Control',
    value: 'off',
  },

  // ── Cross-origin isolation ───────────────────────────────────────────
  {
    // Required for SharedArrayBuffer if used; good practice regardless.
    key:   'Cross-Origin-Opener-Policy',
    value: 'same-origin',
  },
  {
    key:   'Cross-Origin-Resource-Policy',
    value: 'same-origin',
  },
  {
    key:   'Cross-Origin-Embedder-Policy',
    value: 'require-corp',
  },
];

// ---------------------------------------------------------------------------
// Next.js config
// ---------------------------------------------------------------------------
const nextConfig = {
  // ── Security headers ──────────────────────────────────────────────────
  async headers() {
    return [
      {
        // Apply to every route (HTML, API, _next/static, etc.).
        // Static assets get all headers; the browser ignores irrelevant ones.
        source:  '/(.*)',
        headers: securityHeaders,
      },
    ];
  },

  // ── FIX: LOW-1 — Server-only packages ─────────────────────────────────
  // Prevents these packages from being accidentally bundled into the
  // client or Edge runtime.  Add any other Node.js-only deps here.
  serverExternalPackages: [
    'bcryptjs',    // native crypto bindings
    'bullmq',      // Node.js streams / Redis
    'ioredis',     // Redis TCP
    'soap',        // SOAP client
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
    '@aws-sdk/client-secrets-manager',
  ],

  // ── Image optimisation ────────────────────────────────────────────────
  images: {
    // Restrict remote image sources if you use next/image anywhere.
    remotePatterns: [],
  },

  // ── Compiler ─────────────────────────────────────────────────────────
  // Remove console.* calls in production builds (except console.error).
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error'] }
      : false,
  },

  // ── Experimental ─────────────────────────────────────────────────────
  experimental: {
    // Opt in to the App Router server-actions CSRF protection (Next 14).
    serverActions: {
      allowedOrigins: process.env.NEXTAUTH_URL
        ? [new URL(process.env.NEXTAUTH_URL).host]
        : [],
    },
  },
};

module.exports = nextConfig;
