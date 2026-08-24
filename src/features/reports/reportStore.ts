import { create } from "zustand";
import { reportRepository, type SavedReportRecord } from "../../data/repositories/reportRepository";

export type ReportPeriod = "day" | "week" | "month";

export type SavedReport = {
  id: string;
  period: ReportPeriod;
  periodLabel: string;
  anchorDate: string;
  html: string;
  savedAt: string;
  options?: Record<string, boolean>;
};

function dateKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function label(period: ReportPeriod, timestamp: number) {
  return new Intl.DateTimeFormat(undefined, period === "month" ? { month: "long", year: "numeric" } : { month: "short", day: "numeric", year: "numeric" }).format(new Date(timestamp));
}

function fromRecord(report: SavedReportRecord): SavedReport {
  return {
    id: report.id,
    period: report.period_type,
    periodLabel: label(report.period_type, report.period_start),
    anchorDate: dateKey(report.period_start),
    html: report.content,
    savedAt: new Date(report.created_at).toISOString(),
    options: JSON.parse(report.options_json) as Record<string, boolean>,
  };
}

function bounds(report: SavedReport) {
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
    const period = bounds(report);
    await reportRepository.save({
      id: report.id,
      periodType: report.period,
      periodStart: period.start,
      periodEnd: period.end,
      options: report.options ?? {},
      content: report.html,
    });
    await get().load();
  },
  deleteReport: async (id) => {
    await reportRepository.delete(id);
    set((state) => ({ reports: state.reports.filter((report) => report.id !== id) }));
  },
}));
