/**
 * api.js — ElizaOS v1.7.2 API client for Soliza chat
 *
 * Verified against ElizaOS server source code:
 * - All responses wrapped in { success: true, data: { ... } }
 * - Sessions at /api/messaging/sessions (NOT /api/sessions)
 * - Messages at /api/messaging/sessions/:id/messages
 */

const API_BASE = window.location.origin + "/api";
const MESSAGING_BASE = API_BASE + "/messaging";

let currentAgentId = null;
let currentSessionId = null;

// Generate a stable user ID per browser session
function getUserId() {
  let uid = sessionStorage.getItem("soliza_user_id");
  if (!uid) {
    uid = crypto.randomUUID();
    sessionStorage.setItem("soliza_user_id", uid);
  }
  return uid;
}

async function initializeAgent() {
  console.log("[ELIZA-API] === initializeAgent START ===");
  console.log("[ELIZA-API] API_BASE:", API_BASE);
  console.log("[ELIZA-API] MESSAGING_BASE:", MESSAGING_BASE);

  try {
    // Step 1: Fetch agents
    const agentsUrl = `${API_BASE}/agents`;
    console.log("[ELIZA-API] Step 1: GET", agentsUrl);
    const res = await fetch(agentsUrl);
    console.log("[ELIZA-API] /agents status:", res.status);
    if (!res.ok) throw new Error(`GET /agents failed (${res.status})`);

    const raw = await res.json();
    console.log("[ELIZA-API] /agents raw response:", JSON.stringify(raw).slice(0, 500));

    // ElizaOS v1.7.2 wraps responses: { success: true, data: { agents: [...] } }
    const payload = raw.data || raw;
    const agents = payload.agents || payload;
    console.log("[ELIZA-API] Unwrapped agents:", JSON.stringify(agents).slice(0, 300));

    if (Array.isArray(agents) && agents.length > 0) {
      // Pick the first active agent, or the first agent
      const active = agents.find(a => a.status === "active") || agents[0];
      currentAgentId = active.id;
    } else if (typeof agents === "object" && !Array.isArray(agents)) {
      // Fallback: agents might be a map { id: agent }
      const ids = Object.keys(agents);
      if (ids.length > 0) currentAgentId = ids[0];
    }

    console.log("[ELIZA-API] Resolved agentId:", currentAgentId || "NONE FOUND");
    if (!currentAgentId) throw new Error("No agents found in response");

    // Step 2: Create session via /api/messaging/sessions
    const userId = getUserId();
    const sessionsUrl = `${MESSAGING_BASE}/sessions`;
    const sessionBody = { agentId: currentAgentId, userId: userId };
    console.log("[ELIZA-API] Step 2: POST", sessionsUrl);
    console.log("[ELIZA-API] Session body:", JSON.stringify(sessionBody));

    const sessionRes = await fetch(sessionsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sessionBody),
    });

    console.log("[ELIZA-API] /sessions status:", sessionRes.status);
    const sessionRaw = await sessionRes.json();
    console.log("[ELIZA-API] /sessions raw response:", JSON.stringify(sessionRaw).slice(0, 500));

    if (!sessionRes.ok) {
      throw new Error(`POST /sessions failed (${sessionRes.status}): ${JSON.stringify(sessionRaw)}`);
    }

    // Unwrap { success, data } wrapper
    const sessionData = sessionRaw.data || sessionRaw;
    currentSessionId = sessionData.sessionId || sessionData.id;
    console.log("[ELIZA-API] Resolved sessionId:", currentSessionId || "NONE");

    if (!currentSessionId) throw new Error("No sessionId in response");

    console.log("[ELIZA-API] === initializeAgent SUCCESS ===");
    return true;
  } catch (err) {
    console.error("[ELIZA-API] === initializeAgent FAILED ===", err.message);

    // Probe server health to diagnose WHY
    try {
      const healthRes = await fetch(window.location.origin + "/healthz");
      console.error("[ELIZA-API] /healthz status:", healthRes.status);
      if (healthRes.ok) {
        const healthData = await healthRes.json().catch(() => null);
        console.error("[ELIZA-API] /healthz body:", JSON.stringify(healthData));
      }
    } catch (e) {
      console.error("[ELIZA-API] /healthz unreachable:", e.message);
    }

    return false;
  }
}

