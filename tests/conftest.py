"""Test defaults: no background agent runs and no live literature calls unless a test opts in."""
import os

os.environ.setdefault("OPS_WORKFLOW", "0")
os.environ.setdefault("OPS_LITERATURE", "0")
