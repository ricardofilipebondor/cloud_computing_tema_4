export type Task = {
  id: string;
  title: string;
  completed: boolean;
  processed: boolean;
  summary: string | null;
  fileUrl: string | null;
  createdAt: string;
};