async function sendChatMessage(text) {
  console.log("[ELIZA-API] sendChatMessage:", text.slice(0, 80));
  if (!currentSessionId) {
    console.log("[ELIZA-API] No session — initializing agent first");
    const ok = await initializeAgent();
    if (!ok) return "Agent is not available. Check browser console for details.";
  }

  try {
    const url = `${MESSAGING_BASE}/sessions/${currentSessionId}/messages`;
    const body = { content: text, transport: "http" };
    console.log("[ELIZA-API] POST", url);
    console.log("[ELIZA-API] Message body:", JSON.stringify(body));

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    console.log("[ELIZA-API] message status:", res.status);
    if (!res.ok) {
      const errText = await res.text();
      console.log("[ELIZA-API] message error:", errText.slice(0, 500));

      // Server hides real error — fetch it from agent logs endpoint
      let reason = errText.slice(0, 300);
      if (currentAgentId) {
        try {
          const logsRes = await fetch(`${API_BASE}/agents/${currentAgentId}/logs`);
          if (logsRes.ok) {
            const logsRaw = await logsRes.json();
            const logs = logsRaw.data || logsRaw;
            const logsArr = Array.isArray(logs) ? logs : (logs.logs || []);
            // Find the most recent error log
            const errorLog = logsArr.reverse?.().find(l =>
              (l.level === "error" || l.type === "error") &&
              (l.message || l.body || l.msg || "").toString().includes("Error")
            );
            if (errorLog) {
              reason = errorLog.message || errorLog.body || errorLog.msg || JSON.stringify(errorLog);
              console.error("[ELIZA-API] SERVER ERROR from /logs:", reason);
            }
          }
        } catch (_) { /* logs endpoint not available */ }
      }

      // Also log the raw 500 body
      console.error("[ELIZA-API] Raw 500 response:", errText);
      console.error("[ELIZA-API] Server-side reason:", reason);
      throw new Error(reason);
    }

    const raw = await res.json();
    console.log("[ELIZA-API] message raw response:", JSON.stringify(raw).slice(0, 500));

    // Unwrap { success, data } wrapper
    const data = raw.data || raw;

    // Try multiple response formats (ElizaOS varies by version/transport)
    if (data.agentResponse?.text) return data.agentResponse.text;
    if (data.response?.text) return data.response.text;
    if (data.text) return data.text;
    if (typeof data === "string") return data;
    if (data.message?.text) return data.message.text;
    if (data.content?.text) return data.content.text;

    // Array of messages
    if (Array.isArray(data)) {
      console.log("[ELIZA-API] Response is array, length:", data.length);
      const agentMsg = data.find(m => m.role === "assistant" || m.entityId !== m.userId);
      if (agentMsg?.content?.text) return agentMsg.content.text;
      if (agentMsg?.text) return agentMsg.text;
    }

    console.log("[ELIZA-API] Unrecognized response structure:", Object.keys(data));
    return "Received response but couldn't parse it. Check console for raw data.";
  } catch (err) {
    console.error("[ELIZA-API] sendChatMessage ERROR:", err.message);
    return `Error: ${err.message}`;
  }
}

async function checkHealth() {
  const url = window.location.origin + "/healthz";
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

// Full diagnostic — call from browser console: diagnose()
async function diagnose() {
  console.log("=== SOLIZA DIAGNOSTIC ===");
  const origin = window.location.origin;

  // 1. Health
  try {
    const h = await fetch(origin + "/healthz");
    const hb = await h.json().catch(() => h.statusText);
    console.log("1. /healthz:", h.status, hb);
  } catch (e) { console.error("1. /healthz FAILED:", e.message); }

  // 2. Agents
  try {
    const a = await fetch(origin + "/api/agents");
    const ab = await a.json();
    const agents = ab.data?.agents || ab.agents || [];
    console.log("2. /api/agents:", a.status, "count:", agents.length, agents.map(x => ({ id: x.id, name: x.name, status: x.status })));
  } catch (e) { console.error("2. /api/agents FAILED:", e.message); }

  // 3. Sessions health
  try {
    const s = await fetch(origin + "/api/messaging/sessions/health");
    const sb = await s.json().catch(() => s.statusText);
    console.log("3. /sessions/health:", s.status, sb);
  } catch (e) { console.error("3. /sessions/health FAILED:", e.message); }

  // 4. Agent logs (last 5 errors)
  if (currentAgentId) {
    try {
      const l = await fetch(origin + "/api/agents/" + currentAgentId + "/logs");
      const lb = await l.json();
      const logs = lb.data || lb;
      const logsArr = Array.isArray(logs) ? logs : (logs.logs || []);
      const errors = logsArr.filter(x => x.level === "error" || x.type === "error").slice(-5);
      console.log("4. Agent errors (last 5):", errors.length ? errors : "NONE");
    } catch (e) { console.error("4. /logs FAILED:", e.message); }
  } else {
    console.log("4. Skipped (no agentId yet — send a message first)");
  }

  // 5. Try a test session + message
  console.log("5. Testing full message flow...");
  const result = await sendChatMessage("ping");
  console.log("5. Result:", result);

  console.log("=== END DIAGNOSTIC ===");
}
