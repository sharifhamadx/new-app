import { jsPDF } from 'jspdf';
import { MatchmakerResult, TripItinerary, User } from '../types';
import { BRAND_LOGO_SVG_STRING, BRAND_NAME } from '../components/BrandLogo';
import { isRtlLanguage } from '../hooks/useTranslatedContent';

const PAGE_W = 1654; // 210mm at 200 DPI
const PAGE_H = 2339; // 297mm at 200 DPI
const MARGIN_X = 96;
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
      // Handle overly long single words / URLs gracefully
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

export interface GeneratePdfParams {
  result: MatchmakerResult;
  itinerary: TripItinerary | null;
  cityLabel: string;
  user: User | null;
  currentLang: string;
  todayFormatted: string;
  t: any;
}

export async function generateExecutivePdf({
  result,
  itinerary,
  cityLabel,
  user,
  currentLang,
  todayFormatted,
  t,
}: GeneratePdfParams): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const isRtl = isRtlLanguage(currentLang);
  const logoImg = await loadLogoImage();
  const brandSubtitle: string = t?.navbar?.brandSubtitle || 'Your Smart Guide';
  const alignX = isRtl ? PAGE_W - MARGIN_X : MARGIN_X;
  const textAlign: CanvasTextAlign = isRtl ? 'right' : 'left';
  const dir: CanvasDirection = isRtl ? 'rtl' : 'ltr';

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

    // Pure Crisp Paper Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    if (isFirstPage) {
      // Executive Deep Navy Top Banner
      const bannerH = 290;
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, PAGE_W, bannerH);

      // Gold hairline bottom trim on banner
      ctx.fillStyle = '#D97706';
      ctx.fillRect(0, bannerH - 5, PAGE_W, 5);

      // Brand Logo Emblem
      const logoSize = 112;
      const logoX = isRtl ? PAGE_W - MARGIN_X - logoSize : MARGIN_X;
      const logoY = 58;
      if (logoImg) {
        ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
      }

      // Brand Wordmark + Small Refined Subtitle right underneath
      const brandTextX = isRtl ? logoX - 28 : logoX + logoSize + 28;
      ctx.save();
      ctx.direction = dir;
      ctx.textAlign = textAlign;
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `700 56px ${SERIF_FONT}`;
      ctx.fillText(BRAND_NAME, brandTextX, logoY + 56);

      ctx.fillStyle = '#FBBF24';
      ctx.font = `600 22px ${SANS_FONT}`;
      ctx.fillText(brandSubtitle, brandTextX, logoY + 96);

      // Right/Opposite Executive Dossier Metadata
      const metaX = isRtl ? MARGIN_X : PAGE_W - MARGIN_X;
      ctx.textAlign = isRtl ? 'left' : 'right';
      ctx.fillStyle = '#E0F2FE';
      ctx.font = `700 26px ${SANS_FONT}`;
      ctx.fillText(cityLabel, metaX, logoY + 42);

      ctx.fillStyle = '#94A3B8';
      ctx.font = `500 20px ${SANS_FONT}`;
      ctx.fillText(todayFormatted, metaX, logoY + 78);

      if (user?.name) {
        ctx.fillStyle = '#CBD5E1';
        ctx.font = `600 20px ${SANS_FONT}`;
        ctx.fillText(user.name, metaX, logoY + 112);
      }
      ctx.restore();

      // Subtle sub-strip inside banner
      ctx.save();
      ctx.direction = dir;
      ctx.textAlign = textAlign;
      ctx.fillStyle = '#E2E8F0';
      ctx.font = `600 24px ${SANS_FONT}`;
      ctx.fillText(
        itinerary?.headline || t?.matchmaker?.resultsTitle || 'Executive Greece Travel Dossier',
        alignX,
        242,
        CONTENT_W
      );
      ctx.restore();

      y = bannerH + 54;
    } else {
      // Running Executive Header for Page 2+
      ctx.save();
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(MARGIN_X, 66, CONTENT_W, 2);

      if (logoImg) {
        const s = 42;
        const lx = isRtl ? PAGE_W - MARGIN_X - s : MARGIN_X;
        ctx.drawImage(logoImg, lx, 16, s, s);
      }

      ctx.direction = dir;
      ctx.textAlign = textAlign;
      ctx.fillStyle = '#0F172A';
      ctx.font = `700 24px ${SERIF_FONT}`;
      const labelX = isRtl ? PAGE_W - MARGIN_X - 54 : MARGIN_X + 54;
      ctx.fillText(`${BRAND_NAME} · ${brandSubtitle}`, labelX, 46);

      ctx.textAlign = isRtl ? 'left' : 'right';
      ctx.fillStyle = '#64748B';
      ctx.font = `500 20px ${SANS_FONT}`;
      ctx.fillText(cityLabel, isRtl ? MARGIN_X : PAGE_W - MARGIN_X, 46);
      ctx.restore();

      y = 108;
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

  const drawSectionHeading = (title: string) => {
    ensureSpace(95);
    y += 14;
    ctx.save();
    ctx.fillStyle = '#0C4A6E';
    ctx.fillRect(MARGIN_X, y, CONTENT_W, 3);
    ctx.direction = dir;
    ctx.textAlign = textAlign;
    ctx.fillStyle = '#0F172A';
    ctx.font = `700 34px ${SERIF_FONT}`;
    ctx.fillText(title, alignX, y + 48, CONTENT_W);
    ctx.restore();
    y += 76;
  };

  // Start Page 1
  initPage(true);

  // Executive Summary Card
  ctx.font = `400 24px ${SANS_FONT}`;
  const summaryLines = wrapTextLines(ctx, result.summary || '', CONTENT_W - 64);
  const summaryBoxH = Math.max(110, summaryLines.length * 36 + 56);
  ensureSpace(summaryBoxH + 24);
  drawRoundedRect(ctx, MARGIN_X, y, CONTENT_W, summaryBoxH, 16, '#F8FAFC', '#CBD5E1', 2);
  drawTextLines(summaryLines, isRtl ? PAGE_W - MARGIN_X - 32 : MARGIN_X + 32, y + 46, 36, '#1E293B', `400 24px ${SANS_FONT}`);
  y += summaryBoxH + 34;

  // VIP 3-Day Business & Leisure Itinerary Section
  if (itinerary && Array.isArray(itinerary.days) && itinerary.days.length > 0) {
    drawSectionHeading(t?.matchmaker?.itinerary?.sectionTitle || '3-Day VIP Travel Itinerary');

    // Budget Overview Bar
    const budgetText = `${t?.matchmaker?.itinerary?.totalBudgetLabel || '3-Day Budget Estimate'}: ${itinerary.budgetSummary}`;
    ctx.font = `700 22px ${SANS_FONT}`;
    const budgetLines = wrapTextLines(ctx, budgetText, CONTENT_W - 56);
    const budgetH = budgetLines.length * 32 + 34;
    ensureSpace(budgetH + 18);
    drawRoundedRect(ctx, MARGIN_X, y, CONTENT_W, budgetH, 12, '#FFFBEB', '#F59E0B', 2);
    drawTextLines(budgetLines, isRtl ? PAGE_W - MARGIN_X - 28 : MARGIN_X + 28, y + 40, 32, '#92400E', `700 22px ${SANS_FONT}`);
    y += budgetH + 26;

    for (const day of itinerary.days) {
      const entries = [
        { label: t?.matchmaker?.itinerary?.morningLabel || 'Morning', val: day.morning },
        { label: t?.matchmaker?.itinerary?.lunchLabel || 'Lunch Taverna', val: day.lunchTaverna },
        { label: t?.matchmaker?.itinerary?.afternoonLabel || 'Afternoon', val: day.afternoon },
        { label: t?.matchmaker?.itinerary?.sunsetLabel || 'Sunset Spot', val: day.sunsetGem },
        { label: t?.matchmaker?.itinerary?.dinnerStayLabel || 'Dinner & Stay', val: day.dinnerAndStay },
      ];

      ctx.font = `400 21px ${SANS_FONT}`;
      const wrappedRows = entries.map((e) => ({
        label: e.label,
        lines: wrapTextLines(ctx, `${e.label}: ${e.val}`, CONTENT_W - 68),
      }));
      const totalBodyLines = wrappedRows.reduce((sum, r) => sum + r.lines.length, 0);
      const cardH = 96 + totalBodyLines * 31 + wrappedRows.length * 8;

      ensureSpace(cardH + 22);
      drawRoundedRect(ctx, MARGIN_X, y, CONTENT_W, cardH, 14, '#FFFFFF', '#CBD5E1', 2);

      // Day Header Band
      drawRoundedRect(ctx, MARGIN_X, y, CONTENT_W, 64, 14, '#0C4A6E');
      ctx.fillStyle = '#0C4A6E';
      ctx.fillRect(MARGIN_X, y + 48, CONTENT_W, 16);

      ctx.save();
      ctx.direction = dir;
      ctx.textAlign = textAlign;
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `700 24px ${SANS_FONT}`;
      const innerX = isRtl ? PAGE_W - MARGIN_X - 32 : MARGIN_X + 32;
      ctx.fillText(`#${day.dayNumber} · ${day.title}`, innerX, y + 42, CONTENT_W - 280);

      ctx.textAlign = isRtl ? 'left' : 'right';
      ctx.fillStyle = '#FDE68A';
      ctx.font = `700 21px ${SANS_FONT}`;
      ctx.fillText(
        day.estimatedDailyCost,
        isRtl ? MARGIN_X + 32 : PAGE_W - MARGIN_X - 32,
        y + 42
      );
      ctx.restore();

      let curY = y + 98;
      for (const row of wrappedRows) {
        curY = drawTextLines(row.lines, innerX, curY, 31, '#334155', `400 21px ${SANS_FONT}`);
        curY += 8;
      }

      y += cardH + 22;
    }
  }

  // Helper to render Ranked Business-Class Venue Cards cleanly
  const renderDirectoryList = (
    heading: string,
    items: Array<{
      rank?: number;
      title: string;
      subtitle?: string;
      metaRight?: string;
      description: string;
      highlightsLine?: string;
      tip?: string;
      website?: string;
    }>
  ) => {
    if (!items || items.length === 0) return;
    drawSectionHeading(heading);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      ctx.font = `400 21px ${SANS_FONT}`;
      const descLines = wrapTextLines(ctx, item.description, CONTENT_W - 60);
      const hlLines = item.highlightsLine ? wrapTextLines(ctx, item.highlightsLine, CONTENT_W - 60) : [];
      const tipLines = item.tip
        ? wrapTextLines(ctx, `${t?.matchmaker?.insiderTip || 'Tip'}: ${item.tip}`, CONTENT_W - 60)
        : [];
      const webLines = item.website ? wrapTextLines(ctx, item.website, CONTENT_W - 60) : [];

      const boxH =
        86 +
        (item.subtitle ? 30 : 0) +
        descLines.length * 30 +
        (hlLines.length ? hlLines.length * 28 + 10 : 0) +
        (tipLines.length ? tipLines.length * 28 + 10 : 0) +
        (webLines.length ? webLines.length * 26 + 8 : 0) +
        24;

      ensureSpace(boxH + 20);
      drawRoundedRect(ctx, MARGIN_X, y, CONTENT_W, boxH, 14, '#FFFFFF', '#E2E8F0', 2);

      const innerX = isRtl ? PAGE_W - MARGIN_X - 30 : MARGIN_X + 30;
      const oppX = isRtl ? MARGIN_X + 30 : PAGE_W - MARGIN_X - 30;

      ctx.save();
      ctx.direction = dir;
      ctx.textAlign = textAlign;
      ctx.fillStyle = '#0F172A';
      ctx.font = `700 25px ${SANS_FONT}`;
      ctx.fillText(`#${item.rank ?? i + 1}  ${item.title}`, innerX, y + 44, CONTENT_W - 240);

      if (item.metaRight) {
        ctx.textAlign = isRtl ? 'left' : 'right';
        ctx.fillStyle = '#B45309';
        ctx.font = `700 22px ${SANS_FONT}`;
        ctx.fillText(item.metaRight, oppX, y + 44);
      }
      ctx.restore();

      let curY = y + 76;
      if (item.subtitle) {
        curY = drawTextLines([item.subtitle], innerX, curY, 28, '#0369A1', `600 20px ${SANS_FONT}`);
        curY += 6;
      }
      curY = drawTextLines(descLines, innerX, curY, 30, '#334155', `400 21px ${SANS_FONT}`);
      if (hlLines.length > 0) {
        curY += 10;
        curY = drawTextLines(hlLines, innerX, curY, 28, '#475569', `600 20px ${SANS_FONT}`);
      }
      if (tipLines.length > 0) {
        curY += 10;
        curY = drawTextLines(tipLines, innerX, curY, 28, '#0C4A6E', `600 20px ${SANS_FONT}`);
      }
      if (webLines.length > 0) {
        curY += 8;
        drawTextLines(webLines, innerX, curY, 26, '#0284C7', `500 18px ${SANS_FONT}`);
      }

      y += boxH + 20;
    }
  };

  renderDirectoryList(
    t?.matchmaker?.tavernasTitle || 'Best Tavernas & Restaurants',
    (result.tavernas || []).map((tv, idx) => ({
      rank: tv.rank ?? idx + 1,
      title: tv.name,
      subtitle: `${tv.greekName} · ${tv.region}`,
      metaRight: `${tv.priceLevel}  ★ ${tv.rating}`,
      description: tv.description,
      highlightsLine:
        tv.signatureDishes?.length
          ? `${t?.matchmaker?.signatureDishes || 'Signature Dishes'}: ${tv.signatureDishes.join(' · ')}`
          : '',
      tip: tv.insiderTip,
      website: tv.officialWebsite,
    }))
  );

  renderDirectoryList(
    t?.matchmaker?.hotelsTitle || 'Best Hotels & Boutique Stays',
    (result.hotels || []).map((ht, idx) => ({
      rank: ht.rank ?? idx + 1,
      title: ht.name,
      subtitle: `${ht.greekName} · ${ht.category} · ${ht.region}`,
      metaRight: `${ht.priceLevel}  ★ ${ht.rating}`,
      description: ht.description,
      highlightsLine:
        ht.amenities?.length
          ? `${t?.matchmaker?.amenitiesLabel || 'Amenities'}: ${ht.amenities.join(' · ')}`
          : '',
      tip: ht.insiderTip,
      website: ht.officialWebsite,
    }))
  );

  renderDirectoryList(
    t?.matchmaker?.archaeologicalTitle || 'Archaeological & Historical Sites',
    (result.archaeologicalSites || []).map((st, idx) => {
      const nearbyParts: string[] = [];
      if (st.highlights?.length) {
        nearbyParts.push(`${t?.matchmaker?.highlightsLabel || 'Highlights'}: ${st.highlights.join(' · ')}`);
      }
      if (st.nearbyHotels?.length) {
        nearbyParts.push(
          `${t?.matchmaker?.nearbyHotelsTitle || 'Nearby Hotels'}: ${st.nearbyHotels
            .map((h) => h.name)
            .join(', ')}`
        );
      }
      if (st.nearbyRestaurants?.length) {
        nearbyParts.push(
          `${t?.matchmaker?.nearbyRestaurantsTitle || 'Nearby Restaurants & Bars'}: ${st.nearbyRestaurants
            .map((r) => r.name)
            .join(', ')}`
        );
      }
      return {
        rank: st.rank ?? idx + 1,
        title: st.name,
        subtitle: `${st.greekName} · ${st.era} · ${st.region}`,
        metaRight: st.bestTimeToVisit,
        description: st.description,
        highlightsLine: nearbyParts.join(' | '),
        tip: st.insiderTip,
        website: st.officialWebsite,
      };
    })
  );

  // Stamp Executive Footer with total page count on every page
  const totalPages = pages.length;
  pages.forEach((canvas, idx) => {
    const fCtx = canvas.getContext('2d');
    if (!fCtx) return;
    fCtx.save();
    fCtx.fillStyle = '#E2E8F0';
    fCtx.fillRect(MARGIN_X, PAGE_H - 96, CONTENT_W, 2);

    fCtx.direction = dir;
    fCtx.textAlign = textAlign;
    fCtx.fillStyle = '#64748B';
    fCtx.font = `600 18px ${SANS_FONT}`;
    fCtx.fillText(
      `${BRAND_NAME} · ${brandSubtitle} — Sharif Hamad`,
      alignX,
      PAGE_H - 54
    );

    fCtx.textAlign = isRtl ? 'left' : 'right';
    fCtx.fillStyle = '#475569';
    fCtx.font = `700 18px ${SANS_FONT}`;
    fCtx.fillText(
      `${idx + 1} / ${totalPages}`,
      isRtl ? MARGIN_X : PAGE_W - MARGIN_X,
      PAGE_H - 54
    );
    fCtx.restore();
  });

  // Compile Canvas pages into real downloadable A4 PDF
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

  const slug = cityLabel
    .replace(/[^\w\u0600-\u06FF\u0370-\u03FF-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'Greece';
  const filename = `${BRAND_NAME}-${slug}-Guide.pdf`;

  // Use explicit Blob + anchor fallback so downloads work smoothly even in strict embedded iframes
  const pdfBlob = pdf.output('blob');
  const blobUrl = URL.createObjectURL(pdfBlob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}
