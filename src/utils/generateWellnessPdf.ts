import { jsPDF } from 'jspdf';
import { WellnessPlanResult, User } from '../types';
import { BRAND_LOGO_SVG_STRING, BRAND_NAME } from '../components/BrandLogo';
import { isRtlLanguage } from '../hooks/useTranslatedContent';

const PAGE_W = 1654; // 210mm at 200 DPI
const PAGE_H = 2339; // 297mm at 200 DPI
const MARGIN_X = 84;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const FOOTER_SAFE_Y = PAGE_H - 125;

const SANS_FONT = '"Plus Jakarta Sans", "Noto Sans Arabic", "Noto Sans", system-ui, sans-serif';
const SERIF_FONT = '"Playfair Display", "Noto Sans Arabic", Georgia, serif';

function loadLogoImage(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BRAND_LOGO_SVG_STRING)}`;
  });
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const words = clean.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      currentLine = candidate;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      if (ctx.measureText(word).width > maxWidth) {
        let chunk = '';
        for (const ch of word) {
          if (ctx.measureText(chunk + ch).width <= maxWidth) {
            chunk += ch;
          } else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        currentLine = chunk;
      } else {
        currentLine = word;
      }
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill?: string,
  stroke?: string,
  lineWidth = 2
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  ctx.restore();
}

export interface GenerateWellnessPdfParams {
  plan: WellnessPlanResult;
  user: User | null;
  currentLang: string;
  todayFormatted: string;
  brandSubtitle?: string;
  mode?: 'download' | 'share';
}

export async function generateWellnessPdf({
  plan,
  user,
  currentLang,
  todayFormatted,
  brandSubtitle = 'Your Smart Guide',
  mode = 'download',
}: GenerateWellnessPdfParams): Promise<{ filename: string; shared: boolean }> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const isRtl = isRtlLanguage(currentLang);
  const isAr = String(currentLang || '').toLowerCase().startsWith('ar');
  const logoImg = await loadLogoImage();
  const alignX = isRtl ? PAGE_W - MARGIN_X : MARGIN_X;
  const oppX = isRtl ? MARGIN_X : PAGE_W - MARGIN_X;
  const textAlign: CanvasTextAlign = isRtl ? 'right' : 'left';
  const oppAlign: CanvasTextAlign = isRtl ? 'left' : 'right';
  const dir: CanvasDirection = isRtl ? 'rtl' : 'ltr';

  const goalLabel =
    plan.goalType === 'weight_loss'
      ? isAr
        ? 'خطة تخسيس وحرق السعرات'
        : 'Weight Loss & Fat Burn Plan'
      : plan.goalType === 'weight_gain'
      ? isAr
        ? 'خطة زيادة الوزن والكتلة الصحية'
        : 'Healthy Weight Gain Plan'
      : isAr
      ? 'خطة التوازن حسب الحالة الصحية'
      : 'Health-Condition Maintenance Plan';

  const pages: HTMLCanvasElement[] = [];
  let ctx!: CanvasRenderingContext2D;
  let y = 0;

  const initPage = (isFirstPage: boolean) => {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context unavailable.');
    ctx = context;
    ctx.direction = dir;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    if (isFirstPage) {
      const bannerH = 296;
      ctx.fillStyle = '#082F5E';
      ctx.fillRect(0, 0, PAGE_W, bannerH);

      // Aegean Sky Accent Strip
      ctx.fillStyle = '#0D5EAF';
      ctx.fillRect(0, bannerH - 8, PAGE_W, 8);

      const logoSize = 116;
      const logoX = isRtl ? PAGE_W - MARGIN_X - logoSize : MARGIN_X;
      const logoY = 52;
      if (logoImg) {
        ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
      }

      const brandTextX = isRtl ? logoX - 28 : logoX + logoSize + 28;
      ctx.save();
      ctx.direction = dir;
      ctx.textAlign = textAlign;
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `700 54px ${SERIF_FONT}`;
      ctx.fillText(BRAND_NAME, brandTextX, logoY + 52);

      ctx.fillStyle = '#7DD3FC';
      ctx.font = `600 22px ${SANS_FONT}`;
      ctx.fillText(brandSubtitle, brandTextX, logoY + 92);

      ctx.textAlign = oppAlign;
      ctx.fillStyle = '#E0F2FE';
      ctx.font = `700 26px ${SANS_FONT}`;
      const durationBadgeText =
        plan.durationDays === 1
          ? isAr
            ? 'اليوم فقط (1 يوم)'
            : 'Today Only (1 Day)'
          : plan.durationDays === 7
          ? isAr
            ? 'أسبوع كامل (7 أيام)'
            : '1 Week (7 Days)'
          : `${plan.durationDays} ${isAr ? 'أيام' : 'Days'}`;
      ctx.fillText(`${plan.destination} · ${durationBadgeText}`, oppX, logoY + 38);

      ctx.fillStyle = '#BAE6FD';
      ctx.font = `600 20px ${SANS_FONT}`;
      ctx.fillText(goalLabel, oppX, logoY + 74);

      ctx.fillStyle = '#94A3B8';
      ctx.font = `500 18px ${SANS_FONT}`;
      ctx.fillText(
        user?.name ? `${user.name} · ${todayFormatted}` : todayFormatted,
        oppX,
        logoY + 108
      );
      ctx.restore();

      ctx.save();
      ctx.direction = dir;
      ctx.textAlign = textAlign;
      ctx.fillStyle = '#F8FAFC';
      ctx.font = `700 26px ${SANS_FONT}`;
      ctx.fillText(plan.headline, alignX, 246, CONTENT_W);
      ctx.restore();

      y = bannerH + 38;
    } else {
      ctx.save();
      ctx.fillStyle = '#0D5EAF';
      ctx.fillRect(MARGIN_X, 68, CONTENT_W, 2);

      if (logoImg) {
        const s = 44;
        const lx = isRtl ? PAGE_W - MARGIN_X - s : MARGIN_X;
        ctx.drawImage(logoImg, lx, 16, s, s);
      }

      ctx.direction = dir;
      ctx.textAlign = textAlign;
      ctx.fillStyle = '#082F5E';
      ctx.font = `700 24px ${SERIF_FONT}`;
      const labelX = isRtl ? PAGE_W - MARGIN_X - 56 : MARGIN_X + 56;
      ctx.fillText(`${BRAND_NAME} · ${brandSubtitle}`, labelX, 46);

      ctx.textAlign = oppAlign;
      ctx.fillStyle = '#64748B';
      ctx.font = `600 19px ${SANS_FONT}`;
      ctx.fillText(`${plan.destination} · ${goalLabel}`, oppX, 46);
      ctx.restore();

      y = 98;
    }

    pages.push(canvas);
  };

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > FOOTER_SAFE_Y) {
      initPage(false);
    }
  };

  const drawTextLines = (
    lines: string[],
    x: number,
    startY: number,
    lineHeight: number,
    color: string,
    font: string,
    align: CanvasTextAlign = textAlign
  ): number => {
    ctx.save();
    ctx.direction = dir;
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.font = font;
    let curY = startY;
    for (const line of lines) {
      ctx.fillText(line, x, curY);
      curY += lineHeight;
    }
    ctx.restore();
    return curY;
  };

  // Start Page 1
  initPage(true);

  // KPI Strip (4 Clean Boxes)
  const kpiGap = 18;
  const kpiW = (CONTENT_W - kpiGap * 3) / 4;
  const kpiH = 128;
  const tripSign = plan.expectedTripWeightChangeKg > 0 ? '+' : '';
  const monthSign = plan.projectedMonthlyChangePercent > 0 ? '+' : '';

  const kpis = [
    {
      label: isAr ? 'السعرات اليومية المستهدفة' : 'Daily Intake Target',
      value: `${plan.recommendedDailyCalories} kcal`,
      sub: isAr ? 'تغذية متوازنة' : 'Daily meals total',
      bg: '#F0F9FF',
      border: '#BAE6FD',
      valColor: '#0D5EAF',
    },
    {
      label: isAr ? 'معدل الحرق اليومي' : 'Active Burn Target',
      value: `${plan.estimatedDailyBurnCalories} kcal`,
      sub: `${plan.dailyNetCalorieDelta >= 0 ? '+' : ''}${plan.dailyNetCalorieDelta} net kcal`,
      bg: '#F8FAFC',
      border: '#CBD5E1',
      valColor: '#082F5E',
    },
    {
      label: isAr ? 'تغير الوزن خلال الرحلة' : 'Expected Trip Change',
      value: `${tripSign}${plan.expectedTripWeightChangePercent}%`,
      sub: `${tripSign}${plan.expectedTripWeightChangeKg} kg (${plan.durationDays}d)`,
      bg: '#ECFDF5',
      border: '#A7F3D0',
      valColor: '#047857',
    },
    {
      label: isAr ? 'المعدل الشهري المتوقع' : 'Projected 30-Day Rate',
      value: `${monthSign}${plan.projectedMonthlyChangePercent}%`,
      sub: `${monthSign}${plan.projectedMonthlyChangeKg} kg / 30d`,
      bg: '#FFFBEB',
      border: '#FDE68A',
      valColor: '#B45309',
    },
  ];

  kpis.forEach((kpi, idx) => {
    const orderedIdx = isRtl ? 3 - idx : idx;
    const x = MARGIN_X + orderedIdx * (kpiW + kpiGap);
    drawRoundedRect(ctx, x, y, kpiW, kpiH, 14, kpi.bg, kpi.border, 2);

    const tx = isRtl ? x + kpiW - 20 : x + 20;
    ctx.save();
    ctx.direction = dir;
    ctx.textAlign = textAlign;
    ctx.fillStyle = '#475569';
    ctx.font = `600 18px ${SANS_FONT}`;
    ctx.fillText(kpi.label, tx, y + 34, kpiW - 40);

    ctx.fillStyle = kpi.valColor;
    ctx.font = `800 32px ${SANS_FONT}`;
    ctx.fillText(kpi.value, tx, y + 78, kpiW - 40);

    ctx.fillStyle = '#64748B';
    ctx.font = `600 17px ${SANS_FONT}`;
    ctx.fillText(kpi.sub, tx, y + 108, kpiW - 40);
    ctx.restore();
  });

  y += kpiH + 24;

  // Summary & Health Profile Card
  ctx.font = `400 21px ${SANS_FONT}`;
  const summaryLines = wrapTextLines(ctx, plan.summary, CONTENT_W - 56);
  const macroLines = wrapTextLines(
    ctx,
    `${isAr ? 'توزيع المغذيات:' : 'Macros:'} ${plan.macroSplitSummary} · ${plan.healthAdaptationSummary}`,
    CONTENT_W - 56
  );
  const infoH = 44 + summaryLines.length * 30 + macroLines.length * 28 + 26;
  ensureSpace(infoH + 20);
  drawRoundedRect(ctx, MARGIN_X, y, CONTENT_W, infoH, 14, '#F8FAFC', '#CBD5E1', 2);
  let curInfoY = drawTextLines(
    summaryLines,
    isRtl ? PAGE_W - MARGIN_X - 28 : MARGIN_X + 28,
    y + 40,
    30,
    '#1E293B',
    `400 21px ${SANS_FONT}`
  );
  curInfoY += 8;
  drawTextLines(
    macroLines,
    isRtl ? PAGE_W - MARGIN_X - 28 : MARGIN_X + 28,
    curInfoY,
    28,
    '#0D5EAF',
    `700 19px ${SANS_FONT}`
  );
  y += infoH + 28;

  // Day-by-Day Schedule Table & Cards
  for (const day of plan.days || []) {
    ctx.font = `400 19px ${SANS_FONT}`;
    const morningLines = wrapTextLines(
      ctx,
      `${isAr ? 'الصباح:' : 'Morning:'} ${day.morningPlaceAndActivity}`,
      CONTENT_W - 56
    );
    const afternoonLines = wrapTextLines(
      ctx,
      `${isAr ? 'الظهيرة:' : 'Afternoon:'} ${day.afternoonPlaceAndActivity}`,
      CONTENT_W - 56
    );
    const eveningLines = wrapTextLines(
      ctx,
      `${isAr ? 'المساء:' : 'Evening:'} ${day.eveningPlaceAndActivity}`,
      CONTENT_W - 56
    );

    const activitiesH =
      (morningLines.length + afternoonLines.length + eveningLines.length) * 28 + 34;

    // Pre-calculate meal row heights
    const meals = Array.isArray(day.meals) ? day.meals : [];
    const colMealW = 190;
    const colPlaceW = 280;
    const colDishW = 460;
    const colCatW = 270;
    const colCalW = CONTENT_W - (colMealW + colPlaceW + colDishW + colCatW);

    const rowData = meals.map((m) => {
      ctx.font = `600 18px ${SANS_FONT}`;
      const mealL = wrapTextLines(ctx, m.mealType, colMealW - 20);
      const placeL = wrapTextLines(ctx, m.venueOrSetting, colPlaceW - 20);
      const dishL = wrapTextLines(
        ctx,
        m.greekDishName && m.greekDishName !== m.dishName
          ? `${m.dishName} (${m.greekDishName})`
          : m.dishName,
        colDishW - 24
      );
      const catL = wrapTextLines(ctx, `${m.foodCategory} · ${m.portionGuide}`, colCatW - 20);
      const calL = wrapTextLines(
        ctx,
        `${m.calories} kcal\nP:${m.proteinGrams}g C:${m.carbsGrams}g F:${m.fatGrams}g`,
        colCalW - 20
      );
      const maxLines = Math.max(mealL.length, placeL.length, dishL.length, catL.length, calL.length, 2);
      return {
        m,
        mealL,
        placeL,
        dishL,
        catL,
        calL,
        rowH: Math.max(66, maxLines * 25 + 22),
      };
    });

    const tableHeaderH = 44;
    const rowsTotalH = rowData.reduce((s, r) => s + r.rowH, 0);
    const dayFooterH = 44;
    const dayCardH = 66 + activitiesH + tableHeaderH + rowsTotalH + dayFooterH;

    ensureSpace(dayCardH + 24);

    // Card outer container
    drawRoundedRect(ctx, MARGIN_X, y, CONTENT_W, dayCardH, 16, '#FFFFFF', '#CBD5E1', 2);

    // Day Header Band
    drawRoundedRect(ctx, MARGIN_X, y, CONTENT_W, 66, 16, '#082F5E');
    ctx.fillStyle = '#082F5E';
    ctx.fillRect(MARGIN_X, y + 48, CONTENT_W, 18);

    ctx.save();
    ctx.direction = dir;
    ctx.textAlign = textAlign;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 23px ${SANS_FONT}`;
    const headLeftX = isRtl ? PAGE_W - MARGIN_X - 28 : MARGIN_X + 28;
    ctx.fillText(day.dayTitle || `${isAr ? 'اليوم' : 'Day'} ${day.dayNumber}`, headLeftX, y + 42, CONTENT_W - 420);

    ctx.textAlign = oppAlign;
    ctx.fillStyle = '#7DD3FC';
    ctx.font = `700 20px ${SANS_FONT}`;
    ctx.fillText(
      `${day.totalDailyCalories} kcal · 🔥 ${day.estimatedActiveBurnKcal} kcal`,
      isRtl ? MARGIN_X + 28 : PAGE_W - MARGIN_X - 28,
      y + 42
    );
    ctx.restore();

    let curY = y + 94;
    const innerPadX = isRtl ? PAGE_W - MARGIN_X - 28 : MARGIN_X + 28;
    curY = drawTextLines(morningLines, innerPadX, curY, 28, '#1E293B', `400 19px ${SANS_FONT}`);
    curY = drawTextLines(afternoonLines, innerPadX, curY, 28, '#1E293B', `400 19px ${SANS_FONT}`);
    curY = drawTextLines(eveningLines, innerPadX, curY, 28, '#1E293B', `400 19px ${SANS_FONT}`);
    curY += 12;

    // Table Column Header Row
    ctx.fillStyle = '#E0F2FE';
    ctx.fillRect(MARGIN_X + 2, curY, CONTENT_W - 4, tableHeaderH);
    ctx.fillStyle = '#BAE6FD';
    ctx.fillRect(MARGIN_X + 2, curY + tableHeaderH - 2, CONTENT_W - 4, 2);

    const cols = isRtl
      ? [
          { label: isAr ? 'السعرات' : 'Calories', w: colCalW, key: 'cal' },
          { label: isAr ? 'نوع الطعام' : 'Food Type', w: colCatW, key: 'cat' },
          { label: isAr ? 'الوجبة / الطبق' : 'Meal & Dish', w: colDishW, key: 'dish' },
          { label: isAr ? 'مكان تناول الوجبة' : 'Meal Place', w: colPlaceW, key: 'place' },
          { label: isAr ? 'الفترة' : 'Meal', w: colMealW, key: 'meal' },
        ]
      : [
          { label: 'Meal', w: colMealW, key: 'meal' },
          { label: 'Meal Dining Place', w: colPlaceW, key: 'place' },
          { label: 'Dish & Greek Name', w: colDishW, key: 'dish' },
          { label: 'Food Type & Portion', w: colCatW, key: 'cat' },
          { label: 'Calories', w: colCalW, key: 'cal' },
        ];

    let colX = MARGIN_X;
    for (const c of cols) {
      const tx = isRtl ? colX + c.w - 14 : colX + 14;
      ctx.save();
      ctx.direction = dir;
      ctx.textAlign = textAlign;
      ctx.fillStyle = '#082F5E';
      ctx.font = `700 17px ${SANS_FONT}`;
      ctx.fillText(c.label, tx, curY + 28, c.w - 24);
      ctx.restore();
      colX += c.w;
    }
    curY += tableHeaderH;

    // Meal Rows
    rowData.forEach((r, rIdx) => {
      if (rIdx % 2 === 1) {
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(MARGIN_X + 2, curY, CONTENT_W - 4, r.rowH);
      }
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(MARGIN_X + 2, curY + r.rowH - 1, CONTENT_W - 4, 1);

      let rx = MARGIN_X;
      for (const c of cols) {
        const tx = isRtl ? rx + c.w - 14 : rx + 14;
        const textStartY = curY + 28;
        if (c.key === 'meal') {
          drawTextLines(r.mealL, tx, textStartY, 24, '#0D5EAF', `700 18px ${SANS_FONT}`);
        } else if (c.key === 'place') {
          drawTextLines(r.placeL, tx, textStartY, 24, '#334155', `500 17px ${SANS_FONT}`);
        } else if (c.key === 'dish') {
          drawTextLines(r.dishL, tx, textStartY, 24, '#0F172A', `700 18px ${SANS_FONT}`);
        } else if (c.key === 'cat') {
          drawTextLines(r.catL, tx, textStartY, 24, '#475569', `500 17px ${SANS_FONT}`);
        } else {
          drawTextLines(
            [
              `${r.m.calories} kcal`,
              `P:${r.m.proteinGrams}g C:${r.m.carbsGrams}g`,
            ],
            tx,
            textStartY,
            24,
            '#047857',
            `700 17px ${SANS_FONT}`
          );
        }
        rx += c.w;
      }

      curY += r.rowH;
    });

    // Day bottom summary strip
    ctx.save();
    ctx.direction = dir;
    ctx.textAlign = textAlign;
    ctx.fillStyle = '#475569';
    ctx.font = `600 17px ${SANS_FONT}`;
    ctx.fillText(
      `💧 ${day.hydrationLiters}L · 👟 ${day.dailyStepGoal.toLocaleString()} ${isAr ? 'خطوة' : 'steps'} · ${day.dailyWeightTrendNote}`,
      innerPadX,
      curY + 29,
      CONTENT_W - 56
    );
    ctx.restore();

    y += dayCardH + 24;
  }

  // Medical Disclaimer & Sources
  if (plan.medicalSafetyNote) {
    ctx.font = `500 18px ${SANS_FONT}`;
    const noteLines = wrapTextLines(ctx, plan.medicalSafetyNote, CONTENT_W - 56);
    const noteH = noteLines.length * 26 + 34;
    ensureSpace(noteH + 20);
    drawRoundedRect(ctx, MARGIN_X, y, CONTENT_W, noteH, 12, '#FFFBEB', '#FCD34D', 2);
    drawTextLines(
      noteLines,
      isRtl ? PAGE_W - MARGIN_X - 28 : MARGIN_X + 28,
      y + 34,
      26,
      '#92400E',
      `600 18px ${SANS_FONT}`
    );
    y += noteH + 20;
  }

  // Footer with AEGEA branding & Page X / Y
  const totalPages = pages.length;
  pages.forEach((canvas, idx) => {
    const fCtx = canvas.getContext('2d');
    if (!fCtx) return;
    fCtx.save();
    fCtx.fillStyle = '#E2E8F0';
    fCtx.fillRect(MARGIN_X, PAGE_H - 94, CONTENT_W, 2);

    fCtx.direction = dir;
    fCtx.textAlign = textAlign;
    fCtx.fillStyle = '#64748B';
    fCtx.font = `600 18px ${SANS_FONT}`;
    fCtx.fillText(`${BRAND_NAME} · ${brandSubtitle} — Sharif Hamad`, alignX, PAGE_H - 52);

    fCtx.textAlign = oppAlign;
    fCtx.fillStyle = '#082F5E';
    fCtx.font = `700 18px ${SANS_FONT}`;
    fCtx.fillText(`${idx + 1} / ${totalPages}`, oppX, PAGE_H - 52);
    fCtx.restore();
  });

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  pages.forEach((canvas, idx) => {
    if (idx > 0) pdf.addPage();
    const imgData = canvas.toDataURL('image/jpeg', 0.94);
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  });

  const slug =
    plan.destination
      .replace(/[^\w\u0600-\u06FF\u0370-\u03FF-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'Greece';
  const filename = `${BRAND_NAME}-Wellness-${slug}.pdf`;
  const pdfBlob = pdf.output('blob');

  if (mode === 'share' && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });
      const canShareFiles =
        typeof navigator.canShare !== 'function' || navigator.canShare({ files: [pdfFile] });
      if (canShareFiles) {
        await navigator.share({
          files: [pdfFile],
          title: plan.headline,
          text: `${BRAND_NAME} · ${plan.destination}`,
        });
        return { filename, shared: true };
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { filename, shared: false };
      }
      // Fall through to standard file download on unsupported mobile webviews
    }
  }

  const blobUrl = URL.createObjectURL(pdfBlob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 6000);

  return { filename, shared: false };
}
