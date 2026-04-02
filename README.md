# Tokenization and Parsing Visualizer

A static, GitHub Pages-friendly presentation app for showing how NLP-style text processing works.

## What is in the scaffold

- `index.html`: static app shell
- `styles.css`: presentation-oriented visual system
- `src/app.js`: scene registry, animation timeline, and the first demo modules

## Current scenes

- Tokenization across multiple segmentation strategies
- Encoding and decoding traces
- BERT-style masked token prediction vs GPT-style next token generation

## Assumptions baked in

- The app is educational first, not model-accurate first.
- BPE is shown as a simple merge approximation so the mechanics are easy to present.
- Embeddings are explained conceptually instead of rendering real vector values.
- BERT and GPT outputs are deterministic illustrative examples, not live inference.
- Every scene uses a replayable step timeline so it works in a talk without needing backend state.

## Good next additions

- Real tokenizer backends compiled for the browser, such as GPT-style byte pair tokenization
- Attention or context-window visualizations
- Parse tree or dependency arc overlays
- Exportable preset examples for specific slides in the presentation
- Speaker mode with notes per step

## Hosting

The app is designed to run as plain static files with no build step, so it can be deployed directly with GitHub Pages.

## GitHub Pages setup

1. Push the repo to GitHub.
2. In repository settings, enable GitHub Pages from the main branch root.
3. The site will serve `index.html` directly.

For local preview, open `index.html` in a browser or serve the directory with a simple static server.
