/**
 * api.js — ElizaOS API client for chat functionality
 */

const API_BASE = window.location.origin + "/api";

let currentAgentId = null;
let currentSessionId = null;

async function initializeAgent() {
  console.log("[ELIZA-API] initializeAgent → fetching agents from", API_BASE + "/agents");
  try {
    const res = await fetch(`${API_BASE}/agents`);
    console.log("[ELIZA-API] /agents status:", res.status);
    if (!res.ok) throw new Error(`Failed to fetch agents (${res.status})`);
    const data = await res.json();
    console.log("[ELIZA-API] /agents response:", JSON.stringify(data).slice(0, 200));

    const agents = data.agents || data;
    if (Array.isArray(agents) && agents.length > 0) {
      currentAgentId = agents[0].id;
    } else if (typeof agents === "object") {
      const ids = Object.keys(agents);
      if (ids.length > 0) currentAgentId = ids[0];
    }

    console.log("[ELIZA-API] agentId:", currentAgentId || "NONE FOUND");
    if (!currentAgentId) throw new Error("No agents found");

    // Create a session
    console.log("[ELIZA-API] Creating session for agent:", currentAgentId);
    const sessionRes = await fetch(`${API_BASE}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: currentAgentId,
      }),
    });

    console.log("[ELIZA-API] /sessions status:", sessionRes.status);
    if (!sessionRes.ok) {
      const errBody = await sessionRes.text();
      console.log("[ELIZA-API] /sessions error body:", errBody);
      throw new Error("Failed to create session");
    }
    const sessionData = await sessionRes.json();
    currentSessionId = sessionData.sessionId || sessionData.id;
    console.log("[ELIZA-API] sessionId:", currentSessionId || "NONE");

    return true;
  } catch (err) {
    console.error("[ELIZA-API] initializeAgent FAILED:", err.message);
    return false;
  }
}

async function sendChatMessage(text) {
  console.log("[ELIZA-API] sendChatMessage:", text.slice(0, 80));
  if (!currentSessionId) {
    console.log("[ELIZA-API] No session — initializing agent first");
    const ok = await initializeAgent();
    if (!ok) return "Agent is not available. The LLM endpoint may be starting up.";
  }

  try {
    const url = `${API_BASE}/sessions/${currentSessionId}/messages`;
    console.log("[ELIZA-API] POST", url);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: text,
        transport: "http",
      }),
    });

    console.log("[ELIZA-API] message response status:", res.status);
    if (!res.ok) {
      const errText = await res.text();
      console.log("[ELIZA-API] message error body:", errText.slice(0, 300));
      throw new Error(errText || `HTTP ${res.status}`);
    }

    const data = await res.json();
    console.log("[ELIZA-API] message response keys:", Object.keys(data));
    console.log("[ELIZA-API] message response preview:", JSON.stringify(data).slice(0, 300));

    // Extract the agent's response text
    if (data.agentResponse?.text) { console.log("[ELIZA-API] Found agentResponse.text"); return data.agentResponse.text; }
    if (data.response?.text) { console.log("[ELIZA-API] Found response.text"); return data.response.text; }
    if (data.text) { console.log("[ELIZA-API] Found data.text"); return data.text; }
    if (typeof data === "string") { console.log("[ELIZA-API] Response is string"); return data; }

    // If we get an array of messages, find the agent's response
    if (Array.isArray(data)) {
      console.log("[ELIZA-API] Response is array, length:", data.length);
      const agentMsg = data.find(m => m.entityId !== m.userId || m.role === "assistant");
      if (agentMsg?.content?.text) return agentMsg.content.text;
    }

    console.log("[ELIZA-API] Could not parse response structure");
    return "Received response but couldn't parse it. The agent may still be initializing.";
  } catch (err) {
    console.error("[ELIZA-API] sendChatMessage ERROR:", err.message);
    return `Connection error: ${err.message}. The agent may be starting up.`;
  }
}

async function checkHealth() {
  const url = `${API_BASE}/../healthz`;
  console.log("[ELIZA-API] Health check →", url);
  try {
    const res = await fetch(url, { method: "GET" });
    console.log("[ELIZA-API] Health status:", res.status);
    return res.ok;
  } catch (e) {
    console.log("[ELIZA-API] Health check FAILED:", e.message);
    return false;
  }
}
