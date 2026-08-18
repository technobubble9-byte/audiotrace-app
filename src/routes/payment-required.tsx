import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2, ShieldCheck, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const searchSchema = z.object({
  ref: z.string().optional(),
  status: z.enum(["pending", "failed"]).optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/payment-required")({
  validateSearch: searchSchema,
  component: PaymentRequiredPage,
});

function PaymentRequiredPage() {
  const { ref, status, error } = useSearch({ from: "/payment-required" });
  const [currentStatus, setCurrentStatus] = useState(status);
  const [checkoutLoading, setCheckoutLoading] = useState<"STANDARD" | "ULTIMATE" | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!ref || currentStatus !== "pending") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/checkout/status?ref=${encodeURIComponent(ref)}`);
        const data = await res.json();
        if (data.status === "active") {
          window.location.href = "/dashboard";
        } else if (data.status === "failed") {
          setCurrentStatus("failed");
        }
      } catch {
        // keep polling
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [ref, currentStatus]);

  async function startCheckout(plan: "STANDARD" | "ULTIMATE") {
    setCheckoutError(null);
    setCheckoutLoading(plan);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "not_authenticated") {
          window.location.href = "/login";
          return;
        }
        setCheckoutError(data.message || data.error || "Something went wrong starting checkout.");
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setCheckoutError("Network error — try again.");
    } finally {
      setCheckoutLoading(null);
    }
  }

  if (currentStatus === "pending") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <CardTitle className="mt-2">Confirming your payment</CardTitle>
            <CardDescription>
              This usually takes a few seconds — you'll be redirected automatically. No need to refresh.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" /> Payment received, waiting on final confirmation
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-primary" />
          <CardTitle className="mt-2">Choose a plan to continue</CardTitle>
          <CardDescription>
            {currentStatus === "failed"
              ? "We weren't able to confirm your last payment. Try again below, or contact support@audiotrace.tech."
              : error === "missing_ref"
                ? "Something went wrong linking your last payment attempt — try again below."
                : "Your account doesn't have an active subscription yet."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {checkoutError && <p className="mb-4 text-center text-sm text-destructive">{checkoutError}</p>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PlanCard
              name="Standard"
              price="$10.99/mo"
              features={["50 Secure Generations per month", "Bulk Scan Tools", "Standard Email Support"]}
              loading={checkoutLoading === "STANDARD"}
              onSelect={() => startCheckout("STANDARD")}
            />
            <PlanCard
              name="Ultimate"
              price="$16.99/mo"
              features={["Unlimited Secure Generations", "Optional Monitoring", "Priority Support", "API Access"]}
              highlighted
              loading={checkoutLoading === "ULTIMATE"}
              onSelect={() => startCheckout("ULTIMATE")}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PlanCard({
  name,
  price,
  features,
  highlighted,
  loading,
  onSelect,
}: {
  name: string;
  price: string;
  features: string[];
  highlighted?: boolean;
  loading: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={`flex flex-col gap-4 rounded-lg border p-5 ${highlighted ? "border-primary" : "border-border"}`}
    >
      <div>
        <p className="font-semibold">{name}</p>
        <p className="text-2xl font-bold">{price}</p>
      </div>
      <ul className="flex-1 space-y-1.5 text-sm text-muted-foreground">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-1.5">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> {f}
          </li>
        ))}
      </ul>
      <Button disabled={loading} onClick={onSelect} variant={highlighted ? "default" : "outline"}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Select {name}
      </Button>
    </div>
  );
}
