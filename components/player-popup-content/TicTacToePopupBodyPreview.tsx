import Image from "next/image";
import dingCoinIcon from "@/src/assets/icons/ding-coin.png";
import ticStyles from "@/components/tic-tac-toe/TicTacToeModal.module.css";

const DIFFICULTY_LABELS = ["سخت", "متوسط", "آسان"] as const;

/** Static tic-tac-toe body for admin full-popup preview (no game logic). */
export default function TicTacToePopupBodyPreview() {
  return (
    <>
      <div className={ticStyles.difficultyRow}>
        {DIFFICULTY_LABELS.map((label, index) => (
          <div
            key={label}
            className={`${ticStyles.difficultyButton} ${
              index === 1 ? ticStyles.difficultyButtonActive : ""
            } ${index === 2 ? ticStyles.difficultyButtonLocked : ""}`}
            aria-hidden="true"
          >
            <span className={ticStyles.difficultyLossStat}>
              <span
                className={`${ticStyles.difficultyStatValue} numeric-text numeric-text--11`}
                dir="ltr"
              >
                {(index === 1 ? 2 : 0).toLocaleString("en-US")}
              </span>
            </span>
            <span className={ticStyles.difficultyLabel}>{label}</span>
            <span className={ticStyles.difficultyWinStat}>
              <span
                className={`${ticStyles.difficultyStatValue} numeric-text numeric-text--11`}
                dir="ltr"
              >
                {(index === 0 ? 1 : index === 1 ? 4 : 7).toLocaleString("en-US")}
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className={ticStyles.prizeRow}>
        <span>جایزه برد</span>
        <span className={ticStyles.prizeCoinWrap} aria-hidden="true">
          <Image
            src={dingCoinIcon}
            alt=""
            width={22}
            height={22}
            className={ticStyles.prizeCoin}
          />
        </span>
        <span className={`${ticStyles.prizeAmount} numeric-text numeric-text--16`} dir="ltr">
          3
        </span>
        <span>دینگ</span>
      </div>

      <div className={ticStyles.boardFrame}>
        <div className={ticStyles.board}>
          {Array.from({ length: 9 }, (_, index) => (
            <div key={index} className={ticStyles.cell} aria-hidden="true" />
          ))}
        </div>
      </div>
    </>
  );
}
