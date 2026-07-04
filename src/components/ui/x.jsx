'use client';
import { motion, useAnimation } from 'motion/react';
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';

import { cn } from '@/lib/utils';

const pathVariants = {
  normal: { pathLength: 1, opacity: 1 },
  animate: (i) => ({
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: { delay: i * 0.15, duration: 0.3, ease: 'easeInOut' },
  }),
};

const XIcon = forwardRef(({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
  const controls = useAnimation();
  const isControlledRef = useRef(false);

  useImperativeHandle(ref, () => {
    isControlledRef.current = true;
    return {
      startAnimation: () => {
        controls.set('normal');
        controls.start('animate');
      },
      stopAnimation: () => controls.start('normal'),
    };
  });

  const handleMouseEnter = useCallback(
    (e) => {
      if (isControlledRef.current) onMouseEnter?.(e);
      else {
        controls.set('normal');
        controls.start('animate');
      }
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
        <motion.path d="M18 6 6 18" animate={controls} custom={0} variants={pathVariants} />
        <motion.path d="m6 6 12 12" animate={controls} custom={1} variants={pathVariants} />
      </svg>
    </div>
  );
});

XIcon.displayName = 'XIcon';

export { XIcon };
