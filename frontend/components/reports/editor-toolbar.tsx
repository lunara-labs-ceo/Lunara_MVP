"use client";

import { useCallback } from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Highlighter,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link as LinkIcon,
  Unlink,
  Subscript,
  Superscript,
  Table as TableIcon,
  Palette,
  Undo2,
  Redo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EditorToolbarProps {
  editor: Editor | null;
}

interface ToolbarAction {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  action: (editor: Editor) => void;
  isActive?: (editor: Editor) => boolean;
  isDisabled?: (editor: Editor) => boolean;
}

const TOOLBAR_GROUPS: ToolbarAction[][] = [
  // Inline formatting
  [
    {
      icon: Bold,
      label: "Bold",
      action: (e) => e.chain().focus().toggleBold().run(),
      isActive: (e) => e.isActive("bold"),
    },
    {
      icon: Italic,
      label: "Italic",
      action: (e) => e.chain().focus().toggleItalic().run(),
      isActive: (e) => e.isActive("italic"),
    },
    {
      icon: UnderlineIcon,
      label: "Underline",
      action: (e) => e.chain().focus().toggleUnderline().run(),
      isActive: (e) => e.isActive("underline"),
    },
    {
      icon: Strikethrough,
      label: "Strikethrough",
      action: (e) => e.chain().focus().toggleStrike().run(),
      isActive: (e) => e.isActive("strike"),
    },
    {
      icon: Code,
      label: "Inline Code",
      action: (e) => e.chain().focus().toggleCode().run(),
      isActive: (e) => e.isActive("code"),
    },
    {
      icon: Highlighter,
      label: "Highlight",
      action: (e) => e.chain().focus().toggleHighlight().run(),
      isActive: (e) => e.isActive("highlight"),
    },
  ],
  // Headings
  [
    {
      icon: Heading1,
      label: "Heading 1",
      action: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: (e) => e.isActive("heading", { level: 1 }),
    },
    {
      icon: Heading2,
      label: "Heading 2",
      action: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: (e) => e.isActive("heading", { level: 2 }),
    },
    {
      icon: Heading3,
      label: "Heading 3",
      action: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
      isActive: (e) => e.isActive("heading", { level: 3 }),
    },
  ],
  // Lists & blockquote & hr
  [
    {
      icon: List,
      label: "Bullet List",
      action: (e) => e.chain().focus().toggleBulletList().run(),
      isActive: (e) => e.isActive("bulletList"),
    },
    {
      icon: ListOrdered,
      label: "Ordered List",
      action: (e) => e.chain().focus().toggleOrderedList().run(),
      isActive: (e) => e.isActive("orderedList"),
    },
    {
      icon: Quote,
      label: "Blockquote",
      action: (e) => e.chain().focus().toggleBlockquote().run(),
      isActive: (e) => e.isActive("blockquote"),
    },
    {
      icon: Minus,
      label: "Horizontal Rule",
      action: (e) => e.chain().focus().setHorizontalRule().run(),
    },
  ],
  // Text alignment
  [
    {
      icon: AlignLeft,
      label: "Align Left",
      action: (e) => e.chain().focus().setTextAlign("left").run(),
      isActive: (e) => e.isActive({ textAlign: "left" }),
    },
    {
      icon: AlignCenter,
      label: "Align Center",
      action: (e) => e.chain().focus().setTextAlign("center").run(),
      isActive: (e) => e.isActive({ textAlign: "center" }),
    },
    {
      icon: AlignRight,
      label: "Align Right",
      action: (e) => e.chain().focus().setTextAlign("right").run(),
      isActive: (e) => e.isActive({ textAlign: "right" }),
    },
    {
      icon: AlignJustify,
      label: "Justify",
      action: (e) => e.chain().focus().setTextAlign("justify").run(),
      isActive: (e) => e.isActive({ textAlign: "justify" }),
    },
  ],
  // Sub/superscript
  [
    {
      icon: Subscript,
      label: "Subscript",
      action: (e) => e.chain().focus().toggleSubscript().run(),
      isActive: (e) => e.isActive("subscript"),
    },
    {
      icon: Superscript,
      label: "Superscript",
      action: (e) => e.chain().focus().toggleSuperscript().run(),
      isActive: (e) => e.isActive("superscript"),
    },
  ],
  // History
  [
    {
      icon: Undo2,
      label: "Undo",
      action: (e) => e.chain().focus().undo().run(),
      isDisabled: (e) => !e.can().undo(),
    },
    {
      icon: Redo2,
      label: "Redo",
      action: (e) => e.chain().focus().redo().run(),
      isDisabled: (e) => !e.can().redo(),
    },
  ],
];

export function EditorToolbar({ editor }: EditorToolbarProps) {
  if (!editor) return null;

  const handleSetLink = useCallback(() => {
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("Enter URL:", previousUrl || "https://");
    if (url === null) return; // cancelled
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
  }, [editor]);

  const handleInsertTable = useCallback(() => {
    editor
      .chain()
      .focus()
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      .run();
  }, [editor]);

  return (
    <div className="flex items-center justify-center gap-0.5 overflow-x-auto">
      {TOOLBAR_GROUPS.map((group, gi) => (
        <div key={gi} className="flex items-center gap-0.5">
          {gi > 0 && <div className="mx-1 h-4 w-px bg-border" />}
          {group.map((item) => {
            const active = item.isActive?.(editor) ?? false;
            const disabled = item.isDisabled?.(editor) ?? false;
            return (
              <Button
                key={item.label}
                variant="ghost"
                size="sm"
                onClick={() => item.action(editor)}
                disabled={disabled}
                className={cn(
                  "h-7 w-7 p-0",
                  active && "bg-accent text-accent-foreground"
                )}
                title={item.label}
              >
                <item.icon className="size-3.5" />
                <span className="sr-only">{item.label}</span>
              </Button>
            );
          })}
        </div>
      ))}

      {/* Link & Table — need special handlers */}
      <div className="mx-1 h-4 w-px bg-border" />
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSetLink}
        className={cn(
          "h-7 w-7 p-0",
          editor.isActive("link") && "bg-accent text-accent-foreground"
        )}
        title="Add Link"
      >
        <LinkIcon className="size-3.5" />
        <span className="sr-only">Add Link</span>
      </Button>
      {editor.isActive("link") && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().unsetLink().run()}
          className="h-7 w-7 p-0"
          title="Remove Link"
        >
          <Unlink className="size-3.5" />
          <span className="sr-only">Remove Link</span>
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleInsertTable}
        className="h-7 w-7 p-0"
        title="Insert Table"
      >
        <TableIcon className="size-3.5" />
        <span className="sr-only">Insert Table</span>
      </Button>
    </div>
  );
}
