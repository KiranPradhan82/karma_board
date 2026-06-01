export const COMMAND_DESCRIPTIONS: Record<string, { label: string; description: string }> = {
  "/docs": { label: "Full Protocol", description: "Run the complete document generation protocol" },
  "/prd": { label: "PRD", description: "Generate Product Requirements Document" },
  "/trd": { label: "TRD", description: "Generate Technical Requirements Document" },
  "/flow": { label: "App Flow", description: "Generate Application Flow Document" },
  "/ux": { label: "UI/UX Brief", description: "Generate UI/UX Design Brief" },
  "/schema": { label: "Schema", description: "Generate Backend Schema Document" },
  "/plan": { label: "Plan", description: "Generate Implementation Plan" },
  "/help": { label: "Help", description: "Show all available commands" },
};

const COMMAND_PROMPTS: Record<string, string> = {
  "/prd": `Generate a comprehensive Product Requirements Document (PRD).
Structure: Executive Summary, Project Overview, Target Audience, Functional Requirements, Non-Functional Requirements, User Stories, Acceptance Criteria, Scope & Constraints, Risks & Mitigations, Glossary. Use tables. End with Action Items and Open Questions.`,
  "/trd": `Generate a comprehensive Technical Requirements Document (TRD).
Structure: Executive Summary, Architecture Overview, Technology Stack (table), Frontend Requirements, Backend Requirements, Database Design, API Specification (endpoint table), Security Requirements, Performance Requirements, Deployment & Infrastructure, Testing Strategy. End with Action Items.`,
  "/flow": `Generate an Application Flow Document. Structure: Executive Summary, User Journey Maps, Screen Flow Diagrams, Core Flows (Auth, Main App, CRUD, Error Handling), State Management, Navigation Architecture, Interaction Patterns, Data Flow, Error Handling Flow. End with Action Items.`,
  "/ux": `Generate a UI/UX Design Brief. Structure: Executive Summary, Design Principles, Design System Overview, Color Palette (table), Typography (table), Spacing & Layout, Component Guidelines, Screen Designs (layout, content hierarchy, interactions, responsive), Iconography, Motion & Animation, Accessibility, Dark Mode. End with Action Items.`,
  "/schema": `Generate a Backend Schema Document. Structure: Executive Summary, Database Architecture, Entity Relationship Diagram description, Schema Definitions (table per entity with columns), Enum Types, Data Integrity Rules, Seed Data, Migration Strategy, API-Database Mapping. End with Action Items.`,
  "/plan": `Generate an Implementation Plan. Structure: Executive Summary, Phase Breakdown with milestones, Task Breakdown table (Task ID, Description, Priority, Estimate, Dependencies), Sprint Planning, Resource Requirements, Risk Register table (risk, impact, probability, mitigation), Dependencies, Quality Gates, Deployment Plan, Success Metrics. End with Action Items, Critical Path, Next Steps.`,
};

const DOCUMENT_FORMATTING = `
Formatting Rules: Use professional Markdown. Use tables for structured data. Use bullet points and numbered lists. Include code blocks for examples. Bold for key terms. Each section comprehensive and actionable. Always include Action Items section. Be specific.`;

export function buildSystemPrompt(context: {
  projectName?: string;
  projectDescription?: string;
  projectClient?: string;
  protocolSteps?: { title: string; description?: string; commandTag?: string }[];
  command?: string;
}): string {
  const { projectName, projectDescription, projectClient, protocolSteps, command } = context;

  const basePrompt = `You are Karma Space AI, an intelligent project assistant powered by GLM 5. You help teams generate comprehensive project documentation and provide intelligent project assistance. You are thorough, precise, and produce publication-quality documents.`;

  const contextLines: string[] = [];
  if (projectName) contextLines.push(`Project Name: ${projectName}`);
  if (projectDescription) contextLines.push(`Project Description: ${projectDescription}`);
  if (projectClient) contextLines.push(`Client: ${projectClient}`);

  const projectContextBlock = contextLines.length > 0 ? `\n\n## Project Context\n\n${contextLines.join("\n")}` : "";

  if (command === "/docs" && protocolSteps && protocolSteps.length > 0) {
    const stepsList = protocolSteps.map((step, i) => `${i + 1}. **${step.title}**${step.description ? ` - ${step.description}` : ""}${step.commandTag ? ` (command: /${step.commandTag})` : ""}`).join("\n");
    return `${basePrompt}${projectContextBlock}\n\n## Full Protocol Execution\n\nYou are running the complete document generation protocol. Execute all steps sequentially.\n\n### Protocol Steps:\n${stepsList}\n\nInstructions: Execute each step in order. Separate each step output with: ## ✅ Step N: [Title]. If a step has a commandTag, use the specialized template. Ensure each output is comprehensive.${DOCUMENT_FORMATTING}`;
  }

  if (command && command !== "/help" && COMMAND_PROMPTS[command]) {
    return `${basePrompt}${projectContextBlock}\n\n## Current Task: ${COMMAND_DESCRIPTIONS[command]?.label || command}\n\nGenerate using this template:\n\n${COMMAND_PROMPTS[command]}${DOCUMENT_FORMATTING}`;
  }

  if (command === "/help") {
    const helpLines = Object.entries(COMMAND_DESCRIPTIONS).map(([cmd, info]) => `- \`${cmd}\` - **${info.label}**: ${info.description}`).join("\n");
    return `${basePrompt}\n\n## Available Commands\n\n${helpLines}\n\nRespond with a friendly message listing all commands.`;
  }

  return `${basePrompt}${projectContextBlock}\n\n## General Assistant Mode\nHelp with questions, suggestions, architecture, design, implementation. If user wants docs, suggest slash commands:\n\n${Object.entries(COMMAND_DESCRIPTIONS).map(([cmd, info]) => `\`${cmd}\` - ${info.description}`).join("\n")}`;
}
