"use client";

import React, { useCallback, useId, useState } from "react";
import {
  SUPPORT_FAQ_CATEGORIES,
  type FaqItem,
} from "@/lib/support/supportFaqContent";
import styles from "./SupportFaq.module.css";

function FaqAccordionItem({
  item,
  isOpen,
  onToggle,
}: {
  item: FaqItem;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const panelId = useId();
  const buttonId = useId();

  return (
    <div className={styles.faqItem}>
      <button
        type="button"
        id={buttonId}
        className={styles.faqQuestion}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className={styles.faqQuestionText}>{item.question}</span>
        <span className={styles.faqChevron} aria-hidden="true">
          {isOpen ? "−" : "+"}
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        className={isOpen ? styles.faqAnswerOpen : styles.faqAnswerClosed}
        hidden={!isOpen}
      >
        <p className={styles.faqAnswer}>{item.answer}</p>
      </div>
    </div>
  );
}

export default function SupportFaq() {
  const [openId, setOpenId] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <section className={styles.faqSection} aria-labelledby="support-faq-heading">
      <h2 id="support-faq-heading" className={styles.faqHeading}>
        سوالات متداول
      </h2>
      {SUPPORT_FAQ_CATEGORIES.map((category) => (
        <div key={category.id} className={styles.faqCategory}>
          <h3 className={styles.faqCategoryTitle}>{category.title}</h3>
          <div className={styles.faqList}>
            {category.items.map((item) => (
              <FaqAccordionItem
                key={item.id}
                item={item}
                isOpen={openId === item.id}
                onToggle={() => toggle(item.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
