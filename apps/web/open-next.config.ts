import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Runs the Next.js spine + Studio UI as a Cloudflare Worker. Asset bytes live in
// R2 via the `baxter-cloud` profile (see lib/forgecast.ts). Durable metadata
// (D1/Hyperdrive) and a Queues-backed job runner are follow-up steps.
export default defineCloudflareConfig();
