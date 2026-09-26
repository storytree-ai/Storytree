/**
 * The storytree 0.3 desktop app's main process. It starts the app's own Postgres on its data
 * directory (~/.storytree/0.3/pgdata) through local-postgres, connects the library through its
 * public API, opens the project asked for (`--project <name>`, else `storytree` if there is one,
 * else the first), and shows it. It answers the page's two questions, listProjects() and
 * projectTree(name), and stops Postgres when the app quits.
 *
 * `--smoke` renders the project without showing a window, saves a screenshot to the file given
 * with `--screenshot <file>`, prints the page's text to stdout, and quits: exit 0 only if every
 * story of the project and every one of its capabilities rendered.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { app, BrowserWindow, ipcMain, nativeTheme } from "electron";

import { connect, type AnnotatedTree, type Library, type Storytree } from "@storytree/library";
import { DataDirInUseError, findBinaries, start, type LocalPostgres } from "@storytree/local-postgres";

import { CHANNELS } from "../bridge.js";
import { APP_OWNER, appHome } from "../home.js";
import { chooseProject, parseArgs } from "./args.js";

const args = parseArgs(process.argv);
const home = appHome();
/** How long the smoke check may take, start to finish, before it gives up. */
const SMOKE_TIMEOUT_MS = 180_000;

// Electron's own files (cache, local storage) live in the app's home too, apart from any other app.
app.setPath("userData", home.electron);

let postgres: LocalPostgres | undefined;
let storytree: Storytree | undefined;
const libraries = new Map<string, Promise<Library>>();
let shutDown: Promise<void> | undefined;

