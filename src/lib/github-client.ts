/**
 * GitHub API Client — native fetch, no external dependencies
 *
 * Supports pushing files to a GitHub repository using the Contents API
 * and Git Trees API for batch commits.
 */

export interface GitHubConfig {
  repoUrl: string; // e.g., "https://github.com/user/repo"
  token: string;   // GitHub PAT with repo scope
}

interface GitHubRepoInfo {
  owner: string;
  repo: string;
}

function parseRepoUrl(url: string): GitHubRepoInfo {
  // Handle both https://github.com/user/repo and github.com/user/repo
  const match = url.match(/github\.com[/:]([^/]+)\/([^/\s#?]+)/i);
  if (!match) {
    throw new Error("Invalid GitHub repository URL: " + url);
  }
  return { owner: match[1], repo: match[2] };
}

const GITHUB_API = "https://api.github.com";

async function githubFetch(
  config: GitHubConfig,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = GITHUB_API + path;
  const headers: Record<string, string> = {
    Authorization: "Bearer " + config.token,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "KarmaBoard/1.0",
    ...((options.headers as Record<string, string>) || {}),
  };

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error("GitHub API error (" + res.status + "): " + text);
  }

  return res;
}

/**
 * Get the current commit SHA for the default branch.
 */
async function getDefaultBranchSha(config: GitHubConfig, branch: string): Promise<string> {
  const info = parseRepoUrl(config.repoUrl);
  const res = await githubFetch(config, "/repos/" + info.owner + "/" + info.repo + "/git/ref/heads/" + branch);
  const data = await res.json();
  return data.object.sha;
}

/**
 * Check if a file exists and return its SHA if it does.
 */
async function getFileSha(config: GitHubConfig, path: string): Promise<string | null> {
  const info = parseRepoUrl(config.repoUrl);
  try {
    const res = await githubFetch(config, "/repos/" + info.owner + "/" + info.repo + "/contents/" + path);
    const data = await res.json();
    return data.sha || null;
  } catch {
    return null;
  }
}

/**
 * Create or update a single file via GitHub Contents API.
 */
export async function pushFile(
  config: GitHubConfig,
  path: string,
  content: string,
  message: string,
): Promise<{ sha: string; commitSha: string }> {
  const info = parseRepoUrl(config.repoUrl);
  const existingSha = await getFileSha(config, path);

  const body: Record<string, unknown> = {
    message,
    content: typeof Buffer !== "undefined" ? Buffer.from(content, "utf8").toString("base64") : btoa(content),
  };
  if (existingSha) {
    body.sha = existingSha;
  }

  const res = await githubFetch(config, "/repos/" + info.owner + "/" + info.repo + "/contents/" + path, {
    method: "PUT",
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return {
    sha: data.content.sha,
    commitSha: data.commit.sha,
  };
}

/**
 * Push a binary file (base64-encoded) via GitHub Contents API.
 */
export async function pushBinaryFile(
  config: GitHubConfig,
  path: string,
  base64Content: string,
  message: string,
): Promise<{ sha: string; commitSha: string }> {
  const info = parseRepoUrl(config.repoUrl);
  const existingSha = await getFileSha(config, path);

  const body: Record<string, unknown> = {
    message,
    content: base64Content,
  };
  if (existingSha) {
    body.sha = existingSha;
  }

  const res = await githubFetch(config, "/repos/" + info.owner + "/" + info.repo + "/contents/" + path, {
    method: "PUT",
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return {
    sha: data.content.sha,
    commitSha: data.commit.sha,
  };
}

interface FileEntry {
  path: string;
  content: string;
  isBinary?: boolean;
}

/**
 * Push multiple files in a single commit using the Git Trees API.
 * More efficient than pushing files one at a time.
 */
export async function pushMultipleFiles(
  config: GitHubConfig,
  files: FileEntry[],
  message: string,
  branch: string = "main",
): Promise<{ commitSha: string; filesPushed: number }> {
  const info = parseRepoUrl(config.repoUrl);

  // 1. Get the current commit SHA for the branch
  const baseSha = await getDefaultBranchSha(config, branch);

  // 2. Create blobs for each file
  const treeEntries: { path: string; mode: string; type: string; sha: string }[] = [];

  for (const file of files) {
    const res = await githubFetch(config, "/repos/" + info.owner + "/" + info.repo + "/git/blobs", {
      method: "POST",
      body: JSON.stringify({
        content: file.isBinary ? undefined : file.content,
        encoding: file.isBinary ? "base64" : "utf-8",
      }),
    });
    const blob = await res.json();
    treeEntries.push({
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    });
  }

  // 3. Create a tree with all the blobs
  const treeRes = await githubFetch(config, "/repos/" + info.owner + "/" + info.repo + "/git/trees", {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseSha,
      tree: treeEntries,
    }),
  });
  const tree = await treeRes.json();

  // 4. Create a commit pointing to the new tree
  const commitRes = await githubFetch(config, "/repos/" + info.owner + "/" + info.repo + "/git/commits", {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [baseSha],
    }),
  });
  const commit = await commitRes.json();

  // 5. Update the branch reference to point to the new commit
  await githubFetch(config, "/repos/" + info.owner + "/" + info.repo + "/git/refs/heads/" + branch, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha }),
  });

  return {
    commitSha: commit.sha,
    filesPushed: files.length,
  };
}
