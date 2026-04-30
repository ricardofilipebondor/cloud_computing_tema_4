import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { trackEvent, trackException } from "@/lib/application-insights";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const completed = Boolean(body?.completed);

    const task = await prisma.task.update({
      where: { id },
      data: { completed }
    });

    trackEvent("TaskUpdated", {
      taskId: id,
      completed: completed ? "true" : "false"
    });
    return NextResponse.json(task);
  } catch (error) {
    trackException(error, { route: "PATCH /api/tasks/:id" });
    console.error("PATCH /api/tasks/:id failed:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.task.delete({ where: { id } });
    trackEvent("TaskDeleted", { taskId: id });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    trackException(error, { route: "DELETE /api/tasks/:id" });
    console.error("DELETE /api/tasks/:id failed:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
