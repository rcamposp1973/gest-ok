/**
 * Renderizador de láminas 1:1 para Instagram en HTML5 Canvas (1080x1080 px)
 * 100% nativo, sin dependencias de parseo CSS ni fallos de renderizado.
 */

export interface SlideData {
  slideNum: string;
  badge: string;
  title: string;
  subtitle: string;
  badgeColor?: string;
}

export const SLIDES_METADATA: SlideData[] = [
  {
    slideNum: "1/6",
    badge: "🚨 EL DOLOR ACTUAL",
    title: "¿SIGUES DIGITANDO FACTURAS A MANO?",
    subtitle: "Descubre cómo Pymes y estudios contables modernos en Chile automatizan el 70% de su trabajo.",
    badgeColor: "#f43f5e"
  },
  {
    slideNum: "2/6",
    badge: "SEGURIDAD Y RESCATE SII",
    title: "CONEXIÓN Y RESCATE RCV DESDE EL SII",
    subtitle: "Rescata compras, ventas y boletas BHE automáticamente con total seguridad.",
    badgeColor: "#6366f1"
  },
  {
    slideNum: "3/6",
    badge: "AUTOMATIZACIÓN",
    title: "CARGA MASIVA RCV Y HONORARIOS",
    subtitle: "Importa compras, ventas y boletas BHE desde los archivos oficiales del SII en 2 segundos.",
    badgeColor: "#14b8a6"
  },
  {
    slideNum: "4/6",
    badge: "TESORERÍA INTELIGENTE",
    title: "CONCILIACIÓN BANCARIA EN 1 CLIC",
    subtitle: "Cruza cartolas de cualquier banco contra tus facturas pendientes.",
    badgeColor: "#10b981"
  },
  {
    slideNum: "5/6",
    badge: "CALIDAD DE DATOS",
    title: "GRILLAS EXCEL Y EXIGIBILIDAD ESTRICTA",
    subtitle: "La agilidad de una planilla con la seguridad de una base de datos blindada.",
    badgeColor: "#a855f7"
  },
  {
    slideNum: "6/6",
    badge: "OFERTA LIMITADA",
    title: "PROGRAMA DE ESTUDIOS FUNDADORES",
    subtitle: "Pruébalo 15 días gratis con migración de datos asistida por nuestros expertos.",
    badgeColor: "#06b6d4"
  }
];

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = words[0] || "";

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + " " + word).width;
    if (width < maxWidth) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export function renderSlideToCanvas(slideIdx: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const data = SLIDES_METADATA[slideIdx] || SLIDES_METADATA[0];

  // 1. Fondo elegante oscuro con degradado
  const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1080);
  bgGrad.addColorStop(0, "#090d16");
  bgGrad.addColorStop(0.5, "#020617");
  bgGrad.addColorStop(1, "#0a0f1d");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1080, 1080);

  // Círculos de luz ambiental (glow)
  const glow = ctx.createRadialGradient(540, 400, 50, 540, 400, 500);
  glow.addColorStop(0, "rgba(99, 102, 241, 0.12)");
  glow.addColorStop(0.6, "rgba(168, 85, 247, 0.05)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1080, 1080);

  // 2. Barra decorativa superior multicolor
  const topGrad = ctx.createLinearGradient(0, 0, 1080, 0);
  topGrad.addColorStop(0, "#a855f7");
  topGrad.addColorStop(0.5, "#ec4899");
  topGrad.addColorStop(1, "#f59e0b");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, 1080, 16);

  // 3. Cabecera (Lámina X/6 + Badge)
  // Badge Lámina
  ctx.save();
  drawRoundedRect(ctx, 70, 60, 150, 48, 24);
  ctx.fillStyle = "rgba(30, 41, 59, 0.9)";
  ctx.fill();
  ctx.strokeStyle = "rgba(71, 85, 105, 0.6)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "bold 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`LÁMINA ${data.slideNum}`, 145, 84);

  // Badge Temático
  drawRoundedRect(ctx, 700, 60, 310, 48, 24);
  ctx.fillStyle = "rgba(88, 28, 135, 0.4)";
  ctx.fill();
  ctx.strokeStyle = "rgba(168, 85, 247, 0.6)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#d8b4fe";
  ctx.font = "bold 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(data.badge, 855, 84);
  ctx.restore();

  // 4. Título Principal
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "900 52px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

  if (slideIdx === 3) {
    // Lámina 4: CONCILIACIÓN BANCARIA EN 1 CLIC con badge animado
    ctx.fillText("CONCILIACIÓN BANCARIA EN 1", 540, 200);

    // Caja destacada para "CLIC 🖱️"
    const clicWidth = 240;
    const clicHeight = 64;
    const clicX = 540 - clicWidth / 2;
    const clicY = 230;

    drawRoundedRect(ctx, clicX, clicY, clicWidth, clicHeight, 18);
    const clicGrad = ctx.createLinearGradient(clicX, clicY, clicX + clicWidth, clicY);
    clicGrad.addColorStop(0, "rgba(16, 185, 129, 0.3)");
    clicGrad.addColorStop(1, "rgba(6, 182, 212, 0.3)");
    ctx.fillStyle = clicGrad;
    ctx.fill();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#34d399";
    ctx.font = "900 48px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("CLIC 🖱️", 540, clicY + clicHeight / 2 + 3);
  } else {
    const titleLines = wrapText(ctx, data.title, 940);
    const startY = titleLines.length === 1 ? 220 : 190;
    titleLines.forEach((line, i) => {
      ctx.fillText(line, 540, startY + i * 62);
    });
  }
  ctx.restore();

  // 5. Subtítulo
  ctx.save();
  ctx.fillStyle = "#94a3b8";
  ctx.textAlign = "center";
  ctx.font = "400 26px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  const subY = slideIdx === 3 ? 340 : 330;
  const subLines = wrapText(ctx, data.subtitle, 900);
  subLines.forEach((line, i) => {
    ctx.fillText(line, 540, subY + i * 36);
  });
  ctx.restore();

  // 6. Contenido central según lámina
  ctx.save();
  const cardY = 440;
  const cardW = 940;
  const cardX = 70;

  if (slideIdx === 0) {
    // LÁMINA 1: EL DOLOR ACTUAL
    drawRoundedRect(ctx, cardX, cardY, cardW, 260, 24);
    ctx.fillStyle = "rgba(136, 19, 55, 0.35)";
    ctx.fill();
    ctx.strokeStyle = "rgba(244, 63, 94, 0.6)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#fecdd3";
    ctx.font = "500 32px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    const quoteLines = wrapText(
      ctx,
      '"Horas perdidas pasando datos del SII a sistemas lentos, cuadrando bancos en Excel y persiguiendo descuadres a fin de mes."',
      860
    );
    quoteLines.forEach((line, i) => {
      ctx.fillText(line, 540, cardY + 70 + i * 46);
    });

    // Call to action
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 26px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("Hay una forma moderna y automática 👉 Desliza", 540, 750);
  } else if (slideIdx === 1) {
    // LÁMINA 2: SEGURIDAD Y RESCATE SII
    drawRoundedRect(ctx, cardX, cardY, cardW, 160, 20);
    ctx.fillStyle = "rgba(49, 46, 129, 0.4)";
    ctx.fill();
    ctx.strokeStyle = "rgba(99, 102, 241, 0.6)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🛡️ Máxima Seguridad y Confidencialidad", 540, cardY + 60);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "400 22px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(
      "Tus datos tributarios protegidos y respaldados con los más altos estándares en la nube.",
      540,
      cardY + 105
    );

    // 2 Columnas inferiores
    const colW = (cardW - 30) / 2;
    // Columna 1
    drawRoundedRect(ctx, cardX, cardY + 180, colW, 130, 16);
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.fill();
    ctx.strokeStyle = "rgba(51, 65, 85, 0.8)";
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("RESCATE RCV AUTOMÁTICO", cardX + colW / 2, cardY + 225);
    ctx.fillStyle = "#818cf8";
    ctx.font = "900 26px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("Compras, Ventas & BHE", cardX + colW / 2, cardY + 270);

    // Columna 2
    drawRoundedRect(ctx, cardX + colW + 30, cardY + 180, colW, 130, 16);
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.fill();
    ctx.strokeStyle = "rgba(51, 65, 85, 0.8)";
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("ASIENTO CONTABLE", cardX + colW + 30 + colW / 2, cardY + 225);
    ctx.fillStyle = "#34d399";
    ctx.font = "900 26px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("100% Automático", cardX + colW + 30 + colW / 2, cardY + 270);
  } else if (slideIdx === 2) {
    // LÁMINA 3: CARGA MASIVA RCV Y HONORARIOS
    drawRoundedRect(ctx, cardX, cardY, cardW, 140, 20);
    ctx.fillStyle = "rgba(19, 78, 74, 0.4)";
    ctx.fill();
    ctx.strokeStyle = "rgba(20, 184, 166, 0.6)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("📊 Cero Duplicados Garantizado", 540, cardY + 55);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "400 22px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(
      "El sistema valida si un RUT, Tipo y Folio ya existe y auto-crea la ficha del auxiliar.",
      540,
      cardY + 98
    );

    // Tarjeta métrica
    drawRoundedRect(ctx, cardX, cardY + 160, cardW, 150, 20);
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.fill();
    ctx.strokeStyle = "rgba(51, 65, 85, 0.8)";
    ctx.stroke();

    ctx.fillStyle = "#34d399";
    ctx.font = "900 38px 'Courier New', monospace, sans-serif";
    ctx.fillText("⚡ 100+ Documentos en 3 seg", 540, cardY + 225);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "500 22px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("Generación del comprobante de compras y ventas masivo", 540, cardY + 275);
  } else if (slideIdx === 3) {
    // LÁMINA 4: CONCILIACIÓN BANCARIA
    drawRoundedRect(ctx, cardX, cardY, cardW, 140, 20);
    ctx.fillStyle = "rgba(6, 78, 59, 0.4)";
    ctx.fill();
    ctx.strokeStyle = "rgba(16, 185, 129, 0.6)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("⚡ Cruce Inteligente de Facturas", 540, cardY + 55);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "400 22px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(
      "Detecta abonos y cargos de cualquier banco y sugiere el match automáticamente.",
      540,
      cardY + 98
    );

    // Tarjeta bancaria
    drawRoundedRect(ctx, cardX, cardY + 160, cardW, 150, 20);
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.fill();
    ctx.strokeStyle = "rgba(51, 65, 85, 0.8)";
    ctx.stroke();

    ctx.fillStyle = "#6ee7b7";
    ctx.font = "900 32px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("Saldo Cartola = Saldo Libro Mayor", 540, cardY + 225);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "500 22px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("Asiento bancario generado sin digitar una sola cuenta", 540, cardY + 275);
  } else if (slideIdx === 4) {
    // LÁMINA 5: F29 Y BALANCE 8 COLUMNAS
    drawRoundedRect(ctx, cardX, cardY, cardW, 180, 24);
    const grad5 = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY);
    grad5.addColorStop(0, "rgba(88, 28, 135, 0.6)");
    grad5.addColorStop(0.5, "rgba(49, 46, 129, 0.6)");
    grad5.addColorStop(1, "rgba(15, 23, 42, 0.8)");
    ctx.fillStyle = grad5;
    ctx.fill();
    ctx.strokeStyle = "rgba(168, 85, 247, 0.8)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 34px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Formulario 29 Y Balance 8 Columnas IFRS", 540, cardY + 70);

    ctx.fillStyle = "#fcd34d";
    ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("Calculados en tiempo real listos para exportar a Excel y PDF.", 540, cardY + 125);

    // Pills de validación estricta
    const pillY = cardY + 210;
    const pillW = 280;
    const gap = (cardW - pillW * 3) / 2;

    // Pill 1
    drawRoundedRect(ctx, cardX, pillY, pillW, 60, 14);
    ctx.fillStyle = "rgba(49, 46, 129, 0.7)";
    ctx.fill();
    ctx.strokeStyle = "#6366f1";
    ctx.stroke();
    ctx.fillStyle = "#c7d2fe";
    ctx.font = "bold 20px 'Courier New', monospace, sans-serif";
    ctx.fillText("RUT* Bloqueante", cardX + pillW / 2, pillY + 36);

    // Pill 2
    drawRoundedRect(ctx, cardX + pillW + gap, pillY, pillW, 60, 14);
    ctx.fillStyle = "rgba(120, 53, 15, 0.7)";
    ctx.fill();
    ctx.strokeStyle = "#f59e0b";
    ctx.stroke();
    ctx.fillStyle = "#fde68a";
    ctx.font = "bold 20px 'Courier New', monospace, sans-serif";
    ctx.fillText("DOC* Requerido", cardX + pillW + gap + pillW / 2, pillY + 36);

    // Pill 3
    drawRoundedRect(ctx, cardX + (pillW + gap) * 2, pillY, pillW, 60, 14);
    ctx.fillStyle = "rgba(6, 78, 59, 0.7)";
    ctx.fill();
    ctx.strokeStyle = "#10b981";
    ctx.stroke();
    ctx.fillStyle = "#a7f3d0";
    ctx.font = "bold 20px 'Courier New', monospace, sans-serif";
    ctx.fillText("CC* Obligatorio", cardX + (pillW + gap) * 2 + pillW / 2, pillY + 36);
  } else if (slideIdx === 5) {
    // LÁMINA 6: PROGRAMA DE ESTUDIOS FUNDADORES
    drawRoundedRect(ctx, cardX, cardY, cardW, 310, 24);
    const grad6 = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY);
    grad6.addColorStop(0, "rgba(6, 78, 59, 0.6)");
    grad6.addColorStop(1, "rgba(19, 78, 74, 0.6)");
    ctx.fillStyle = grad6;
    ctx.fill();
    ctx.strokeStyle = "rgba(16, 185, 129, 0.8)";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Badge interno
    drawRoundedRect(ctx, 540 - 130, cardY + 25, 260, 44, 22);
    ctx.fillStyle = "#10b981";
    ctx.fill();
    ctx.fillStyle = "#020617";
    ctx.font = "900 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("CUPOS LIMITADOS", 540, cardY + 52);

    // Lista de beneficios
    ctx.textAlign = "left";
    ctx.fillStyle = "#f1f5f9";
    ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const benefits = [
      "✓ 15 días de acceso total gratuito.",
      "✓ Migración asistida de tus empresas y auxiliares.",
      "✓ Precio congelado de por vida con usuarios ilimitados."
    ];
    benefits.forEach((item, i) => {
      ctx.fillText(item, cardX + 80, cardY + 120 + i * 42);
    });

    // Contacto
    ctx.textAlign = "center";
    ctx.fillStyle = "#67e8f9";
    ctx.font = "bold 22px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("WhatsApp: +56 9 4631 8783  |  app.pulsocontable.cl", 540, cardY + 265);
  }
  ctx.restore();

  // 7. Pie de Lámina (Branding & Desliza)
  ctx.save();
  ctx.strokeStyle = "rgba(51, 65, 85, 0.6)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(70, 960);
  ctx.lineTo(1010, 960);
  ctx.stroke();

  // Logo y Marca
  ctx.fillStyle = "#10b981";
  ctx.beginPath();
  ctx.arc(85, 1000, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Pulso Contable", 105, 1000);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "400 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("• Software Contable en la Nube", 280, 1000);

  // Call to action de deslizamiento
  ctx.textAlign = "right";
  ctx.fillStyle = "#c084fc";
  ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(
    slideIdx < 5 ? "Desliza para ver más 👉" : "¡Guarda este post! 📌",
    1010,
    1000
  );
  ctx.restore();

  return canvas;
}

/**
 * Obtiene el Data URL PNG de una lámina (instantáneo y 100% libre de errores)
 */
export function getSlideDataUrl(slideIdx: number): string {
  const canvas = renderSlideToCanvas(slideIdx);
  return canvas.toDataURL("image/png");
}

/**
 * Descarga una sola lámina directamente como archivo PNG
 */
export function downloadSlidePNGDirect(slideIdx: number): void {
  const dataUrl = getSlideDataUrl(slideIdx);
  const data = SLIDES_METADATA[slideIdx] || SLIDES_METADATA[0];
  const cleanBadge = data.badge.replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `Lamina_${slideIdx + 1}_${cleanBadge}_PulsoContable.png`;

  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
