import path from "node:path"

export type ProjectDocSlug = "readme" | "hardware" | "data" | "experiments"

export const PROJECT_DOCS: Array<{
  slug: ProjectDocSlug
  title: string
  description: string
  path: string
}> = [
  {
    slug: "readme",
    title: "Overview",
    description: "What it is, quick start, credits",
    path: "README.md",
  },
  {
    slug: "hardware",
    title: "Hardware",
    description: "Wiring, firmware, flashing",
    path: "docs/hardware.md",
  },
  {
    slug: "data",
    title: "Data",
    description: "Supabase, keys, packets, API",
    path: "docs/data.md",
  },
  {
    slug: "experiments",
    title: "Experiments",
    description: "What is measured and why",
    path: "docs/experiments.md",
  },
]

export function projectDocForSlug(slug: string) {
  return PROJECT_DOCS.find((doc) => doc.slug === slug) ?? null
}

export function projectDocPath(slug: string) {
  const doc = projectDocForSlug(slug)
  if (!doc) {
    return null
  }

  // Allowlisted files are bundled via outputFileTracingIncludes in
  // next.config.ts, so the tracer does not need to follow this path.
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), "..", doc.path)
}
