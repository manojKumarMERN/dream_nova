import { useEffect, useRef } from 'react';
import { useViewport } from '@xyflow/react';

export interface HelperLinesProps {
  horizontal?: number;
  vertical?: number;
}

export function HelperLines({ horizontal, vertical }: HelperLinesProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { x, y, zoom } = useViewport();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const context = canvas.getContext('2d');
    if (context === null) {
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    if (horizontal === undefined && vertical === undefined) {
      return;
    }
    context.beginPath();
    context.setLineDash([4, 4]);
    context.strokeStyle = '#5b50e6';
    context.lineWidth = 1;
    if (horizontal !== undefined) {
      const screenY = y + horizontal * zoom;
      context.moveTo(0, screenY);
      context.lineTo(width, screenY);
    }
    if (vertical !== undefined) {
      const screenX = x + vertical * zoom;
      context.moveTo(screenX, 0);
      context.lineTo(screenX, height);
    }
    context.stroke();
  }, [horizontal, vertical, x, y, zoom]);

  return <canvas aria-hidden="true" className="designer-helper-lines" ref={canvasRef} />;
}
