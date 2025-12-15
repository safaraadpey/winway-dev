import BingoCard from "@/components/BingoCard";

interface GamePageProps {
  params: {
    roomId: string;
  };
}

export default function GamePage({ params }: GamePageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">
          Bingo Game - Room {params.roomId}
        </h2>
        <p className="mt-2 text-gray-600">
          Mark your numbers as they are called
        </p>
      </div>

      <div className="flex justify-center">
        <BingoCard />
      </div>
    </div>
  );
}

