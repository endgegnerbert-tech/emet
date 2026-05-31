#!/usr/bin/env python3
import pathlib
import runpy
import sys

target = pathlib.Path(__file__).resolve().parent / "train" / "generate_followup_distill.py"
sys.argv[0] = str(target)
runpy.run_path(str(target), run_name="__main__")
