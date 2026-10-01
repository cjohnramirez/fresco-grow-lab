import path from "node:path"
import type { NextConfig } from "next";

const repoRoot = path.join(__dirname, "..")

const nextConfig: NextConfig = {
  // The in-app docs viewer reads Markdown from the repository root (README.md
  // and docs/), outside this Next.js project. Trace from the repo root and
  // include those files so the docs routes keep working when deployed.
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
  },
  outputFileTracingIncludes: {
    "/api/project-docs/*": ["../README.md", "../docs/**/*.md"],
  },
};

export default nextConfig;
