"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

interface TestResult {
  name: string;
  status: "checking" | "success" | "error";
  message: string;
}

export default function TestConnectionPage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    runTests();
  }, []);

  const runTests = async () => {
    setLoading(true);
    const testResults: TestResult[] = [];

    // تست 1: بررسی Environment Variables
    testResults.push({
      name: "Environment Variables",
      status: "checking",
      message: "در حال بررسی...",
    });
    setResults([...testResults]);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key || url.includes("your_") || key.includes("your_")) {
      testResults[0] = {
        name: "Environment Variables",
        status: "error",
        message: "❌ متغیرهای محیطی تنظیم نشده‌اند!",
      };
      setResults([...testResults]);
      setLoading(false);
      return;
    }

    testResults[0] = {
      name: "Environment Variables",
      status: "success",
      message: "✅ متغیرهای محیطی موجود هستند",
    };
    setResults([...testResults]);

    // تست 2: بررسی Supabase Client
    testResults.push({
      name: "Supabase Client",
      status: "checking",
      message: "در حال بررسی...",
    });
    setResults([...testResults]);

    try {
      // تست ساده: گرفتن session
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        throw sessionError;
      }

      testResults[1] = {
        name: "Supabase Client",
        status: "success",
        message: "✅ کلاینت Supabase متصل است",
      };
      setResults([...testResults]);
    } catch (error: any) {
      testResults[1] = {
        name: "Supabase Client",
        status: "error",
        message: `❌ خطا: ${error.message}`,
      };
      setResults([...testResults]);
      setLoading(false);
      return;
    }

    // تست 3: بررسی Database Connection
    testResults.push({
      name: "Database Connection",
      status: "checking",
      message: "در حال بررسی...",
    });
    setResults([...testResults]);

    try {
      // تلاش برای خواندن از جدول rooms
      const { data, error } = await supabase
        .from("rooms")
        .select("id")
        .limit(1);

      if (error) {
        // اگر جدول وجود نداشته باشد، این خطا طبیعی است
        if (
          error.code === "PGRST116" ||
          error.message.includes("relation") ||
          error.message.includes("does not exist") ||
          error.message.includes("permission denied")
        ) {
          testResults[2] = {
            name: "Database Connection",
            status: "success",
            message: "✅ اتصال به دیتابیس برقرار است (جدول rooms ممکن است وجود نداشته باشد - این طبیعی است)",
          };
        } else {
          throw error;
        }
      } else {
        testResults[2] = {
          name: "Database Connection",
          status: "success",
          message: "✅ اتصال به دیتابیس برقرار است و جدول rooms موجود است",
        };
      }
      setResults([...testResults]);
    } catch (error: any) {
      testResults[2] = {
        name: "Database Connection",
        status: "error",
        message: `❌ خطا: ${error.message}`,
      };
      setResults([...testResults]);
    }

    setLoading(false);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">تست اتصال Supabase</h1>
        <p className="text-gray-600 mb-6">
          این صفحه اتصال به Supabase را بررسی می‌کند
        </p>

        {loading && (
          <div className="text-center py-8">
            <p className="text-gray-500">در حال تست...</p>
          </div>
        )}

        <div className="space-y-4">
          {results.map((result, index) => (
            <div
              key={index}
              className={`border rounded-lg p-4 ${
                result.status === "success"
                  ? "border-green-200 bg-green-50"
                  : result.status === "error"
                  ? "border-red-200 bg-red-50"
                  : "border-yellow-200 bg-yellow-50"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">{result.name}</h3>
                <span
                  className={`px-3 py-1 rounded text-sm ${
                    result.status === "success"
                      ? "bg-green-100 text-green-800"
                      : result.status === "error"
                      ? "bg-red-100 text-red-800"
                      : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {result.status === "success"
                    ? "✅ موفق"
                    : result.status === "error"
                    ? "❌ خطا"
                    : "⏳ در حال بررسی..."}
                </span>
              </div>
              <p className="text-sm">{result.message}</p>
            </div>
          ))}
        </div>

        {!loading && (
          <button
            onClick={runTests}
            className="mt-6 w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            تست مجدد
          </button>
        )}

        <div className="mt-8 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold mb-2">نکات:</h3>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• اگر Environment Variables خطا بدهد، فایل .env.local را بررسی کنید</li>
            <li>• اگر Database خطا بدهد، ممکن است جدول rooms وجود نداشته باشد (این طبیعی است)</li>
            <li>• برای ایجاد جداول، فایل supabase-schema.sql را در Supabase SQL Editor اجرا کنید</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

