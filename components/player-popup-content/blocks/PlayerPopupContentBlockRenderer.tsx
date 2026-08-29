import type { PlayerPopupContentBlock } from "@/lib/player-popup-content/types";
import PlayerPopupBannerBlockView from "./PlayerPopupBannerBlock";
import PlayerPopupCountdownBlockView from "./PlayerPopupCountdownBlock";
import PlayerPopupCtaBlockView from "./PlayerPopupCtaBlock";
import PlayerPopupTextBlockView from "./PlayerPopupTextBlock";
import PlayerPopupWinnersBlockView from "./PlayerPopupWinnersBlock";

export default function PlayerPopupContentBlockRenderer({
  block,
}: {
  block: PlayerPopupContentBlock;
}) {
  switch (block.type) {
    case "text":
      return <PlayerPopupTextBlockView block={block} />;
    case "winners":
      return <PlayerPopupWinnersBlockView block={block} />;
    case "countdown":
      return <PlayerPopupCountdownBlockView block={block} />;
    case "banner":
      return <PlayerPopupBannerBlockView block={block} />;
    case "cta":
      return <PlayerPopupCtaBlockView block={block} />;
    default: {
      const _exhaustive: never = block;
      void _exhaustive;
      return null;
    }
  }
}
