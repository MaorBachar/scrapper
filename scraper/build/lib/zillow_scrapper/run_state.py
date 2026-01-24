from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Literal, Optional


ZipStatus = Literal["pending", "done", "blocked", "error"]
ListingStatus = Literal["pending", "done", "blocked", "error", "skipped"]


@dataclass
class RunState:
    run_id: str
    created_at: str
    zip_status: dict[str, ZipStatus]
    listing_status: dict[str, ListingStatus]

    @staticmethod
    def new(run_id: str, zip_codes: list[str]) -> "RunState":
        return RunState(
            run_id=run_id,
            created_at=datetime.utcnow().isoformat(),
            zip_status={z: "pending" for z in zip_codes},
            listing_status={},
        )

    @staticmethod
    def load(path: Path) -> "RunState":
        data = json.loads(path.read_text(encoding="utf-8"))
        return RunState(
            run_id=str(data["run_id"]),
            created_at=str(data.get("created_at", "")),
            zip_status=dict(data.get("zip_status", {})),
            listing_status=dict(data.get("listing_status", {})),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "created_at": self.created_at,
            "zip_status": self.zip_status,
            "listing_status": self.listing_status,
        }


def atomic_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    tmp.replace(path)


def listing_key(zpid: Optional[str], url: str) -> str:
    return zpid or url

