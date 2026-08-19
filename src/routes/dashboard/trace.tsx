import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Upload, Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileDropzone } from "@/components/file-dropzone";

import { getTraceScans, scanForFingerprint } from "@/lib/api/trace.functions";
import { fileToBase64 } from "@/lib/audio-client-utils";

export const Route = createFileRoute("/dashboard/trace")({
  component: TracePage,
});

function TracePage() {
  const queryClient = useQueryClient();
  const { data: scans, isLoading } = useQuery({ queryKey: ["trace-scans"], queryFn: () => getTraceScans() });

  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof scanForFingerprint>> | null>(null);

  const scanMutation = useMutation({
    mutationFn: async (file: File) => {
      const base64Data = await fileToBase64(file);
      return scanForFingerprint({ data: { filename: file.name, base64Data } });
    },
    onSuccess: (result) => {
      setError(null);
      setLastResult(result);
      queryClient.invalidateQueries({ queryKey: ["trace-scans"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trace / Detection</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a suspected leaked file to check it for an embedded fingerprint and identify the recipient
          it was distributed to.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scan a file</CardTitle>
          <CardDescription>Blind detection — no original master required.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="max-w-sm">
            <FileDropzone
              accept=".wav,.mp3,.flac,.aiff,.aif,.m4a,.ogg,audio/*"
              isLoading={scanMutation.isPending}
              loadingLabel="Scanning..."
              idleLabel="Upload suspect file"
              onFile={(file) => scanMutation.mutate(file)}
            />
          </div>

          {error && (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> {error}
            </p>
          )}

          {lastResult && <ScanResultCard result={lastResult} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scan history</CardTitle>
          <CardDescription>{scans?.length ?? 0} scan(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !scans || scans.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Search className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No scans yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File scanned</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Matched recipient</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Scanned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scans.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.suspect_filename}</TableCell>
                    <TableCell>
                      {s.detected ? (
                        <Badge className="bg-primary/15 text-primary" variant="outline">
                          Fingerprint found
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          No fingerprint
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.matched_recipient_name ? (
                        <>
                          {s.matched_recipient_name}
                          <div className="text-xs text-muted-foreground">{s.matched_recipient_email}</div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{(s.confidence * 100).toFixed(0)}%</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(s.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScanResultCard({ result }: { result: Awaited<ReturnType<typeof scanForFingerprint>> }) {
  const { detection, matched } = result;

  if (detection.detected && matched) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-primary/30 bg-primary/5 p-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <CheckCircle2 className="h-4 w-4 text-primary" /> Fingerprint detected — leak traced
        </p>
        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-xs text-muted-foreground">Recipient</span>
            <p className="font-medium">{matched.recipient_name}</p>
            <p className="text-xs text-muted-foreground">{matched.recipient_email}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Original file</span>
            <p className="font-medium">{matched.upload_filename}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Fingerprint ID</span>
            <p>
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{detection.fingerprintHex}</code>
            </p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Confidence</span>
            <p className="font-medium">{(detection.confidence * 100).toFixed(0)}%</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-4">
      <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <XCircle className="h-4 w-4 text-muted-foreground" /> No AudioTrace fingerprint detected
      </p>
      <p className="text-xs text-muted-foreground">
        Either this file was never protected through AudioTrace, or the fingerprint didn't survive whatever
        processing this copy went through.
      </p>
    </div>
  );
}
