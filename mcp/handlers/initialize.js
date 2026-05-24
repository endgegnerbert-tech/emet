import { buildInitializeResult } from "../initialize-result.js";
import { resolveHostProfile } from "../hosts/profiles.js";

export async function handleInitialize(message, deps) {
  const protocolVersion = message.params?.protocolVersion || "2025-03-26";
  deps.hostProfile = resolveHostProfile({
    clientInfo: message.params?.clientInfo,
    env: deps.env,
    requestedHost: deps.hostId,
  });
  return buildInitializeResult(protocolVersion, { hostProfile: deps.hostProfile });
}
