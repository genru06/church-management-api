import { randomUUID } from "crypto";

export function generateQrToken() {
  return randomUUID().replace(/-/g, "");
}
