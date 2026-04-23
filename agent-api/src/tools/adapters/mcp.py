"""MCP (Model Context Protocol) tool adapter — client side only.

Acts as an MCP client to external MCP servers. A configured tool record in
the database stores enough info to (a) connect to a remote/local MCP server
and (b) invoke one specific tool exposed by that server.

Supported transports:
- "http"  — Streamable HTTP (recommended for production / remote servers)
- "sse"   — legacy SSE transport
- "stdio" — local subprocess (e.g. `npx -y @modelcontextprotocol/server-…`)

execution JSON shape::

    {
      "type": "mcp",
      "mcp": {
        "transport": "http" | "sse" | "stdio",
        "url": "https://mcp.example.com/mcp",         # http / sse
        "command": ["npx", "-y", "pkg"],              # stdio
        "env": {"FOO": "bar"},                        # stdio extra env
        "headers": {"X-Tenant": "abc"},               # http / sse extra headers
        "auth": {                                     # same schema as REST adapter
          "type": "bearer_token",
          "env_key": "MCP_TOKEN"
        },
        "timeout": 30,
        "tool_name": "search_documents"               # the tool on the server
      }
    }
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import time
from contextlib import asynccontextmanager
from typing import Any, Optional

from src.tools.adapters.base import BaseToolAdapter, ToolExecutionError
from src.utils.logger import tools_logger


_ENV_PATTERN = re.compile(r"\$\{([^}]+)\}")


def _resolve_env_in_value(value: Any) -> Any:
    """Recursively resolve ${ENV_VAR} placeholders in strings/dicts/lists."""
    if isinstance(value, str):
        if "${" not in value:
            return value
        def repl(match: "re.Match[str]") -> str:
            return os.getenv(match.group(1), "")
        return _ENV_PATTERN.sub(repl, value)
    if isinstance(value, dict):
        return {k: _resolve_env_in_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_resolve_env_in_value(v) for v in value]
    return value


def _build_auth_headers(auth_config: dict) -> dict:
    """Mirror RestApiAdapter._get_auth_headers so MCP tools can reuse the
    same auth schema users already know from the REST flow."""
    headers: dict[str, str] = {}
    if not auth_config:
        return headers
    auth_type = auth_config.get("type", "none")

    if auth_type == "bearer_token":
        env_key = auth_config.get("env_key")
        if env_key:
            token = os.getenv(env_key)
            if token:
                header_name = auth_config.get("header_name", "Authorization")
                headers[header_name] = f"Bearer {token}"

    elif auth_type == "api_key":
        env_key = auth_config.get("env_key")
        header_name = auth_config.get("header_name", "X-Api-Key")
        if env_key:
            api_key = os.getenv(env_key)
            if api_key:
                headers[header_name] = api_key

    elif auth_type == "basic":
        username = os.getenv(auth_config.get("username_env", ""))
        password = os.getenv(auth_config.get("password_env", ""))
        if username and password:
            credentials = base64.b64encode(f"{username}:{password}".encode()).decode()
            headers["Authorization"] = f"Basic {credentials}"

    return headers


def _content_to_result(content_list: list[Any]) -> Any:
    """Convert MCP `tools/call` content array into a JSON-friendly structure.

    The MCP spec allows multiple content parts per response (text / image /
    resource). We try to collapse the common single-part-text case down to a
    plain object so the LLM sees clean JSON rather than a list wrapper.
    """
    if not content_list:
        return {"content": ""}

    def _one(item: Any) -> Any:
        # Text content
        if getattr(item, "type", None) == "text" or hasattr(item, "text"):
            text = getattr(item, "text", "") or ""
            try:
                return json.loads(text)
            except (json.JSONDecodeError, ValueError):
                return {"content": text}

        # Image content (base64 data + mimeType)
        if getattr(item, "type", None) == "image" or (
            hasattr(item, "data") and hasattr(item, "mimeType")
        ):
            mime = getattr(item, "mimeType", "image/png")
            data = getattr(item, "data", "")
            return {"content": f"data:{mime};base64,{data}"}

        # Resource / unknown — fall back to model_dump if available
        if hasattr(item, "model_dump"):
            return item.model_dump()
        return str(item)

    if len(content_list) == 1:
        return _one(content_list[0])

    return {"items": [_one(item) for item in content_list]}


@asynccontextmanager
async def _open_session(mcp_config: dict, timeout: float):
    """Open a `ClientSession` for the given MCP server configuration.

    Yields an initialized session. Caller MUST `await session.initialize()`
    is already done by us.
    """
    # Imports kept local so the rest of the module is importable even when
    # the optional `mcp` package is missing during tests.
    from mcp import ClientSession

    transport = (mcp_config.get("transport") or "http").lower()

    if transport == "http":
        from mcp.client.streamable_http import streamablehttp_client

        url = mcp_config.get("url")
        if not url:
            raise ToolExecutionError("mcp", "MCP http transport requires `url`")
        url = _resolve_env_in_value(url)

        headers = _resolve_env_in_value(mcp_config.get("headers", {}) or {})
        headers.update(_build_auth_headers(mcp_config.get("auth", {}) or {}))

        async with streamablehttp_client(url, headers=headers or None) as (read, write, _):
            async with ClientSession(read, write) as session:
                await asyncio.wait_for(session.initialize(), timeout=timeout)
                yield session

    elif transport == "sse":
        from mcp.client.sse import sse_client

        url = mcp_config.get("url")
        if not url:
            raise ToolExecutionError("mcp", "MCP sse transport requires `url`")
        url = _resolve_env_in_value(url)

        headers = _resolve_env_in_value(mcp_config.get("headers", {}) or {})
        headers.update(_build_auth_headers(mcp_config.get("auth", {}) or {}))

        async with sse_client(url, headers=headers or None) as (read, write):
            async with ClientSession(read, write) as session:
                await asyncio.wait_for(session.initialize(), timeout=timeout)
                yield session

    elif transport == "stdio":
        from mcp import StdioServerParameters
        from mcp.client.stdio import stdio_client

        command = mcp_config.get("command")
        if not command or not isinstance(command, list) or not command[0]:
            raise ToolExecutionError(
                "mcp",
                "MCP stdio transport requires `command` (list of strings)",
            )
        # Allow ${ENV} interpolation in command args too — handy for paths.
        command = [_resolve_env_in_value(c) for c in command]

        env = _resolve_env_in_value(mcp_config.get("env", {}) or {})
        # stdio_client needs a clean env dict without None values.
        merged_env = {**os.environ, **{k: str(v) for k, v in env.items() if v is not None}}

        params = StdioServerParameters(
            command=command[0],
            args=command[1:],
            env=merged_env,
        )

        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await asyncio.wait_for(session.initialize(), timeout=timeout)
                yield session

    else:
        raise ToolExecutionError("mcp", f"Unknown MCP transport: {transport}")


class MCPAdapter(BaseToolAdapter):
    """Adapter that calls a tool on a remote/local MCP server."""

    async def execute(
        self,
        tool_config: dict,
        params: dict,
        user_info: Optional[dict] = None,
    ) -> Any:
        mcp_config = tool_config.get("mcp") or {}
        tool_name = mcp_config.get("tool_name")
        if not tool_name:
            raise ToolExecutionError("mcp", "Missing `mcp.tool_name` in execution config")

        timeout = float(mcp_config.get("timeout", 30))

        tools_logger.info("=" * 60)
        tools_logger.info(
            f"MCP execute: transport={mcp_config.get('transport', 'http')} tool={tool_name}"
        )
        tools_logger.debug(f"Args: {params}")

        try:
            async with _open_session(mcp_config, timeout=timeout) as session:
                result = await asyncio.wait_for(
                    session.call_tool(tool_name, arguments=params or {}),
                    timeout=timeout,
                )
        except ToolExecutionError:
            raise
        except asyncio.TimeoutError:
            raise ToolExecutionError("mcp", f"MCP call timed out after {timeout}s")
        except Exception as exc:
            tools_logger.error(f"MCP execute failed: {exc}", exc_info=True)
            raise ToolExecutionError("mcp", str(exc)) from exc

        # MCP servers can flag a tool result as an error via `isError=True`.
        is_error = getattr(result, "isError", False)
        content = getattr(result, "content", []) or []
        normalized = _content_to_result(content)

        if is_error:
            # Surface as our standard error envelope so the LLM gets a clear
            # signal rather than treating an error string as data.
            message = (
                normalized.get("content")
                if isinstance(normalized, dict)
                else str(normalized)
            )
            return {"error": True, "message": message or "MCP tool returned error"}

        tools_logger.info("MCP execute ok")
        tools_logger.info("=" * 60)
        return normalized

    async def test_connection(
        self,
        tool_config: dict,
        custom_params: Optional[dict] = None,
    ) -> dict:
        """Test reachability of the configured MCP server.

        We do an `initialize` handshake plus a `tools/list` so the user gets
        confirmation that the server actually advertises tools (a successful
        TCP connect alone isn't very useful).
        """
        mcp_config = tool_config.get("mcp") or {}
        timeout = float(mcp_config.get("timeout", 15))

        start = time.time()
        try:
            async with _open_session(mcp_config, timeout=timeout) as session:
                listed = await asyncio.wait_for(session.list_tools(), timeout=timeout)
            latency_ms = int((time.time() - start) * 1000)
            tool_names = [t.name for t in (listed.tools or [])]
            return {
                "ok": True,
                "message": f"Connected. Server advertises {len(tool_names)} tool(s).",
                "latency_ms": latency_ms,
                "details": {"tools": tool_names[:50]},
            }
        except ToolExecutionError as exc:
            latency_ms = int((time.time() - start) * 1000)
            return {"ok": False, "message": exc.message, "latency_ms": latency_ms}
        except asyncio.TimeoutError:
            latency_ms = int((time.time() - start) * 1000)
            return {
                "ok": False,
                "message": f"Connect/list_tools timed out after {timeout}s",
                "latency_ms": latency_ms,
            }
        except Exception as exc:
            latency_ms = int((time.time() - start) * 1000)
            tools_logger.error(f"MCP test_connection failed: {exc}", exc_info=True)
            return {"ok": False, "message": str(exc), "latency_ms": latency_ms}

    async def list_remote_tools(self, mcp_config: dict) -> list[dict]:
        """Connect and return the server's tool catalog.

        Used by the "discover MCP tools" UI flow. Each entry is::

            {"name": str, "description": str, "input_schema": dict}

        `input_schema` is the raw JSON Schema published by the server — we
        translate it to our internal `parameters` array on import.
        """
        timeout = float(mcp_config.get("timeout", 15))
        async with _open_session(mcp_config, timeout=timeout) as session:
            listed = await asyncio.wait_for(session.list_tools(), timeout=timeout)

        out: list[dict] = []
        for tool in listed.tools or []:
            schema = getattr(tool, "inputSchema", None) or {}
            if hasattr(schema, "model_dump"):
                schema = schema.model_dump()
            out.append(
                {
                    "name": tool.name,
                    "description": tool.description or "",
                    "input_schema": schema,
                }
            )
        return out


mcp_adapter = MCPAdapter()


# ---------------------------------------------------------------------------
# Helpers used by the import endpoint
# ---------------------------------------------------------------------------

_JSON_SCHEMA_TYPE_TO_INTERNAL = {
    "string": "string",
    "integer": "integer",
    "number": "number",
    "boolean": "boolean",
    "array": "array",
    "object": "object",
}


def json_schema_to_parameters(input_schema: dict) -> list[dict]:
    """Convert an MCP tool's JSON Schema (`inputSchema`) into the internal
    `parameters` array used by `UserTool.input_schema`.

    The internal shape matches what `build_pydantic_schema` in
    `src/tools/user_tools.py` expects::

        {"parameters": [{"name", "type", "required", "description", "default"}]}
    """
    if not isinstance(input_schema, dict):
        return []

    properties = input_schema.get("properties") or {}
    required = set(input_schema.get("required") or [])

    params: list[dict] = []
    for name, prop in properties.items():
        if not isinstance(prop, dict):
            continue
        # JSON Schema can express type as a list (e.g. ["string","null"]) — pick
        # the first non-null primitive.
        raw_type = prop.get("type", "string")
        if isinstance(raw_type, list):
            raw_type = next((t for t in raw_type if t != "null"), "string")
        params.append(
            {
                "name": name,
                "type": _JSON_SCHEMA_TYPE_TO_INTERNAL.get(raw_type, "string"),
                "required": name in required,
                "description": prop.get("description") or prop.get("title") or "",
                "default": prop.get("default"),
            }
        )

    return params
