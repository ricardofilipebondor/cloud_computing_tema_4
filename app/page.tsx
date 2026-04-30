"use client";

import { FormEvent, useEffect, useState } from "react";
import { Task } from "@/types/task";

const TRANSLATION_LANGUAGES = [
  { code: "ro", label: "Romanian" },
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" }
];

type TaskTranslation = {
  title?: string;
  summary?: string;
};

export default function HomePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState("ro");
  const [translationsByTaskId, setTranslationsByTaskId] = useState<Record<string, TaskTranslation>>({});
  const [translatingTaskId, setTranslatingTaskId] = useState<string | null>(null);

  async function fetchTasks() {
    const response = await fetch("/api/tasks");
    const data = (await response.json()) as Task[];
    setTasks(data);
  }

  useEffect(() => {
    void fetchTasks();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;

    const formData = new FormData();
    formData.append("title", title);
    if (file) formData.append("file", file);

    setLoading(true);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        body: formData
      });
      if (!response.ok) throw new Error("Could not create task");
      setTitle("");
      setFile(null);
      await fetchTasks();
    } finally {
      setLoading(false);
    }
  }

  async function toggleTask(task: Task) {
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !task.completed })
    });
    await fetchTasks();
  }

  async function deleteTask(id: string) {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    await fetchTasks();
  }

  async function translateTask(task: Task) {
    const fieldsToTranslate: Array<{ key: "title" | "summary"; value: string }> = [
      { key: "title", value: task.title }
    ];
    if (task.summary?.trim()) {
      fieldsToTranslate.push({ key: "summary", value: task.summary });
    }

    setTranslatingTaskId(task.id);

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: targetLanguage,
          texts: fieldsToTranslate.map((field) => field.value)
        })
      });

      if (!response.ok) {
        throw new Error("Could not translate task");
      }

      const data = (await response.json()) as { translations?: string[] };
      const translatedByKey = fieldsToTranslate.reduce<TaskTranslation>((accumulator, field, index) => {
        const translatedValue = data.translations?.[index];
        if (translatedValue) {
          accumulator[field.key] = translatedValue;
        }
        return accumulator;
      }, {});

      setTranslationsByTaskId((current) => ({
        ...current,
        [task.id]: translatedByKey
      }));
    } finally {
      setTranslatingTaskId(null);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Azure SaaS Task Manager</h1>

      <form onSubmit={onSubmit} className="mb-8 rounded-lg bg-white p-4 shadow">
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium">Task title</label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
            placeholder="Create onboarding document"
            suppressHydrationWarning
          />
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium">Attach file (optional)</label>
          <input
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="w-full rounded border border-slate-300 px-3 py-2"
            suppressHydrationWarning
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          suppressHydrationWarning
        >
          {loading ? "Creating..." : "Create task"}
        </button>
      </form>

      <section className="rounded-lg bg-white p-4 shadow">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Tasks</h2>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Translate to</label>
            <select
              value={targetLanguage}
              onChange={(event) => setTargetLanguage(event.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
              suppressHydrationWarning
            >
              {TRANSLATION_LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <ul className="space-y-3">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center justify-between rounded border border-slate-200 p-3"
            >
              <div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => void toggleTask(task)}
                  />
                  <p className={task.completed ? "line-through text-slate-500" : ""}>
                    {translationsByTaskId[task.id]?.title ?? task.title}
                  </p>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Queue processed: {task.processed ? "yes" : "pending"}
                </p>
                {task.summary ? (
                  <p className="mt-1 text-sm text-slate-700">
                    Summary: {translationsByTaskId[task.id]?.summary ?? task.summary}
                  </p>
                ) : null}
                {task.fileUrl ? (
                  <a
                    href={task.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-blue-600 underline"
                  >
                    Open attachment
                  </a>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => void translateTask(task)}
                  disabled={translatingTaskId === task.id}
                  className="rounded bg-indigo-600 px-3 py-1 text-sm text-white disabled:opacity-50"
                >
                  {translatingTaskId === task.id ? "Translating..." : "Translate"}
                </button>
                <button
                  onClick={() => void deleteTask(task.id)}
                  className="rounded bg-red-600 px-3 py-1 text-sm text-white"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {tasks.length === 0 ? <p className="text-slate-500">No tasks yet.</p> : null}
        </ul>
      </section>
    </main>
  );
}
