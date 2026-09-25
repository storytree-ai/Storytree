/**
 * The page's glue: it asks the main process (through the preload's two functions) for the
 * projects and a project's tree, and puts view.ts's HTML into the document. `data-state` on the
 * body says where it got to (loading, ready, empty, missing, error), which the smoke check reads.
 */
import type { StorytreeBridge } from "../bridge.js";
import { renderNoProjects, renderProject, renderSwitcher } from "../view/view.js";

declare global {
  interface Window {
    readonly storytree: StorytreeBridge;
  }
}

const content = element("content");
const switcher = element("switcher");
const params = new URLSearchParams(location.search);

void open().catch((error: unknown) => showMessage("error", "Something went wrong", messageOf(error)));

async function open(): Promise<void> {
  const problem = params.get("problem");
  if (problem !== null) return showMessage("error", "The library could not be opened", problem);
  const projects = await window.storytree.listProjects();
  if (projects.length === 0) {
    content.innerHTML = renderNoProjects();
    return setState("empty");
  }
  await show(params.get("project") ?? projects[0] ?? "", projects);
}

/** Show project `name`, with the switcher listing `projects`. */
async function show(name: string, projects: readonly string[]): Promise<void> {
  setState("loading");
  switcher.innerHTML = renderSwitcher(projects, projects.includes(name) ? name : undefined);
  const select = switcher.querySelector("select");
  if (select !== null) {
    if (!projects.includes(name)) select.selectedIndex = -1;
    select.addEventListener("change", () => void show(select.value, projects).catch((error: unknown) => showMessage("error", "Something went wrong", messageOf(error))));
  }
  if (!projects.includes(name)) {
    return showMessage("missing", `There is no project called “${name}”`, "Pick one of the projects in the switcher above.");
  }
  const tree = await window.storytree.projectTree(name);
  content.innerHTML = renderProject(name, tree);
  document.title = `${name} · storytree 0.3`;
  setState("ready");
}

/** A heading and a line of text in place of the project, written as text (never as HTML). */
function showMessage(state: string, heading: string, text: string): void {
  const box = document.createElement("div");
  box.className = "empty";
  const title = document.createElement("h1");
  title.textContent = heading;
  const body = document.createElement("p");
  body.textContent = text;
  box.append(title, body);
  content.replaceChildren(box);
  setState(state);
}

function setState(state: string): void {
  document.body.dataset.state = state;
}

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`the page has no #${id}`);
  return found;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
