import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseDraggableModalOptions {
  initialPosition?: { x: number; y: number };
  resetOnOpen?: boolean;
  isOpen?: boolean;
}

export function useDraggableModal(options: UseDraggableModalOptions = {}) {
  const [position, setPosition] = useState<{ x: number; y: number }>(
    options.initialPosition || { x: 0, y: 0 }
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: 0,
    startY: 0,
  });

  // Reset position when modal opens if specified
  useEffect(() => {
    if (options.isOpen && options.resetOnOpen !== false) {
      setPosition(options.initialPosition || { x: 0, y: 0 });
    }
  }, [options.isOpen, options.resetOnOpen, options.initialPosition]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only drag with primary mouse button
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (
        target.closest('button') ||
        target.closest('input') ||
        target.closest('select') ||
        target.closest('textarea') ||
        target.closest('a') ||
        target.closest('.no-drag')
      ) {
        return;
      }

      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        startX: position.x,
        startY: position.y,
      };
    },
    [position]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('button') ||
        target.closest('input') ||
        target.closest('select') ||
        target.closest('textarea') ||
        target.closest('a') ||
        target.closest('.no-drag')
      ) {
        return;
      }

      if (e.touches.length === 1) {
        const touch = e.touches[0];
        setIsDragging(true);
        dragStartRef.current = {
          mouseX: touch.clientX,
          mouseY: touch.clientY,
          startX: position.x,
          startY: position.y,
        };
      }
    },
    [position]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;

      const newX = dragStartRef.current.startX + deltaX;
      const newY = dragStartRef.current.startY + deltaY;

      // Keep at least part of the modal within viewport
      const clampedX = Math.max(-window.innerWidth * 0.48, Math.min(window.innerWidth * 0.48, newX));
      const clampedY = Math.max(-window.innerHeight * 0.45, Math.min(window.innerHeight * 0.45, newY));

      setPosition({ x: clampedX, y: clampedY });
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const deltaX = touch.clientX - dragStartRef.current.mouseX;
        const deltaY = touch.clientY - dragStartRef.current.mouseY;

        const newX = dragStartRef.current.startX + deltaX;
        const newY = dragStartRef.current.startY + deltaY;

        const clampedX = Math.max(-window.innerWidth * 0.48, Math.min(window.innerWidth * 0.48, newX));
        const clampedY = Math.max(-window.innerHeight * 0.45, Math.min(window.innerHeight * 0.45, newY));

        setPosition({ x: clampedX, y: clampedY });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging]);

  const resetPosition = useCallback(() => {
    setPosition({ x: 0, y: 0 });
  }, []);

  return {
    position,
    isDragging,
    dragProps: {
      onMouseDown: handleMouseDown,
      onTouchStart: handleTouchStart,
      style: {
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none' as const,
      },
      title: 'Haz clic y arrastra para mover esta ventana por la pantalla',
    },
    modalStyle: {
      transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
      transition: isDragging ? 'none' : 'transform 0.1s ease-out',
      willChange: isDragging ? ('transform' as const) : ('auto' as const),
    },
    resetPosition,
  };
}
