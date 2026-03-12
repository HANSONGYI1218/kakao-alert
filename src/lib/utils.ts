import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function extractTime(str: string): number {
  if (typeof str !== "string") return 0;
  // '2025-06-03 오전 11:30' → '오전 11:30'
  const timePart = str.split(" ")[1] + " " + str.split(" ")[2]; // '오전 11:30'

  const [ampm, hm] = timePart.split(" ");
  // eslint-disable-next-line prefer-const
  let [h, m] = hm.split(":").map(Number);

  if (ampm === "오후" && h < 12) h += 12;
  if (ampm === "오전" && h === 12) h = 0;

  return h * 60 + m; // 분 단위로 변환
}

export const downloadExcel = (data: any[], originalFilename: string) => {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

  // 원래 파일명에서 확장자 제거하고 '_final.xlsx' 추가
  const baseName = originalFilename.replace(/\.[^/.]+$/, "");
  const finalFileName = `${baseName}_final${generate4DigitCode()}.xlsx`;

  const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([excelBuffer], { type: "application/octet-stream" });

  saveAs(blob, finalFileName);
};

export function generate4DigitCode(): string {
  const code = Math.floor(Math.random() * 10000); // 0~9999
  return code.toString().padStart(4, "0");
}

export function excelDateToJSDate(serial: number) {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date = new Date(utc_value * 1000);

  const fractional_day = serial - Math.floor(serial);
  const total_seconds = Math.floor(86400 * fractional_day);

  const seconds = total_seconds % 60;
  const hours = Math.floor(total_seconds / 3600);
  const minutes = Math.floor(total_seconds / 60) % 60;

  date.setHours(hours);
  date.setMinutes(minutes);
  date.setSeconds(seconds);

  return date;
}