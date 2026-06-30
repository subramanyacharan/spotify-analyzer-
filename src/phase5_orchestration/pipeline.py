"""
Phase 5.2: Master pipeline orchestration.

Single-command workflow: ingest -> analyze -> insight -> dashboard snapshot -> report.
"""

from __future__ import annotations

import logging
import os
import sys
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Sequence

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if project_root not in sys.path:
    sys.path.append(project_root)

from dotenv import load_dotenv

load_dotenv()

from src.phase1_data_pipeline.data_cleaning import run_cleaning
from src.phase1_data_pipeline.data_ingestion import run_ingestion
from src.phase1_data_pipeline.data_sanitization import run_sanitization
from src.phase1_data_pipeline.deduplication import run_deduplication
from src.phase2_analysis.cluster_insights import run_cluster_insight_generation
from src.phase2_analysis.embedding_clustering import run_embedding_clustering
from src.phase2_analysis.sentiment_analysis import run_sentiment_analysis
from src.phase2_analysis.theme_classification import run_theme_classification_v2
from src.phase2_analysis.user_segment_detection import run_user_segment_detection
from src.phase3_knowledge.insight_prioritization import run_insight_prioritization_engine
from src.phase3_knowledge.opportunity_scoring import run_opportunity_scoring_engine
from src.phase3_knowledge.problem_statement_engine import (
    default_analysis_filters,
    run_problem_statement_engine,
)
from src.phase3_knowledge.segment_deep_dive import run_segment_deep_dive_engine
from src.phase5_orchestration.checkpoint import (
    DEFAULT_CHECKPOINT_PATH,
    init_checkpoint,
    is_stage_complete,
    load_checkpoint,
    mark_stage_complete,
    mark_stage_failed,
    reset_checkpoint,
    save_checkpoint,
)
from src.phase5_orchestration.dashboard_snapshots import run_dashboard_snapshots
from src.phase5_orchestration.weekly_report_generator import (
    DEFAULT_OUTPUT_FILE as WEEKLY_REPORT_PATH,
    run_weekly_report_generator,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

FULL_INGEST_DAYS = 90
INCREMENTAL_INGEST_DAYS = 7

STAGE_ORDER: List[str] = [
    "phase1_ingest",
    "phase1_clean",
    "phase1_sanitize",
    "phase1_dedupe",
    "phase2_embedding",
    "phase2_themes",
    "phase2_sentiment",
    "phase2_segments",
    "phase2_cluster_insights",
    "phase3_problem",
    "phase3_deep_dive",
    "phase3_opportunities",
    "phase3_prioritization",
    "phase4_snapshots",
    "phase5_weekly_report",
]

PHASE1_STAGES = {"phase1_ingest", "phase1_clean", "phase1_sanitize", "phase1_dedupe"}
PHASE2_STAGES = {
    "phase2_embedding",
    "phase2_themes",
    "phase2_sentiment",
    "phase2_segments",
    "phase2_cluster_insights",
}
PHASE3_STAGES = {
    "phase3_problem",
    "phase3_deep_dive",
    "phase3_opportunities",
    "phase3_prioritization",
}


@dataclass
class PipelineConfig:
    mode: str = "incremental"
    from_stage: Optional[str] = None
    to_stage: Optional[str] = None
    skip_phase1: bool = False
    skip_phase2: bool = False
    skip_phase3: bool = False
    skip_ingest: bool = False
    save_supabase: bool = True
    use_checkpoint: bool = True
    force_stages: Sequence[str] = field(default_factory=list)
    max_retries: int = 2
    checkpoint_path: str = DEFAULT_CHECKPOINT_PATH
    weekly_report_path: str = WEEKLY_REPORT_PATH


@dataclass
class StageSpec:
    stage_id: str
    label: str
    runner: Callable[[PipelineConfig], Any]


def _ingest_days(config: PipelineConfig) -> int:
    return FULL_INGEST_DAYS if config.mode == "full" else INCREMENTAL_INGEST_DAYS


def _incremental(config: PipelineConfig) -> bool:
    return config.mode == "incremental"


def _run_phase1_ingest(config: PipelineConfig) -> Dict[str, Any]:
    days = _ingest_days(config)
    logger.info("Ingest window: %s days (%s mode)", days, config.mode)
    run_ingestion(days=days)
    return {"ingest_days": days}


def _run_phase1_clean(config: PipelineConfig) -> List[Dict[str, Any]]:
    reviews = run_cleaning(save_local=True)
    return reviews


def _run_phase1_sanitize(config: PipelineConfig) -> List[Dict[str, Any]]:
    return run_sanitization(save_local=True)


def _run_phase1_dedupe(config: PipelineConfig) -> List[Dict[str, Any]]:
    return run_deduplication(
        save_local=True,
        store_in_supabase=config.save_supabase,
    )


def _run_phase2_embedding(config: PipelineConfig) -> Dict[str, Any]:
    result = run_embedding_clustering(
        skip_existing_embeddings=_incremental(config),
    )
    if isinstance(result, dict) and result.get("error"):
        raise RuntimeError(f"Phase 2.1 failed: {result['error']}")
    return result or {}


def _run_phase2_themes(config: PipelineConfig) -> Dict[str, Any]:
    return run_theme_classification_v2(
        use_zero_shot_fallback=not _incremental(config),
    )


def _run_phase2_sentiment(config: PipelineConfig) -> Dict[str, Any]:
    return run_sentiment_analysis(skip_scored=_incremental(config))


def _run_phase2_segments(config: PipelineConfig) -> Dict[str, Any]:
    return run_user_segment_detection(skip_segmented=_incremental(config))


def _run_phase2_cluster_insights(config: PipelineConfig) -> Dict[str, Any]:
    return run_cluster_insight_generation()


def _phase3_filters(_config: PipelineConfig):
    return default_analysis_filters()


def _run_phase3_problem(config: PipelineConfig) -> Dict[str, Any]:
    return run_problem_statement_engine(
        filters=_phase3_filters(config),
        save_supabase=config.save_supabase,
    )


def _run_phase3_deep_dive(config: PipelineConfig) -> Dict[str, Any]:
    return run_segment_deep_dive_engine(
        filters=_phase3_filters(config),
        save_supabase=config.save_supabase,
    )


def _run_phase3_opportunities(config: PipelineConfig) -> Dict[str, Any]:
    return run_opportunity_scoring_engine(
        filters=_phase3_filters(config),
        save_supabase=config.save_supabase,
    )


def _run_phase3_prioritization(config: PipelineConfig) -> Dict[str, Any]:
    return run_insight_prioritization_engine(
        filters=_phase3_filters(config),
        save_supabase=config.save_supabase,
    )


def _run_phase4_snapshots(config: PipelineConfig) -> Dict[str, Any]:
    return run_dashboard_snapshots(
        save_supabase=config.save_supabase,
    )


def _run_phase5_weekly_report(config: PipelineConfig) -> Dict[str, Any]:
    result = run_weekly_report_generator(
        save_supabase=config.save_supabase,
        output_path=config.weekly_report_path,
    )
    if not result:
        raise RuntimeError("Weekly report generation returned no data.")
    return result


STAGE_REGISTRY: Dict[str, StageSpec] = {
    "phase1_ingest": StageSpec("phase1_ingest", "Phase 1.2 Ingest", _run_phase1_ingest),
    "phase1_clean": StageSpec("phase1_clean", "Phase 1.3 Clean", _run_phase1_clean),
    "phase1_sanitize": StageSpec("phase1_sanitize", "Phase 1.4 Sanitize", _run_phase1_sanitize),
    "phase1_dedupe": StageSpec("phase1_dedupe", "Phase 1.5 Dedupe", _run_phase1_dedupe),
    "phase2_embedding": StageSpec("phase2_embedding", "Phase 2.1 Embed & Cluster", _run_phase2_embedding),
    "phase2_themes": StageSpec("phase2_themes", "Phase 2.2 Themes", _run_phase2_themes),
    "phase2_sentiment": StageSpec("phase2_sentiment", "Phase 2.3 Sentiment", _run_phase2_sentiment),
    "phase2_segments": StageSpec("phase2_segments", "Phase 2.4 Segments", _run_phase2_segments),
    "phase2_cluster_insights": StageSpec(
        "phase2_cluster_insights", "Phase 2.5 Cluster Insights", _run_phase2_cluster_insights
    ),
    "phase3_problem": StageSpec("phase3_problem", "Phase 3.1 Problem Engine", _run_phase3_problem),
    "phase3_deep_dive": StageSpec("phase3_deep_dive", "Phase 3.2 Segment Deep-Dive", _run_phase3_deep_dive),
    "phase3_opportunities": StageSpec(
        "phase3_opportunities", "Phase 3.3 Opportunity Scoring", _run_phase3_opportunities
    ),
    "phase3_prioritization": StageSpec(
        "phase3_prioritization", "Phase 3.4 Prioritization", _run_phase3_prioritization
    ),
    "phase4_snapshots": StageSpec("phase4_snapshots", "Phase 4 Dashboard Snapshots", _run_phase4_snapshots),
    "phase5_weekly_report": StageSpec(
        "phase5_weekly_report", "Phase 5.1 Weekly Report", _run_phase5_weekly_report
    ),
}


def list_stages() -> List[str]:
    return list(STAGE_ORDER)


def _should_skip_stage(stage_id: str, config: PipelineConfig) -> bool:
    if stage_id == "phase1_ingest" and config.skip_ingest:
        return True
    if stage_id in PHASE1_STAGES and config.skip_phase1:
        return True
    if stage_id in PHASE2_STAGES and config.skip_phase2:
        return True
    if stage_id in PHASE3_STAGES and config.skip_phase3:
        return True
    return False


def _resolve_stage_window(config: PipelineConfig) -> List[str]:
    stages = list(STAGE_ORDER)
    if config.from_stage:
        if config.from_stage not in STAGE_REGISTRY:
            raise ValueError(f"Unknown stage: {config.from_stage}")
        start_idx = stages.index(config.from_stage)
        stages = stages[start_idx:]
    if config.to_stage:
        if config.to_stage not in STAGE_REGISTRY:
            raise ValueError(f"Unknown stage: {config.to_stage}")
        end_idx = stages.index(config.to_stage)
        stages = stages[: end_idx + 1]
    return stages


def _execute_stage_with_retry(
    spec: StageSpec,
    config: PipelineConfig,
) -> Any:
    last_error: Optional[Exception] = None
    attempts = max(1, config.max_retries + 1)
    for attempt in range(1, attempts + 1):
        try:
            logger.info("[%s] Starting (attempt %s/%s)", spec.label, attempt, attempts)
            started = time.monotonic()
            result = spec.runner(config)
            elapsed = time.monotonic() - started
            logger.info("[%s] Completed in %.1fs", spec.label, elapsed)
            return result
        except Exception as exc:
            last_error = exc
            logger.error("[%s] Failed on attempt %s: %s", spec.label, attempt, exc)
            if attempt < attempts:
                backoff = min(2 ** attempt, 30)
                logger.info("[%s] Retrying in %ss...", spec.label, backoff)
                time.sleep(backoff)
    assert last_error is not None
    raise last_error


def run_pipeline(config: PipelineConfig) -> Dict[str, Any]:
    """
    Execute the master pipeline according to config.

    Returns a summary dict with completed stages and any failures.
    """
    stages_to_run = _resolve_stage_window(config)
    if config.use_checkpoint:
        checkpoint = load_checkpoint(config.checkpoint_path)
        if not checkpoint or checkpoint.get("mode") != config.mode:
            checkpoint = init_checkpoint(config.mode, config.checkpoint_path)
    else:
        checkpoint = {}

    summary: Dict[str, Any] = {
        "mode": config.mode,
        "run_id": checkpoint.get("run_id"),
        "stages_planned": stages_to_run,
        "stages_completed": [],
        "stages_skipped": [],
        "stages_failed": [],
    }

    logger.info("=" * 60)
    logger.info("Phase 5.2 Pipeline — %s mode", config.mode.upper())
    logger.info("Stages: %s", " -> ".join(stages_to_run))
    logger.info("=" * 60)

    for stage_id in stages_to_run:
        spec = STAGE_REGISTRY[stage_id]

        if _should_skip_stage(stage_id, config):
            logger.info("[%s] Skipped (group flag)", spec.label)
            summary["stages_skipped"].append(stage_id)
            continue

        if (
            config.use_checkpoint
            and is_stage_complete(checkpoint, stage_id)
            and stage_id not in config.force_stages
        ):
            logger.info("[%s] Skipped (checkpoint)", spec.label)
            summary["stages_skipped"].append(stage_id)
            continue

        try:
            result = _execute_stage_with_retry(spec, config)
            if config.use_checkpoint:
                mark_stage_complete(checkpoint, stage_id, result, config.checkpoint_path)
            summary["stages_completed"].append(stage_id)
        except Exception as exc:
            if config.use_checkpoint:
                mark_stage_failed(checkpoint, stage_id, str(exc), config.checkpoint_path)
            summary["stages_failed"].append({"stage": stage_id, "error": str(exc)})
            logger.error("Pipeline halted at %s: %s", stage_id, exc)
            break

    summary["success"] = not summary["stages_failed"]
    if config.use_checkpoint:
        save_checkpoint(checkpoint, config.checkpoint_path)
    return summary


def reset_pipeline_checkpoint(path: str = DEFAULT_CHECKPOINT_PATH) -> None:
    reset_checkpoint(path)
