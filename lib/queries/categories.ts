import "server-only";
import { cache } from "react";
import { prisma } from "../prisma";
import { DEMO, demoCategories } from "../demo";

export type CategoryLite = {
  id: string;
  name: string;
  color: string;
  defaultDurationMinutes: number;
};

/** Lista de categorii a userului (select minimal). Cache per-request. */
export const listCategories = cache(
  async (userId: string): Promise<CategoryLite[]> => {
    if (DEMO) return demoCategories;
    return prisma.category.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        color: true,
        defaultDurationMinutes: true,
      },
      orderBy: { name: "asc" },
    });
  },
);

export const getCategory = cache(
  async (userId: string, id: string): Promise<CategoryLite | null> => {
    if (DEMO) return demoCategories.find((c) => c.id === id) ?? null;
    return prisma.category.findFirst({
      where: { id, userId },
      select: {
        id: true,
        name: true,
        color: true,
        defaultDurationMinutes: true,
      },
    });
  },
);

/** Seedează câteva categorii utile la prima utilizare (o singură dată). */
export async function ensureDefaultCategories(userId: string): Promise<void> {
  const count = await prisma.category.count({ where: { userId } });
  if (count > 0) return;
  await prisma.category.createMany({
    data: [
      { userId, name: "Consultație", color: "#6366f1", defaultDurationMinutes: 30 },
      { userId, name: "Tuns", color: "#10b981", defaultDurationMinutes: 45 },
      { userId, name: "Vopsit", color: "#f59e0b", defaultDurationMinutes: 90 },
    ],
  });
}
