import { create } from "zustand";
import { reportRepository, type SavedReportRecord } from "../../data/repositories/reportRepository";

export type ReportPeriod = "day" | "week" | "month";

type DateReportScope = { period: ReportPeriod; anchorDate: string; options?: Record<string, boolean> };
type TicketReportScope = { period: "ticket"; ticketNumber: string };

export type SavedReport = (DateReportScope | TicketReportScope) & {
  id: string;
  periodLabel: string;
  html: string;
  savedAt: string;
};

function dateKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function label(period: ReportPeriod, timestamp: number) {
  return new Intl.DateTimeFormat(undefined, period === "month" ? { month: "long", year: "numeric" } : { month: "short", day: "numeric", year: "numeric" }).format(new Date(timestamp));
}

function fromRecord(report: SavedReportRecord): SavedReport {
  const snapshot = {
    id: report.id,
    html: report.content,
    savedAt: new Date(report.created_at).toISOString(),
  };
  if (report.period_type === "ticket") {
    return { ...snapshot, period: "ticket", ticketNumber: report.ticket_number, periodLabel: report.ticket_number };
  }
  return {
    ...snapshot,
    period: report.period_type,
    periodLabel: label(report.period_type, report.period_start),
    anchorDate: dateKey(report.period_start),
    options: JSON.parse(report.options_json) as Record<string, boolean>,
  };
}

function bounds(report: DateReportScope) {
  const [year, month, day] = report.anchorDate.split("-").map(Number);
  const start = report.period === "month" ? new Date(year, month - 1, 1) : new Date(year, month - 1, day);
  const end = new Date(start);
  if (report.period === "month") end.setMonth(end.getMonth() + 1);
  else end.setDate(end.getDate() + (report.period === "week" ? 7 : 1));
  return { start: start.getTime(), end: end.getTime() };
}

type ReportStore = {
  reports: SavedReport[];
  loaded: boolean;
  load: () => Promise<void>;
  saveReport: (report: SavedReport) => Promise<void>;
  deleteReport: (id: string) => Promise<void>;
};

export const useReportStore = create<ReportStore>((set, get) => ({
  reports: [],
  loaded: false,
  load: async () => set({ reports: (await reportRepository.list()).map(fromRecord), loaded: true }),
  saveReport: async (report) => {
    const snapshot = { id: report.id, content: report.html };
    if (report.period === "ticket") {
      await reportRepository.save({
        ...snapshot,
        scope: { period_type: "ticket", period_start: null, period_end: null, ticket_number: report.ticketNumber },
        options: {},
      });
    } else {
      const dates = bounds(report);
      await reportRepository.save({
        ...snapshot,
        scope: { period_type: report.period, period_start: dates.start, period_end: dates.end, ticket_number: null },
        options: report.options ?? {},
      });
    }
    await get().load();
  },
  deleteReport: async (id) => {
    await reportRepository.delete(id);
    set((state) => ({ reports: state.reports.filter((report) => report.id !== id) }));
  },
}));
