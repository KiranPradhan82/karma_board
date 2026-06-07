/**
 * AI Tool Definitions for Agentic Karma Space
 *
 * Defines OpenAI-compatible function/tool schemas that Karma Space can call
 * to autonomously perform actions in KarmaBoard (create projects, update status, etc.)
 *
 * Tools are subject to RBAC — the executor checks the user's role before execution.
 */

export interface AiToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface AiToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface AiToolResult {
  toolCallId: string;
  toolName: string;
  success: boolean;
  result: string;
  displayMessage: string;
}

// ===== Tool Definitions =====

export const AI_TOOLS: AiToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "create_project",
      description:
        "Create a new project in KarmaBoard. Use this when the user asks you to create, set up, or start a new project. Collect all details from the user first (name, description, priority, deadline, color, client info) before calling.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Project name (1-100 characters, required)",
          },
          description: {
            type: "string",
            description: "Brief project description (optional, max 500 chars)",
          },
          priority: {
            type: "string",
            enum: ["HIGH", "MEDIUM", "LOW"],
            description: "Project priority level (default: MEDIUM)",
          },
          deadline: {
            type: "string",
            description:
              "Project deadline as ISO date string, e.g. '2025-12-31' (optional)",
          },
          color: {
            type: "string",
            description:
              "Hex color code for project badge, e.g. '#3B82F6' (optional)",
          },
          clientName: {
            type: "string",
            description: "Name of the client this project is for (optional)",
          },
        },
        required: ["name"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "list_projects",
      description:
        "List all projects the current user has access to. Use this when the user asks about their projects, wants to see what projects exist, or needs project info before performing another action.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["ACTIVE", "COMPLETED", "ON_HOLD", "ARCHIVED"],
            description: "Filter by project status (optional — omit to list all)",
          },
        },
      },
    },
  },

  {
    type: "function",
    function: {
      name: "get_project_info",
      description:
        "Get detailed information about a specific project including name, description, status, priority, deadline, client, and team size. Use this when the user asks about a specific project's details.",
      parameters: {
        type: "object",
        properties: {
          projectId: {
            type: "string",
            description: "The unique ID of the project",
          },
        },
        required: ["projectId"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "update_project",
      description:
        "Update an existing project's details (status, priority, deadline, description, color). Use this when the user asks to change, modify, or update a project. Requires ADMIN or SUPERADMIN role.",
      parameters: {
        type: "object",
        properties: {
          projectId: {
            type: "string",
            description: "The unique ID of the project to update",
          },
          name: {
            type: "string",
            description: "New project name (optional)",
          },
          description: {
            type: "string",
            description: "New project description (optional)",
          },
          status: {
            type: "string",
            enum: ["ACTIVE", "COMPLETED", "ON_HOLD", "ARCHIVED"],
            description: "New project status (optional)",
          },
          priority: {
            type: "string",
            enum: ["HIGH", "MEDIUM", "LOW"],
            description: "New priority level (optional)",
          },
          deadline: {
            type: "string",
            description: "New deadline as ISO date string (optional)",
          },
          color: {
            type: "string",
            description: "New hex color code (optional)",
          },
        },
        required: ["projectId"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "add_project_member",
      description:
        "Add a team member to a project. Use this when the user asks to assign someone to a project. Requires ADMIN, SUPERADMIN, or LEAD role for that project.",
      parameters: {
        type: "object",
        properties: {
          projectId: {
            type: "string",
            description: "The unique ID of the project",
          },
          userId: {
            type: "string",
            description: "The user ID to add to the project",
          },
          role: {
            type: "string",
            enum: ["LEAD", "DEVELOPER", "MARKETER", "VIEWER", "MEMBER"],
            description: "Project role for the member (default: MEMBER)",
          },
        },
        required: ["projectId", "userId"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "knowledge_research",
      description:
        "Perform knowledge-based research on a topic using training data. This is NOT a live web search — it returns structured research guidance based on your training knowledge. Use for competitive analysis, market research, technology trends, UX patterns, and security best practices during documentation generation. Do NOT claim you searched the web — say 'Based on my knowledge' instead.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Research topic (e.g., 'project management software competitors 2025', 'Next.js 16 best practices')",
          },
          category: {
            type: "string",
            enum: ["competitors", "technology", "ux_patterns", "security", "market_trends", "general"],
            description: "Category of research to focus the analysis",
          },
        },
        required: ["query"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "save_github_config",
      description:
        "Save GitHub repository URL, Personal Access Token (PAT), and PAT expiry date to settings. Use this during the /init flow after collecting the repo URL, PAT, and expiry date from the user. The PAT is encrypted before storage. The expiry date is used to send email reminders before the token expires.",
      parameters: {
        type: "object",
        properties: {
          repoUrl: {
            type: "string",
            description: "Full GitHub repository URL (e.g., 'https://github.com/username/repo-name')",
          },
          pat: {
            type: "string",
            description: "GitHub Personal Access Token with repo scope",
          },
          patExpiry: {
            type: "string",
            description: "Expiry date for the GitHub PAT in ISO date format (e.g., '2025-12-31'). This is used to send an email notification to the user when the token is about to expire.",
          },
        },
        required: ["repoUrl", "pat", "patExpiry"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_pull",
      description:
        "Pull the latest contents of files from the project's GitHub repository. Use this to see what code currently exists in the repo before making changes. Returns file paths and their contents.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Specific file path to pull (e.g., 'src/app/page.tsx'). Omit to list the repo tree.",
          },
          branch: {
            type: "string",
            description: "Branch name (default: 'main')",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_or_update_file",
      description:
        "Create or update a code file in the project. The file is stored in the project's file registry. After creating files, use github_push_code to push them to GitHub.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path relative to project root (e.g., 'src/app/page.tsx')",
          },
          content: {
            type: "string",
            description: "Full file content",
          },
          message: {
            type: "string",
            description: "Commit message describing the change",
          },
        },
        required: ["path", "content", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_push_code",
      description:
        "Push the staged files to the project's GitHub repository. Files must first be created with create_or_update_file before pushing. This creates a real git commit on GitHub.",
      parameters: {
        type: "object",
        properties: {
          branch: {
            type: "string",
            description: "Target branch (default: 'main')",
          },
        },
      },
    },
  },

  // ===== Filesystem (GitHub-based) Tools =====
  {
    type: "function",
    function: {
      name: "fs_list_dir",
      description:
        "List directory contents from the project's GitHub repository. Use this to explore the repo structure, see what files exist, and navigate the codebase.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory path to list. Omit for root directory.",
          },
          branch: {
            type: "string",
            description: "Branch name (default: 'main')",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fs_read_file",
      description:
        "Read the contents of a specific file from the project's GitHub repository. Returns the full file content decoded from base64.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path to read (e.g., 'src/app/page.tsx')",
          },
          branch: {
            type: "string",
            description: "Branch name (default: 'main')",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fs_write_file",
      description:
        "Create or update a single file directly on GitHub. This creates an immediate commit (no staging needed). For multiple files, use fs_batch_write instead.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path to create or update (e.g., 'src/app/page.tsx')",
          },
          content: {
            type: "string",
            description: "Full file content to write",
          },
          message: {
            type: "string",
            description: "Commit message describing the change",
          },
          branch: {
            type: "string",
            description: "Branch name (default: 'main')",
          },
        },
        required: ["path", "content", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fs_delete_file",
      description:
        "Delete a file from the GitHub repository.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path to delete (e.g., 'src/app/old-page.tsx')",
          },
          message: {
            type: "string",
            description: "Commit message describing the deletion",
          },
          branch: {
            type: "string",
            description: "Branch name (default: 'main')",
          },
        },
        required: ["path", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fs_search_code",
      description:
        "Search for code patterns, text, or symbols across the entire repository using GitHub Code Search API.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query (e.g., 'useState', 'export function handleSubmit', 'TODO')",
          },
          path: {
            type: "string",
            description: "Restrict search to a specific path (e.g., 'src/components')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fs_batch_write",
      description:
        "Create or update multiple files in a single git commit on GitHub. Use this when you need to create several files at once.",
      parameters: {
        type: "object",
        properties: {
          files: {
            type: "array",
            description: "Array of files to create or update",
            items: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "File path (e.g., 'src/app/page.tsx')",
                },
                content: {
                  type: "string",
                  description: "Full file content",
                },
                message: {
                  type: "string",
                  description: "Commit message for this file",
                },
              },
              required: ["path", "content", "message"],
            },
          },
          branch: {
            type: "string",
            description: "Branch name (default: 'main')",
          },
        },
        required: ["files"],
      },
    },
  },

  // ===== Command Execution Tool =====
  {
    type: "function",
    function: {
      name: "exec_command",
      description:
        "Execute a shell command (bash, node, python, git, etc.) via GitHub Actions workflow. Returns the command output. Each execution takes ~15-30s to start. Max timeout: 300 seconds.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Shell command to execute (e.g., 'npm run build', 'git log --oneline -5')",
          },
          working_directory: {
            type: "string",
            description: "Working directory for the command (e.g., 'apps/web')",
          },
          timeout: {
            type: "number",
            description: "Maximum execution time in seconds (max 300, default 60)",
          },
        },
        required: ["command"],
      },
    },
  },

  // ===== Web Tools =====
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for current information, news, documentation, or any real-time data. Returns search results with URLs, titles, and snippets.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query (e.g., 'Next.js 16 release notes', 'Tailwind CSS v4 documentation')",
          },
          num_results: {
            type: "number",
            description: "Number of results to return (default: 5)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_read_page",
      description:
        "Read and extract the main content from a web page URL. Returns the page title, content text, and publication date if available.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL of the web page to read (e.g., 'https://nextjs.org/blog')",
          },
        },
        required: ["url"],
      },
    },
  },

  // ===== Image Generation Tool =====
  {
    type: "function",
    function: {
      name: "image_generate",
      description:
        "Generate an image from a text description using AI. Returns a base64-encoded PNG image.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Text description of the image to generate",
          },
          size: {
            type: "string",
            enum: ["1024x1024", "768x1344", "1344x768"],
            description: "Image dimensions (default: '1024x1024')",
          },
        },
        required: ["prompt"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "save_database_config",
      description:
        "Save database connection details including auth token and token expiry date to settings. Use this during the /init flow after collecting the database URL, auth token, database type, and token expiry from the user. The auth token is encrypted before storage. The expiry date is used to send email reminders before the token expires.",
      parameters: {
        type: "object",
        properties: {
          dbUrl: {
            type: "string",
            description: "Database connection URL (e.g., 'libsql://your-db.turso.io', 'postgresql://user:pass@host:5432/dbname', 'file:./local.db')",
          },
          dbAuthToken: {
            type: "string",
            description: "Database authentication token or password",
          },
          dbType: {
            type: "string",
            description: "Database engine type (e.g., 'Turso/SQLite', 'PostgreSQL', 'MySQL', 'MongoDB', 'Supabase')",
          },
          dbTokenExpiry: {
            type: "string",
            description: "Expiry date for the database auth token in ISO date format (e.g., '2025-12-31'). This is used to send an email notification to the user when the token is about to expire.",
          },
        },
        required: ["dbUrl", "dbAuthToken", "dbType", "dbTokenExpiry"],
      },
    },
  },
];

