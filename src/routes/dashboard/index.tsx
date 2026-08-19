import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Upload, ShieldCheck, Download, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileDropzone } from "@/components/file-dropzone";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { getUploads, uploadAudio } from "@/lib/api/uploads.functions";
import { getRecipients, createRecipient } from "@/lib/api/recipients.functions";
import { generateProtectedFile, downloadProtectedFile } from "@/lib/api/protect.functions";
import { fileToBase64, triggerBrowserDownload, formatDuration, formatBytes } from "@/lib/audio-client-utils";

export const Route = createFileRoute("/dashboard/")({
  component: ProtectWorkflowPage,
});

const MIME_BY_EXT: Record<string, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  flac: "audio/flac",
  aiff: "audio/aiff",
  aif: "audio/aiff",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
};

function ProtectWorkflowPage() {
  const queryClient = useQueryClient();

  const uploadsQuery = useQuery({ queryKey: ["uploads"], queryFn: () => getUploads() });
  const recipientsQuery = useQuery({ queryKey: ["recipients"], queryFn: () => getRecipients() });

  const [selectedUploadId, setSelectedUploadId] = useState<string>("");
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>("");
  const [newRecipientOpen, setNewRecipientOpen] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientCompany, setRecipientCompany] = useState("");

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [lastProtectedFileId, setLastProtectedFileId] = useState<string | null>(null);
  const [lastFingerprint, setLastFingerprint] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const base64Data = await fileToBase64(file);
      return uploadAudio({ data: { filename: file.name, base64Data } });
    },
    onSuccess: (row) => {
      setUploadError(null);
      setSelectedUploadId(row.id);
      queryClient.invalidateQueries({ queryKey: ["uploads"] });
    },
    onError: (err: Error) => setUploadError(err.message),
  });

  const createRecipientMutation = useMutation({
    mutationFn: () =>
      createRecipient({
        data: { name: recipientName, email: recipientEmail, company: recipientCompany || undefined },
      }),
    onSuccess: (r) => {
      setSelectedRecipientId(r.id);
      setNewRecipientOpen(false);
      setRecipientName("");
      setRecipientEmail("");
      setRecipientCompany("");
      queryClient.invalidateQueries({ queryKey: ["recipients"] });
    },
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      generateProtectedFile({ data: { uploadId: selectedUploadId, recipientId: selectedRecipientId } }),
    onSuccess: (pf) => {
      setGenerateError(null);
      setLastProtectedFileId(pf.id);
      setLastFingerprint(pf.fingerprint_hex);
      queryClient.invalidateQueries({ queryKey: ["protected-files"] });
    },
    onError: (err: Error) => setGenerateError(err.message),
  });

  const downloadMutation = useMutation({
    mutationFn: (id: string) => downloadProtectedFile({ data: { id } }),
    onSuccess: (file) => {
      triggerBrowserDownload(file.base64Data, file.filename, MIME_BY_EXT[file.ext] ?? "application/octet-stream");
    },
  });

  const uploads = uploadsQuery.data ?? [];
  const recipients = recipientsQuery.data ?? [];
  const canGenerate = !!selectedUploadId && !!selectedRecipientId && !generateMutation.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Protect a File</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload audio you own or are authorized to distribute, assign it to a recipient, and generate a
          uniquely fingerprinted copy for that recipient.
        </p>
      </div>

      {/* Step 1: Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              1
            </span>
            Upload source audio
          </CardTitle>
          <CardDescription>WAV, MP3, FLAC, AIFF, M4A, or OGG. You must own or be authorized to distribute this content.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="w-full sm:w-auto sm:min-w-[280px]">
              <FileDropzone
                accept=".wav,.mp3,.flac,.aiff,.aif,.m4a,.ogg,audio/*"
                isLoading={uploadMutation.isPending}
                loadingLabel="Uploading..."
                idleLabel="Choose audio file"
                onFile={(file) => uploadMutation.mutate(file)}
              />
            </div>

            <div className="min-w-[220px] flex-1">
              <Label className="mb-1.5 block text-xs text-muted-foreground">Or pick a previous upload</Label>
              <Select value={selectedUploadId} onValueChange={setSelectedUploadId}>
                <SelectTrigger>
                  <SelectValue placeholder={uploads.length ? "Select an uploaded file" : "No uploads yet"} />
                </SelectTrigger>
                <SelectContent>
                  {uploads.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.original_filename} · {formatDuration(u.duration_seconds)} · {formatBytes(u.size_bytes)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {uploadError && (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> {uploadError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Recipient */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              2
            </span>
            Choose recipient
          </CardTitle>
          <CardDescription>Each recipient gets their own uniquely fingerprinted copy.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[220px] flex-1">
              <Select value={selectedRecipientId} onValueChange={setSelectedRecipientId}>
                <SelectTrigger>
                  <SelectValue placeholder={recipients.length ? "Select a recipient" : "No recipients yet"} />
                </SelectTrigger>
                <SelectContent>
                  {recipients.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} · {r.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={() => setNewRecipientOpen((v) => !v)}>
              {newRecipientOpen ? "Cancel" : "+ New recipient"}
            </Button>
          </div>

          {newRecipientOpen && (
            <div className="grid grid-cols-1 gap-3 rounded-md border border-border p-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="r-name" className="mb-1.5 block text-xs">
                  Name
                </Label>
                <Input id="r-name" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="John Doe" />
              </div>
              <div>
                <Label htmlFor="r-email" className="mb-1.5 block text-xs">
                  Email
                </Label>
                <Input
                  id="r-email"
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="john@label.com"
                />
              </div>
              <div>
                <Label htmlFor="r-company" className="mb-1.5 block text-xs">
                  Company (optional)
                </Label>
                <Input
                  id="r-company"
                  value={recipientCompany}
                  onChange={(e) => setRecipientCompany(e.target.value)}
                  placeholder="Acme Records"
                />
              </div>
              <div className="sm:col-span-3">
                <Button
                  size="sm"
                  disabled={!recipientName || !recipientEmail || createRecipientMutation.isPending}
                  onClick={() => createRecipientMutation.mutate()}
                >
                  {createRecipientMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save recipient
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 3: Generate */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              3
            </span>
            Generate protected file
          </CardTitle>
          <CardDescription>
            Embeds a unique inaudible fingerprint tied to this recipient and this file.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button disabled={!canGenerate} onClick={() => generateMutation.mutate()}>
            {generateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {generateMutation.isPending ? "Embedding fingerprint..." : "Generate protected file"}
          </Button>

          {generateError && (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> {generateError}
            </p>
          )}

          {lastProtectedFileId && lastFingerprint && (
            <div className="flex flex-col gap-3 rounded-md border border-primary/30 bg-primary/5 p-4">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" /> Protected file ready
              </p>
              <p className="text-xs text-muted-foreground">
                Fingerprint ID: <code className="rounded bg-muted px-1.5 py-0.5">{lastFingerprint}</code>
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-fit"
                disabled={downloadMutation.isPending}
                onClick={() => downloadMutation.mutate(lastProtectedFileId)}
              >
                {downloadMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download protected file
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
