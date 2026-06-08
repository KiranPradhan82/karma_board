"use client";

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import type { ImperativePanelHandle } from "react-resizable-panels";

// Re-export types for convenience
export type { FileTreeItem } from "./file-explorer";
export type { TerminalEntry } from "./terminal-panel";

interface IdeLayoutProps {
  children: ReactNode;
  fileExplorerContent: ReactNode;
  terminalContent: ReactNode;
  fileExplorerOpen: boolean;
  terminalOpen: boolean;
  onFileExplorerOpenChange: (open: boolean) => void;
  onTerminalOpenChange: (open: boolean) => void;
  isMobile?: boolean;
}

export function IdeLayout({
  children,
  fileExplorerContent,
  terminalContent,
  fileExplorerOpen,
  terminalOpen,
  onFileExplorerOpenChange,
  onTerminalOpenChange,
  isMobile = false,
}: IdeLayoutProps) {
  const filePanelRef = useRef<ImperativePanelHandle>(null);
  const terminalPanelRef = useRef<ImperativePanelHandle>(null);

  // Track whether panels are collapsed internally (for content rendering)
  const [filePanelCollapsed, setFilePanelCollapsed] = useState(!fileExplorerOpen);
  const [terminalPanelMinimized, setTerminalPanelMinimized] = useState(!terminalOpen);

  // Sync file explorer panel with state
  useEffect(() => {
    const panel = filePanelRef.current;
    if (!panel) return;

    if (fileExplorerOpen) {
      if (panel.isCollapsed()) {
        panel.expand();
      }
    } else {
      if (!panel.isCollapsed()) {
        panel.collapse();
      }
    }
  }, [fileExplorerOpen]);

  // Sync terminal panel with state
  useEffect(() => {
    const panel = terminalPanelRef.current;
    if (!panel) return;

    if (terminalOpen) {
      if (panel.isCollapsed()) {
        panel.expand();
      }
    } else {
      if (!panel.isCollapsed()) {
        panel.collapse();
      }
    }
  }, [terminalOpen]);

  const handleFileCollapse = useCallback(() => {
    setFilePanelCollapsed(true);
    onFileExplorerOpenChange(false);
  }, [onFileExplorerOpenChange]);

  const handleFileExpand = useCallback(() => {
    setFilePanelCollapsed(false);
    onFileExplorerOpenChange(true);
  }, [onFileExplorerOpenChange]);

  const handleTerminalCollapse = useCallback(() => {
    setTerminalPanelMinimized(true);
    onTerminalOpenChange(false);
  }, [onTerminalOpenChange]);

  const handleTerminalExpand = useCallback(() => {
    setTerminalPanelMinimized(false);
    onTerminalOpenChange(true);
  }, [onTerminalOpenChange]);

  // On mobile: no file explorer panel, just chat + terminal
  if (isMobile) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <ResizablePanelGroup direction="vertical" className="h-full flex-1">
          <ResizablePanel
            defaultSize={terminalOpen ? 72 : 100}
            minSize={30}
            order={1}
          >
            {children}
          </ResizablePanel>
          <ResizableHandle className="h-px bg-border hover:bg-green-500/30 transition-colors" />
          <ResizablePanel
            ref={terminalPanelRef}
            collapsible
            collapsedSize={6}
            defaultSize={terminalOpen ? 28 : 6}
            minSize={8}
            maxSize={55}
            order={2}
            onCollapse={handleTerminalCollapse}
            onExpand={handleTerminalExpand}
          >
            {terminalContent}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    );
  }

  // Desktop: file explorer | chat + terminal
  return (
    <div className="flex h-full overflow-hidden">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* File Explorer Panel */}
        <ResizablePanel
          ref={filePanelRef}
          collapsible
          collapsedSize={0}
          defaultSize={fileExplorerOpen ? 18 : 0}
          minSize={12}
          maxSize={30}
          order={1}
          onCollapse={handleFileCollapse}
          onExpand={handleFileExpand}
        >
          {fileExplorerContent}
        </ResizablePanel>
        <ResizableHandle className="w-px bg-border/60 hover:bg-primary/30 transition-colors data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full" />

        {/* Main Content: Chat + Terminal */}
        <ResizablePanel
          defaultSize={fileExplorerOpen ? 82 : 100}
          minSize={40}
          order={2}
        >
          <ResizablePanelGroup direction="vertical" className="h-full">
            {/* Chat Area */}
            <ResizablePanel
              defaultSize={terminalOpen ? 68 : 100}
              minSize={25}
              order={1}
            >
              {children}
            </ResizablePanel>

            {/* Terminal */}
            <ResizableHandle className="h-px bg-border/60 hover:bg-green-500/30 transition-colors" />
            <ResizablePanel
              ref={terminalPanelRef}
              collapsible
              collapsedSize={6}
              defaultSize={terminalOpen ? 32 : 6}
              minSize={8}
              maxSize={55}
              order={2}
              onCollapse={handleTerminalCollapse}
              onExpand={handleTerminalExpand}
            >
              {terminalContent}
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