/**
 * Get tool names that a specific role is allowed to use.
 */
export function getToolsForRole(role: string): AiToolDefinition[] {
  switch (role) {
    case "SUPERADMIN":
      return AI_TOOLS; // Full access to all tools
    case "ADMIN":
      // All tools except exec_command, fs_delete_file, fs_batch_write, image_generate
      return AI_TOOLS.filter(
        (tool) =>
          ![
            "exec_command",
            "fs_delete_file",
            "fs_batch_write",
            "image_generate",
          ].includes(tool.function.name)
      );
    case "MEMBER":
      // Only project info, web search, and read-only filesystem tools
      return AI_TOOLS.filter((tool) =>
        [
          "list_projects",
          "get_project_info",
          "web_search",
          "fs_list_dir",
          "fs_read_file",
        ].includes(tool.function.name)
      );
    default:
      return AI_TOOLS.filter((tool) =>
        [
          "list_projects",
          "get_project_info",
          "web_search",
          "fs_list_dir",
          "fs_read_file",
        ].includes(tool.function.name)
      );
  }
}

/**
 * Check if a tool requires elevated permissions.
 */
export function isToolAllowedForRole(toolName: string, role: string): boolean {
  const restrictedTools = [
    "create_project",
    "update_project",
    "add_project_member",
    "github_pull",
    "create_or_update_file",
    "github_push_code",
    // GitHub filesystem tools
    "fs_write_file",
    "fs_delete_file",
    "fs_search_code",
    "fs_batch_write",
    // Execution & generation tools
    "exec_command",
    "web_read_page",
    "image_generate",
    // Config tools
    "save_github_config",
    "save_database_config",
  ];
  if (role === "SUPERADMIN") return true;
  if (role === "ADMIN") {
    // Admins cannot use exec_command, fs_delete_file, fs_batch_write, image_generate
    const adminRestricted = ["exec_command", "fs_delete_file", "fs_batch_write", "image_generate"];
    return !adminRestricted.includes(toolName);
  }
  // MEMBER and default: only unrestricted tools
  return !restrictedTools.includes(toolName);
}
