import { defaultMode } from "../../lib/research.js";
import { runWebResearch } from "../../lib/web-research.js";
import { trackEmetEvent } from "../../lib/analytics.js";
import { buildToolDefinition, TOOL_NAME } from "../../lib/tool-schema.js";
import { applyHostProfileToTool } from "../hosts/profiles.js";

export async function handleToolsList(message, deps) {
  const tool = deps.hostProfile
    ? applyHostProfileToTool(buildToolDefinition(), deps.hostProfile)
    : buildToolDefinition();
  return { tools: [tool] };
}

export async function handleToolsCall(message, deps) {
  const params = message.params || {};
  if (params.name !== TOOL_NAME) {
    throw new Error(`Unknown tool: ${String(params.name || "")}`);
  }

  const run = deps.runWebResearchFn || runWebResearch;
  const runtime = deps.runtime;
  const args = params.arguments || {};
  
  // Make sure we have an object to mutate if needed
  let input = { ...args };
  if (!input.mode) input.mode = defaultMode(input.query || "");
  trackEmetEvent("tool:call", { mode: input.mode, host: deps.hostProfile?.id || "unknown" });

  if (runtime) {
    const { skip, reason, modifiedInput } = runtime.interceptCall(input);
    if (skip) {
      trackEmetEvent("tool:skip", { mode: input.mode, reason });
      return {
        content: [{ type: "text", text: JSON.stringify({ skip: true, reason }, null, 2) }],
        structuredContent: { skip: true, reason },
        isError: false,
      };
    }
    input = modifiedInput;
  }
  
  let ctx = undefined;
  if (deps.samplingService) {
    ctx = deps.samplingService.createVirtualContext();
  }
  
  let payload;
  try {
    payload = await run(input.query, ctx, undefined, undefined, {
      mode: input.mode,
      force: input.force,
      isolate: input.isolate,
      ...(input.options || {}),
    });
    trackEmetEvent(payload?.ok ? "tool:success" : "tool:error", { mode: input.mode });
  } catch (error) {
    trackEmetEvent("tool:error", { mode: input.mode });
    throw error;
  }

  if (runtime) {
    runtime.interceptResult(input, payload);
    const formatted = runtime.formatResponse(payload);
    return {
      content: [{ type: "text", text: formatted.text }],
      structuredContent: formatted.structuredContent,
      isError: !payload?.ok,
    };
  }

  const text = payload?.ok ? (payload.contentText || JSON.stringify(payload, null, 2)) : JSON.stringify(payload, null, 2);
  
  return {
    content: [{ type: "text", text }],
    structuredContent: payload,
    isError: !payload?.ok,
  };
}
