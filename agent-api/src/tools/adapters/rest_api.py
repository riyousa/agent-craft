"""REST API tool adapter."""
import os
import re
import time
import json
import httpx
from typing import Any, Optional
from src.tools.adapters.base import BaseToolAdapter, ToolExecutionError
from src.utils.logger import tools_logger


class RestApiAdapter(BaseToolAdapter):
    """REST API adapter for external API calls."""

    def __init__(self):
        self.client = None

    def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self.client is None:
            self.client = httpx.AsyncClient(timeout=30.0)
        return self.client

    def _resolve_env_vars(self, value: str) -> str:
        """Resolve environment variable references in string.

        Supports format: ${ENV_VAR_NAME}
        """
        if isinstance(value, str) and "${" in value:
            import re
            pattern = r'\$\{([^}]+)\}'
            matches = re.findall(pattern, value)
            for var_name in matches:
                env_value = os.getenv(var_name, "")
                value = value.replace(f"${{{var_name}}}", env_value)
        return value

    def _resolve_user_vars(self, value: Any, user_info: dict) -> Any:
        """Resolve user variable references in string or dict.

        Supports formats:
        - ${user.id} - User ID
        - ${user.username} - Username
        - ${user.name} - User display name
        - ${user.email} - User email
        - ${user.role_level} - User role level
        - ${user.department} - User department

        Args:
            value: Value to resolve (string, dict, or list)
            user_info: Dictionary containing user information

        Returns:
            Resolved value with user placeholders replaced
        """
        if not user_info:
            return value

        if isinstance(value, str):
            if "${user." in value:
                import re
                pattern = r'\$\{user\.([^}]+)\}'
                matches = re.findall(pattern, value)
                for field_name in matches:
                    user_value = user_info.get(field_name, "")
                    value = value.replace(f"${{user.{field_name}}}", str(user_value))
            return value
        elif isinstance(value, dict):
            return {k: self._resolve_user_vars(v, user_info) for k, v in value.items()}
        elif isinstance(value, list):
            return [self._resolve_user_vars(item, user_info) for item in value]
        return value

    def _resolve_template(self, template: Any, params: dict) -> Any:
        """Resolve template variables in format {{param_name}} or {{param_name | default: value}}.

        Supports:
        - {{param_name}} - simple parameter reference
        - {{param_name | default: 'value'}} - parameter with default value
        - {{param_name | default: 123}} - parameter with numeric default
        - {{param_name | default: true}} - parameter with boolean default
        - Mixed strings like "prefix {{param}} suffix" are also supported
        """
        if isinstance(template, str):
            # Check if the ENTIRE string is a single placeholder — return typed value
            single_match = re.match(r'^\{\{(.+?)\}\}$', template.strip())
            if single_match:
                return self._resolve_single_placeholder(single_match.group(1).strip(), params)

            # Otherwise do inline replacement — all {{...}} in string become string values
            def replacer(match):
                placeholder = match.group(1).strip()
                resolved = self._resolve_single_placeholder(placeholder, params)
                if resolved is None:
                    return ''
                return str(resolved)

            resolved = re.sub(r'\{\{(.+?)\}\}', replacer, template)
            return resolved

        elif isinstance(template, dict):
            return {k: self._resolve_template(v, params) for k, v in template.items()}
        elif isinstance(template, list):
            return [self._resolve_template(item, params) for item in template]
        return template

    def _resolve_single_placeholder(self, content: str, params: dict) -> Any:
        """Resolve a single placeholder content (without {{ }})."""
        # Check for default value syntax: param | default: value
        if " | default:" in content or "|default:" in content:
            parts = content.split("|", 1)
            param_name = parts[0].strip()
            default_part = parts[1].strip()

            if default_part.startswith("default:"):
                default_str = default_part[8:].strip()
                default_value = self._parse_default_value(default_str)

                param_value = params.get(param_name)
                if param_value is not None:
                    return param_value
                return default_value

        # Simple parameter reference
        return params.get(content)

    def _parse_streaming_response(self, text: str) -> Any:
        """Parse Server-Sent Events (SSE) or streaming text response.

        SSE format:
            data: {"key": "value"}

            data: {"key": "value2"}

            [DONE]

        Args:
            text: Raw response text

        Returns:
            Parsed data (dict or string)
        """
        if not text or not text.strip():
            return {"content": ""}

        lines = text.strip().split('\n')
        data_items = []

        for line in lines:
            line = line.strip()
            if not line or line == "[DONE]":
                continue

            # Parse SSE format: "data: {json}"
            if line.startswith("data:"):
                data_str = line[5:].strip()  # Remove "data:" prefix
                if data_str and data_str != "[DONE]":
                    try:
                        data_json = json.loads(data_str)
                        data_items.append(data_json)
                    except json.JSONDecodeError:
                        # Not JSON, keep as string
                        data_items.append({"content": data_str})

        # Return the last data item if available, or combine all items
        if not data_items:
            # No valid data found, return raw text
            return {"content": text}
        elif len(data_items) == 1:
            # Single item
            return data_items[0]
        else:
            # Multiple items - return the last one (usually the final result)
            # or combine them if needed
            return data_items[-1]

    def _parse_default_value(self, value_str: str) -> Any:
        """Parse default value string to appropriate Python type.

        Args:
            value_str: String representation of default value

        Returns:
            Parsed value (str, int, float, bool, or None)
        """
        value_str = value_str.strip()

        # Remove quotes for string values
        if (value_str.startswith("'") and value_str.endswith("'")) or \
           (value_str.startswith('"') and value_str.endswith('"')):
            return value_str[1:-1]

        # Parse boolean values
        if value_str.lower() == "true":
            return True
        elif value_str.lower() == "false":
            return False

        # Parse numeric values
        try:
            if "." in value_str:
                return float(value_str)
            else:
                return int(value_str)
        except ValueError:
            pass

        # Return as string if can't parse
        return value_str

    def _resolve_template_string(self, text: str, params: dict) -> str:
        """Resolve all {{param}} placeholders in a string.

        Args:
            text: String with {{param}} placeholders
            params: Parameter values

        Returns:
            String with placeholders replaced
        """
        import re

        def replacer(match):
            param_name = match.group(1).strip()
            value = params.get(param_name)
            if value is not None:
                return str(value)
            # Keep original placeholder if param not found
            return match.group(0)

        return re.sub(r'\{\{(\w+)\}\}', replacer, text)

    def _get_auth_headers(self, auth_config: dict) -> dict:
        """Get authentication headers based on auth config."""
        headers = {}
        auth_type = auth_config.get("type", "none")

        if auth_type == "bearer_token":
            env_key = auth_config.get("env_key")
            if env_key:
                token = os.getenv(env_key)
                if token:
                    header_name = auth_config.get("header_name", "Authorization")
                    headers[header_name] = f"Bearer {token}"
                else:
                    tools_logger.warning(f"No token found for env_key: {env_key}")
            else:
                tools_logger.warning("No env_key in auth_config")

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
                import base64
                credentials = base64.b64encode(f"{username}:{password}".encode()).decode()
                headers["Authorization"] = f"Basic {credentials}"

        return headers

    def _extract_response_data(self, response_data: Any, mapping: dict) -> Any:
        """Extract and map response data according to response_mapping."""
        if not mapping:
            return response_data

        # Get root data
        root_path = mapping.get("root_path", "")
        fallback_path = mapping.get("fallback_path", "")

        data = response_data
        if root_path:
            for key in root_path.split("."):
                if isinstance(data, dict):
                    data = data.get(key)
                else:
                    break

        # Try fallback if root_path didn't work
        if data is None and fallback_path:
            data = response_data
            for key in fallback_path.split("."):
                if isinstance(data, dict):
                    data = data.get(key)
                else:
                    break

        # Apply field mapping
        field_mapping = mapping.get("field_mapping", {})
        if not field_mapping:
            return data

        if isinstance(data, list):
            return [self._map_fields(item, field_mapping) for item in data]
        elif isinstance(data, dict):
            return self._map_fields(data, field_mapping)
        return data

    def _map_fields(self, item: dict, field_mapping: dict) -> dict:
        """Map fields according to field_mapping."""
        result = {}
        for output_field, source_expr in field_mapping.items():
            # Support "field1 || field2" syntax for fallback
            if " || " in source_expr:
                sources = [s.strip() for s in source_expr.split("||")]
                for source in sources:
                    value = item.get(source)
                    if value:
                        result[output_field] = value
                        break
            else:
                result[output_field] = item.get(source_expr)
        return result

    async def execute(self, tool_config: dict, params: dict, user_info: Optional[dict] = None) -> Any:
        """Execute REST API call.

        Args:
            tool_config: Tool configuration
            params: Tool parameters
            user_info: User information (user_id, username, name, email, role_level, etc.)

        Returns:
            API response data
        """
        tools_logger.info("="*60)
        tools_logger.info("Starting REST API tool execution")
        tools_logger.debug(f"Tool config: {tool_config}")
        tools_logger.debug(f"Input params: {params}")
        tools_logger.debug(f"User info: {user_info}")

        config = tool_config.get("config", {})
        request_mapping = tool_config.get("request_mapping", {})
        response_mapping = tool_config.get("response_mapping", {})

        # Resolve request parameters
        resolved_params = self._resolve_template(request_mapping, params)
        tools_logger.debug(f"Resolved params (after template): {resolved_params}")

        # Resolve user variables in request params
        if user_info:
            resolved_params = self._resolve_user_vars(resolved_params, user_info)
            tools_logger.debug(f"Resolved params (after user vars): {resolved_params}")

        # Extract body if request_mapping wraps params in a "body" field
        # This allows more flexible request_mapping structures
        if isinstance(resolved_params, dict) and "body" in resolved_params and len(resolved_params) == 1:
            resolved_params = resolved_params["body"]
            tools_logger.debug(f"Extracted body from request_mapping: {resolved_params}")

        # Build headers
        headers = config.get("headers", {}).copy()
        tools_logger.debug(f"Initial headers: {headers}")

        # Resolve environment variables in headers
        for key, value in headers.items():
            headers[key] = self._resolve_env_vars(value)
        tools_logger.debug(f"Headers (after env vars): {headers}")

        # Resolve user variables in headers
        if user_info:
            headers = self._resolve_user_vars(headers, user_info)
            tools_logger.debug(f"Headers (after user vars): {headers}")

        # Add auth headers
        auth_config = config.get("auth", {})
        auth_headers = self._get_auth_headers(auth_config)
        headers.update(auth_headers)
        tools_logger.debug(f"Final headers (with auth): {headers}")

        # Resolve endpoint - first env vars, then params
        endpoint_template = self._resolve_env_vars(config.get("endpoint", ""))
        # Track which params were consumed by {{...}} placeholders in the URL
        # so we don't duplicate them as query string / body.
        consumed_in_url = set(re.findall(r'\{\{(\w+)\}\}', endpoint_template))
        # Replace {{param}} placeholders in endpoint with actual param values
        endpoint = self._resolve_template_string(endpoint_template, params)
        tools_logger.info(f"Endpoint after param substitution: {endpoint}")
        tools_logger.debug(f"Params consumed in URL template: {consumed_in_url}")

        # When request_mapping is empty (common for AI-generated tools),
        # fall back to the raw LLM-provided params — excluding ones already
        # baked into the URL via {{placeholder}} substitution.
        if not request_mapping:
            fallback_payload = {
                k: v for k, v in (params or {}).items()
                if k not in consumed_in_url
            }
            if fallback_payload:
                tools_logger.debug(
                    f"request_mapping empty — using raw params as payload: {fallback_payload}"
                )
                resolved_params = fallback_payload

        method = config.get("method", "POST").upper()
        timeout = config.get("timeout", 10)
        tools_logger.info(f"Request: {method} {endpoint}")
        tools_logger.debug(f"Timeout: {timeout}s")

        # Retry configuration
        # max_attempts represents the number of retry attempts (not including the initial attempt)
        # So total attempts = 1 (initial) + max_attempts (retries)
        retry_config = config.get("retry", {})
        max_retries = retry_config.get("max_attempts", 0)  # Default: no retries
        total_attempts = 1 + max_retries  # Initial attempt + retries
        backoff_ms = retry_config.get("backoff_ms", 1000)

        client = self._get_client()
        last_error = None

        for attempt in range(total_attempts):
            tools_logger.info(f"Attempt {attempt + 1}/{total_attempts}")
            try:
                if method == "GET":
                    # For GET, resolved_params (from request_mapping or raw fallback)
                    # go into the URL query string. httpx merges these with any
                    # existing query in the endpoint, so we don't need to guard on '?'.
                    tools_logger.debug(f"GET request query params: {resolved_params}")
                    response = await client.get(
                        endpoint,
                        params=resolved_params if resolved_params else None,
                        headers=headers,
                        timeout=timeout
                    )
                else:
                    # For other methods (POST, PUT, PATCH, etc.), use json body
                    tools_logger.debug(f"Request body (JSON): {resolved_params}")
                    response = await client.request(
                        method,
                        endpoint,
                        json=resolved_params if resolved_params else None,
                        headers=headers,
                        timeout=timeout
                    )

                tools_logger.info(f"Response status: {response.status_code}")
                tools_logger.debug(f"Response headers: {dict(response.headers)}")

                response.raise_for_status()

                # Check content type to determine how to parse response
                content_type = response.headers.get("content-type", "").lower()

                if "text/event-stream" in content_type or "text/plain" in content_type:
                    # Handle streaming or text response (SSE format)
                    tools_logger.debug("Parsing streaming/text response")
                    response_data = self._parse_streaming_response(response.text)
                    tools_logger.debug(f"Parsed streaming response: {response_data}")
                elif "application/json" in content_type or not content_type:
                    # Handle JSON response (default)
                    response_data = response.json()
                    tools_logger.debug(f"Response data: {response_data}")
                else:
                    # Unknown content type, try JSON first, fallback to text
                    try:
                        response_data = response.json()
                        tools_logger.debug(f"Response data (JSON): {response_data}")
                    except Exception:
                        response_data = {"content": response.text}
                        tools_logger.debug(f"Response data (text): {response_data}")

                # === Polling support ===
                polling_config = tool_config.get("polling")
                if polling_config and polling_config.get("enabled"):
                    tools_logger.info("Polling enabled, starting async status check...")
                    import asyncio

                    task_id_path = polling_config.get("task_id_path", "task_id")
                    # Extract task_id from response
                    task_id = response_data
                    for key in task_id_path.split("."):
                        if isinstance(task_id, dict):
                            task_id = task_id.get(key)
                        else:
                            break
                    tools_logger.info(f"Task ID: {task_id}")

                    if task_id is None:
                        raise ToolExecutionError("rest_api", f"Cannot find task_id at path '{task_id_path}' in response")

                    status_endpoint = polling_config.get("status_endpoint", "")
                    status_endpoint = self._resolve_env_vars(status_endpoint)
                    status_endpoint = status_endpoint.replace("{{task_id}}", str(task_id))

                    status_field = polling_config.get("status_field", "status")
                    # Support single string or comma-separated or list
                    completed_raw = polling_config.get("completed_value", "completed")
                    failed_raw = polling_config.get("failed_value", "failed")
                    completed_values = set(v.strip() for v in (completed_raw if isinstance(completed_raw, list) else str(completed_raw).split(",")))
                    failed_values = set(v.strip() for v in (failed_raw if isinstance(failed_raw, list) else str(failed_raw).split(",")))
                    tools_logger.info(f"Polling: completed={completed_values}, failed={failed_values}")

                    result_path = polling_config.get("result_path", "")
                    interval = polling_config.get("interval_seconds", 5)
                    max_attempts = polling_config.get("max_attempts", 60)

                    for poll_i in range(max_attempts):
                        await asyncio.sleep(interval)
                        tools_logger.info(f"Polling attempt {poll_i + 1}/{max_attempts}: GET {status_endpoint}")
                        poll_resp = await client.get(status_endpoint, headers=headers, timeout=timeout)
                        poll_resp.raise_for_status()
                        poll_data = poll_resp.json()
                        tools_logger.debug(f"Poll response: {poll_data}")

                        # Extract status value
                        status_val = poll_data
                        for key in status_field.split("."):
                            if isinstance(status_val, dict):
                                status_val = status_val.get(key)
                            else:
                                break

                        if str(status_val) in completed_values:
                            tools_logger.info("Polling completed successfully")
                            # Extract result from poll response
                            final_data = poll_data
                            if result_path:
                                for key in result_path.split("."):
                                    if isinstance(final_data, dict):
                                        final_data = final_data.get(key)
                                    else:
                                        break
                            result = self._extract_response_data(final_data or poll_data, response_mapping)
                            tools_logger.info(f"Final result: {result}")
                            tools_logger.info("="*60)
                            return result

                        if str(status_val) in failed_values:
                            error_msg = poll_data.get("message") or poll_data.get("error") or "Task failed"
                            tools_logger.error(f"Task failed: {error_msg}")
                            raise ToolExecutionError("rest_api", f"任务失败: {error_msg}")

                    raise ToolExecutionError("rest_api", f"轮询超时：{max_attempts * interval}秒后任务仍未完成 (task_id={task_id})")

                # Apply response mapping (non-polling)
                result = self._extract_response_data(response_data, response_mapping)

                # If result is None/empty after mapping, return the original response
                # so the LLM gets meaningful data instead of None (which causes it to retry)
                if result is None:
                    tools_logger.warning("Response mapping returned None, returning original response data")
                    result = response_data

                tools_logger.info(f"Tool execution successful. Result: {result}")
                tools_logger.info("="*60)
                return result

            except ToolExecutionError:
                # Don't retry ToolExecutionError (e.g. polling timeout/failure)
                raise
            except httpx.HTTPStatusError as e:
                last_error = f"HTTP {e.response.status_code}: {e.response.text[:200]}"
                tools_logger.error(f"HTTP error: {last_error}")
                tools_logger.debug(f"Response body: {e.response.text}")
            except httpx.RequestError as e:
                last_error = f"Request error: {str(e)}"
                tools_logger.error(f"Request error: {last_error}")
            except Exception as e:
                last_error = f"Unexpected error: {str(e)}"
                tools_logger.error(f"Unexpected error: {last_error}", exc_info=True)

            # Wait before retry
            if attempt < total_attempts - 1:
                tools_logger.info(f"Waiting {backoff_ms}ms before retry...")
                time.sleep(backoff_ms / 1000)

        tools_logger.error(f"All {total_attempts} attempts failed. Last error: {last_error}")
        tools_logger.info("="*60)
        raise ToolExecutionError("rest_api", last_error or "Unknown error")

    async def test_connection(self, tool_config: dict, custom_params: Optional[dict] = None) -> dict:
        """Test REST API connectivity."""
        tools_logger.info("="*60)
        tools_logger.info("Testing REST API connection")
        tools_logger.debug(f"Tool config: {tool_config}")
        tools_logger.debug(f"Custom params: {custom_params}")

        config = tool_config.get("config", {})
        endpoint = self._resolve_env_vars(config.get("endpoint", ""))
        tools_logger.info(f"Endpoint: {endpoint}")

        if not endpoint:
            tools_logger.error("Endpoint not configured")
            return {
                "ok": False,
                "message": "Endpoint not configured",
                "latency_ms": 0
            }

        # Check auth configuration
        auth_config = config.get("auth", {})
        auth_type = auth_config.get("type", "none")
        tools_logger.info(f"Auth type: {auth_type}")

        if auth_type != "none":
            env_key = auth_config.get("env_key")
            if env_key and not os.getenv(env_key):
                tools_logger.error(f"Environment variable {env_key} not set")
                return {
                    "ok": False,
                    "message": f"Environment variable {env_key} not set",
                    "latency_ms": 0
                }
            tools_logger.debug(f"Auth env_key: {env_key} (value present: {bool(os.getenv(env_key))})")

        # Try to make a test request
        start_time = time.time()
        tools_logger.info("Sending test request...")
        try:
            # Use custom params if provided, otherwise use minimal test params
            if custom_params is None:
                # Build minimal params from input schema
                custom_params = {}
            tools_logger.debug(f"Test params: {custom_params}")

            headers = config.get("headers", {}).copy()
            for key, value in headers.items():
                headers[key] = self._resolve_env_vars(value)
            tools_logger.debug(f"Headers (after env vars): {headers}")

            auth_headers = self._get_auth_headers(auth_config)
            headers.update(auth_headers)
            tools_logger.debug(f"Final headers (with auth): {headers}")

            method = config.get("method", "POST").upper()
            timeout = config.get("timeout", 10)
            tools_logger.info(f"Test request: {method} {endpoint} (timeout: {timeout}s)")

            client = self._get_client()

            if method == "GET":
                # For GET requests, use custom_params as query parameters
                tools_logger.debug(f"GET params: {custom_params}")
                response = await client.get(
                    endpoint,
                    params=custom_params if custom_params else None,
                    headers=headers,
                    timeout=timeout
                )
            else:
                # For other methods, use json body
                tools_logger.debug(f"Request body: {custom_params}")
                response = await client.request(
                    method,
                    endpoint,
                    json=custom_params if custom_params else None,
                    headers=headers,
                    timeout=timeout
                )

            latency_ms = int((time.time() - start_time) * 1000)
            tools_logger.info(f"Response: HTTP {response.status_code} (latency: {latency_ms}ms)")
            tools_logger.debug(f"Response headers: {dict(response.headers)}")
            tools_logger.debug(f"Response body: {response.text[:500]}")

            if response.status_code < 400:
                tools_logger.info("Connection test successful")
                tools_logger.info("="*60)
                return {
                    "ok": True,
                    "message": f"Connection successful (HTTP {response.status_code})",
                    "latency_ms": latency_ms,
                    "details": {
                        "status_code": response.status_code,
                        "content_length": len(response.content)
                    }
                }
            else:
                tools_logger.warning(f"Connection test failed: HTTP {response.status_code}")
                tools_logger.info("="*60)
                return {
                    "ok": False,
                    "message": f"HTTP {response.status_code}: {response.text[:200]}",
                    "latency_ms": latency_ms
                }

        except httpx.RequestError as e:
            latency_ms = int((time.time() - start_time) * 1000)
            tools_logger.error(f"Request error: {str(e)}")
            tools_logger.info("="*60)
            return {
                "ok": False,
                "message": f"Request error: {str(e)}",
                "latency_ms": latency_ms
            }
        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            tools_logger.error(f"Unexpected error: {str(e)}", exc_info=True)
            tools_logger.info("="*60)
            return {
                "ok": False,
                "message": f"Error: {str(e)}",
                "latency_ms": latency_ms
            }


# Global adapter instance
rest_api_adapter = RestApiAdapter()
