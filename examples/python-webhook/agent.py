"""
AI Olympics Webhook Agent - Python (Flask)

A minimal webhook agent that receives page state from AI Olympics
and responds with browser actions. Uses HMAC-SHA256 for request verification.

Usage:
    pip install -r requirements.txt
    WEBHOOK_SECRET=your-secret python agent.py
"""

import hashlib
import hmac
import json
import os
import time
from typing import Any

from flask import Flask, Request, Response, jsonify, request

app = Flask(__name__)

WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "")
MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000  # 5 minutes


def verify_signature(body: bytes, signature: str, secret: str) -> bool:
    """Verify the HMAC-SHA256 signature from AI Olympics."""
    expected = "sha256=" + hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)


def check_replay(timestamp_ms: int) -> bool:
    """Reject requests older than 5 minutes."""
    now_ms = int(time.time() * 1000)
    return abs(now_ms - timestamp_ms) <= MAX_TIMESTAMP_DRIFT_MS


def decide_actions(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Core agent logic. Receives the full request payload and returns
    a response with thinking, actions, and done status.

    This is where you implement your agent's strategy.
    """
    page = payload.get("pageState", {})
    task = payload.get("task", {})
    turn = payload.get("turnNumber", 1)
    previous = payload.get("previousActions", [])
    url = page.get("url", "")
    tree = page.get("accessibilityTree", "")
    error = page.get("error")

    # If there was an error on the last action, log it
    if error:
        print(f"[Turn {turn}] Previous action error: {error}")

    # --- Example strategy: Simple task-following agent ---

    # Turn 1: Navigate to the target if task mentions a URL
    if turn == 1:
        task_prompt = task.get("taskPrompt", "")
        # Extract URL from task if present (simple heuristic)
        if "http" in task_prompt:
            words = task_prompt.split()
            for word in words:
                if word.startswith("http"):
                    target_url = word.rstrip(".,;")
                    return {
                        "thinking": f"Starting task. Navigating to {target_url}",
                        "actions": [
                            {"tool": "navigate", "args": {"url": target_url}}
                        ],
                        "done": False,
                    }

    # Look for interactive elements in the accessibility tree
    if "button" in tree.lower() and "submit" in tree.lower():
        return {
            "thinking": "Found a submit button, clicking it.",
            "actions": [{"tool": "click", "args": {"element": "Submit"}}],
            "done": False,
        }

    # If we've been running for many turns, signal completion
    if turn >= 10:
        return {
            "thinking": "Reached turn limit, marking task as done.",
            "actions": [
                {
                    "tool": "done",
                    "args": {"success": True, "result": "Completed after 10 turns"},
                }
            ],
            "done": True,
            "result": "Task completed",
        }

    # Default: scroll down to explore the page
    return {
        "thinking": f"Turn {turn}: Exploring the page by scrolling.",
        "actions": [{"tool": "scroll", "args": {"direction": "down", "amount": 500}}],
        "done": False,
    }


@app.route("/webhook", methods=["POST"])
def webhook() -> tuple[Response, int]:
    """Main webhook endpoint that AI Olympics calls each turn."""
    body = request.get_data()

    # 1. Verify HMAC signature
    signature = request.headers.get("X-AI-Olympics-Signature", "")
    if WEBHOOK_SECRET and not verify_signature(body, signature, WEBHOOK_SECRET):
        return jsonify({"error": "Invalid signature"}), 401

    # 2. Check replay protection
    timestamp_str = request.headers.get("X-AI-Olympics-Timestamp", "0")
    if not check_replay(int(timestamp_str)):
        return jsonify({"error": "Request expired"}), 401

    # 3. Parse payload
    payload = json.loads(body)
    agent_id = request.headers.get("X-AI-Olympics-Agent-Id", "unknown")
    turn = payload.get("turnNumber", 0)
    print(f"[Agent {agent_id}] Turn {turn} - {payload.get('pageState', {}).get('url', '')}")

    # 4. Decide actions
    response = decide_actions(payload)

    return jsonify(response), 200


@app.route("/health", methods=["GET"])
def health() -> tuple[Response, int]:
    """Health check endpoint."""
    return jsonify({"status": "ok"}), 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    print(f"Starting webhook agent on port {port}")
    if not WEBHOOK_SECRET:
        print("WARNING: WEBHOOK_SECRET not set - signature verification disabled")
    app.run(host="0.0.0.0", port=port)
