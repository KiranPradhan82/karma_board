# TeamForge PM — Contributing Guide

## For AI Agents and Developers

This guide outlines how to contribute to TeamForge PM. Whether you are an AI agent (like GLM, Claude, or Super Z) or a human developer, follow these rules.

## 1. Before You Start

### Always Read These Files First:
1. **`AGENT.md`** — Master instruction file. Contains ALL project rules, conventions, and context.
2. **`docs/architecture.md`** — System architecture overview.
3. **`docs/database-schema.md`** — Database schema reference.
4. **`docs/api-reference.md`** — API endpoint documentation.

### Never Ask About:
- Anything already documented in AGENT.md
- Tech stack choices (they are locked)
- Project structure (it is defined)
- Database schema (it is finalized)

### Always Ask About:
- Ambiguous requirements not covered in docs
- New features not yet discussed
- Changes to locked decisions (need user approval)

## 2. Code Contribution Rules

### Making Changes:
1. Read existing code before modifying it
2. Follow the coding conventions in AGENT.md exactly
3. Use TypeScript strict mode — no `any` types
4. Validate all inputs with Zod schemas
5. Handle errors properly with try/catch
6. Write meaningful commit messages (conventional commits)

### Adding New Features:
1. Update the database schema if needed (`prisma/schema.prisma`)
2. Run migration: `npx prisma migrate dev --name feature-name`
3. Create API route in appropriate directory
4. Create/update UI components
5. Add proper authorization checks
6. Update relevant documentation in `docs/`
7. Update AGENT.md status section if needed

### Pull Request Checklist:
- [ ] Code follows all conventions in AGENT.md
- [ ] TypeScript compiles without errors
- [ ] All inputs are validated with Zod
- [ ] Auth checks are in place for protected routes
- [ ] Error handling is implemented
- [ ] Documentation is updated
- [ ] No `console.log` left in production code
- [ ] No `any` types used

## 3. AI Agent Specific Rules

### When Working as an AI Agent:
1. **Read AGENT.md first** — Every session, every time
2. **Do NOT skip steps** — Follow the build order in AGENT.md
3. **Report blockers immediately** — If you need credentials, API keys, or decisions, ask clearly
4. **Write complete code** — No placeholders, no TODO comments, no "implement later"
5. **Test mentally** — Before delivering code, verify it would work logically
6. **Save to correct directories** — All files go inside the project structure defined in AGENT.md

### AI Agent Workflow:
```
1. Read AGENT.md
2. Read worklog.md (if exists) for previous session context
3. Identify current phase from AGENT.md status section
4. Execute tasks for current phase
5. Update worklog.md with what was done
6. Report completion and next steps
```

## 4. File Modification Rules

### DO modify:
- Files within the defined project structure
- `prisma/schema.prisma` (with migration)
- `docs/` documentation files
- `AGENT.md` (status updates, new conventions)
- `.env.example` (when adding new env vars)

### DO NOT modify:
- `node_modules/`
- `.next/`
- Generated shadcn/ui component internals
- Lock files (let npm handle them)

## 5. Testing Requirements (Future)

When testing is implemented:
- All API routes need unit tests
- All utility functions need unit tests
- Critical flows need integration tests
- Run `npm test` before submitting changes

## 6. Documentation Updates

When you make any of these changes, update the relevant doc:

| Change | Update |
|--------|--------|
| New API endpoint | `docs/api-reference.md` |
| Schema change | `docs/database-schema.md` |
| New feature/flow | `docs/architecture.md` |
| New env var needed | `.env.example` |
| Phase completion | `AGENT.md` status section |
| New convention | `AGENT.md` conventions section |
