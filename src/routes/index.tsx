import { createFileRoute, Navigate } from "@tanstack/react-router";

// This deployment is the AudioTrace *application* (dashboard + processing
// backend) only. The marketing/pricing site at audiotrace.tech is a
// separate static page hosted on Cloudflare — see README. So "/" here just
// sends people straight into the working product.
export const Route = createFileRoute("/")({
  component: () => <Navigate to="/dashboard" />,
});
