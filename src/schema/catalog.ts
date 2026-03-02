import schemaPack from "./docs/schemaPack.json" with { type: "json" };
import type { SchemaDoc, SchemaSnippet } from "../types.js";

interface SchemaPack {
  docs: SchemaDoc[];
  snippets: SchemaSnippet[];
}

const PACK = schemaPack as SchemaPack;

function contains(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function listSchemaIndex(): {
  docs: Array<Pick<SchemaDoc, "id" | "title" | "tags">>;
  snippets: Array<Pick<SchemaSnippet, "id" | "title" | "tags">>;
} {
  return {
    docs: PACK.docs.map(({ id, title, tags }) => ({ id, title, tags })),
    snippets: PACK.snippets.map(({ id, title, tags }) => ({ id, title, tags }))
  };
}

export function readSchemaDoc(id: string): SchemaDoc | undefined {
  return PACK.docs.find((doc) => doc.id === id);
}

export function readSchemaSnippet(id: string): SchemaSnippet | undefined {
  return PACK.snippets.find((snippet) => snippet.id === id);
}

export function searchSchema(query: string, tags?: string[]): {
  docs: SchemaDoc[];
  snippets: SchemaSnippet[];
} {
  const needle = query.trim();
  const tagSet = new Set((tags ?? []).map((tag) => tag.toLowerCase()));

  const docs = PACK.docs.filter((doc) => {
    const textMatch =
      needle.length === 0 ||
      contains(doc.id, needle) ||
      contains(doc.title, needle) ||
      contains(doc.body, needle) ||
      doc.tags.some((tag) => contains(tag, needle));

    const tagMatch = tagSet.size === 0 || doc.tags.some((tag) => tagSet.has(tag.toLowerCase()));
    return textMatch && tagMatch;
  });

  const snippets = PACK.snippets.filter((snippet) => {
    const textMatch =
      needle.length === 0 ||
      contains(snippet.id, needle) ||
      contains(snippet.title, needle) ||
      contains(snippet.code, needle) ||
      snippet.tags.some((tag) => contains(tag, needle));
    const tagMatch = tagSet.size === 0 || snippet.tags.some((tag) => tagSet.has(tag.toLowerCase()));
    return textMatch && tagMatch;
  });

  return { docs, snippets };
}
