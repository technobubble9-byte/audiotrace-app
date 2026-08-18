import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FileAudio, Download, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

import { getProtectedFiles, downloadProtectedFile } from "@/lib/api/protect.functions";
import { triggerBrowserDownload, formatBytes } from "@/lib/audio-client-utils";

export const Route = createFileRoute("/dashboard/protected-files")({
  component: ProtectedFilesPage,
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

function ProtectedFilesPage() {
  const { data: files, isLoading } = useQuery({
    queryKey: ["protected-files"],
    queryFn: () => getProtectedFiles(),
  });

  const downloadMutation = useMutation({
    mutationFn: (id: string) => downloadProtectedFile({ data: { id } }),
    onSuccess: (file) => {
      triggerBrowserDownload(file.base64Data, file.filename, MIME_BY_EXT[file.ext] ?? "application/octet-stream");
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Protected Files</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every fingerprinted copy generated, with the recipient and source file it's tied to.
          </p>
        </div>
        <Button asChild>
          <Link to="/dashboard">Generate a protected file</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribution records</CardTitle>
          <CardDescription>{files?.length ?? 0} protected file(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !files || files.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <FileAudio className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No protected files yet.</p>
              <Button asChild size="sm">
                <Link to="/dashboard">Generate your first protected file</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source file</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Fingerprint ID</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.upload_filename}</TableCell>
                    <TableCell>
                      {f.recipient_name}
                      <div className="text-xs text-muted-foreground">{f.recipient_email}</div>
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{f.fingerprint_hex}</code>
                    </TableCell>
                    <TableCell>{formatBytes(f.size_bytes)}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(f.created_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={downloadMutation.isPending}
                        onClick={() => downloadMutation.mutate(f.id)}
                      >
                        {downloadMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TableCell>
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
