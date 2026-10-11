"""Sharded Firestore counters for high-traffic aggregate analytics.

A single Firestore document sustains roughly one write per second. Funnel
counters are written on every gameplay event, so each write picks one of
``SHARDS`` sibling documents at random and readers sum them back together.
Totals written before sharding (the base document) are still included.
"""
from __future__ import annotations

import random

SHARDS = 10


def shard_ref(client, doc_id: str):
    return client.collection("analytics").document(f"{doc_id}__shard{random.randrange(SHARDS)}")


def _merge_counts(target: dict, source: dict) -> None:
    for key, value in source.items():
        if isinstance(value, dict):
            _merge_counts(target.setdefault(key, {}), value)
        elif isinstance(value, (int, float)) and not isinstance(value, bool):
            target[key] = target.get(key, 0) + value


def read_counts(client, doc_id: str) -> dict:
    """Return the summed counter document (base doc plus every shard)."""
    totals: dict = {}
    collection = client.collection("analytics")
    for name in [doc_id] + [f"{doc_id}__shard{index}" for index in range(SHARDS)]:
        snap = collection.document(name).get()
        if getattr(snap, "exists", False):
            data = snap.to_dict() or {}
            _merge_counts(totals, {k: v for k, v in data.items() if k != "updatedAt"})
    return totals
