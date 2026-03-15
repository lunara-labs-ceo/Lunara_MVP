"use client";

import { useEffect, useImperativeHandle, forwardRef, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Image } from "@tiptap/extension-image";
import { Underline } from "@tiptap/extension-underline";
import { TextAlign } from "@tiptap/extension-text-align";
import { Highlight } from "@tiptap/extension-highlight";
import { Link } from "@tiptap/extension-link";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import type { Editor } from "@tiptap/react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TiptapEditorHandle {
  editor: Editor | null;
}

interface TiptapEditorProps {
  content: string;
  isGenerating: boolean;
  onUpdate: (html: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TiptapEditor = forwardRef<TiptapEditorHandle, TiptapEditorProps>(
  function TiptapEditor({ content, isGenerating, onUpdate }, ref) {
    // Track whether a content change originated from the editor itself
    const isLocalUpdate = useRef(false);

    const editor = useEditor({
      immediatelyRender: false,
      extensions: [
        StarterKit,
        Image.configure({
          inline: false,
          allowBase64: true,
        }),
        Underline,
        TextAlign.configure({
          types: ["heading", "paragraph"],
        }),
        Highlight.configure({
          multicolor: false,
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: "text-primary underline cursor-pointer",
          },
        }),
        Subscript,
        Superscript,
        Table.configure({
          resizable: true,
        }),
        TableRow,
        TableCell,
        TableHeader,
        TextStyle,
        Color,
      ],
      content,
      editable: !isGenerating,
      editorProps: {
        attributes: {
          class: "tiptap focus:outline-none min-h-[200px]",
        },
      },
      onUpdate: ({ editor: e }) => {
        isLocalUpdate.current = true;
        onUpdate(e.getHTML());
      },
    });

    // Expose editor instance for parent access (future: surgical AI editing)
    useImperativeHandle(ref, () => ({ editor }), [editor]);

    // Toggle editability when generation state changes
    useEffect(() => {
      if (editor) {
        editor.setEditable(!isGenerating);
      }
    }, [editor, isGenerating]);

    // Load new content only when it comes from outside
    useEffect(() => {
      if (!editor || !content) return;

      if (isLocalUpdate.current) {
        isLocalUpdate.current = false;
        return;
      }

      editor.commands.setContent(content);
    }, [content, editor]);

    return <EditorContent editor={editor} />;
  }
);
