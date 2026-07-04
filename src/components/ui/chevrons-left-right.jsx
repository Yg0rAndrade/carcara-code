'use client';
import { motion, useAnimation } from 'motion/react';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';

import { cn } from '@/lib/utils';

const DEFAULT_TRANSITION = {
  type: 'spring',
  stiffness: 250,
  damping: 25,
};

const ChevronsLeftRightIcon = forwardRef(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return {
        startAnimation: () => controls.start('animate'),
        stopAnimation: () => controls.start('normal'),
      };
    });

    const handleMouseEnter = useCallback(
      (e) => {
        if (isControlledRef.current) onMouseEnter?.(e);
        else controls.start('animate');
      },
      [controls, onMouseEnter],
    );

    const handleMouseLeave = useCallback(
      (e) => {
        if (isControlledRef.current) onMouseLeave?.(e);
        else controls.start('normal');
      },
      [controls, onMouseLeave],
    );

    return (
      <div
        className={cn(className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.path
            animate={controls}
            d="m9 7-5 5 5 5"
            initial="normal"
            transition={DEFAULT_TRANSITION}
            variants={{ normal: { translateX: '0%' }, animate: { translateX: '-2px' } }}
          />
          <motion.path
            animate={controls}
            d="m15 7 5 5-5 5"
            initial="normal"
            transition={DEFAULT_TRANSITION}
            variants={{ normal: { translateX: '0%' }, animate: { translateX: '2px' } }}
          />
        </svg>
      </div>
    );
  },
);

ChevronsLeftRightIcon.displayName = 'ChevronsLeftRightIcon';

export { ChevronsLeftRightIcon };
