import { DynamicTool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { logToolCall } from "@/lib/services/session.service";

export function wrapToolsWithLogging(
  tools: StructuredToolInterface[],
  requestId: string
): StructuredToolInterface[] {
  return tools.map((tool) => {
    const originalFunc = (tool as DynamicTool).func;
    if (!originalFunc) return tool;

    return new DynamicTool({
      name: tool.name,
      description: tool.description,
      func: async (input: string) => {
        const start = Date.now();
        let parsedInput: object | undefined;
        try {
          parsedInput = JSON.parse(input);
        } catch {
          parsedInput = { raw: input };
        }

        try {
          const result = await originalFunc(input);
          const durationMs = Date.now() - start;

          let parsedOutput: object | undefined;
          try {
            parsedOutput = JSON.parse(result);
          } catch {
            parsedOutput = { raw: result };
          }

          logToolCall({
            requestId,
            toolName: tool.name,
            toolInput: parsedInput,
            toolOutput: parsedOutput,
            durationMs,
            success: true,
          }).catch((err) =>
            console.error("[tool-wrapper] Failed to log tool call:", err)
          );

          return result;
        } catch (err) {
          const durationMs = Date.now() - start;
          const errorMsg =
            err instanceof Error ? err.message : "Unknown error";

          logToolCall({
            requestId,
            toolName: tool.name,
            toolInput: parsedInput,
            durationMs,
            success: false,
            error: errorMsg,
          }).catch((logErr) =>
            console.error("[tool-wrapper] Failed to log tool error:", logErr)
          );

          throw err;
        }
      },
    });
  });
}
