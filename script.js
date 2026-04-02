/*
README: App structure
- `presets` and `storageKey` keep the shared text persistent across pages.
- `body[data-page]` decides whether this is the landing page or one focused phase page.
- Phase pages use one shared animation controller and one renderer at a time.
- `buildTokenizationFrames`, `buildTrainingFrames`, and `buildGenerationFrames`
  produce the state-machine frames for the active page.
- Everything is plain HTML, CSS, and JavaScript and is safe for static hosting.
*/

(function initApp() {
  const presets = {
    story:
      "The small robot learns from patterns in text and predicts what word might come next.",
    science:
      "Plants use sunlight to make energy, and a model can learn repeated patterns from many examples.",
    chat:
      "When you type a message, a generative system guesses the next token one step at a time.",
    poetry:
      "Morning light touches quiet windows while the city slowly wakes and listens.",
    code:
      "A beginner writes simple code, reads the output, notices the error, and improves the next attempt."
  };

  const storageKey = "simple-ai-demo-text";
  const pageType = document.body.dataset.page;
  const phaseName = document.body.dataset.phase || "";

  const speedMap = {
    slow: 1400,
    normal: 850,
    fast: 420
  };

  const phaseMeta = {
    tokenization: {
      title: "Tokenization",
      visualTitle: "Breaking text into token blocks",
      explanation:
        "This page shows only the tokenization idea. The text is split into smaller pieces, then each piece gets a simple numeric ID.",
      meaning:
        "Before a model can learn from text, it usually needs the text broken into smaller units."
    },
    training: {
      title: "Simplified training",
      visualTitle: "Prediction, error, and update",
      explanation:
        "This page shows only the training idea. A token becomes a few toy numbers, flows through a tiny network, makes a guess, and then gets corrected by error.",
      meaning:
        "Training is repeated practice: predict, compare, measure error, update."
    },
    generation: {
      title: "Generation",
      visualTitle: "Choosing the next token",
      explanation:
        "This page shows only the generation idea. The current context is used to score possible next tokens, choose one, and extend the output.",
      meaning:
        "Generated text appears one token at a time, not all at once."
    }
  };

  function $(id) {
    return document.getElementById(id);
  }

  function makeElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function round(value, digits = 2) {
    return Number(value.toFixed(digits));
  }

  function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  function seededRandom(seed) {
    const raw = Math.sin(seed * 999.91) * 10000;
    return raw - Math.floor(raw);
  }

  function tokenizeText(text) {
    return (text.match(/[A-Za-z0-9']+|[.,!?;:()-]/g) || []).filter(Boolean);
  }

  function buildVocabulary(tokens) {
    const seen = new Map();
    tokens.forEach((token) => {
      const key = token.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, 100 + seen.size);
      }
    });
    return [...seen.entries()].map(([token, id]) => ({ token, id }));
  }

  function tokenIdFor(token, vocabularyMap) {
    return vocabularyMap.get(token.toLowerCase()) || 0;
  }

  function softParts(text) {
    return text.match(/\S+|\s+/g) || [];
  }

  function getSavedText() {
    return window.localStorage.getItem(storageKey) || presets.story;
  }

  function saveText(text) {
    window.localStorage.setItem(storageKey, text);
  }

  function fillPresetSelect(select) {
    if (!select) {
      return;
    }
    select.innerHTML = "";
    Object.entries({
      story: "Story sentence",
      science: "Science sentence",
      chat: "Chat example",
      poetry: "Poetry line",
      code: "Code description"
    }).forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    });
  }

  function setupSharedTextControls() {
    const input = $("inputText");
    const preset = $("presetSelect");
    const saveButton = $("saveTextButton");
    const resetButton = $("resetTextButton");
    const saveStatus = $("saveStatus");

    if (!input) {
      return;
    }

    fillPresetSelect(preset);
    input.value = getSavedText();

    if (preset) {
      preset.value = "story";
      preset.addEventListener("change", () => {
        input.value = presets[preset.value];
      });
    }

    if (saveButton) {
      saveButton.addEventListener("click", () => {
        const text = input.value.trim() || presets.story;
        input.value = text;
        saveText(text);
        if (saveStatus) {
          saveStatus.textContent = "Saved. Open or refresh any phase page to use this text.";
        }
      });
    }

    if (resetButton) {
      resetButton.addEventListener("click", () => {
        input.value = presets.story;
        saveText(presets.story);
        if (saveStatus) {
          saveStatus.textContent = "Reset to the default example.";
        }
      });
    }
  }

  function buildPhaseState() {
    const text = $("inputText").value.trim() || getSavedText();
    saveText(text);

    const tokens = tokenizeText(text);
    const vocabulary = buildVocabulary(tokens);
    const vocabularyMap = new Map(vocabulary.map((item) => [item.token, item.id]));
    const tokenIds = tokens.map((token) => tokenIdFor(token, vocabularyMap));
    const prompt = tokens.slice(0, Math.min(3, tokens.length)).filter((token) => /[A-Za-z0-9']/.test(token));

    return {
      text,
      tokens,
      vocabulary,
      tokenIds,
      generationPrompt: prompt.length ? prompt : ["Start"],
      generationLength: Number($("lengthSlider") ? $("lengthSlider").value : 6),
      temperature: Number($("temperatureSlider") ? $("temperatureSlider").value : 0.6),
      randomSampling: $("randomToggle") ? $("randomToggle").checked : false,
      speed: "normal",
      animation: {
        playing: false,
        timerId: null,
        frameIndex: -1,
        frames: []
      }
    };
  }

  function buildTrainingSnapshots(state) {
    const pairs = [];
    const vocabularyMap = new Map(state.vocabulary.map((item) => [item.token, item.id]));
    const usable = state.tokens.slice(0, Math.min(state.tokens.length - 1, 5));

    usable.forEach((token, index) => {
      const nextToken = state.tokens[index + 1];
      if (!nextToken) {
        return;
      }
      pairs.push({
        step: index + 1,
        token,
        nextToken,
        inputVector: [
          round((tokenIdFor(token, vocabularyMap) % 10) / 10, 2),
          round((token.length % 7) / 7, 2),
          round(((index + 1) % 5) / 5, 2)
        ]
      });
    });

    let weightsIH = [
      [0.42, -0.26, 0.31],
      [0.17, 0.36, -0.24],
      [-0.18, 0.28, 0.41]
    ];
    let weightsHO = [
      [0.33, -0.21, 0.18],
      [0.12, 0.27, -0.14],
      [-0.11, 0.19, 0.29]
    ];
    const outputLabels = state.vocabulary.slice(0, 3).map((item) => item.token);
    while (outputLabels.length < 3) {
      outputLabels.push(`token-${outputLabels.length + 1}`);
    }

    return pairs.map((pair, stepIndex) => {
      const hidden = weightsIH.map((row) =>
        round(sigmoid(row.reduce((sum, weight, index) => sum + weight * pair.inputVector[index], 0)))
      );
      const output = weightsHO.map((row) =>
        round(sigmoid(row.reduce((sum, weight, index) => sum + weight * hidden[index], 0)))
      );
      const expectedIndex =
        outputLabels.indexOf(pair.nextToken.toLowerCase()) >= 0
          ? outputLabels.indexOf(pair.nextToken.toLowerCase())
          : stepIndex % outputLabels.length;
      const predictedIndex = output.indexOf(Math.max(...output));
      const loss = round(Math.abs(output[predictedIndex] - (predictedIndex === expectedIndex ? 1 : 0)) + 0.18);
      const errorSignal = round((expectedIndex === predictedIndex ? -0.08 : 0.12) + stepIndex * 0.01);

      weightsHO = weightsHO.map((row, rowIndex) =>
        row.map((weight, colIndex) => round(weight + (rowIndex === expectedIndex ? 0.03 : -0.02) * hidden[colIndex], 2))
      );
      weightsIH = weightsIH.map((row, rowIndex) =>
        row.map((weight, colIndex) => round(weight + pair.inputVector[colIndex] * (rowIndex === expectedIndex ? 0.02 : -0.01), 2))
      );

      return {
        pair,
        outputLabels,
        hidden,
        output,
        expectedIndex,
        predictedIndex,
        loss,
        errorSignal,
        weightsIH: weightsIH.map((row) => [...row]),
        weightsHO: weightsHO.map((row) => [...row])
      };
    });
  }

  function scoreCandidates(state, context, stepNumber) {
    const basePool = [...new Set([...state.tokens.map((token) => token.toLowerCase()), "the", "model", "learns", "patterns", "next", "token", "context"])]
      .filter((token) => /[a-z0-9']/.test(token))
      .slice(0, 8);
    const last = context[context.length - 1]?.toLowerCase() || "";
    const secondLast = context[context.length - 2]?.toLowerCase() || "";

    const scored = basePool.map((token, index) => {
      let score = 0.18;
      if (token === last) {
        score -= 0.08;
      }
      if (token === secondLast) {
        score += 0.04;
      }
      if (token.length > 4) {
        score += 0.05;
      }
      if (token.includes("learn") || token.includes("pattern")) {
        score += 0.08;
      }
      score += seededRandom(stepNumber * 19 + index + state.text.length) * 0.18;
      score += clamp(state.temperature, 0, 1) * 0.06;
      return { token, score };
    });

    const total = scored.reduce((sum, item) => sum + item.score, 0) || 1;
    return scored
      .map((item) => ({ token: item.token, probability: round(item.score / total, 2) }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 4);
  }

  function chooseCandidate(state, candidates, stepNumber) {
    if (!state.randomSampling) {
      return candidates[0];
    }
    const temperatureFactor = 0.6 + state.temperature;
    const weighted = candidates.map((item) => ({
      ...item,
      adjusted: Math.pow(item.probability, 1 / temperatureFactor)
    }));
    const total = weighted.reduce((sum, item) => sum + item.adjusted, 0) || 1;
    let marker = seededRandom(state.text.length + stepNumber * 31) * total;
    for (const item of weighted) {
      marker -= item.adjusted;
      if (marker <= 0) {
        return item;
      }
    }
    return weighted[weighted.length - 1];
  }

  function buildTokenizationFrames(state) {
    return state.tokens.map((token, index) => ({
      tokenIndex: index,
      explanation: `"${token}" is separated out as one token and assigned a simple demo ID.`,
      meaning: "Tokenization converts text into smaller units that a model can work with."
    }));
  }

  function buildTrainingFrames(state) {
    const frames = [];
    const snapshots = buildTrainingSnapshots(state);
    state.trainingSnapshots = snapshots;

    snapshots.forEach((snapshot, index) => {
      ["inputs", "hidden", "outputs", "backprop"].forEach((stage) => {
        frames.push({ stage, trainingIndex: index });
      });
    });
    return frames;
  }

  function buildGenerationFrames(state) {
    const frames = [];
    const history = [];
    const output = [];
    for (let step = 0; step < state.generationLength; step += 1) {
      const candidates = scoreCandidates(state, [...state.generationPrompt, ...output], step + 1);
      const chosen = chooseCandidate(state, candidates, step + 1);
      output.push(chosen.token);
      history.push({
        step: step + 1,
        candidates,
        chosen: chosen.token,
        output: [...output]
      });
      frames.push({ generationIndex: step });
    }
    state.generationHistory = history;
    return frames;
  }

  function clearTimer(state) {
    if (state.animation.timerId) {
      window.clearTimeout(state.animation.timerId);
      state.animation.timerId = null;
    }
  }

  function renderMetricGrid(items) {
    const grid = makeElement("div", "metric-grid");
    items.forEach((item) => {
      const card = makeElement("div", "metric");
      card.append(makeElement("span", "label", item.label), makeElement("span", "value", item.value));
      grid.appendChild(card);
    });
    return grid;
  }

  function renderTokenizationCanvas(state) {
    const canvas = $("phaseCanvas");
    const frame = state.animation.frames[state.animation.frameIndex] || null;
    const activeIndex = frame ? frame.tokenIndex : -1;
    const stack = makeElement("div", "canvas-stack");

    stack.appendChild(
      renderMetricGrid([
        { label: "Characters", value: String(state.text.length) },
        { label: "Tokens", value: String(state.tokens.length) },
        { label: "Vocabulary", value: String(state.vocabulary.length) }
      ])
    );

    const original = makeElement("section", "visual-card");
    const originalHead = makeElement("div", "card-head");
    originalHead.append(makeElement("h3", "", "Original text"), makeElement("span", "", frame ? `Step ${activeIndex + 1}` : "Ready"));
    original.appendChild(originalHead);
    const textBox = makeElement("div", "original-text");
    softParts(state.text).forEach((part) => {
      const span = makeElement("span", "source-part", part);
      if (activeIndex >= 0 && state.tokens[activeIndex] === part.trim()) {
        span.classList.add("active");
      }
      textBox.appendChild(span);
    });
    original.appendChild(textBox);
    stack.appendChild(original);

    const tokensCard = makeElement("section", "visual-card");
    const tokenHead = makeElement("div", "card-head");
    tokenHead.append(makeElement("h3", "", "Token blocks"), makeElement("span", "", "Word and punctuation split"));
    tokensCard.appendChild(tokenHead);
    const grid = makeElement("div", "token-grid");
    state.tokens.forEach((token, index) => {
      const card = makeElement("div", "token-card");
      if (index === activeIndex) {
        card.classList.add("active");
      }
      card.innerHTML = `<strong>${token}</strong><div>ID ${state.tokenIds[index]}</div>`;
      grid.appendChild(card);
    });
    tokensCard.appendChild(grid);
    stack.appendChild(tokensCard);

    const vocab = makeElement("section", "visual-card");
    const vocabHead = makeElement("div", "card-head");
    vocabHead.append(makeElement("h3", "", "Vocabulary table"), makeElement("span", "", "Deterministic demo mapping"));
    vocab.appendChild(vocabHead);
    const table = makeElement("table", "vocab-table");
    const head = document.createElement("thead");
    const body = document.createElement("tbody");
    head.innerHTML = "<tr><th>Token</th><th>ID</th></tr>";
    state.vocabulary.slice(0, 8).forEach((item) => {
      const row = document.createElement("tr");
      row.innerHTML = `<td>${item.token}</td><td>${item.id}</td>`;
      body.appendChild(row);
    });
    table.append(head, body);
    vocab.appendChild(table);
    stack.appendChild(vocab);

    canvas.innerHTML = "";
    canvas.appendChild(stack);
  }

  function buildNetworkSvg(snapshot, stage) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "network-svg");
    svg.setAttribute("viewBox", "0 0 900 340");
    svg.setAttribute("preserveAspectRatio", "none");
    const positions = { input: [72, 170, 268], hidden: [72, 170, 268], output: [72, 170, 268] };

    function addLine(x1, y1, x2, y2, className) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("class", className);
      svg.appendChild(line);
    }

    snapshot.weightsIH.forEach((row, rowIndex) => {
      row.forEach((_, colIndex) => {
        addLine(128, positions.input[colIndex], 410, positions.hidden[rowIndex], `connection ${stage === "inputs" || stage === "hidden" ? "forward" : stage === "backprop" ? "backward" : ""}`.trim());
      });
    });
    snapshot.weightsHO.forEach((row, rowIndex) => {
      row.forEach((_, colIndex) => {
        addLine(490, positions.hidden[colIndex], 772, positions.output[rowIndex], `connection ${stage === "outputs" ? "forward" : stage === "backprop" ? "backward" : ""}`.trim());
      });
    });

    return svg;
  }

  function makeNode(label, value, extraClass) {
    const node = makeElement("div", `node${extraClass ? ` ${extraClass}` : ""}`);
    node.innerHTML = `<span class="node-label">${label}</span><span class="node-value">${value}</span>`;
    return node;
  }

  function renderTrainingCanvas(state) {
    const canvas = $("phaseCanvas");
    const frame = state.animation.frames[state.animation.frameIndex] || null;
    const trainingIndex = frame ? frame.trainingIndex : 0;
    const stage = frame ? frame.stage : "inputs";
    const snapshot = state.trainingSnapshots[trainingIndex];
    const stack = makeElement("div", "canvas-stack");

    stack.appendChild(
      renderMetricGrid([
        { label: "Epoch", value: "1" },
        { label: "Step", value: `${snapshot.pair.step}` },
        { label: "Expected token", value: snapshot.pair.nextToken }
      ])
    );

    const networkCard = makeElement("section", "visual-card");
    const head = makeElement("div", "card-head");
    head.append(makeElement("h3", "", "Tiny network"), makeElement("span", "", `${snapshot.pair.token} -> ${snapshot.pair.nextToken}`));
    networkCard.appendChild(head);

    const board = makeElement("div", "network-board");
    board.appendChild(buildNetworkSvg(snapshot, stage));

    const inputLayer = makeElement("div", "node-layer input");
    snapshot.pair.inputVector.forEach((value, index) => {
      inputLayer.appendChild(makeNode(`input ${index + 1}`, value, stage === "inputs" ? "active" : ""));
    });

    const hiddenLayer = makeElement("div", "node-layer hidden");
    snapshot.hidden.forEach((value, index) => {
      hiddenLayer.appendChild(makeNode(`hidden ${index + 1}`, value, stage === "hidden" ? "active" : ""));
    });

    const outputLayer = makeElement("div", "node-layer output");
    snapshot.output.forEach((value, index) => {
      const classes = [
        stage === "outputs" ? "active" : "",
        index === snapshot.expectedIndex ? "expected" : "",
        index === snapshot.predictedIndex ? "predicted" : ""
      ]
        .filter(Boolean)
        .join(" ");
      outputLayer.appendChild(makeNode(snapshot.outputLabels[index], value, classes));
    });

    board.append(inputLayer, hiddenLayer, outputLayer);
    networkCard.appendChild(board);

    const stats = makeElement("div", "stats-grid");
    [
      { label: "Predicted", value: snapshot.outputLabels[snapshot.predictedIndex] },
      { label: "Expected", value: snapshot.outputLabels[snapshot.expectedIndex] },
      { label: "Loss", value: String(snapshot.loss) },
      { label: "Backprop signal", value: String(snapshot.errorSignal) }
    ].forEach((item) => {
      const stat = makeElement("div", "stat");
      stat.append(makeElement("span", "label", item.label), makeElement("span", "value", item.value));
      stats.appendChild(stat);
    });
    networkCard.appendChild(stats);

    const weights = makeElement("div", "weight-grid");
    [
      `w(in1->h1): ${snapshot.weightsIH[0][0]}`,
      `w(in2->h2): ${snapshot.weightsIH[1][1]}`,
      `w(in3->h3): ${snapshot.weightsIH[2][2]}`,
      `w(h1->out1): ${snapshot.weightsHO[0][0]}`,
      `w(h2->out2): ${snapshot.weightsHO[1][1]}`,
      `w(h3->out3): ${snapshot.weightsHO[2][2]}`
    ].forEach((text) => {
      weights.appendChild(makeElement("div", "weight-item", text));
    });
    networkCard.appendChild(weights);
    stack.appendChild(networkCard);

    const legend = makeElement("section", "visual-card");
    const legendHead = makeElement("div", "card-head");
    legendHead.append(makeElement("h3", "", "Legend"), makeElement("span", "", "Highlight meaning"));
    legend.appendChild(legendHead);
    const legendRow = makeElement("div", "legend-row");
    [
      ["Forward activation", "var(--accent)"],
      ["Predicted output", "var(--sky)"],
      ["Expected output", "var(--gold)"],
      ["Backprop update", "var(--rose)"]
    ].forEach(([label, color]) => {
      const chip = makeElement("div", "legend-chip");
      const dot = makeElement("span", "legend-dot");
      dot.style.background = color;
      chip.append(dot, document.createTextNode(label));
      legendRow.appendChild(chip);
    });
    legend.appendChild(legendRow);
    stack.appendChild(legend);

    canvas.innerHTML = "";
    canvas.appendChild(stack);
  }

  function renderGenerationCanvas(state) {
    const canvas = $("phaseCanvas");
    const frame = state.animation.frames[state.animation.frameIndex] || null;
    const history = frame ? state.generationHistory[frame.generationIndex] : null;
    const stack = makeElement("div", "canvas-stack");

    stack.appendChild(
      renderMetricGrid([
        { label: "Prompt tokens", value: String(state.generationPrompt.length) },
        { label: "Target steps", value: String(state.generationLength) },
        { label: "Mode", value: state.randomSampling ? "Random" : "Deterministic" }
      ])
    );

    const outputCard = makeElement("section", "visual-card");
    const outputHead = makeElement("div", "card-head");
    outputHead.append(makeElement("h3", "", "Current context"), makeElement("span", "", history ? `Step ${history.step}` : "Ready"));
    outputCard.appendChild(outputHead);
    const row = makeElement("div", "generation-row");
    state.generationPrompt.forEach((token) => {
      const card = makeElement("div", "token-card context");
      card.innerHTML = `<strong>${token}</strong><div>Prompt</div>`;
      row.appendChild(card);
    });
    if (history) {
      history.output.forEach((token, index) => {
        const card = makeElement("div", "token-card generated");
        if (index === history.output.length - 1) {
          card.classList.add("active");
        }
        card.innerHTML = `<strong>${token}</strong><div>Generated ${index + 1}</div>`;
        row.appendChild(card);
      });
    }
    outputCard.appendChild(row);
    stack.appendChild(outputCard);

    const candidates = makeElement("section", "visual-card");
    const candidateHead = makeElement("div", "card-head");
    candidateHead.append(makeElement("h3", "", "Candidate next tokens"), makeElement("span", "", "Scored choices"));
    candidates.appendChild(candidateHead);
    const list = makeElement("div", "candidate-list");
    const visibleCandidates = history ? history.candidates : scoreCandidates(state, state.generationPrompt, 1);
    visibleCandidates.forEach((item) => {
      const card = makeElement("div", "candidate-item");
      if (history && item.token === history.chosen) {
        card.classList.add("active");
      }
      const top = makeElement("div", "candidate-top");
      top.append(makeElement("strong", "", item.token), makeElement("span", "", `${Math.round(item.probability * 100)}%`));
      const bar = makeElement("div", "candidate-bar");
      const fill = makeElement("span", "");
      fill.style.width = `${Math.round(item.probability * 100)}%`;
      bar.appendChild(fill);
      card.append(top, bar);
      list.appendChild(card);
    });
    candidates.appendChild(list);
    stack.appendChild(candidates);

    canvas.innerHTML = "";
    canvas.appendChild(stack);
  }

  function createEmptyState(message) {
    const box = makeElement("div", "empty-state");
    box.textContent = message;
    return box;
  }

  function renderPhasePage(state) {
    const meta = phaseMeta[phaseName];
    $("phaseTitle").textContent = meta.title;
    $("visualTitle").textContent = meta.visualTitle;

    const frame = state.animation.frames[state.animation.frameIndex] || null;
    let explanation = meta.explanation;
    let meaning = meta.meaning;

    if (phaseName === "tokenization" && frame) {
      explanation = frame.explanation;
      meaning = frame.meaning;
    }

    if (phaseName === "training" && frame && state.trainingSnapshots.length) {
      const snapshot = state.trainingSnapshots[frame.trainingIndex];
      if (frame.stage === "inputs") {
        explanation = `The token "${snapshot.pair.token}" becomes a few toy numeric features.`;
      } else if (frame.stage === "hidden") {
        explanation = "The hidden layer combines those inputs into intermediate activations.";
      } else if (frame.stage === "outputs") {
        explanation = `The network predicts a next token and compares it with "${snapshot.pair.nextToken}".`;
      } else {
        explanation = "The error signal travels backward and nudges the weights.";
      }
      meaning = meta.meaning;
    }

    if (phaseName === "generation" && frame && state.generationHistory.length) {
      const step = state.generationHistory[frame.generationIndex];
      explanation = `The model scores a few next-token options and chooses "${step.chosen}".`;
      meaning = meta.meaning;
    }

    $("phaseExplanation").textContent = explanation;
    $("meaningBox").innerHTML = `<strong>What this means</strong><p>${meaning}</p>`;

    const visibleStep = state.animation.frames.length ? Math.max(0, state.animation.frameIndex + 1) : 0;
    $("phaseCounter").textContent = `${visibleStep} / ${state.animation.frames.length}`;
    $("phaseProgressBar").style.width = `${state.animation.frames.length ? (visibleStep / state.animation.frames.length) * 100 : 0}%`;

    if (!state.tokens.length) {
      $("phaseCanvas").innerHTML = "";
      $("phaseCanvas").appendChild(createEmptyState("Add text and save it to see this page."));
      return;
    }

    if (phaseName === "tokenization") {
      renderTokenizationCanvas(state);
    } else if (phaseName === "training") {
      renderTrainingCanvas(state);
    } else {
      renderGenerationCanvas(state);
    }
  }

  function setupPhasePage() {
    fillPresetSelect($("presetSelect"));
    setupSharedTextControls();

    const state = buildPhaseState();
    const speedButtons = $("speedButtons");
    const playButton = $("playButton");
    const pauseButton = $("pauseButton");
    const replayButton = $("replayButton");
    const stepButton = $("stepButton");

    function buildFrames() {
      state.text = $("inputText").value.trim() || getSavedText();
      saveText(state.text);
      const fresh = buildPhaseState();
      Object.assign(state, fresh);
      if (phaseName === "tokenization") {
        state.animation.frames = buildTokenizationFrames(state);
      } else if (phaseName === "training") {
        state.animation.frames = buildTrainingFrames(state);
      } else {
        state.animation.frames = buildGenerationFrames(state);
      }
      state.animation.frameIndex = -1;
      $("phaseStatus").textContent = "Ready";
    }

    function renderSpeedButtons() {
      speedButtons.innerHTML = "";
      Object.keys(speedMap).forEach((speed) => {
        const button = makeElement("button", `speed-button${state.speed === speed ? " active" : ""}`, speed[0].toUpperCase() + speed.slice(1));
        button.type = "button";
        button.addEventListener("click", () => {
          state.speed = speed;
          renderSpeedButtons();
        });
        speedButtons.appendChild(button);
      });
    }

    function stop(status) {
      clearTimer(state);
      state.animation.playing = false;
      $("phaseStatus").textContent = status;
    }

    function advanceFrame() {
      if (state.animation.frameIndex >= state.animation.frames.length - 1) {
        stop("Complete");
        renderPhasePage(state);
        return;
      }
      state.animation.frameIndex += 1;
      $("phaseStatus").textContent = state.animation.playing ? "Playing" : "Stepped";
      renderPhasePage(state);
      if (state.animation.playing) {
        state.animation.timerId = window.setTimeout(advanceFrame, speedMap[state.speed]);
      }
    }

    function replay() {
      stop("Replayed");
      buildFrames();
      renderPhasePage(state);
    }

    $("inputText").addEventListener("input", () => {
      $("saveStatus").textContent = "Unsaved changes.";
    });

    $("saveTextButton").addEventListener("click", () => {
      buildFrames();
      renderPhasePage(state);
    });

    $("resetTextButton").addEventListener("click", () => {
      buildFrames();
      renderPhasePage(state);
    });

    if ($("lengthSlider")) {
      $("lengthValue").textContent = $("lengthSlider").value;
      $("lengthSlider").addEventListener("input", () => {
        $("lengthValue").textContent = $("lengthSlider").value;
        buildFrames();
        renderPhasePage(state);
      });
    }

    if ($("temperatureSlider")) {
      $("temperatureValue").textContent = $("temperatureSlider").value;
      $("temperatureSlider").addEventListener("input", () => {
        $("temperatureValue").textContent = $("temperatureSlider").value;
        buildFrames();
        renderPhasePage(state);
      });
    }

    if ($("randomToggle")) {
      $("randomToggle").addEventListener("change", () => {
        buildFrames();
        renderPhasePage(state);
      });
    }

    playButton.addEventListener("click", () => {
      if (!state.animation.frames.length) {
        buildFrames();
      }
      if (state.animation.frameIndex >= state.animation.frames.length - 1) {
        state.animation.frameIndex = -1;
      }
      state.animation.playing = true;
      $("phaseStatus").textContent = "Playing";
      advanceFrame();
    });

    pauseButton.addEventListener("click", () => {
      stop("Paused");
    });

    replayButton.addEventListener("click", replay);

    stepButton.addEventListener("click", () => {
      if (state.animation.playing) {
        return;
      }
      if (!state.animation.frames.length) {
        buildFrames();
      }
      advanceFrame();
    });

    buildFrames();
    renderSpeedButtons();
    renderPhasePage(state);
  }

  if (pageType === "home") {
    setupSharedTextControls();
  } else if (pageType === "phase") {
    setupPhasePage();
  }
})();
