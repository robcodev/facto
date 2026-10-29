import { createHmac, timingSafeEqual } from "node:crypto";
import type { Idea } from "./core";
function payload(idea: Idea, org: number, user: string) {
  return JSON.stringify({
    purpose: "marketing-evidence-v1",
    org,
    user,
    id: idea.id,
    format: idea.format,
    evidence: idea.evidence,
    createdAt: idea.created_at,
  });
}
export function ideaProof(idea: Idea, org: number, user: string) {
  const secret = process.env.FACTO_BACKEND_SECRET;
  if (!secret) throw Error("Missing server credential");
  return createHmac("sha256", secret)
    .update(payload(idea, org, user))
    .digest("hex");
}
export function validProof(idea: Idea, org: number, user: string) {
  if (!idea.proof || !/^[a-f0-9]{64}$/.test(idea.proof)) return false;
  return timingSafeEqual(
    Buffer.from(idea.proof, "hex"),
    Buffer.from(ideaProof(idea, org, user), "hex"),
  );
}
