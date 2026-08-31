import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  async rewrites() {
    // OAuth discovery documents (RFC 8414 / RFC 9728). Clients probe both
    // the bare path and the path-suffixed variant for the /api/mcp resource.
    const authServer = "/api/oauth/authorization-server-metadata";
    const protectedResource = "/api/oauth/protected-resource-metadata";
    return {
      beforeFiles: [
        {
          source: "/.well-known/oauth-authorization-server",
          destination: authServer,
        },
        {
          source: "/.well-known/oauth-authorization-server/:path*",
          destination: authServer,
        },
        {
          source: "/.well-known/oauth-protected-resource",
          destination: protectedResource,
        },
        {
          source: "/.well-known/oauth-protected-resource/:path*",
          destination: protectedResource,
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default withNextIntl(nextConfig);
