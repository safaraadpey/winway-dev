"use client";

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import styles from './DingBalanceCapsule.module.css';
import dingCoinIcon from '@/src/assets/icons/ding-coin.png';

interface DingBalanceCapsuleProps {
  dingBalance: number;
  loading?: boolean;
  isAnimating?: boolean;
}

/**
 * کامپوننت کپسول نمایش موجودی Ding با انیمیشن
 * این کامپوننت مستقل است و می‌تواند در هر جای مناسب استفاده شود
 */
export default function DingBalanceCapsule({ 
  dingBalance, 
  loading = false,
  isAnimating = false 
}: DingBalanceCapsuleProps) {
  const formatDingBalance = (amount: number): string => {
    return amount.toLocaleString('en-US');
  };

  return (
    <motion.div 
      className={styles.balanceCapsule}
      animate={
        isAnimating
          ? {
              backgroundColor: [
                'rgba(59, 130, 246, 0.1)',
                'rgba(251, 191, 36, 0.3)',
                'rgba(251, 191, 36, 0.2)',
                'rgba(59, 130, 246, 0.1)',
              ],
              boxShadow: [
                '0 0 0px rgba(251, 191, 36, 0)',
                '0 0 20px rgba(251, 191, 36, 0.6)',
                '0 0 15px rgba(251, 191, 36, 0.4)',
                '0 0 0px rgba(251, 191, 36, 0)',
              ],
            }
          : {}
      }
      transition={{
        duration: 0.8,
        ease: 'easeInOut',
      }}
    >
      {loading ? (
        <span className={styles.loadingText}>...</span>
      ) : (
        <>
          <motion.span 
            className={styles.balanceAmount}
            animate={
              isAnimating
                ? {
                    color: [
                      '#fbbf24',
                      '#fcd34d',
                      '#fde047',
                      '#fbbf24',
                    ],
                    filter: [
                      'brightness(1)',
                      'brightness(2)',
                      'brightness(1.5)',
                      'brightness(1)',
                    ],
                    textShadow: [
                      '0 0 0px rgba(251, 191, 36, 0)',
                      '0 0 15px rgba(251, 191, 36, 0.8)',
                      '0 0 10px rgba(251, 191, 36, 0.5)',
                      '0 0 0px rgba(251, 191, 36, 0)',
                    ],
                  }
                : {}
            }
            transition={{
              duration: 0.8,
              ease: 'easeInOut',
            }}
          >
            {formatDingBalance(dingBalance)}
          </motion.span>
          <motion.div
            animate={
              isAnimating
                ? {
                    scale: [1, 1.15, 1],
                  }
                : {}
            }
            transition={{
              duration: 0.6,
              ease: 'easeOut',
            }}
          >
            <Image
              src={dingCoinIcon}
              alt="Ding Coin"
              className={styles.coinIcon}
              width={32}
              height={32}
            />
          </motion.div>
        </>
      )}
    </motion.div>
  );
}

