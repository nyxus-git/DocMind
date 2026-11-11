import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function config(phase: string): NextConfig {
  const base: NextConfig = {
    output: "export",
    trailingSlash: true,
    images: {
      unoptimized: true,
    },
  };

  if (phase === PHASE_DEVELOPMENT_SERVER) {
    base.rewrites = async () => [
      {
        source: "/:slug((?!(?:api|app|admin|auth|company|employee|login|signup|org|_next|_not-found|404)(?:/|$))[^/.]+)/:rest*",
        destination: "/org/",
      },
    ];
  }

  return base;
}
