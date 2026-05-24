export class SamplingService {
  constructor(transport) {
    this.transport = transport;
    this.requestCounter = 1000;
    this.pendingRequests = new Map();
  }

  /**
   * Request sampling from the connected MCP client.
   * @param {Object} params - The sampling parameters (messages, maxTokens, etc.)
   * @returns {Promise<Object>} The sampled message
   */
  async requestSample(params) {
    const id = this.requestCounter++;
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      this.transport.send({
        jsonrpc: "2.0",
        id,
        method: "sampling/createMessage",
        params
      });

      // Timeout for sampling
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error("Sampling request timed out"));
        }
      }, 30000); // 30s timeout
    });
  }

  handleResponse(message) {
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
      return true;
    }
    return false;
  }

  /**
   * Creates a virtual Agent context (ctx) that routes LLM requests through the MCP client via sampling.
   * Gracefully degrades by returning null if the sampling fails or is rejected.
   */
  createVirtualContext() {
    return {
      completeResearch: async (prompt, opts = {}) => {
        try {
          const result = await this.requestSample({
            messages: [{ role: "user", content: { type: "text", text: prompt } }],
            maxTokens: 4096
          });
          
          if (result && result.content) {
            if (typeof result.content === "string") return result.content;
            if (Array.isArray(result.content)) {
              return result.content.filter(p => p.type === "text").map(p => p.text).join("\n").trim();
            }
            if (typeof result.content === "object" && result.content.text) {
              return result.content.text;
            }
          }
          return null;
        } catch (err) {
          // Graceful degradation: If client denies or it times out, 
          // returning null triggers local heuristic fallbacks
          return null;
        }
      }
    };
  }
}
