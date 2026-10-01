"use client"

import * as React from "react"
import {
  BookOpenIcon,
  CpuIcon,
  DatabaseIcon,
  FlaskConicalIcon,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { INITIAL_COMPONENTS, Markdown } from "@/components/ui/markdown"
import { Skeleton } from "@/components/ui/skeleton"
import type { useProjectDocs } from "@/features/project-docs/hooks/use-project-docs"
import { PROJECT_DOCS, type ProjectDocSlug } from "@/lib/project-docs/docs"
import { cn } from "@/lib/utils"

const DOC_ICONS: Record<ProjectDocSlug, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  readme: BookOpenIcon,
  hardware: CpuIcon,
  data: DatabaseIcon,
  experiments: FlaskConicalIcon,
}

// Links between repository docs (README.md, docs/*.md) switch tabs here
// instead of 404ing; repo-relative image paths map to the public folder.
function docSlugForHref(href: string | undefined) {
  if (!href) return null
  const path = href.replace(/^(\.\.?\/)+/, "").split("#")[0]
  return PROJECT_DOCS.find((doc) => doc.path === path || doc.path.endsWith(`/${path}`))?.slug ?? null
}

function useDocComponents(openDoc: (slug: ProjectDocSlug) => void) {
  return React.useMemo(
    () => ({
      ...INITIAL_COMPONENTS,
      a({ href, children }: React.ComponentProps<"a">) {
        const slug = docSlugForHref(href)
        if (slug) {
          return (
            <a
              href={`#${slug}`}
              onClick={(event) => {
                event.preventDefault()
                openDoc(slug)
              }}
            >
              {children}
            </a>
          )
        }
        const external = href?.startsWith("http")
        return (
          <a
            href={href}
            {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
          >
            {children}
            {external && <span className="sr-only"> (opens in a new tab)</span>}
          </a>
        )
      },
      table({ children }: React.ComponentProps<"table">) {
        return (
          // Focusable so keyboard users can scroll wide tables.
          <div className="docs-table-wrap" tabIndex={0}>
            <table>{children}</table>
          </div>
        )
      },
      img({ src, alt }: React.ComponentProps<"img">) {
        const resolved =
          typeof src === "string" ? src.replace(/^(\.\/)?web\/public\//, "/") : src
        // eslint-disable-next-line @next/next/no-img-element -- markdown content
        return <img src={resolved} alt={alt ?? ""} loading="lazy" />
      },
    }),
    [openDoc]
  )
}

export function ProjectDocsView({
  docs,
}: {
  docs: ReturnType<typeof useProjectDocs>
}) {
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([])
  const components = useDocComponents(docs.setActiveSlug)
  const activeIndex = docs.docs.findIndex((doc) => doc.slug === docs.activeSlug)

  // Arrow keys move between doc tabs (WAI-ARIA tabs pattern).
  function onTabKeyDown(event: React.KeyboardEvent, index: number) {
    const last = docs.docs.length - 1
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? index === last ? 0 : index + 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? index === 0 ? last : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null
    if (next === null) return
    event.preventDefault()
    docs.setActiveSlug(docs.docs[next].slug)
    tabRefs.current[next]?.focus()
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-4">
      <div
        role="tablist"
        aria-label="Project documents"
        className="grid grid-cols-2 gap-2 lg:grid-cols-4"
      >
        {docs.docs.map((doc, index) => {
          const Icon = DOC_ICONS[doc.slug] ?? BookOpenIcon
          const selected = doc.slug === docs.activeSlug
          return (
            <button
              key={doc.slug}
              ref={(element) => {
                tabRefs.current[index] = element
              }}
              type="button"
              role="tab"
              id={`doc-tab-${doc.slug}`}
              aria-selected={selected}
              aria-controls="doc-panel"
              tabIndex={selected || (activeIndex === -1 && index === 0) ? 0 : -1}
              onClick={() => docs.setActiveSlug(doc.slug)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              className={cn(
                "flex min-w-0 items-start gap-3 rounded-xl border bg-card p-3 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50",
                selected && "border-primary ring-1 ring-primary"
              )}
            >
              <Icon
                aria-hidden="true"
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  selected ? "text-primary" : "text-muted-foreground"
                )}
              />
              <span className="grid min-w-0">
                <span className="truncate text-sm font-medium">{doc.title}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {doc.description}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {docs.error && (
        <Alert variant="destructive">
          <AlertTitle>Document Error</AlertTitle>
          <AlertDescription>{docs.error}</AlertDescription>
        </Alert>
      )}

      <Card
        id="doc-panel"
        role="tabpanel"
        aria-labelledby={`doc-tab-${docs.activeSlug}`}
        className="min-w-0"
      >
        <CardContent className="py-2 sm:px-8 sm:py-4">
          {docs.loading ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <Markdown className="project-docs-markdown" components={components}>
              {docs.content}
            </Markdown>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
