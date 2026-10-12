declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    CF_VERSION_METADATA?: WorkerVersionMetadata;
  }
}
