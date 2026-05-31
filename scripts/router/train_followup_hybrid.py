#!/usr/bin/env python3
import pathlib
import runpy
import sys

target = pathlib.Path(__file__).resolve().parent / "train" / "train_followup_hybrid.py"
sys.argv[0] = str(target)
runpy.run_path(str(target), run_name="__main__")
