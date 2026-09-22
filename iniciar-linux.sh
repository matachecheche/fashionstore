#!/usr/bin/env sh
# Lanzador para Linux / macOS / Codespaces: solo llama a iniciar.py
cd "$(dirname "$0")" && exec python3 iniciar.py "$@"
