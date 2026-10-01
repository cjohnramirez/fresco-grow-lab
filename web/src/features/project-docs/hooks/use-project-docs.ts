"use client"

import * as React from "react"

import type { ProjectDocSlug } from "@/lib/project-docs/docs"

type DocMeta = {
  slug: ProjectDocSlug
  title: string
  description: string
  path: string
}

type DocsListResponse =
  | { ok: true; docs: DocMeta[] }
  | { ok: false; message: string }

type DocResponse =
  | { ok: true; doc: DocMeta; content: string }
  | { ok: false; message: string }

export function useProjectDocs(initialSlug: ProjectDocSlug = "readme") {
  const [docs, setDocs] = React.useState<DocMeta[]>([])
  const [activeSlug, setActiveSlug] = React.useState<ProjectDocSlug>(initialSlug)
  const [content, setContent] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false

    fetch("/api/project-docs")
      .then((response) => response.json() as Promise<DocsListResponse>)
      .then((payload) => {
        if (!cancelled) {
          if (payload.ok) {
            setDocs(payload.docs)
          } else {
            setError(payload.message)
          }
        }
      })
      .catch((listError) => {
        if (!cancelled) {
          setError(
            listError instanceof Error
              ? listError.message
              : "Project documents could not be loaded."
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const selectDoc = React.useCallback(
    (slug: ProjectDocSlug) => {
      if (slug === activeSlug) {
        return
      }

      setActiveSlug(slug)
      setContent("")
      setLoading(true)
      setError(null)
    },
    [activeSlug]
  )

  React.useEffect(() => {
    let cancelled = false

    fetch(`/api/project-docs/${activeSlug}`)
      .then((response) => response.json() as Promise<DocResponse>)
      .then((payload) => {
        if (cancelled) {
          return
        }
        if (payload.ok) {
          setContent(payload.content)
        } else {
          setError(payload.message)
        }
      })
      .catch((docError) => {
        if (!cancelled) {
          setError(
            docError instanceof Error
              ? docError.message
              : "Project document could not be loaded."
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeSlug])

  const activeDoc =
    docs.find((doc) => doc.slug === activeSlug) ??
    docs.find((doc) => doc.slug === initialSlug) ??
    null

  return {
    activeDoc,
    activeSlug,
    content,
    docs,
    error,
    loading,
    setActiveSlug: selectDoc,
  }
}
