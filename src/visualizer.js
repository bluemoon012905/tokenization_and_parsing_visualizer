export const SCENES = {
  tokenization: {
    label: "Tokenization",
    title: "Tokenization Strategies",
    subtitle:
      "Compare multiple segmentation lenses so the audience sees that tokens are a modeling choice, not a fixed truth.",
    assumptions: [
      "Show four views: characters, words, phrase chunks, and a simple BPE-style merge pass.",
      "Use an educational BPE approximation rather than a production tokenizer vocabulary.",
      "Highlight that phrase chunks are semantic teaching aids, not literal transformer tokens."
    ]
  },
  encoding: {
    label: "Encoding / Decoding",
    title: "Encoding and Decoding Trace",
    subtitle:
      "Walk from surface text into ids and abstract vector slots, then back out into a generated continuation.",
    assumptions: [
      "Represent embeddings as compressed explanatory summaries rather than real high-dimensional vectors.",
      "Assign deterministic demo ids so the scene is stable during a presentation.",
      "Keep the decode side small and interpretable instead of pretending to be a full model run."
    ]
  },
  compare: {
    label: "BERT vs GPT",
    title: "BERT Fill-In vs GPT Continuation",
    subtitle:
      "Contrast bidirectional masked-token scoring with left-to-right generation using the same source text.",
    assumptions: [
      "Use a single masked word for the BERT side and a short next-token rollout for the GPT side.",
      "Candidate scores are illustrative rankings, not outputs from a live model.",
      "The comparison focuses on interaction patterns: fill a gap vs continue a prefix."
    ]
  }
};

function sanitizeWords(text) {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean);
}

function splitIntoCharacters(text) {
  return Array.from(text).filter((char) => char.trim() !== "");
}

function buildPhraseChunks(words) {
  const phrases = [];
  for (let index = 0; index < words.length; index += 3) {
    phrases.push(words.slice(index, index + 3).join(" "));
  }
  return phrases;
}

function buildBpeApprox(words) {
  const stems = words.slice(0, 10).map((word) => word.toLowerCase().replace(/[^a-z]/g, ""));
  const merges = [];
  stems.forEach((word) => {
    if (!word) {
      return;
    }
    if (word.length <= 4) {
      merges.push(word);
      return;
    }
    const pivot = Math.max(2, Math.floor(word.length / 2));
    merges.push(word.slice(0, pivot));
    merges.push(`##${word.slice(pivot)}`);
  });
  return merges;
}

