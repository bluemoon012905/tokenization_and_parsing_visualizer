import { SCENES, buildScene } from "./visualizer.js";

const elements = {
  sourceText: document.getElementById("sourceText"),
  sceneTabs: document.getElementById("sceneTabs"),
  renderButton: document.getElementById("renderButton"),
  resetButton: document.getElementById("resetButton"),
  prevFrameButton: document.getElementById("prevFrameButton"),
  nextFrameButton: document.getElementById("nextFrameButton"),
  assumptionList: document.getElementById("assumptionList"),
  sceneTitle: document.getElementById("sceneTitle"),
  sceneSubtitle: document.getElementById("sceneSubtitle"),
  visualizationStage: document.getElementById("visualizationStage"),
  visualizationLink: document.getElementById("visualizationLink"),
  timelineList: document.getElementById("timelineList"),
  stepBadge: document.getElementById("stepBadge")
};

let activeScene = "tokenization";
let activeFrameIndex = -1;
let activeSteps = [];

function getCurrentText() {
  return elements.sourceText.value.trim() || "Language models turn text into structured signals.";
}

function renderSceneTabs() {
  elements.sceneTabs.innerHTML = "";
  Object.entries(SCENES).forEach(([key, scene]) => {
    const button = document.createElement("button");
    button.className = `scene-tab${key === activeScene ? " active" : ""}`;
    button.type = "button";
    button.textContent = scene.label;
    button.addEventListener("click", () => {
      activeScene = key;
      activeFrameIndex = -1;
      renderSceneTabs();
      renderCurrentScene();
    });
    elements.sceneTabs.appendChild(button);
  });
}

function renderAssumptions(scene) {
  elements.assumptionList.innerHTML = "";
  scene.assumptions.forEach((assumption) => {
    const item = document.createElement("li");
    item.textContent = assumption;
    elements.assumptionList.appendChild(item);
  });
}

function renderTimelineList(steps) {
  elements.timelineList.innerHTML = "";
  steps.forEach((step, index) => {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    const note = document.createElement("span");
    item.dataset.index = String(index);
    title.textContent = step.title;
    note.textContent = step.note;
    item.append(title, note);
    item.addEventListener("click", () => {
      activeFrameIndex = index;
      renderCurrentScene();
    });
    elements.timelineList.appendChild(item);
  });
}

function activateTimelineStep(index, badgeText) {
  [...elements.timelineList.children].forEach((item) => {
    item.classList.toggle("active", Number(item.dataset.index) === index);
  });
  elements.stepBadge.textContent = badgeText;
}

function syncFrameControls() {
  const hasFrames = activeSteps.length > 0;
  elements.resetButton.disabled = !hasFrames || activeFrameIndex < 0;
  elements.prevFrameButton.disabled = !hasFrames || activeFrameIndex <= -1;
  elements.nextFrameButton.disabled = !hasFrames || activeFrameIndex >= activeSteps.length - 1;
}

function updateVisualizationLink() {
  const params = new URLSearchParams({
    scene: activeScene,
    text: getCurrentText(),
    frame: String(Math.max(activeFrameIndex, 0))
  });
  elements.visualizationLink.dataset.href = `./rendered.html?${params.toString()}`;
}

function renderCurrentScene() {
  const scene = SCENES[activeScene];
  const text = getCurrentText();

  elements.sceneTitle.textContent = scene.title;
  elements.sceneSubtitle.textContent = scene.subtitle;
  renderAssumptions(scene);

  elements.visualizationStage.innerHTML = "";
  const built = buildScene(activeScene, text, elements.visualizationStage);
  activeSteps = built.steps;
  renderTimelineList(activeSteps);

  if (activeFrameIndex >= activeSteps.length) {
    activeFrameIndex = activeSteps.length - 1;
  }

  for (let index = 0; index <= activeFrameIndex; index += 1) {
    activeSteps[index].run();
  }

  if (activeFrameIndex >= 0) {
    activateTimelineStep(activeFrameIndex, activeSteps[activeFrameIndex].badge);
  } else {
    activateTimelineStep(-1, "Ready");
  }

  syncFrameControls();
  updateVisualizationLink();
}

elements.renderButton.addEventListener("click", () => {
  activeFrameIndex = -1;
  renderCurrentScene();
});

elements.resetButton.addEventListener("click", () => {
  activeFrameIndex = -1;
  renderCurrentScene();
});

elements.prevFrameButton.addEventListener("click", () => {
  activeFrameIndex = Math.max(-1, activeFrameIndex - 1);
  renderCurrentScene();
});

elements.nextFrameButton.addEventListener("click", () => {
  activeFrameIndex = Math.min(activeSteps.length - 1, activeFrameIndex + 1);
  renderCurrentScene();
});

elements.visualizationLink.addEventListener("click", () => {
  const href = elements.visualizationLink.dataset.href;
  if (href) {
    window.location.href = href;
  }
});

renderSceneTabs();
renderCurrentScene();
