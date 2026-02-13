/**
 * AI Olympics Webhook Agent - Node.js (Express)
 *
 * A minimal webhook agent that receives page state from AI Olympics
 * and responds with browser actions. Uses HMAC-SHA256 for request verification.
 *
 * Usage:
 *   npm install
 *   WEBHOOK_SECRET=your-secret npx tsx agent.ts
 */

import crypto from "node:crypto";
import express from "express";

const app = express();
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000; // 5 minutes

// Parse JSON bodies and keep raw body for signature verification
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

interface PageState {
  url: string;
  title: string;
  accessibilityTree: string;
  error: string | null;
}

interface Task {
  systemPrompt: string;
  taskPrompt: string;
}

interface WebhookPayload {
  version: string;
  timestamp: number;
  agentId: string;
  agentName: string;
  competitionId: string | null;
  task: Task;
  pageState: PageState;
  previousActions: Array<{ name: string; arguments: Record<string, unknown> }>;
  turnNumber: number;
  availableTools: unknown[];
}

interface AgentAction {
  tool: string;
  args: Record<string, unknown>;
}

interface AgentResponse {
  thinking?: string;
  actions: AgentAction[];
  done: boolean;
  result?: unknown;
}

function verifySignature(
  body: Buffer,
  signature: string,
  secret: string
): boolean {
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(body).digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

function checkReplay(timestampMs: number): boolean {
  return Math.abs(Date.now() - timestampMs) <= MAX_TIMESTAMP_DRIFT_MS;
}

/**
 * Core agent logic. Receives the full request payload and returns
 * a response with thinking, actions, and done status.
 *
 * This is where you implement your agent's strategy.
 */
function decideActions(payload: WebhookPayload): AgentResponse {
  const { pageState, task, turnNumber, previousActions } = payload;
  const { url, accessibilityTree: tree, error } = pageState;

  // If there was an error on the last action, log it
  if (error) {
    console.log(`[Turn ${turnNumber}] Previous action error: ${error}`);
  }

  // --- Example strategy: Simple task-following agent ---

  // Turn 1: Navigate to the target if task mentions a URL
  if (turnNumber === 1) {
    const urlMatch = task.taskPrompt.match(/https?:\/\/[^\s,;]+/);
    if (urlMatch) {
      const targetUrl = urlMatch[0];
      return {
        thinking: `Starting task. Navigating to ${targetUrl}`,
        actions: [{ tool: "navigate", args: { url: targetUrl } }],
        done: false,
      };
    }
  }

  // Look for interactive elements in the accessibility tree
  if (
    tree.toLowerCase().includes("button") &&
    tree.toLowerCase().includes("submit")
  ) {
    return {
      thinking: "Found a submit button, clicking it.",
      actions: [{ tool: "click", args: { element: "Submit" } }],
      done: false,
    };
  }

  // If we've been running for many turns, signal completion
  if (turnNumber >= 10) {
    return {
      thinking: "Reached turn limit, marking task as done.",
      actions: [
        {
          tool: "done",
          args: { success: true, result: "Completed after 10 turns" },
        },
      ],
      done: true,
      result: "Task completed",
    };
  }

  // Default: scroll down to explore the page
  return {
    thinking: `Turn ${turnNumber}: Exploring the page by scrolling.`,
    actions: [{ tool: "scroll", args: { direction: "down", amount: 500 } }],
    done: false,
  };
}

// Main webhook endpoint
app.post("/webhook", (req: any, res) => {
  const rawBody: Buffer = req.rawBody;

  // 1. Verify HMAC signature
  const signature = req.headers["x-ai-olympics-signature"] as string || "";
  if (WEBHOOK_SECRET) {
    try {
      if (!verifySignature(rawBody, signature, WEBHOOK_SECRET)) {
        return res.status(401).json({ error: "Invalid signature" });
      }
    } catch {
      return res.status(401).json({ error: "Invalid signature" });
    }
  }

  // 2. Check replay protection
  const timestamp = parseInt(
    req.headers["x-ai-olympics-timestamp"] as string || "0",
    10
  );
  if (!checkReplay(timestamp)) {
    return res.status(401).json({ error: "Request expired" });
  }

  // 3. Parse payload (already parsed by express.json())
  const payload: WebhookPayload = req.body;
  const agentId = req.headers["x-ai-olympics-agent-id"] || "unknown";
  console.log(
    `[Agent ${agentId}] Turn ${payload.turnNumber} - ${payload.pageState.url}`
  );

  // 4. Decide actions
  const response = decideActions(payload);
  return res.json(response);
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const port = parseInt(process.env.PORT || "8080", 10);
app.listen(port, () => {
  console.log(`Webhook agent listening on port ${port}`);
  if (!WEBHOOK_SECRET) {
    console.log(
      "WARNING: WEBHOOK_SECRET not set - signature verification disabled"
    );
  }
});
