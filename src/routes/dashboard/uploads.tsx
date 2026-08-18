import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileAudio } from "lucide-react";

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

import { getUploads } from "@/lib/api/uploads.functions";
import { formatBytes, formatDuration } from "@/lib/audio-client-utils";

export const Route = createFileRoute("/dashboard/uploads")({
  component: UploadsPage,
});

function UploadsPage() {
  const { data: uploads, isLoading } = useQuery({ queryKey: ["uploads"], queryFn: () => getUploads() });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Uploads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Source audio you've uploaded. Each one can be protected for any number of recipients.
          </p>
        </div>
        <Button asChild>
          <Link to="/dashboard">Upload a file</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All uploads</CardTitle>
          <CardDescription>{uploads?.length ?? 0} file(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !uploads || uploads.length === 0 ? (
            <EmptyState />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filename</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Sample rate</TableHead>
                  <TableHead>Channels</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uploads.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.original_filename}</TableCell>
                    <TableCell className="uppercase text-muted-foreground">{u.ext}</TableCell>
                    <TableCell>{formatDuration(u.duration_seconds)}</TableCell>
                    <TableCell>{u.sample_rate.toLocaleString()} Hz</TableCell>
                    <TableCell>{u.channels}</TableCell>
                    <TableCell>{formatBytes(u.size_bytes)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(u.created_at).toLocaleString()}
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <FileAudio className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">No uploads yet.</p>
      <Button asChild size="sm">
        <Link to="/dashboard">Upload your first file</Link>
      </Button>
    </div>
  );
}