function hashToken(token, index) {
  return (
    token
      .split("")
      .reduce((sum, char) => sum + char.charCodeAt(0), 0) +
    index * 17 +
    97
  );
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function laneHeader(title, meta) {
  const header = el("div", "lane-header");
  header.append(el("div", "lane-title", title), el("div", "lane-meta", meta));
  return header;
}

function chipRow(values, kind, className) {
  const row = el("div", `${kind}-row`);
  values.forEach((value) => {
    const chip = el("span", className, value);
    chip.classList.add("dim");
    row.appendChild(chip);
  });
  return row;
}

function decodePreview(words) {
  const seed = words.slice(-2);
  return [...words, ...seed, "with", "context"];
}

function buildCandidates(maskedWord) {
  const normalized = maskedWord.toLowerCase().replace(/[^a-z]/g, "") || "token";
  return [
    { token: normalized, score: "0.42" },
    { token: "signal", score: "0.23" },
    { token: "concept", score: "0.17" },
    { token: "pattern", score: "0.08" }
  ];
}

function renderTokenLane(title, meta, tokens, kind) {
  const lane = el("section", "lane");
  const header = el("div", "lane-header");
  header.append(el("div", "lane-title", title), el("div", "lane-meta", meta));
  const row = el("div", "token-row");
  tokens.forEach((token) => {
    const chip = el("span", "token-chip", token);
    chip.dataset.kind = kind;
    row.appendChild(chip);
  });
  lane.append(header, row);
  return lane;
}

function highlightLane(root, index) {
  const lanes = [...root.querySelectorAll(".lane")];
  lanes.forEach((lane, laneIndex) => {
    lane.querySelectorAll(".token-chip").forEach((chip) => {
      chip.classList.toggle("active", laneIndex === index);
      chip.classList.toggle("dim", laneIndex !== index);
    });
  });
}

function highlightClass(root, selector, start, end) {
  const chips = [...root.querySelectorAll(selector)];
  chips.forEach((chip, index) => {
    const active = index >= start && index < end;
    chip.classList.toggle("active", active);
    chip.classList.toggle("dim", !active);
  });
}

function buildTokenizationScene(text, root) {
  const words = sanitizeWords(text);
  const characters = splitIntoCharacters(text).slice(0, 48);
  const phrases = buildPhraseChunks(words);
  const bpe = buildBpeApprox(words);

  root.append(
    renderTokenLane("Character pieces", `${characters.length} units`, characters, "char"),
    renderTokenLane("Whitespace words", `${words.length} units`, words, "word"),
    renderTokenLane("Phrase chunks", `${phrases.length} teaching chunks`, phrases, "phrase"),
    renderTokenLane("BPE-style merges", `${bpe.length} subword pieces`, bpe, "bpe")
  );

  const steps = [
    {
      title: "Start with raw text",
      note: "The sentence is a single uninterrupted surface form.",
      badge: "Raw text",
      run() {
        [...root.querySelectorAll(".token-chip")].forEach((chip) => {
          chip.classList.add("dim");
          chip.classList.remove("active");
        });
      }
    },
    {
      title: "Reveal character splits",
      note: "The smallest visible pieces emphasize that segmentation can be very fine-grained.",
      badge: "Characters",
      run() {
        highlightLane(root, 0);
      }
    },
    {
      title: "Promote word tokens",
      note: "A simpler human-friendly segmentation often used as a teaching baseline.",
      badge: "Words",
      run() {
        highlightLane(root, 1);
      }
    },
    {
      title: "Group into phrases",
      note: "Semantic chunking is useful for explanation even when the model consumes something else.",
      badge: "Phrases",
      run() {
        highlightLane(root, 2);
      }
    },
    {
      title: "Show subword merges",
      note: "Subword tokenization balances vocabulary size against coverage.",
      badge: "Subwords",
      run() {
        highlightLane(root, 3);
      }
    }
  ];

  return {
    steps,
    inspector: [
      { label: "Input length", value: `${text.length} characters` },
      { label: "Word count", value: `${words.length} words` },
      { label: "Teaching point", value: "Different tokenizers expose different structures." }
    ]
  };
}

function buildEncodingScene(text, root) {
  const words = sanitizeWords(text).slice(0, 8);
  const ids = words.map((word, index) => hashToken(word, index));
  const decoded = decodePreview(words);

  const tokenLane = el("section", "lane");
  tokenLane.append(
    laneHeader("Surface tokens", "Text broken into interpretable units"),
    chipRow(words, "generation", "generation-chip")
  );

  const idLane = el("section", "lane");
  idLane.append(
    laneHeader("Vocabulary ids", "Deterministic ids used for the demo"),
    chipRow(ids.map(String), "id", "id-chip")
  );

  const mapping = el("section", "lane");
  mapping.append(laneHeader("Compressed embedding intuition", "What the vector is supposed to preserve"));
  const grid = el("div", "mapping-grid");
  words.forEach((word, index) => {
    const card = el("div", "mapping-card");
    card.innerHTML = `<strong>${word}</strong><span>id ${ids[index]}</span><p>captures context, similarity, and ordering cues</p>`;
    grid.appendChild(card);
  });
  mapping.appendChild(grid);

  const decodeLane = el("section", "lane");
  decodeLane.append(
    laneHeader("Decode preview", "A tiny continuation trace"),
    chipRow(decoded, "generation", "generation-chip")
  );

  root.append(tokenLane, idLane, mapping, decodeLane);

  const steps = [
    {
      title: "Observe the source tokens",
      note: "Start from a short token sequence the audience can track visually.",
      badge: "Surface",
      run() {
        highlightClass(root, ".generation-chip", 0, words.length);
      }
    },
    {
      title: "Map each token to an id",
      note: "The model consumes ids, not raw strings.",
      badge: "Ids",
      run() {
        highlightClass(root, ".id-chip", 0, ids.length);
      }
    },
    {
      title: "Abstract into embeddings",
      note: "Each id indexes a dense representation that carries contextual signal.",
      badge: "Embeddings",
      run() {
        root.querySelectorAll(".mapping-card").forEach((card, index) => {
          card.style.opacity = index % 2 === 0 ? "1" : "0.68";
          card.style.transform = "translateY(-2px)";
        });
      }
    },
    {
      title: "Decode into output tokens",
      note: "Generation happens by choosing likely continuations over time.",
      badge: "Decode",
      run() {
        highlightClass(root, ".generation-chip", words.length, words.length + decoded.length);
      }
    }
  ];

  return {
    steps,
    inspector: [
      { label: "Token sample", value: words.join(" | ") },
      { label: "Id range", value: `${Math.min(...ids)} to ${Math.max(...ids)}` },
      { label: "Teaching point", value: "Encoding turns strings into indexed representations before any prediction." }
    ]
  };
}

function buildCompareScene(text, root) {
  const words = sanitizeWords(text);
  const maskIndex = Math.min(4, Math.max(1, Math.floor(words.length / 3)));
  const originalMaskWord = words[maskIndex] || "word";
  const maskedWords = [...words];
  maskedWords[maskIndex] = "[MASK]";
  const prefix = words.slice(0, Math.min(8, words.length));
  const gptContinuation = ["and", "adapted", "to", "new", "prompts"];
  const bertCandidates = buildCandidates(originalMaskWord);

  const bertLane = el("section", "lane");
  bertLane.append(
    laneHeader("BERT-style masked prediction", "Bidirectional context around a missing slot"),
    chipRow(maskedWords, "generation", "generation-chip")
  );
  const candidateRow = el("div", "candidate-row");
  bertCandidates.forEach((candidate) => {
    const chip = el("span", "candidate-chip dim", `${candidate.token} · ${candidate.score}`);
    candidateRow.appendChild(chip);
  });
  bertLane.appendChild(candidateRow);

  const gptLane = el("section", "lane");
  gptLane.append(
    laneHeader("GPT-style next token rollout", "Left-to-right continuation from a prefix"),
    chipRow(prefix, "generation", "generation-chip"),
    chipRow(gptContinuation, "generation", "generation-chip")
  );

  root.append(bertLane, gptLane);

  const steps = [
    {
      title: "Mask one interior token",
      note: "BERT conditions on both the left and right context around a gap.",
      badge: "Masked context",
      run() {
        const bertTokens = [...bertLane.querySelectorAll(".generation-chip")];
        bertTokens.forEach((chip, index) => {
          const active = index === maskIndex;
          chip.classList.toggle("active", active);
          chip.classList.toggle("dim", !active);
        });
      }
    },
    {
      title: "Rank BERT candidates",
      note: "The masked-token head scores replacements for the missing position.",
      badge: "BERT scores",
      run() {
        [...candidateRow.children].forEach((chip, index) => {
          chip.classList.toggle("active", index === 0);
          chip.classList.toggle("dim", index !== 0);
        });
      }
    },
    {
      title: "Shift to a GPT prefix",
      note: "GPT only sees the prefix and predicts the next token step by step.",
      badge: "GPT prefix",
      run() {
        const prefixChips = [...gptLane.querySelectorAll(".generation-row")[0].children];
        prefixChips.forEach((chip) => {
          chip.classList.add("active");
          chip.classList.remove("dim");
        });
      }
    },
    {
      title: "Roll out continuation tokens",
      note: "Each predicted token becomes part of the next input state.",
      badge: "Autoregressive",
      run() {
        const continuationRow = gptLane.querySelectorAll(".generation-row")[1];
        [...continuationRow.children].forEach((chip, index) => {
          chip.classList.toggle("active", true);
          chip.classList.toggle("dim", false);
          chip.style.transitionDelay = `${index * 120}ms`;
        });
      }
    }
  ];

  return {
    steps,
    inspector: [
      { label: "Masked token", value: originalMaskWord },
      { label: "Top BERT guess", value: bertCandidates[0].token },
      { label: "Teaching point", value: "BERT fills an interior gap; GPT extends the visible prefix." }
    ]
  };
}

export function buildScene(sceneKey, text, root) {
  switch (sceneKey) {
    case "encoding":
      return buildEncodingScene(text, root);
    case "compare":
      return buildCompareScene(text, root);
    case "tokenization":
    default:
      return buildTokenizationScene(text, root);
  }
}

