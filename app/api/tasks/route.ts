import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSignedBlobUrl,
  sendTaskToQueue,
  uploadTaskFile
} from "@/lib/azure-storage";

export const runtime = "nodejs";

export async function GET() {
  const tasks = await prisma.task.findMany({
    orderBy: { createdAt: "desc" }
  });
  const tasksWithSignedUrls = await Promise.all(
    tasks.map(async (task) => ({
      ...task,
      fileUrl: task.fileUrl ? await getSignedBlobUrl(task.fileUrl) : null
    }))
  );
  return NextResponse.json(tasksWithSignedUrls);
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

    const createdTask = {
      ...task,
      fileUrl: task.fileUrl ? await getSignedBlobUrl(task.fileUrl) : null
    };

    return NextResponse.json(createdTask, { status: 201 });
  } catch (error) {
    console.error("POST /api/tasks failed:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
