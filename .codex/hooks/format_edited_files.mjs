import { spawnSync } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const editableFileMarkers = ["Add File", "Update File", "Move to"];

const readStdin = async () => {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
};

const getRepositoryRoot = (cwd) => {
  let currentDirectory = resolve(cwd);

  while (true) {
    if (existsSync(join(currentDirectory, ".git"))) {
      return currentDirectory;
    }

    const parentDirectory = dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      throw new Error(`Unable to find repository root from: ${cwd}`);
    }

    currentDirectory = parentDirectory;
  }
};

const getEditedPaths = (patch) => {
  const markerPattern = editableFileMarkers.join("|");
  const pathPattern = new RegExp(`^\\*\\*\\* (?:${markerPattern}): (.+)$`, "gm");

  return [...patch.matchAll(pathPattern)].map((match) => match[1].trim());
};

const successStatuses = new Set(["completed", "ok", "success", "succeeded"]);

const toolResponseSucceeded = (toolResponse) => {
  if (typeof toolResponse === "string") {
    const response = toolResponse.trim();

    return (
      /^(done!?|ok|success\.?)$/i.test(response) ||
      (/^Exit code:\s*0\b/m.test(response) &&
        /Success\. Updated the following files:/i.test(response))
    );
  }

  if (Array.isArray(toolResponse)) {
    return toolResponse.some(toolResponseSucceeded);
  }

  if (!toolResponse || typeof toolResponse !== "object") {
    return false;
  }

  if (Object.keys(toolResponse).length === 0) {
    return true;
  }

  if (
    toolResponse.success === true ||
    toolResponse.ok === true ||
    toolResponse.exit_code === 0 ||
    (typeof toolResponse.status === "string" &&
      successStatuses.has(toolResponse.status.toLowerCase()))
  ) {
    return true;
  }

  return [toolResponse.content, toolResponse.output, toolResponse.result, toolResponse.text].some(
    toolResponseSucceeded,
  );
};

const resolveRepositoryFile = (repositoryRoot, editCwd, candidate) => {
  const absolutePath = isAbsolute(candidate) ? resolve(candidate) : resolve(editCwd, candidate);
  const repositoryRealPath = realpathSync(repositoryRoot);
  const absoluteRealPath = existsSync(absolutePath) ? realpathSync(absolutePath) : absolutePath;
  const relativeRealPath = relative(repositoryRealPath, absoluteRealPath);

  if (
    relativeRealPath === ".." ||
    relativeRealPath.startsWith(`..${sep}`) ||
    isAbsolute(relativeRealPath)
  ) {
    throw new Error(`Edited path is outside the repository: ${candidate}`);
  }

  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    return undefined;
  }

  return {
    absolutePath: absoluteRealPath,
    relativePath: relative(repositoryRealPath, absoluteRealPath),
  };
};

const writeContext = (relativePaths) => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: `Prettier processed edited files: ${relativePaths.join(", ")}`,
      },
    }),
  );
};

const main = async () => {
  const input = JSON.parse(await readStdin());

  if (input.hook_event_name !== "PostToolUse" || input.tool_name !== "apply_patch") {
    return;
  }

  if (!toolResponseSucceeded(input.tool_response)) {
    return;
  }

  const patch = input.tool_input?.command;

  if (typeof patch !== "string") {
    return;
  }

  const editCwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
  const repositoryRoot = getRepositoryRoot(editCwd);
  const files = [
    ...new Map(
      getEditedPaths(patch)
        .map((candidate) => resolveRepositoryFile(repositoryRoot, editCwd, candidate))
        .filter((file) => file !== undefined)
        .map((file) => [file.absolutePath, file]),
    ).values(),
  ];

  if (files.length === 0) {
    return;
  }

  const result = spawnSync(
    "pnpm",
    ["exec", "prettier", "--write", "--ignore-unknown", ...files.map((file) => file.absolutePath)],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  );

  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr.trim() ?? "Unknown Prettier error";
    throw new Error(`Unable to format edited files: ${detail}`);
  }

  writeContext(files.map((file) => file.relativePath));
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
});
