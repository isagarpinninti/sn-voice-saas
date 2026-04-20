'use client'

import { use, useEffect, useState, FormEvent } from 'react'
import { UploadCloud, Check, AlertTriangle, FileText } from 'lucide-react'

type Props = { params: Promise<{ token: string }> }

type Status =
  | { kind: 'loading' }
  | { kind: 'ready'; allowed: string[]; maxBytes: number }
  | { kind: 'invalid'; reason: string }
  | { kind: 'uploading'; progress: number }
  | { kind: 'done'; fileName: string }
  | { kind: 'error'; message: string }

export default function UploadPage({ params }: Props) {
  const { token } = use(params)
  const [status, setStatus] = useState<Status>({ kind: 'loading' })
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    fetch(`/api/upload/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.ok) {
          setStatus({ kind: 'invalid', reason: d?.reason || 'invalid' })
        } else if (!d.ready) {
          setStatus({ kind: 'invalid', reason: 'call-ended' })
        } else {
          setStatus({ kind: 'ready', allowed: d.allowed || [], maxBytes: d.maxBytes || 10485760 })
        }
      })
      .catch(() => setStatus({ kind: 'invalid', reason: 'network' }))
  }, [token])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!file || status.kind !== 'ready') return

    setStatus({ kind: 'uploading', progress: 0 })
    const fd = new FormData()
    fd.append('file', file)

    try {
      const res = await fetch(`/api/upload/${encodeURIComponent(token)}`, {
        method: 'POST',
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.ok) {
        setStatus({ kind: 'error', message: data?.error || `Upload failed (${res.status})` })
        return
      }
      setStatus({ kind: 'done', fileName: data.fileName || file.name })
    } catch (err: any) {
      setStatus({ kind: 'error', message: err?.message || 'Network error' })
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12 bg-background text-foreground">
      <div className="w-full max-w-[480px]">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center glow-ring">
            <UploadCloud className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-[14px] font-semibold tracking-tight">ZeVox upload</p>
            <p className="text-[11px] text-muted-foreground">Shared by the voice agent on your call</p>
          </div>
        </div>

        {status.kind === 'loading' && (
          <p className="text-[13px] text-muted-foreground">Checking link…</p>
        )}

        {status.kind === 'invalid' && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/[0.06] p-5 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] font-semibold text-foreground mb-1">Link expired</p>
              <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                {status.reason === 'call-ended'
                  ? 'The call has ended, so this upload link is no longer active. Ask the agent for a fresh link if you still need to share a file.'
                  : status.reason === 'expired'
                  ? 'This link has expired — it\'s good for about 15 minutes after the agent sends it.'
                  : 'This upload link is invalid or has already been used.'}
              </p>
            </div>
          </div>
        )}

        {status.kind === 'ready' && (
          <form onSubmit={submit} className="rounded-xl border border-border bg-card/50 p-6">
            <p className="text-[14px] font-medium text-foreground mb-2">Choose a file to share</p>
            <p className="text-[12px] text-muted-foreground mb-5 leading-relaxed">
              Max {(status.maxBytes / 1024 / 1024).toFixed(0)}MB. Accepted: {status.allowed.join(', ')}.
            </p>

            <label className="block rounded-lg border border-dashed border-border hover:border-primary/40 bg-background/50 p-6 text-center cursor-pointer transition-colors mb-5">
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                accept=".png,.jpg,.jpeg,.pdf,.xls,.xlsx,.ppt,.pptx"
                className="hidden"
              />
              {file ? (
                <>
                  <FileText className="w-6 h-6 text-primary mx-auto mb-2" />
                  <p className="text-[13px] font-medium text-foreground break-all">{file.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">{(file.size / 1024).toFixed(1)} KB</p>
                </>
              ) : (
                <>
                  <UploadCloud className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-[13px] text-foreground">Click to choose a file</p>
                  <p className="text-[10.5px] text-muted-foreground mt-0.5">or drag and drop</p>
                </>
              )}
            </label>

            <button
              type="submit"
              disabled={!file}
              className="w-full px-4 py-2.5 rounded-md bg-foreground text-background text-[13px] font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send to agent
            </button>
          </form>
        )}

        {status.kind === 'uploading' && (
          <div className="rounded-xl border border-border bg-card/50 p-6">
            <p className="text-[14px] font-medium text-foreground mb-2">Uploading…</p>
            <p className="text-[12px] text-muted-foreground">Don't close this page.</p>
            <div className="h-1 mt-4 rounded-full bg-muted overflow-hidden">
              <div className="h-full w-1/3 bg-primary animate-pulse" />
            </div>
          </div>
        )}

        {status.kind === 'done' && (
          <div className="rounded-xl border border-primary/30 bg-primary/[0.06] p-6 text-center">
            <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center mx-auto mb-3">
              <Check className="w-5 h-5 text-primary" />
            </div>
            <p className="text-[14px] font-semibold text-foreground mb-1">Sent — {status.fileName}</p>
            <p className="text-[12.5px] text-muted-foreground leading-relaxed">
              Return to your call. The agent has been notified.
            </p>
          </div>
        )}

        {status.kind === 'error' && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/[0.06] p-5 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] font-semibold text-foreground mb-1">Upload failed</p>
              <p className="text-[12.5px] text-muted-foreground leading-relaxed">{status.message}</p>
              <button
                type="button"
                onClick={() => setStatus({ kind: 'ready', allowed: ['png', 'jpg', 'pdf', 'xlsx', 'ppt', 'pptx'], maxBytes: 10485760 })}
                className="mt-3 text-[12px] underline text-foreground hover:text-primary"
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
