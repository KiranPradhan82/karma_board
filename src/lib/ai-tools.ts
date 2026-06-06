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
      name: "web_search",
      description:
        "Perform knowledge-based research on a topic. Use this for competitive analysis, market research, technology trends, UX patterns, and security best practices during documentation generation. Returns structured research insights based on extensive training data.",
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
      return AI_TOOLS; // Full access
    case "ADMIN":
      return AI_TOOLS; // Full access
    case "MEMBER":
      // Members can view projects, get info, and search web, but cannot create/update/add members
      return AI_TOOLS.filter((tool) =>
        ["list_projects", "get_project_info", "web_search"].includes(tool.function.name)
      );
    default:
      return AI_TOOLS.filter((tool) =>
        ["list_projects", "get_project_info", "web_search"].includes(tool.function.name)
      );
  }
}

/**
 * Check if a tool requires elevated permissions.
 */
export function isToolAllowedForRole(toolName: string, role: string): boolean {
  const restrictedTools = ["create_project", "update_project", "add_project_member"];
  if (role === "SUPERADMIN" || role === "ADMIN") return true;
  return !restrictedTools.includes(toolName);
}
