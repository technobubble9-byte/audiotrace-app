import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Users, Loader2 } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { getRecipients, createRecipient } from "@/lib/api/recipients.functions";

export const Route = createFileRoute("/dashboard/recipients")({
  component: RecipientsPage,
});

function RecipientsPage() {
  const queryClient = useQueryClient();
  const { data: recipients, isLoading } = useQuery({
    queryKey: ["recipients"],
    queryFn: () => getRecipients(),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => createRecipient({ data: { name, email, company: company || undefined, notes: notes || undefined } }),
    onSuccess: () => {
      setError(null);
      setName("");
      setEmail("");
      setCompany("");
      setNotes("");
      setFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["recipients"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recipients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everyone you distribute protected copies to. Every download is tied to one of these records.
          </p>
        </div>
        <Button onClick={() => setFormOpen((v) => !v)}>{formOpen ? "Cancel" : "+ New recipient"}</Button>
      </div>

      {formOpen && (
        <Card>
          <CardContent className="grid grid-cols-1 gap-3 pt-6 sm:grid-cols-2">
            <div>
              <Label htmlFor="name" className="mb-1.5 block text-xs">
                Name
              </Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" />
            </div>
            <div>
              <Label htmlFor="email" className="mb-1.5 block text-xs">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@label.com"
              />
            </div>
            <div>
              <Label htmlFor="company" className="mb-1.5 block text-xs">
                Company (optional)
              </Label>
              <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Records" />
            </div>
            <div>
              <Label htmlFor="notes" className="mb-1.5 block text-xs">
                Notes (optional)
              </Label>
              <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="A&R contact" />
            </div>
            {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
            <div className="sm:col-span-2">
              <Button size="sm" disabled={!name || !email || createMutation.isPending} onClick={() => createMutation.mutate()}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save recipient
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All recipients</CardTitle>
          <CardDescription>{recipients?.length ?? 0} recipient(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !recipients || recipients.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Users className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No recipients yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell className="text-muted-foreground">{r.company || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
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
