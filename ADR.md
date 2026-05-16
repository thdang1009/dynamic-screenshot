# Architectural Decision Record: Serverless-Hybrid Dynamic Screenshot Service

## Status

**Proposed**

## Context & Problem Statement

The personal portfolio website (`[https://dangtrinh.site/me/about-me](https://dangtrinh.site/me/about-me)`) showcases previous web engineering products. The initial approach of embedding these third-party projects via HTML `<iframe>` tags introduces security risks (blocked by `X-Frame-Options` or `Content-Security-Policy`), performance degradation, and layout breaking.

Switching to static preview images resolves the embedding issues but introduces a maintenance bottleneck: project screenshots become outdated over time. Commercial "Screenshot as a Service" platforms exist but possess significant trade-offs for indie developers and open-source communities:

* High subscription costs ($15-$30+/month).
* Severe rate-limiting on free tiers (e.g., 100 requests/month), making them vulnerable to basic denial-of-service/caching invalidation exploits.
* "Cold Start" user-experience penalties: When a cache expires, the visiting end-user is forced to wait 3 to 8 seconds while a headless browser boots, navigates, and captures the target site.

We need a cost-effective, automated, resilient system capable of serving dynamic, auto-updating web screenshots through an `<img>` tag without compromising frontend performance.

## Decision Drivers

* **Cost Efficiency:** Maximize the use of robust free tiers across cloud providers (Target: $0/month operational cost).
* **Performance / Latency:** End-users viewing portfolios must never experience delays caused by real-time browser rendering (Zero Cold Starts).
* **Developer Ergonomics:** Leveraging a JavaScript/TypeScript ecosystem for fast development and maintaining a clean separation of concerns.
* **Scalability for Community Use:** The architecture must handle cache distribution gracefully if opened to other developers.

## Considered Options

1. **Traditional VPS (DigitalOcean/Linode) + Node.js + Puppeteer + Redis:** Requires server maintenance, monthly fixed costs, and manual OS-level dependency patching for Chromium.
2. **Pure Serverless Functions (AWS Lambda/Vercel Functions) + Puppeteer-Core:** Hit strict deployment package size limits (Chromium binary limitations) and unpredictable execution timeouts.
3. **Hybrid Serverless (Docker on PaaS + Serverless Redis + Object Storage CDN):** Containerized runtime for predictable Chromium execution, paired with global CDN distribution and decoupled background workers.

## Decision Outcome

Chosen Option: **Option 3 (Hybrid Serverless)**. This setup strikes the perfect balance between zero operational costs and enterprise-grade performance.

### Architectural Component Stack

* **API & Worker Runtime:** Node.js (NestJS or Express) + Puppeteer packaged inside a `Dockerfile` and hosted on **Hugging Face Spaces (Docker)** or **Render.com**.
* **Storage & Image Delivery:** **Cloudflare R2** combined with **Cloudflare CDN** for edge-caching and zero egress/bandwidth fees.
* **State & Metadata Store:** **Supabase (PostgreSQL)** for managing user authentication, api-keys, and cache TTL tracking.
* **Asynchronous Orchestration:** **Upstash Redis** running `BullMQ` to manage the background screenshot task queue.

---

## Technical Architecture & Lifecycle Strategy

### The Strategy: Stale-While-Revalidate (SWR)

To bypass the "Cold Start" performance bottleneck, the service will implement an asynchronous cache revalidation cycle.

```
                  [ End User Browser ]
                           |
                           | Request <img> URL
                           v
              [ API Gate / Express Server ]
                           |
            +--------------+--------------+
            | (Cache Valid < 24h)         | (Cache Stale > 24h)
            v                             v
   [ 302 Redirect to R2 ]        [ 302 Redirect to STALE R2 Image ]
            |                             | (Instant load for user)
            v                             v
    (Instant Render)             [ Push Revalidate Job to Redis Queue ]
                                          |
                                          v
                                 [ Puppeteer Worker ]
                                  - Boot Chromium (headless)
                                  - Inject anti-lazyload scroll
                                  - Capture PNG -> Push to R2
                                  - Update Supabase Cache Timestamp

```

### Edge Cases & Resolutions

* **Anti-Lazy Loading & Layout Shift:** The Puppeteer worker will execute a page-down/page-up scrolling injection script upon `networkidle2` to trigger image lazy-loading blocks before firing the screenshot event.
* **Cache Invalidation Exploitation (F5 Spamming):** Users can manually clear cache via `&force=true` query parameters, but this route will be throttle-limited using Upstash Redis rate-limiting algorithms to avoid resource starvation on the free-tier backend.

---

## Pros and Cons of the Chosen Architecture

### Pros

* **Absolute Zero Infrastructure Cost:** Utilizes the highly generous free structures of Cloudflare R2 (10GB space, $0 egress), Supabase (500MB DB), Upstash (10k requests/day), and PaaS Docker runtimes.
* **Perceived Zero Latency:** Because the endpoint instantly redirects users to an existing asset in Cloudflare R2 (even if stale), portfolio loading speeds remain entirely unaffected by background operations.
* **Portability:** Entirely containerized via Docker. If a platform alters its free tier policies, the app can be remigrated to any Docker-compliant host within minutes.

### Cons

* **Initial Asset Delay:** The absolute first visit to a newly registered URL will require a real-time render wait. Subsequent updates are invisible to the user.
* **Ephemeral PaaS Spin-up:** If hosted on Render's free tier, the API container goes to sleep after inactivity. The first API ping might take ~30 seconds to wake up (mitigated by hosting on Hugging Face Spaces which remains active, or running a lightweight cron to keep the container warm).

## Confirmation & Implementation Plan

1. **Phase 1 (PoC):** Construct a local Express-Puppeteer backend capable of rendering a targeted URL, scrolling to bypass lazy-loading, and outputting a clean image file.
2. **Phase 2 (Storage Integration):** Integrate the Cloudflare R2 SDK to upload captured screenshots and implement the 302 HTTP Redirect flow.
3. **Phase 3 (Queue Configuration):** Hook up Upstash Redis with `BullMQ` to extract the Puppeteer capture logic out of the HTTP request cycle into an asynchronous background task.
4. **Phase 4 (Database & Dashboard):** Set up Supabase schemas for tracking project mapping metadata, and construct the portfolio manager interface using Angular/Vue.