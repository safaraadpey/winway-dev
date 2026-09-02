export default function TransactionsTabSkeleton() {
  return (
    <div className="h-screen bg-[#0E0E0F] text-white flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="max-w-md mx-auto w-full h-full flex flex-col overflow-hidden">
          <div className="flex-shrink-0 p-4 pb-0">
            <div
              className="flex mb-4 rounded-2xl overflow-hidden bg-[#111827] text-sm font-semibold"
              aria-hidden="true"
            >
              {["سوابق", "پیشخوان", "برداشت"].map((label) => (
                <div
                  key={label}
                  className="flex-1 py-3 text-center text-gray-500 animate-pulse"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
