"use client"

import * as React from "react"
import { CopyIcon, DatabaseIcon, DownloadIcon, SaveIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { mutate } from "swr"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { isSupabaseProjectUrl } from "@/lib/supabase/custom-headers"

import { useCustomSupabase, writeCustomSupabase } from "./custom-supabase"

const SCHEMA_URL = "/supabase/fresco-schema.sql"

function looksSecret(key: string) {
  if (key.startsWith("sb_secret_")) return true
  // Legacy JWT keys carry their role in the payload.
  const payload = key.split(".")[1]
  if (!payload) return false
  try {
    return atob(payload.replace(/-/g, "+").replace(/_/g, "/")).includes("service_role")
  } catch {
    return false
  }
}

export function SupabasePanel({ onUseCloud }: { onUseCloud: () => void }) {
  const current = useCustomSupabase()
  const [url, setUrl] = React.useState(current?.url ?? "")
  const [key, setKey] = React.useState(current?.key ?? "")
  const [error, setError] = React.useState<string | null>(null)

  function save(event: React.FormEvent) {
    event.preventDefault()
    const trimmedUrl = url.trim().replace(/\/+$/, "")
    const trimmedKey = key.trim()
    if (!isSupabaseProjectUrl(trimmedUrl)) {
      setError("Use your project URL, e.g. https://abcd1234.supabase.co")
      return
    }
    if (!trimmedKey) {
      setError("Paste the project's publishable (anon) key.")
      return
    }
    if (looksSecret(trimmedKey)) {
      setError("That is a secret/service key. Use the publishable (anon) key instead.")
      return
    }
    setError(null)
    writeCustomSupabase({ url: trimmedUrl, key: trimmedKey })
    void mutate(() => true)
    onUseCloud()
    toast.success("Dashboard now reads your Supabase project")
  }

  function clear() {
    writeCustomSupabase(null)
    setUrl("")
    setKey("")
    void mutate(() => true)
    toast.message("Back to the site's default Supabase project")
  }

  async function copySchema() {
    try {
      const sql = await fetch(SCHEMA_URL).then((response) => response.text())
      await navigator.clipboard.writeText(sql)
      toast.success("Schema SQL copied")
    } catch {
      toast.error("Could not copy. Use Download instead.")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <DatabaseIcon aria-hidden="true" />
        <AlertTitle>Bring your own database</AlertTitle>
        <AlertDescription>
          Create a free Supabase project, run the Fresco schema in its SQL
          editor, then paste the project URL and publishable key below. They
          are stored only in this browser and sent with each dashboard request.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void copySchema()}>
          <CopyIcon data-icon="inline-start" />
          Copy schema SQL
        </Button>
        <Button
          type="button"
          variant="outline"
          nativeButton={false}
          render={<a href={SCHEMA_URL} download="fresco-schema.sql" />}
        >
          <DownloadIcon data-icon="inline-start" />
          Download schema SQL
        </Button>
      </div>

      <form onSubmit={save}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="custom-supabase-url">Project URL</FieldLabel>
            <Input
              id="custom-supabase-url"
              placeholder="https://abcd1234.supabase.co"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="custom-supabase-key">Publishable key</FieldLabel>
            <Input
              id="custom-supabase-key"
              type="password"
              autoComplete="off"
              placeholder="sb_publishable_... or legacy anon key"
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
            <FieldDescription>
              Found under Project Settings, API Keys. Never paste a secret or
              service_role key into a website.
            </FieldDescription>
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit">
              <SaveIcon data-icon="inline-start" />
              Use my project
            </Button>
            {current && (
              <Button type="button" variant="outline" onClick={clear}>
                <XIcon data-icon="inline-start" />
                Stop using it
              </Button>
            )}
          </div>
        </FieldGroup>
      </form>

      {current && (
        <p className="text-sm text-muted-foreground">
          Active: <span className="font-mono">{current.url}</span>
        </p>
      )}
    </div>
  )
}
