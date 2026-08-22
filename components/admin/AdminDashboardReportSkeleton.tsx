export default function AdminDashboardReportSkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-y-3 py-1"
      aria-busy="true"
      aria-label="در حال بارگذاری گزارش"
    >
      {Array.from({ length: 11 }).map((_, index) => (
        <div key={index} className="contents">
          <div className="h-4 w-24 rounded bg-gray-800 animate-pulse" />
          <div className="h-4 w-16 rounded bg-gray-700 animate-pulse justify-self-end" />
        </div>
      ))}
    </div>
  );
}
