"use client";

import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  FileJson,
  Image as ImageIcon,
  RefreshCw,
  PanelLeftClose,
  File,
  FolderTree,
} from "lucide-react";

export interface FileTreeItem {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: FileTreeItem[];
  expanded?: boolean;
}

interface FileExplorerProps {
  files: FileTreeItem[];
  onToggle: () => void;
  onSelectFile: (path: string) => void;
  onRefresh?: () => void;
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return <FileCode className="h-3.5 w-3.5 shrink-0 text-sky-500" />;
    case "json":
      return <FileJson className="h-3.5 w-3.5 shrink-0 text-amber-500" />;
    case "md":
    case "mdx":
      return <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-500" />;
    case "txt":
    case "log":
    case "env":
    case "env.local":
      return <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-400" />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "webp":
    case "ico":
      return <ImageIcon className="h-3.5 w-3.5 shrink-0 text-purple-500" />;
    case "css":
    case "scss":
    case "sass":
    case "less":
      return <FileCode className="h-3.5 w-3.5 shrink-0 text-pink-500" />;
    case "html":
      return <FileCode className="h-3.5 w-3.5 shrink-0 text-orange-500" />;
    case "sql":
      return <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-500" />;
    case "yaml":
    case "yml":
    case "toml":
      return <FileText className="h-3.5 w-3.5 shrink-0 text-red-400" />;
    case "sh":
    case "bash":
    case "zsh":
      return <FileText className="h-3.5 w-3.5 shrink-0 text-lime-500" />;
    case "lock":
      return <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
    default:
      return <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  }
}

function FileTreeNode({
  item,
  depth = 0,
  onSelectFile,
}: {
  item: FileTreeItem;
  depth?: number;
  onSelectFile: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = item.children && item.children.length > 0;

  return (
    <div>
      <button
        onClick={() => {
          if (item.type === "directory") {
            setExpanded(!expanded);
          } else {
            onSelectFile(item.path);
          }
        }}
        className="flex items-center gap-1.5 w-full px-2 py-[3px] text-[13px] hover:bg-muted/50 rounded-sm transition-colors cursor-pointer group"
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
      >
        {item.type === "directory" ? (
          <>
            {hasChildren ? (
              expanded ? (
                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/60" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
              )
            ) : (
              <span className="w-3 shrink-0" />
            )}
            {expanded ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400/70" />
            )}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            {getFileIcon(item.name)}
          </>
        )}
        <span className="truncate text-foreground/80 group-hover:text-foreground transition-colors">
          {item.name}
        </span>
      </button>
      {item.type === "directory" && expanded && hasChildren && (
        <div>
          {item.children!.map((child) => (
            <FileTreeNode
              key={child.path}
              item={child}
              depth={depth + 1}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileExplorer({
  files,
  onToggle,
  onSelectFile,
  onRefresh,
}: FileExplorerProps) {
  return (
    <div className="flex flex-col h-full bg-card border-r">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <div className="flex items-center gap-2">
          <FolderTree className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold tracking-tight">Files</span>
        </div>
        <div className="flex items-center gap-0.5">
          {onRefresh && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={onRefresh}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Refresh</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onToggle}
                >
                  <PanelLeftClose className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Hide Explorer</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* File Tree */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {files.length > 0 ? (
            files.map((item) => (
              <FileTreeNode
                key={item.path}
                item={item}
                onSelectFile={onSelectFile}
              />
            ))
          ) : (
            <div className="px-4 py-10 text-center">
              <FolderTree className="h-8 w-8 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
                File tree will appear here
                <br />
                when you explore files with AI
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/**
 * Build a nested file tree from flat directory listing items.
 * Merges items from multiple fs_list_dir calls into a single tree.
 */
export function buildFileTree(
  items: Array<{ name: string; path: string; type: string; size?: number }>
): FileTreeItem[] {
  const nodeMap = new Map<string, FileTreeItem>();
  const rootItems: FileTreeItem[] = [];

  // Create nodes, skip duplicates (later calls override)
  for (const item of items) {
    nodeMap.set(item.path, {
      name: item.name,
      path: item.path,
      type: item.type === "directory" ? "directory" : "file",
      size: item.size,
      children: item.type === "directory" ? [] : undefined,
    });
  }

  // Build parent-child relationships
  for (const item of items) {
    const node = nodeMap.get(item.path);
    if (!node) continue;

    const lastSlash = item.path.lastIndexOf("/");
    const parentPath = lastSlash > 0 ? item.path.substring(0, lastSlash) : null;

    if (parentPath && nodeMap.has(parentPath)) {
      const parent = nodeMap.get(parentPath)!;
      if (parent.children) {
        // Avoid duplicates in children
        if (!parent.children.some((c) => c.path === node.path)) {
          parent.children.push(node);
        }
      }
    } else {
      // Root-level item
      if (!rootItems.some((r) => r.path === node.path)) {
        rootItems.push(node);
      }
    }
  }

  // Sort: directories first, then files; alphabetically within each group
  const sortItems = (items: FileTreeItem[]) => {
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const item of items) {
      if (item.children) sortItems(item.children);
    }
  };
  sortItems(rootItems);

  return rootItems;
}
