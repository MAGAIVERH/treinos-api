import { prismaAdapter } from "better-auth/adapters/prisma";
import { betterAuth } from "better-auth/minimal";

import { prisma } from "./db.js";
import { env } from "./env.js";

export const auth = betterAuth({
  baseURL: env.API_BASE_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.WEB_APP_BASE_URL],
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      pkce: true, // ← usa PKCE em vez de cookie para o state
    },
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  advanced: {
    crossSubDomainCookies: {
      enabled: false,
    },
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      httpOnly: true,
      path: "/",
    },
    useSecureCookies: env.NODE_ENV === "production",
    disableCSRFCheck: false,
  },
});
