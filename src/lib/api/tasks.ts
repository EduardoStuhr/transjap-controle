import { createServerFn } from "@tanstack/react-start";
import {
  deleteStoreDocument,
  listStoreDocuments,
  upsertStoreDocument,
} from "@/lib/api/store-documents";
import type { TaskRecord } from "@/lib/task-types";

const TASKS_MODULE = "tasks";

export type StoredTaskKind = "task" | "request";

export type StoredTaskDocument = {
  kind: StoredTaskKind;
  task: TaskRecord;
};

export type TaskListResult = {
  tasks: TaskRecord[];
  pendingRequests: TaskRecord[];
};

function splitTaskDocuments(documents: StoredTaskDocument[]): TaskListResult {
  return documents.reduce<TaskListResult>(
    (state, document) => {
      if (document.kind === "request") {
        state.pendingRequests.push(document.task);
      } else {
        state.tasks.push(document.task);
      }
      return state;
    },
    { tasks: [], pendingRequests: [] },
  );
}

export const listTasks = createServerFn({ method: "GET" }).handler(async () => {
  const documents = await listStoreDocuments<StoredTaskDocument>(TASKS_MODULE);
  return splitTaskDocuments(documents);
});

export const createTaskDocument = createServerFn({ method: "POST" })
  .inputValidator((document: StoredTaskDocument) => document)
  .handler(async ({ data }) => upsertStoreDocument(TASKS_MODULE, data.task.id, data));

export const updateTaskDocument = createServerFn({ method: "POST" })
  .inputValidator((document: StoredTaskDocument) => document)
  .handler(async ({ data }) => upsertStoreDocument(TASKS_MODULE, data.task.id, data));

export const deleteTaskDocument = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data }) => deleteStoreDocument(TASKS_MODULE, data));
