'use client';
import { motion, useAnimation } from 'motion/react';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';

import { cn } from '@/lib/utils';

const PATH_VARIANTS = {
  normal: { d: 'm12 19-7-7 7-7', translateX: 0 },
  animate: {
    d: 'm12 19-7-7 7-7',
    translateX: [0, 3, 0],
    transition: {
      duration: 0.4,
    },
  },
};

const SECOND_PATH_VARIANTS = {
  normal: { d: 'M19 12H5' },
  animate: {
    d: ['M19 12H5', 'M19 12H10', 'M19 12H5'],
    transition: {
      duration: 0.4,
    },
  },
};

const ArrowLeftIcon = forwardRef(
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
        if (isControlledRef.current) {
          onMouseEnter?.(e);
        } else {
          controls.set('normal');
          controls.start('animate');
        }
      },
      [controls, onMouseEnter],
    );

    const handleMouseLeave = useCallback(
      (e) => {
        if (isControlledRef.current) {
          onMouseLeave?.(e);
        } else {
          controls.start('normal');
        }
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
          <motion.path animate={controls} d="m12 19-7-7 7-7" variants={PATH_VARIANTS} />
          <motion.path animate={controls} d="M19 12H5" variants={SECOND_PATH_VARIANTS} />
        </svg>
      </div>
    );
  },
);

ArrowLeftIcon.displayName = 'ArrowLeftIcon';

export { ArrowLeftIcon };
