'use client'

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Download, Loader2, ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import { authFetch, setAuthToken } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"

const CONFIRM_PHRASE = "DELETE"

export default function PrivacyAndData() {
  const router = useRouter()
  const { logout } = useAuth()
  const [downloading, setDownloading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmInput, setConfirmInput] = useState("")
  const [deleting, setDeleting] = useState(false)

  const handleDownload = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/me/export`)
      if (!res.ok) {
        const body = await res.text()
        console.error("Data export failed:", res.status, body)
        toast.error("Failed to download your data")
        return
      }

      const disposition = res.headers.get("content-disposition") || ""
      const match = /filename="?([^";]+)"?/i.exec(disposition)
      const filename = match?.[1] || `fixera-data-export-${new Date().toISOString().split("T")[0]}.json`

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success("Your data is downloading")
    } catch (err) {
      console.error("Data export error:", err)
      toast.error("Failed to download your data")
    } finally {
      setDownloading(false)
    }
  }

  const handleDelete = async () => {
    if (deleting) return
    if (confirmInput !== CONFIRM_PHRASE) return
    setDeleting(true)
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/me/account`, {
        method: "DELETE",
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(body?.msg || "Failed to delete account")
        return
      }
      toast.success(body?.msg || "Account deleted")
      setAuthToken(null)
      try {
        await logout()
      } catch {
        // logout failures are fine; we redirect regardless
      }
      router.replace("/")
    } catch (err) {
      console.error("Account delete error:", err)
      toast.error("Failed to delete account")
    } finally {
      setDeleting(false)
      setConfirmOpen(false)
      setConfirmInput("")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" />
          Privacy &amp; Data
        </CardTitle>
        <CardDescription>
          Download a copy of your data or permanently delete your account. Financial records (bookings, payments,
          invoices) are retained as required by law even after account deletion.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Download my data</p>
            <p className="text-sm text-muted-foreground">
              Export everything we hold about you as a JSON file (bookings, messages, projects, points, etc.).
            </p>
          </div>
          <Button variant="outline" onClick={handleDownload} disabled={downloading}>
            {downloading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing…
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" /> Download JSON
              </>
            )}
          </Button>
        </div>

        <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-destructive">Delete my account</p>
            <p className="text-sm text-muted-foreground">
              Removes your personal information and signs you out. This cannot be undone.
            </p>
          </div>
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            Delete account
          </Button>
        </div>
      </CardContent>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!deleting) {
            setConfirmOpen(open)
            if (!open) setConfirmInput("")
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This will remove your name, email, phone, and other personal details. Bookings, payments, and invoices
              will be kept on file for legal record-keeping but will no longer be linked to your identifiable profile.
              You will be logged out immediately and cannot log in again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="delete-confirm">
              Type <span className="font-mono font-semibold">{CONFIRM_PHRASE}</span> to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmOpen(false)
                setConfirmInput("")
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || confirmInput !== CONFIRM_PHRASE}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting…
                </>
              ) : (
                "Permanently delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
