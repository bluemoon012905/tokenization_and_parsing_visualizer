import { SCENES, buildScene } from "./visualizer.js";

const params = new URLSearchParams(window.location.search);
const sceneKey = SCENES[params.get("scene")] ? params.get("scene") : "tokenization";
const text = params.get("text")?.trim() || "Language models turn text into structured signals.";
const requestedFrame = Number.parseInt(params.get("frame") || "0", 10);

const elements = {
  sceneTitle: document.getElementById("sceneTitle"),
  sceneSubtitle: document.getElementById("sceneSubtitle"),
  stepBadge: document.getElementById("stepBadge"),
  visualizationStage: document.getElementById("visualizationStage"),
  timelineList: document.getElementById("timelineList")
};

function activateTimelineStep(index, badgeText) {
  [...elements.timelineList.children].forEach((item) => {
    item.classList.toggle("active", Number(item.dataset.index) === index);
  });
  elements.stepBadge.textContent = badgeText;
}

function renderTimelineList(steps, activeIndex) {
  elements.timelineList.innerHTML = "";
  steps.forEach((step, index) => {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    const note = document.createElement("span");
    item.dataset.index = String(index);
    title.textContent = step.title;
    note.textContent = step.note;
    item.append(title, note);
    item.classList.toggle("active", index === activeIndex);
    elements.timelineList.appendChild(item);
  });
}

function renderStandalone() {
  const scene = SCENES[sceneKey];
  elements.sceneTitle.textContent = scene.title;
  elements.sceneSubtitle.textContent = scene.subtitle;
  elements.visualizationStage.innerHTML = "";

  const built = buildScene(sceneKey, text, elements.visualizationStage);
  const frameIndex = Math.max(-1, Math.min(requestedFrame, built.steps.length - 1));
  renderTimelineList(built.steps, frameIndex);

  for (let index = 0; index <= frameIndex; index += 1) {
    built.steps[index].run();
  }

  if (frameIndex >= 0) {
    activateTimelineStep(frameIndex, built.steps[frameIndex].badge);
  } else {
    activateTimelineStep(-1, "Ready");
  }
}

renderStandalone();
