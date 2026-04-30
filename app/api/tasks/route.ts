import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSignedBlobUrl,
  sendTaskToQueue,
  uploadTaskFile
} from "@/lib/azure-storage";
import { trackEvent, trackException } from "@/lib/application-insights";

export const runtime = "nodejs";

export async function GET() {
  try {
    const tasks = await prisma.task.findMany({
      orderBy: { createdAt: "desc" }
    });
    const tasksWithSignedUrls = await Promise.all(
      tasks.map(async (task) => ({
        ...task,
        fileUrl: task.fileUrl ? await getSignedBlobUrl(task.fileUrl) : null
      }))
    );

    trackEvent("TasksListed", { taskCount: String(tasks.length) });
    return NextResponse.json(tasksWithSignedUrls);
  } catch (error) {
    trackException(error, { route: "GET /api/tasks" });
    console.error("GET /api/tasks failed:", error);
    return NextResponse.json({ error: "Failed to load tasks" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const title = String(formData.get("title") ?? "").trim();
    const file = formData.get("file");

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    let fileUrl: string | undefined;
    if (file instanceof File && file.size > 0) {
      fileUrl = await uploadTaskFile(file);
    }

    const task = await prisma.task.create({
      data: {
        title,
        fileUrl
      }
    });

    await sendTaskToQueue({ taskId: task.id, title: task.title });
    trackEvent("TaskQueued", {
      taskId: task.id,
      hasAttachment: task.fileUrl ? "true" : "false"
    });

    const createdTask = {
      ...task,
      fileUrl: task.fileUrl ? await getSignedBlobUrl(task.fileUrl) : null
    };

    return NextResponse.json(createdTask, { status: 201 });
  } catch (error) {
    trackException(error, { route: "POST /api/tasks" });
    console.error("POST /api/tasks failed:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
