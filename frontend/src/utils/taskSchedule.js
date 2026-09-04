export const scheduleTypes = [
  { value: "once", label: "Once" },
  { value: "recurring", label: "Recurring" },
];

export const frequencyOptions = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export const frequencyLabels = { once: "Once", daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

const pad = (n) => String(n).padStart(2, "0");

export function defaultNextRun() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateTime(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}