if (!args.smoke && !app.requestSingleInstanceLock()) {
  app.quit(); // the app is already open: that one is focused instead
} else {
  app.on("second-instance", () => {
    const [window] = BrowserWindow.getAllWindows();
    if (window?.isMinimized() === true) window.restore();
    window?.focus();
  });
  app.on("window-all-closed", () => app.quit());
  // Quitting waits for Postgres to stop; app.exit then ends the app without asking again.
  app.on("before-quit", (event) => {
    event.preventDefault();
    void shutdown().finally(() => app.exit(0));
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => app.quit());
  if (args.smoke) {
    setTimeout(() => {
      console.error(`smoke: gave up after ${SMOKE_TIMEOUT_MS / 1000} s`);
      void shutdown().finally(() => app.exit(1));
    }, SMOKE_TIMEOUT_MS).unref();
  }
  app.whenReady().then(run, (error: unknown) => fail(error));
}

async function run(): Promise<void> {
  ipcMain.handle(CHANNELS.listProjects, () => (storytree === undefined ? [] : storytree.listProjects()));
  ipcMain.handle(CHANNELS.projectTree, async (_event, name: unknown) => projectTree(name));

  let problem: string | undefined;
  try {
    postgres = await start({ dataDir: home.pgdata, owner: APP_OWNER, bin: postgresBinaries(), log: (message) => console.log(`Postgres: ${message}`) });
    storytree = await connect({ url: postgres.url });
    recordLaunch();
  } catch (error) {
    problem =
      error instanceof DataDirInUseError
        ? `The app's library (${error.dataDir}) is in use by ${error.owner ?? "another program"} (process ${error.pid}). ` +
          "Close that, then open the app again."
        : `The app's library could not be opened: ${messageOf(error)}`;
    console.error(problem);
  }
  const projects = storytree === undefined ? [] : await storytree.listProjects();
  const project = chooseProject(projects, args.project);
  const window = openWindow({ ...(project === undefined ? {} : { project }), ...(problem === undefined ? {} : { problem }) });
  if (args.smoke) await smoke(window, project);
}

/**
 * Record how this app was started, so that an agent's session start can open it again when it is
 * closed (the agent link's setup check). A packaged portable build runs from a temporary copy, so
 * the portable file itself is what is recorded; in development, Electron and the app's folder.
 */
function recordLaunch(): void {
  const command = app.isPackaged ? (process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath) : process.execPath;
  const args = app.isPackaged ? [] : [app.getAppPath()];
  try {
    writeFileSync(home.launchRecord, `${JSON.stringify({ command, args }, null, 2)}\n`);
  } catch (error) {
    console.error(`recording how to open the app: ${messageOf(error)}`);
  }
}

/** The Postgres binaries: shipped in the packaged app's resources, or from node_modules in development. */
function postgresBinaries(): string {
  return app.isPackaged
    ? findBinaries({ dir: path.join(process.resourcesPath, "postgres", "bin") })
    : findBinaries({ resolveFrom: app.getAppPath() });
}

/** A project's tree. Only a project the library already has is opened: looking never creates one. */
async function projectTree(name: unknown): Promise<AnnotatedTree> {
  if (storytree === undefined) throw new Error("the library is not open");
  if (typeof name !== "string" || !(await storytree.listProjects()).includes(name)) {
    throw new Error(`there is no project called ${JSON.stringify(name)}`);
  }
  const connection = storytree;
  let library = libraries.get(name);
  if (library === undefined) {
    library = connection.openProject(name);
    libraries.set(name, library);
    library.catch(() => libraries.delete(name));
  }
  return (await library).projectTree();
}

function openWindow(query: { project?: string; problem?: string }): BrowserWindow {
  const window = new BrowserWindow({
    width: 1120,
    height: 860,
    minWidth: 640,
    minHeight: 480,
    show: false,
    title: "storytree 0.3",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#17191c" : "#fbfbfa",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  // The page is the app: it never navigates away or opens other windows.
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  if (!args.smoke) window.once("ready-to-show", () => window.show());
  void window.loadFile(path.join(__dirname, "renderer", "index.html"), { query });
  return window;
}

/** The smoke check: wait for the page, screenshot it, print its text, and judge what rendered. */
async function smoke(window: BrowserWindow, project: string | undefined): Promise<void> {
  let code = 1;
  try {
    const state = await pageState(window);
    // Open one capability, as a click would, so the screenshot shows contracts too: the first
    // whose verified column is not passing, else the first.
    const opened = (await window.webContents.executeJavaScript(`(() => {
      const all = [...document.querySelectorAll("details.capability")];
      const pick = all.find((node) => node.querySelector("summary [data-column=verified] .badge-passing") === null) ?? all[0];
      if (pick === undefined) return null;
      pick.querySelector("summary").click();
      return { title: pick.querySelector("summary .row-title").innerText, contracts: pick.querySelectorAll("[data-contract-id]").length };
    })()`)) as { title: string; contracts: number } | null;
    const page = (await window.webContents.executeJavaScript(`(() => ({
      text: document.body.innerText,
      stories: [...document.querySelectorAll("[data-story-id]")].map((node) => node.dataset.storyId),
      capabilities: [...document.querySelectorAll("[data-capability-id]")].map((node) => node.dataset.capabilityId),
    }))()`)) as { text: string; stories: string[]; capabilities: string[] };

    // A screenshot holds only what is in view, so the window is made as tall as the page first.
    const [width] = window.getContentSize();
    const height = Number(await window.webContents.executeJavaScript("document.documentElement.scrollHeight"));
    window.setContentSize(width ?? 1120, Math.min(Math.max(height, 480), 4000));
    await new Promise((resolve) => setTimeout(resolve, 300));
    let image = await window.webContents.capturePage();
    if (image.isEmpty()) {
      window.showInactive(); // some systems will not paint a window that has never been shown
      await new Promise((resolve) => setTimeout(resolve, 500));
      image = await window.webContents.capturePage();
    }
    if (args.screenshot !== undefined) {
      const file = path.resolve(args.screenshot);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, image.toPNG());
      console.log(`smoke: screenshot ${file} (${image.getSize().width}x${image.getSize().height})`);
    }
    process.stdout.write(`${page.text.trim()}\n`);
    if (opened !== null) console.log(`smoke: opened "${opened.title}", showing its ${opened.contracts} contract(s)`);

    const tree = project === undefined || state !== "ready" ? undefined : await projectTree(project);
    const problems = smokeProblems(state, tree, page);
    if (problems.length === 0 && tree !== undefined) {
      const capabilities = tree.stories.reduce((sum, story) => sum + story.capabilities.length, 0);
      console.log(
        `smoke: project "${project}" rendered ${tree.stories.map((story) => `story "${story.title}"`).join(", ")} ` +
          `and ${page.capabilities.length}/${capabilities} capabilities`,
      );
      code = 0;
    } else {
      for (const problem of problems) console.error(`smoke: ${problem}`);
    }
  } catch (error) {
    console.error(`smoke: ${messageOf(error)}`);
  } finally {
    await shutdown();
    app.exit(code);
  }
}

/** Wait until the page has finished loading its project (or found it cannot), and return its state. */
async function pageState(window: BrowserWindow): Promise<string> {
  for (;;) {
    const state = window.webContents.isLoading()
      ? "loading"
      : String(await window.webContents.executeJavaScript("document.body?.dataset.state ?? 'loading'"));
    if (state !== "loading") return state;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** What stops the smoke check passing: every story of the project and each of its capabilities must be on the page. */
function smokeProblems(state: string, tree: AnnotatedTree | undefined, page: { text: string; stories: string[]; capabilities: string[] }): string[] {
  if (state !== "ready") return [`the page did not render a project (its state is "${state}")`];
  if (tree === undefined) return ["no project was opened"];
  if (tree.stories.length === 0) return ["the project has no stories to render"];
  const problems: string[] = [];
  for (const story of tree.stories) {
    if (!page.stories.includes(story.id) || !page.text.includes(story.title)) problems.push(`story "${story.title}" did not render`);
    for (const capability of story.capabilities) {
      if (!page.capabilities.includes(capability.id) || !page.text.includes(capability.title)) {
        problems.push(`capability "${capability.title}" did not render`);
      }
    }
  }
  return problems;
}

/** Close the library and stop Postgres. Safe to call more than once. */
function shutdown(): Promise<void> {
  shutDown ??= (async () => {
    for (const library of libraries.values()) await library.then((open) => open.close()).catch(() => {});
    libraries.clear();
    await storytree?.close().catch((error: unknown) => console.error(`closing the library: ${messageOf(error)}`));
    storytree = undefined;
    await postgres?.stop().catch((error: unknown) => console.error(`stopping Postgres: ${messageOf(error)}`));
    postgres = undefined;
  })();
  return shutDown;
}

function fail(error: unknown): void {
  console.error(`storytree 0.3: ${messageOf(error)}`);
  void shutdown().finally(() => app.exit(1));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
