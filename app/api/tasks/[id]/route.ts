import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

    return NextResponse.json(task);
  } catch (error) {
    console.error("PATCH /api/tasks/:id failed:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.task.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/tasks/:id failed:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
