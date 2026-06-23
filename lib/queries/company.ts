import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "../prisma";
import { DEMO } from "../demo";

export type Company = {
  companyName: string;
  logo: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxId: string | null;
  vatNumber: string | null;
  bankDetails: string | null;
  currency: string;
  invoicePrefix: string;
};

const DEFAULTS: Company = {
  companyName: "",
  logo: null,
  phone: null,
  email: null,
  address: null,
  taxId: null,
  vatNumber: null,
  bankDetails: null,
  currency: "MDL",
  invoicePrefix: "INV",
};

const SELECT = {
  companyName: true,
  logo: true,
  phone: true,
  email: true,
  address: true,
  taxId: true,
  vatNumber: true,
  bankDetails: true,
  currency: true,
  invoicePrefix: true,
} as const;

/** Datele companiei (singleton). Cache cross-request. */
export const getCompanySettings = unstable_cache(
  async (): Promise<Company> => {
    if (DEMO) return { ...DEFAULTS, companyName: "Compania Demo SRL" };
    const row = await prisma.companySettings.findUnique({
      where: { singleton: "main" },
      select: SELECT,
    });
    return row ?? DEFAULTS;
  },
  ["company-settings"],
  { tags: ["company"], revalidate: 600 },
);
