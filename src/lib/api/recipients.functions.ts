import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { insertRecipient, listRecipients, type Recipient } from "../db/queries.server";

export const getRecipients = createServerFn({ method: "GET" }).handler(async () => {
  return listRecipients();
});

export const createRecipient = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string().min(1, "Name is required"),
      email: z.string().email("Enter a valid email"),
      company: z.string().optional(),
      notes: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const recipient: Recipient = {
      id: crypto.randomUUID(),
      name: data.name.trim(),
      email: data.email.trim(),
      company: data.company?.trim() || null,
      notes: data.notes?.trim() || null,
      created_at: new Date().toISOString(),
    };
    insertRecipient(recipient);
    return recipient;
  });
