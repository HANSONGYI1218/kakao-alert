"use client";

import * as XLSX from "xlsx";
import { useEffect, useRef } from "react";
import { downloadExcel, extractTime } from "@/lib/utils";
import * as iconv from "iconv-lite";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { format, parse } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { ko } from "date-fns/locale";

const DataProcessSchema = z.object({
  excelFile: z.instanceof(File),
});

type RowData = Record<string, any>;

export default function DataProcessContainer() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const form = useForm<z.infer<typeof DataProcessSchema>>({
    resolver: zodResolver(DataProcessSchema),
    defaultValues: {
      excelFile: undefined,
    },
  });

  function onSubmit() {
    const file = form.getValues("excelFile");
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isCsv = fileName.endsWith(".csv");

    const reader = new FileReader();

    if (isCsv) {
      console.log("isCsv", isCsv);
      reader.onload = (evt) => {
        const arrayBuffer = evt.target?.result as ArrayBuffer;
        const buffer = Buffer.from(arrayBuffer); // Node 환경 아니어도 Uint8Array로 가능

        // CP949 → UTF-8 변환
        const utf8String = iconv.decode(buffer, "cp949");

        console.log("utf8String 예시:", utf8String.slice(0, 200));

        // 이제 XLSX 라이브러리로 CSV 읽기
        const workbook = XLSX.read(utf8String, {
          type: "string",
          raw: false,
        });

        // XLSX 변환 버퍼 생성
        const xlsxBuffer = XLSX.write(workbook, {
          type: "array",
          bookType: "xlsx",
        });

        processWorkbook(xlsxBuffer);
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (evt) => {
        const buffer = new Uint8Array(evt.target?.result as ArrayBuffer);
        processWorkbook(buffer);
      };
      reader.readAsArrayBuffer(file);
    }

    function processWorkbook(data: Uint8Array | ArrayBuffer) {
      const workbook = XLSX.read(data, { type: "array", codepage: 65001 });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json: RowData[] = XLSX.utils.sheet_to_json(worksheet);
      console.log("예취 삭제");
      // 1단계: 예취 삭제
      const filtered = json.filter((row) => (row["환자명"] ?? "").trim() !== "예취");

      console.log("보호자ID + 환자명 기준으로 빠른 시간만 남기기");
      // 2단계: 보호자ID + 환자명 기준으로 빠른 시간만 남기기
      const grouped = new Map<string, any>();

      filtered.forEach((row: any) => {
        const key = `${row["보호자ID"]}_${row["환자명"]}`;
        const time = extractTime(row["시작일"]);

        if (!grouped.has(key)) {
          grouped.set(key, row);
        } else {
          const existing = grouped.get(key)!;
          const existingTime = extractTime(existing["시작일"]);
          if (time < existingTime) grouped.set(key, row);
        }
      });

      console.log("보호자ID별로 환자명 묶기");
      // 2-1. 보호자ID별로 환자명 묶기
      const guardianIDMap = new Map<string, any[]>();

      for (const row of grouped.values()) {
        const id = row["보호자ID"];
        if (!guardianIDMap.has(id)) {
          guardianIDMap.set(id, [row]);
        } else {
          guardianIDMap.get(id)!.push(row);
        }
      }
      console.log(" 2-2. 보호자ID별로 빠른 시간 하나만 남기고, 환자명 합치기");
      // 2-2. 보호자ID별로 빠른 시간 하나만 남기고, 환자명 합치기
      const finalRows: any[] = [];

      guardianIDMap.forEach((rows) => {
        if (rows.length === 1) {
          finalRows.push(rows[0]);
        } else {
          // 여러 명일 경우 → 가장 빠른 시간 찾기
          const sorted = rows.sort((a, b) => extractTime(a["시작일"]) - extractTime(b["시작일"]));
          const mainRow = sorted[0];

          const allNames = rows.map((r) => r["환자명"]);
          mainRow["환자명"] = allNames.join(", ");

          finalRows.push(mainRow);
        }
      });

      const updatedRows = finalRows.map((row: any) => {
        const memo = row["예약메모"] ?? "";
        const pattern = /\*\s*\d+[^\s]*/;
        
        const 추정시간 = pattern.test(memo) ? memo : "";

        return {
          ...row,
          추정시간,
        };
      });
      console.log("3단계: 환자명, 핸드폰, 시작일만 남김");
      // 3단계: 환자명, 핸대폰, 시작일만 남김
      const deletdRows = updatedRows.map((row) => {
        delete row["보호자명"];
        delete row["종"];
        delete row["품종"];
        delete row["종료일"];
        delete row["전화번호"];
        delete row["예약목적"];
        delete row["예약메모"];
        delete row["종료일"];
        delete row["보호자ID"];
        delete row["환자ID"];

        return row;
      });

      let newData = deletdRows.map((row) => {
        console.log(" 4단계: 핸드폰, 환자명, 날짜, 시작일 순으로 새롭게 열 추가");
        // 4단계: 핸드폰, 환자명, 날짜, 시작일 순으로 새롭게 열 추가
        const startDate: string = row["시작일"] ?? "";
        console.log("startDate:,", startDate);
        const parsedDate = parse(startDate, "yyyy-MM-dd a h:mm", new Date(), { locale: ko });
        if (isNaN(parsedDate.getTime())) {
          console.error("잘못된 날짜 포맷:", startDate);
        }

        const result = format(parsedDate, "M월 d일 (EEE)", { locale: ko }); // 이렇게 바로

        console.log("5단계: 시작일 시간만 남김, 환자명 기호 삭제");
        // 5단계: 시작일 시간만 남김
        const timeStr: string = row["시작일"]; // 예: '2025-05-06 오후 4시'
        const timeOnly = timeStr?.split(" ").slice(1).join(" ") || ""; // '오후 4시'
        // 5단계: 환자명 기호 삭제 + 괄호 안 내용 제거
        const cleanedName = (row["환자명"] ?? "")
          .replace(/\(.*?\)/g, "") // 괄호로 시작해서 닫히는 괄호까지 제거
          .replace(/[^\p{L}\p{N},\s]/gu, ""); // 그 외 기호 제거

        return {
          핸드폰: row["핸드폰"],
          환자명: cleanedName,
          날짜: result, // 새 열 추가
          시작일: timeOnly,
          추정시간: row["추정시간"],
        };
      });

      // ✅ 모든 행의 추정시간이 빈 문자열이면 열 제거
      const allEmpty = newData.every((row) => !row["추정시간"]);
      if (allEmpty) {
        newData = newData.map((row) => {
          delete row["추정시간"];
          return row;
        });
      }

      // ✅ "시작일" 시간 기준으로 오름차순 정렬
newData.sort((a, b) => {
  const parseKoreanTime = (timeStr: string) => {
    try {
      return parse(timeStr, "a h:mm", new Date(), { locale: ko }).getTime();
    } catch {
      return 0;
    }
  };

  const timeA = parseKoreanTime(a["시작일"] ?? "");
  const timeB = parseKoreanTime(b["시작일"] ?? "");

  return timeA - timeB;
});

      downloadExcel(newData, file.name);
    }
  }

  const excelFileWatch = useWatch({
    control: form.control,
    name: "excelFile",
  });

  useEffect(() => {
    onSubmit();
  }, [excelFileWatch, onSubmit]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex h-full w-full items-center">
        <FormField
          control={form.control}
          name="excelFile"
          render={({ field }) => (
            <FormItem>
              <div className="mx-auto flex w-1/2 items-center gap-6">
                <Input
                  className="h-16 flex-1 rounded-full bg-white px-6"
                  readOnly
                  value={field?.value?.name ?? ""}
                  placeholder="파일을 선택하세요."
                />
                <Button
                  type="button"
                  id="input"
                  onClick={() => {
                    form.reset();
                    if (inputRef.current) {
                      inputRef.current.value = ""; // 중요: 파일 input 초기화
                    }
                  }}
                  variant={"destructive"}
                  className="relative h-16 w-16"
                >
                  <Upload />
                  <label
                    htmlFor="excel"
                    className="absolute top-0 left-0 h-full w-full cursor-pointer rounded-full opacity-0"
                  >
                    업로드
                  </label>
                  <input
                    ref={inputRef}
                    type="file"
                    id="excel"
                    accept=".xlsx, .xls, .csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        field.onChange(file);
                      }
                    }}
                    className="hidden"
                  />
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* <pre className="mt-4 bg-gray-100 p-2 rounded">
        {JSON.stringify(data, null, 2)}
      </pre> */}
      </form>
    </Form>
  );
}
