import { access } from "node:fs/promises"

import { describe, expect, it } from "vitest"

import { PROJECT_DOCS, projectDocPath } from "./docs"

describe("project docs allowlist", () => {
  it.each(PROJECT_DOCS.map((doc) => [doc.slug, doc.path]))(
    "%s points at an existing file (%s)",
    async (slug) => {
      await expect(access(projectDocPath(slug)!)).resolves.toBeUndefined()
    }
  )

  it("credits Fresco Greenovations in the overview", async () => {
    const { readFile } = await import("node:fs/promises")
    const about = await readFile(projectDocPath("readme")!, "utf8")
    expect(about).toContain("Fresco Greenovations Inc.")
  })
})
