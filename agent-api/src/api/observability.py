"""Observability API — LangSmith trace data for monitoring.

普通用户只能看到自己的追踪数据，管理员可查看全部。
"""
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from src.api.auth_deps import get_current_user
from src.models.user import User
from src.config import settings
from src.utils.logger import api_logger

router = APIRouter(prefix="/observability", tags=["observability"])


def _get_client():
    """Get LangSmith client."""
    if not settings.langchain_api_key:
        raise HTTPException(status_code=503, detail="LangSmith 未配置")
    try:
        from langsmith import Client
        return Client(
            api_key=settings.langchain_api_key,
            api_url=settings.langchain_endpoint,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"LangSmith 连接失败: {e}")


@router.get("/status")
async def get_observability_status(
    current_user: User = Depends(get_current_user),
):
    """检查 LangSmith 连接状态."""
    enabled = settings.langchain_tracing_v2.lower() == "true" and bool(settings.langchain_api_key)
    if not enabled:
        return {"enabled": False, "project": None}

    try:
        client = _get_client()
        # Verify connection by reading project
        project = client.read_project(project_name=settings.langchain_project)
        return {
            "enabled": True,
            "project": settings.langchain_project,
            "project_id": str(project.id) if project else None,
        }
    except Exception as e:
        return {"enabled": True, "project": settings.langchain_project, "error": str(e)}


@router.get("/runs")
async def list_runs(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    hours: int = Query(24, ge=1, le=168),
    status: Optional[str] = Query(None, description="success/error"),
    current_user: User = Depends(get_current_user),
):
    """获取追踪记录列表.

    普通用户只能看到自己的（按 metadata.user_id 过滤），管理员看全部。
    """
    client = _get_client()
    is_admin = current_user.role_level >= 2

    start_time = datetime.now() - timedelta(hours=hours)

    try:
        filters = []
        if not is_admin:
            # Filter by user_id in metadata
            filters.append(f'has(metadata, "user_id") and eq(metadata["user_id"], {current_user.id})')
        if status == "error":
            filters.append('eq(status, "error")')
        elif status == "success":
            filters.append('eq(status, "success")')

        filter_str = " and ".join(filters) if filters else None

        runs = list(client.list_runs(
            project_name=settings.langchain_project,
            start_time=start_time,
            filter=filter_str,
            limit=limit,
            offset=offset,
            is_root=True,  # Only top-level runs
        ))

        items = []
        for run in runs:
            item = {
                "id": str(run.id),
                "name": run.name,
                "run_type": run.run_type,
                "status": run.status,
                "start_time": run.start_time.isoformat() if run.start_time else None,
                "end_time": run.end_time.isoformat() if run.end_time else None,
                "latency_ms": int((run.end_time - run.start_time).total_seconds() * 1000) if run.end_time and run.start_time else None,
                "total_tokens": run.total_tokens,
                "prompt_tokens": run.prompt_tokens,
                "completion_tokens": run.completion_tokens,
                "error": run.error if run.status == "error" else None,
                "metadata": {
                    "thread_id": (run.extra or {}).get("metadata", {}).get("thread_id"),
                    "user_id": (run.extra or {}).get("metadata", {}).get("user_id"),
                },
            }
            # Extract input/output preview
            if run.inputs:
                msgs = run.inputs.get("messages") or run.inputs.get("input")
                if isinstance(msgs, list) and msgs:
                    last = msgs[-1]
                    if isinstance(last, dict):
                        item["input_preview"] = str(last.get("content", ""))[:100]
                    elif isinstance(last, str):
                        item["input_preview"] = last[:100]
            if run.outputs:
                out = run.outputs.get("output") or run.outputs.get("messages")
                if isinstance(out, str):
                    item["output_preview"] = out[:100]
                elif isinstance(out, list) and out:
                    last = out[-1]
                    if isinstance(last, dict):
                        item["output_preview"] = str(last.get("content", ""))[:100]

            items.append(item)

        return {"items": items, "total": len(items)}

    except Exception as e:
        api_logger.error(f"Failed to list runs: {e}")
        raise HTTPException(status_code=500, detail=f"查询失败: {e}")


@router.get("/runs/{run_id}")
async def get_run_detail(
    run_id: str,
    current_user: User = Depends(get_current_user),
):
    """获取单条追踪详情（包含子 run）."""
    client = _get_client()

    try:
        run = client.read_run(run_id)

        # Permission check for non-admin
        if current_user.role_level < 2:
            run_user_id = (run.extra or {}).get("metadata", {}).get("user_id")
            if run_user_id and int(run_user_id) != current_user.id:
                raise HTTPException(status_code=403, detail="无权查看此记录")

        # Get child runs
        child_runs = list(client.list_runs(
            project_name=settings.langchain_project,
            trace_id=run.trace_id,
            is_root=False,
        ))

        children = []
        for child in child_runs:
            children.append({
                "id": str(child.id),
                "name": child.name,
                "run_type": child.run_type,
                "status": child.status,
                "latency_ms": int((child.end_time - child.start_time).total_seconds() * 1000) if child.end_time and child.start_time else None,
                "total_tokens": child.total_tokens,
                "error": child.error if child.status == "error" else None,
            })

        return {
            "id": str(run.id),
            "name": run.name,
            "run_type": run.run_type,
            "status": run.status,
            "start_time": run.start_time.isoformat() if run.start_time else None,
            "end_time": run.end_time.isoformat() if run.end_time else None,
            "latency_ms": int((run.end_time - run.start_time).total_seconds() * 1000) if run.end_time and run.start_time else None,
            "total_tokens": run.total_tokens,
            "prompt_tokens": run.prompt_tokens,
            "completion_tokens": run.completion_tokens,
            "error": run.error,
            "inputs": run.inputs,
            "outputs": run.outputs,
            "metadata": run.extra.get("metadata") if run.extra else {},
            "children": children,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {e}")


@router.get("/stats")
async def get_stats(
    hours: int = Query(24, ge=1, le=168),
    current_user: User = Depends(get_current_user),
):
    """获取统计概览（调用次数、成功率、token 用量等）."""
    client = _get_client()
    is_admin = current_user.role_level >= 2

    start_time = datetime.now() - timedelta(hours=hours)

    try:
        filters = []
        if not is_admin:
            filters.append(f'has(metadata, "user_id") and eq(metadata["user_id"], {current_user.id})')

        filter_str = " and ".join(filters) if filters else None

        runs = list(client.list_runs(
            project_name=settings.langchain_project,
            start_time=start_time,
            filter=filter_str,
            is_root=True,
            limit=500,
        ))

        total = len(runs)
        success = sum(1 for r in runs if r.status == "success")
        errors = sum(1 for r in runs if r.status == "error")
        total_tokens = sum(r.total_tokens or 0 for r in runs)
        total_latency = sum(
            (r.end_time - r.start_time).total_seconds() * 1000
            for r in runs if r.end_time and r.start_time
        )
        avg_latency = total_latency / total if total > 0 else 0

        return {
            "period_hours": hours,
            "total_runs": total,
            "success": success,
            "errors": errors,
            "success_rate": round(success / total * 100, 1) if total > 0 else 0,
            "total_tokens": total_tokens,
            "avg_latency_ms": round(avg_latency),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"统计失败: {e}")
