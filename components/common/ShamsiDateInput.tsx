"use client";

import DatePicker, { DateObject } from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import gregorian from "react-date-object/calendars/gregorian";
import gregorian_en from "react-date-object/locales/gregorian_en";

interface ShamsiDateInputProps {
  value: string; // YYYY-MM-DD (Gregorian) for backend compatibility
  onChange: (value: string) => void;
  className?: string;
}

function toShamsiDateObject(value: string): DateObject | null {
  if (!value) return null;
  try {
    return new DateObject({
      date: value,
      format: "YYYY-MM-DD",
      calendar: gregorian,
      locale: gregorian_en,
    }).convert(persian, persian_fa);
  } catch {
    return null;
  }
}

export default function ShamsiDateInput({
  value,
  onChange,
  className = "",
}: ShamsiDateInputProps) {
  return (
    <DatePicker
      value={toShamsiDateObject(value)}
      onChange={(date) => {
        if (!date) {
          onChange("");
          return;
        }
        const d = Array.isArray(date) ? date[0] : date;
        if (!(d instanceof DateObject)) {
          onChange("");
          return;
        }
        // Convert selected Jalali date back to Gregorian YYYY-MM-DD for APIs.
        const g = d.convert(gregorian, gregorian_en);
        onChange(g.format("YYYY-MM-DD"));
      }}
      calendar={persian}
      locale={persian_fa}
      calendarPosition="bottom-right"
      inputClass={`rounded-lg bg-[#1f1f1f] border border-gray-700 px-3 py-2 text-sm w-full ${className}`.trim()}
      format="YYYY/MM/DD"
    />
  );
}

