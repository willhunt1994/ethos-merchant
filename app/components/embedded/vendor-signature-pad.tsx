import { useCallback, useEffect, useRef, useState } from "react";
import styles from "../../styles/embedded-app.module.css";
import { isDrawnVendorSignature } from "../../lib/vendor-signature";

type VendorSignaturePadProps = {
  initialValue?: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
};

const CANVAS_WIDTH = 520;
const CANVAS_HEIGHT = 160;

export function VendorSignaturePad({
  initialValue = "",
  onChange,
  disabled,
}: VendorSignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(() => isDrawnVendorSignature(initialValue));

  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.floor(CANVAS_WIDTH * dpr);
    canvas.height = Math.floor(CANVAS_HEIGHT * dpr);
    canvas.style.width = `${CANVAS_WIDTH}px`;
    canvas.style.height = `${CANVAS_HEIGHT}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.25;
    ctx.strokeStyle = "#1a1a1a";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }, []);

  const loadImageOntoCanvas = useCallback(
    (dataUrl: string) => {
      const canvas = canvasRef.current;
      if (!canvas || !isDrawnVendorSignature(dataUrl)) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const img = new Image();
      img.onload = () => {
        syncCanvasSize();
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(img, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        setHasInk(true);
      };
      img.src = dataUrl;
    },
    [syncCanvasSize],
  );

  useEffect(() => {
    syncCanvasSize();
    if (isDrawnVendorSignature(initialValue)) {
      loadImageOntoCanvas(initialValue);
    } else {
      setHasInk(false);
    }
  }, [syncCanvasSize, loadImageOntoCanvas, initialValue]);

  function exportCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
  }

  function pointerPos(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const { x, y } = pointerPos(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    event.preventDefault();
    const { x, y } = pointerPos(event);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasInk(true);
  }

  function endStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    exportCanvas();
  }

  function handleClear() {
    if (disabled) return;
    syncCanvasSize();
    setHasInk(false);
    onChange("");
  }

  return (
    <div className={styles.vendorSignaturePadWrap}>
      <canvas
        ref={canvasRef}
        className={styles.vendorSignaturePadCanvas}
        aria-label="Draw your signature"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={endStroke}
      />
      {!hasInk ? (
        <span className={styles.vendorSignaturePadHint} aria-hidden>
          Click and drag to sign
        </span>
      ) : null}
      <div className={styles.vendorSignaturePadToolbar}>
        <button
          type="button"
          className={styles.settingsButton}
          onClick={handleClear}
          disabled={disabled || !hasInk}
        >
          Clear Signature
        </button>
      </div>
    </div>
  );
}

export function VendorSignaturePreview({
  signatureText,
  className,
}: {
  signatureText: string;
  className?: string;
}) {
  if (isDrawnVendorSignature(signatureText)) {
    return (
      <img
        src={signatureText}
        alt="Drawn signature"
        className={className ?? styles.vendorSignaturePreviewImage}
      />
    );
  }
  return (
    <span className={className ?? styles.vendorSignaturePreviewName}>{signatureText}</span>
  );
}
