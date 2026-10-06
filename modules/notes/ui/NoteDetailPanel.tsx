import type { JSX } from "react";
import type { DetailPanelProps } from "@magnis/host/base";
import { NoteDetail } from "./NoteDetail";

export function NoteDetailPanel({ entityId }: DetailPanelProps): JSX.Element {
  return <NoteDetail noteId={entityId} />;
}
