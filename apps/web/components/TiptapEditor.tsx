"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";

interface TiptapEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
}

export default function TiptapEditor({
  content,
  onChange,
  placeholder = "Start writing…",
  editable = true,
}: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
    ],
    content,
    editable,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
  });

  // Sync content when prop changes externally (e.g. revert)
  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  // Sync editable prop
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editable, editor]);

  return (
    <div className="tiptap-editor border border-gray-300 rounded-lg overflow-hidden">
      {editable && (
        <div className="flex gap-1 px-2 py-1 border-b border-gray-200 bg-gray-50 flex-wrap">
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleBold().run()}
            className={`px-2 py-1 text-sm rounded hover:bg-gray-200 font-bold ${editor?.isActive("bold") ? "bg-gray-200" : ""}`}
          >
            B
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            className={`px-2 py-1 text-sm rounded hover:bg-gray-200 italic ${editor?.isActive("italic") ? "bg-gray-200" : ""}`}
          >
            I
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            className={`px-2 py-1 text-sm rounded hover:bg-gray-200 ${editor?.isActive("bulletList") ? "bg-gray-200" : ""}`}
          >
            • List
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            className={`px-2 py-1 text-sm rounded hover:bg-gray-200 ${editor?.isActive("orderedList") ? "bg-gray-200" : ""}`}
          >
            1. List
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`px-2 py-1 text-sm rounded hover:bg-gray-200 ${editor?.isActive("heading", { level: 2 }) ? "bg-gray-200" : ""}`}
          >
            H2
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`px-2 py-1 text-sm rounded hover:bg-gray-200 ${editor?.isActive("heading", { level: 3 }) ? "bg-gray-200" : ""}`}
          >
            H3
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            className={`px-2 py-1 text-sm rounded hover:bg-gray-200 ${editor?.isActive("blockquote") ? "bg-gray-200" : ""}`}
          >
            &ldquo;&rdquo;
          </button>
        </div>
      )}
      <EditorContent
        editor={editor}
        className="prose max-w-none p-3 min-h-[120px] text-sm focus-within:outline-none"
      />
    </div>
  );
}
