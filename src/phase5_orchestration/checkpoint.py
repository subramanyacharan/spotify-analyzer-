"""Pipeline checkpoint persistence for Phase 5.2 orchestration."""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
DEFAULT_CHECKPOINT_PATH = os.path.join(project_root, "data", "outputs", "pipeline_checkpoint.json")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_checkpoint(path: str = DEFAULT_CHECKPOINT_PATH) -> Dict[str, Any]:
    if not os.path.isfile(path):
        return {}
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def save_checkpoint(data: Dict[str, Any], path: str = DEFAULT_CHECKPOINT_PATH) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data["updated_at"] = _utc_now()
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)


def init_checkpoint(mode: str, path: str = DEFAULT_CHECKPOINT_PATH) -> Dict[str, Any]:
    data = {
        "run_id": str(uuid.uuid4()),
        "mode": mode,
        "started_at": _utc_now(),
        "updated_at": _utc_now(),
        "completed_stages": [],
        "stage_results": {},
    }
    save_checkpoint(data, path)
    return data


def mark_stage_complete(
    checkpoint: Dict[str, Any],
    stage_id: str,
    result: Any,
    path: str = DEFAULT_CHECKPOINT_PATH,
) -> None:
    completed: List[str] = checkpoint.setdefault("completed_stages", [])
    if stage_id not in completed:
        completed.append(stage_id)
    checkpoint.setdefault("stage_results", {})[stage_id] = {
        "status": "success",
        "completed_at": _utc_now(),
        "result_summary": _summarize_result(result),
    }
    checkpoint["last_completed"] = stage_id
    save_checkpoint(checkpoint, path)


def mark_stage_failed(
    checkpoint: Dict[str, Any],
    stage_id: str,
    error: str,
    path: str = DEFAULT_CHECKPOINT_PATH,
) -> None:
    checkpoint.setdefault("stage_results", {})[stage_id] = {
        "status": "failed",
        "failed_at": _utc_now(),
        "error": error,
    }
    save_checkpoint(checkpoint, path)


def is_stage_complete(checkpoint: Dict[str, Any], stage_id: str) -> bool:
    return stage_id in checkpoint.get("completed_stages", [])


def _summarize_result(result: Any) -> Dict[str, Any]:
    if result is None:
        return {"type": "none"}
    if isinstance(result, dict):
        summary: Dict[str, Any] = {"type": "dict", "keys": list(result.keys())[:12]}
        if "error" in result:
            summary["error"] = result["error"]
        for key in (
            "total_reviews_analyzed",
            "reviews_scored",
            "clusters_processed",
            "output_count",
        ):
            if key in result:
                summary[key] = result[key]
        return summary
    if isinstance(result, list):
        return {"type": "list", "length": len(result)}
    return {"type": type(result).__name__}


def reset_checkpoint(path: str = DEFAULT_CHECKPOINT_PATH) -> None:
    if os.path.isfile(path):
        os.remove(path)
