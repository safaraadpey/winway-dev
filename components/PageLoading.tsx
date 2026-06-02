type PageLoadingProps = {
  message?: string;
};

export default function PageLoading({
  message = "در حال بارگذاری...",
}: PageLoadingProps) {
  return (
    <div className="min-h-screen bg-black/40 flex flex-col items-center justify-center gap-4">
      <div
        className="w-12 h-12 border-4 border-white/10 border-t-amber-400 rounded-full animate-spin"
        aria-hidden="true"
      />
      <p className="text-white/60 text-base">{message}</p>
    </div>
  );
}
