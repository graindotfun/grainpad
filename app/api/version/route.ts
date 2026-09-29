import {env} from "cloudflare:workers";
import {BUILD_COMMIT} from "@/lib/build-commit";
import {deploymentVersion} from "@/lib/deployment-version.mjs";

export const dynamic = "force-dynamic";

export function GET() {
  const metadata = (env as unknown as {CF_VERSION_METADATA?:WorkerVersionMetadata}).CF_VERSION_METADATA;
  const version = deploymentVersion(metadata, BUILD_COMMIT);
  return Response.json(version, {
    status: version.commit ? 200 : 503,
    headers: {"Cache-Control":"no-store"},
  });
}
