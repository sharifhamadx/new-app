import {
  MatchmakerResult,
  GuideCategory,
  TavernaRecommendation,
  HotelRecommendation,
  ArchaeologicalSite,
  DishRecommendation,
  HiddenGemSpot,
  LocalPhrase,
  Language,
} from '../types';
import {
  curatedTavernas,
  curatedDishes,
  curatedHiddenGems,
  TAVERNA_IMAGES,
  HOTEL_IMAGES,
  ARCHAEOLOGICAL_IMAGES,
} from '../data/greekCuratedData';

interface WikiSearchResult {
  title: string;
  extract: string;
  thumbnail?: string;
  url: string;
}

async function fetchWikipediaGreeceResults(
  searchQuery: string,
  langCode: string,
  limitCount = 4
): Promise<WikiSearchResult[]> {
  const wikiLang = langCode.startsWith('ar')
    ? 'ar'
    : langCode.startsWith('el')
    ? 'el'
    : 'en';

  const endpoint =
    `https://${wikiLang}.wikipedia.org/w/api.php` +
    `?action=query&generator=search&gsrsearch=${encodeURIComponent(searchQuery)}` +
    `&gsrlimit=${limitCount}&prop=extracts|pageimages|info&exintro=1&explaintext=1` +
    `&exsentences=3&piprop=thumbnail&pithumbsize=640&inprop=url&format=json&origin=*`;

  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(5500) });
    if (!res.ok) return [];
    const data = await res.json();
    const pagesObj = data?.query?.pages;
    if (!pagesObj) return [];
    return Object.values(pagesObj)
      .sort((a: any, b: any) => (a.index ?? 99) - (b.index ?? 99))
      .map((p: any) => ({
        title: String(p.title || ''),
        extract: String(p.extract || '').trim(),
        thumbnail: p.thumbnail?.source ? String(p.thumbnail.source) : undefined,
        url: String(p.fullurl || ''),
      }))
      .filter((item) => item.title && item.extract);
  } catch {
    return [];
  }
}

const CITY_REGION_MATCH: Record<string, string[]> = {
  Athens: ['athens'],
  Thessaloniki: ['thessaloniki', 'thess'],
  Santorini: ['cyclades', 'santorini'],
  Mykonos: ['cyclades', 'mykonos'],
  'Chania, Crete': ['crete', 'chania'],
  'Heraklion, Crete': ['crete', 'heraklion'],
  Rhodes: ['dodecanese', 'rhodes'],
  Corfu: ['ionian', 'corfu'],
  Nafplio: ['peloponnese', 'nafplio'],
  Delphi: ['delphi', 'central'],
  Meteora: ['meteora', 'epirus', 'northern'],
  Naxos: ['cyclades', 'naxos'],
  Paros: ['cyclades', 'paros'],
  Zakynthos: ['ionian', 'zakynthos'],
  Kefalonia: ['ionian', 'kefalonia'],
  'Olympia, Peloponnese': ['peloponnese', 'olympia'],
};

function matchesCity(text: string, city: string): boolean {
  if (!city || city === 'All Greece') return true;
  const normText = text.toLowerCase();
  const cityTokens = city.toLowerCase().split(/[,\s]+/).filter(Boolean);
  if (cityTokens.some((tok) => normText.includes(tok))) return true;
  const aliases = CITY_REGION_MATCH[city] || [];
  return aliases.some((a) => normText.includes(a));
}

function buildGuestPhrases(isAr: boolean): LocalPhrase[] {
  return [
    {
      greek: 'Καλημέρα, ένα τραπέζι για δύο παρακαλώ.',
      phonetic: 'Ka-lee-ME-ra, E-na tra-PE-zee ya THEE-o pa-ra-ka-LO',
      translation: isAr ? 'صباح الخير، طاولة لشخصين من فضلك.' : 'Good morning, a table for two please.',
      meaning: isAr ? 'عند دخول الحانة أو المطعم' : 'When arriving at a Greek taverna',
    },
    {
      greek: 'Τον λογαριασμό, παρακαλώ.',
      phonetic: 'Ton lo-gar-yaz-MO, pa-ra-ka-LO',
      translation: isAr ? 'الحساب من فضلك.' : 'The bill, please.',
      meaning: isAr ? 'لطلب الفاتورة بعد الطعام' : 'When asking for the check after dining',
    },
    {
      greek: 'Τι προτείνετε σήμερα;',
      phonetic: 'Tee pro-TEE-ne-te SEE-me-ra?',
      translation: isAr ? 'بماذا تنصحون اليوم؟' : 'What do you recommend today?',
      meaning: isAr ? 'لسؤال النادل عن أطباق اليوم الطازجة' : 'Asking the waiter for fresh daily specials',
    },
    {
      greek: 'Πού είναι η είσοδος για τον αρχαιολογικό χώρο;',
      phonetic: 'Poo EE-ne ee EE-so-thos ya ton ar-he-o-lo-yee-KO HO-ro?',
      translation: isAr ? 'أين مدخل الموقع الأثري؟' : 'Where is the entrance to the archaeological site?',
      meaning: isAr ? 'للوصول إلى المعالم الأثرية بسهولة' : 'Asking directions at landmarks & museums',
    },
  ];
}

export async function runGuestGreeceSearch(params: {
  city: string;
  cityLabel: string;
  foodType: string;
  foodLabel: string;
  guideCategory: GuideCategory;
  notes?: string;
  lang: Language;
}): Promise<MatchmakerResult> {
  const normLang = String(params.lang || 'en').trim().toLowerCase();
  const isAr = normLang.startsWith('ar');
  const cityClean = params.city === 'All Greece' ? 'Greece' : params.city;
  const wantTavernas = params.guideCategory === 'all' || params.guideCategory === 'tavernas';
  const wantHotels = params.guideCategory === 'all' || params.guideCategory === 'hotels';
  const wantSites = params.guideCategory === 'all' || params.guideCategory === 'archaeological';

  const [siteWiki, foodWiki, hotelWiki] = await Promise.all([
    wantSites
      ? fetchWikipediaGreeceResults(`${cityClean} archaeological museum ancient landmarks`, normLang, 4)
      : Promise.resolve([]),
    wantTavernas
      ? fetchWikipediaGreeceResults(`${cityClean} Greek cuisine traditional food`, normLang, 3)
      : Promise.resolve([]),
    wantHotels
      ? fetchWikipediaGreeceResults(`${cityClean} historic hotel resort tourism`, normLang, 3)
      : Promise.resolve([]),
  ]);

  // 1. Curated + Wiki-enriched Tavernas
  const cityMatchedTavernas = curatedTavernas.filter((t) =>
    matchesCity(`${t.region} ${t.location} ${t.name}`, params.city)
  );
  const selectedTavernas =
    cityMatchedTavernas.length > 0 ? cityMatchedTavernas : curatedTavernas.slice(0, 4);

  const tavernas: TavernaRecommendation[] = wantTavernas
    ? selectedTavernas.map((t, idx) => ({
        ...t,
        rank: idx + 1,
        imageUrl: t.imageUrl || TAVERNA_IMAGES[idx % TAVERNA_IMAGES.length],
        description:
          foodWiki[idx]?.extract && cityMatchedTavernas.length === 0
            ? `${t.description} — ${foodWiki[idx].extract}`
            : t.description,
      }))
    : [];

  // 2. Hotels (built from live Wikipedia info + curated stays in Greece)
  const hotels: HotelRecommendation[] = wantHotels
    ? [
        ...hotelWiki.slice(0, 3).map((w, idx) => ({
          id: `g-hotel-wiki-${idx}`,
          rank: idx + 1,
          name: w.title,
          englishName: w.title,
          greekName: `${cityClean} Hospitality`,
          region: params.cityLabel,
          location: `${cityClean}, Greece`,
          category: isAr ? 'إقامة ومقصد سياحي موثّق' : 'Verified Heritage & Boutique Area',
          description: w.extract,
          amenities: isAr
            ? ['إطلالة ساحرة', 'موقع مركزي قريب من المعالم', 'إفطار يوناني تقليدي', 'واي فاي مجاني']
            : ['Scenic Views', 'Central Historic Access', 'Greek Breakfast', 'Free Wi-Fi'],
          priceLevel: (idx === 0 ? '€€€' : '€€') as '€' | '€€' | '€€€',
          insiderTip: isAr
            ? `استخدم زر "فحص الأسعار والحجز" أدناه لمقارنة الفنادق المتاحة حالياً في ${params.cityLabel}.`
            : `Use "Check Rooms & Rates" below to compare live room availability in ${params.cityLabel}.`,
          rating: 4.8 - idx * 0.1,
          officialWebsite: w.url || undefined,
          imageUrl: w.thumbnail || HOTEL_IMAGES[idx % HOTEL_IMAGES.length],
        })),
        ...(hotelWiki.length === 0
          ? [
              {
                id: 'g-hotel-curated-1',
                rank: 1,
                name: `${cityClean} Aegean Heritage Suites`,
                englishName: `${cityClean} Boutique Hotel`,
                greekName: `Ξενοδοχείο ${cityClean}`,
                region: params.cityLabel,
                location: `${cityClean}, Greece`,
                category: isAr ? 'فندق بوتيك متوسطي' : 'Boutique Mediterranean Stay',
                description: isAr
                  ? `إقامة مميزة في قلب ${params.cityLabel} قريبة من الحانات التاريخية والمواقع الأثرية والشواطئ.`
                  : `Charming boutique stay in ${params.cityLabel} with quick walking access to tavernas, landmarks, and sea views.`,
                amenities: isAr
                  ? ['تراس بانورامي', 'إفطار متوسطي طازج', 'خدمة الإرشاد المحلي']
                  : ['Panoramic Terrace', 'Fresh Mediterranean Breakfast', 'Local Concierge'],
                priceLevel: '€€' as const,
                insiderTip: isAr
                  ? 'اضغط على "فحص الأسعار والحجز" للتحقق من أفضل العروض المتاحة مباشرة.'
                  : 'Tap Check Rooms & Rates to compare live seasonal offers.',
                rating: 4.8,
                imageUrl: HOTEL_IMAGES[0],
              },
            ]
          : []),
      ]
    : [];

  // 3. Archaeological Sites (real live Wikipedia entries + offline fallback)
  const archaeologicalSites: ArchaeologicalSite[] = wantSites
    ? siteWiki.length > 0
      ? siteWiki.map((w, idx) => ({
          id: `g-site-wiki-${idx}`,
          rank: idx + 1,
          name: w.title,
          englishName: w.title,
          greekName: cityClean,
          region: params.cityLabel,
          location: `${cityClean}, Greece`,
          era: isAr ? 'التراث اليوناني العريق' : 'Classical & Ancient Heritage',
          description: w.extract,
          highlights: isAr
            ? ['معلم تاريخي بارز', 'معلومات موثقة عبر ويكيبيديا', 'مناسب للتصوير والجولات الصباحية']
            : ['Historic Landmark', 'Verified Encyclopedia Reference', 'Ideal for Morning Tours'],
          bestTimeToVisit: isAr
            ? 'الصباح الباكر (08:00 - 10:30) لتفادي الحر والازدحام'
            : 'Early morning (08:00–10:30) for cooler weather and soft light',
          insiderTip: isAr
            ? `احرص على حجز التذاكر مسبقاً في المواسم السياحية في ${params.cityLabel}.`
            : `Book timed entry in advance during peak summer months in ${params.cityLabel}.`,
          nearbyTavernaSuggestion: selectedTavernas[0]?.name || 'Local Village Taverna',
          officialWebsite: w.url || undefined,
          imageUrl: w.thumbnail || ARCHAEOLOGICAL_IMAGES[idx % ARCHAEOLOGICAL_IMAGES.length],
        }))
      : [
          {
            id: 'g-site-fallback-1',
            rank: 1,
            name: `${cityClean} Historic Quarter & Ancient Landmarks`,
            englishName: `${cityClean} Archaeological Landmarks`,
            greekName: `Αρχαιολογικός Χώρος ${cityClean}`,
            region: params.cityLabel,
            location: `${cityClean}, Greece`,
            era: isAr ? 'العصور الكلاسيكية والبيزنطية' : 'Classical & Byzantine Era',
            description: isAr
              ? `استكشف أبرز المعالم الأثرية والمتاحف التاريخية في ${params.cityLabel} والمسارات القديمة المحيطة بها.`
              : `Explore the ancient monuments, stone citadels, and archaeological museums of ${params.cityLabel}.`,
            highlights: isAr
              ? ['القلعة التاريخية', 'المتحف الأثري', 'إطلالات بانورامية']
              : ['Historic Citadel', 'Archaeological Museum', 'Panoramic Views'],
            bestTimeToVisit: isAr ? 'الصباح الباكر أو قبل الغروب' : 'Early morning or late afternoon',
            insiderTip: isAr
              ? 'ارتدِ حذاءً مريحاً للمشي على الحجارة الرخامية القديمة.'
              : 'Wear comfortable walking shoes for ancient marble pathways.',
            nearbyTavernaSuggestion: selectedTavernas[0]?.name || 'Traditional Harbor Taverna',
            imageUrl: ARCHAEOLOGICAL_IMAGES[0],
          },
        ]
    : [];

  // 4. Dishes matching preference
  const foodMatchedDishes = curatedDishes.filter((d) => {
    const f = params.foodType.toLowerCase();
    if (f === 'traditional') return true;
    if (f === 'seafood') return d.dietary.some((x) => x.toLowerCase().includes('seafood'));
    if (f === 'vegetarian') return d.dietary.some((x) => x.toLowerCase().includes('vegetarian'));
    if (f === 'vegan') return d.dietary.some((x) => x.toLowerCase().includes('vegan'));
    if (f === 'pastries') return d.dietary.some((x) => x.toLowerCase().includes('dessert'));
    if (f === 'halalfriendly') return !d.ingredients.some((i) => i.toLowerCase().includes('pork'));
    if (f === 'glutenfree') return d.dietary.some((x) => x.toLowerCase().includes('gluten'));
    return true;
  });
  const dishes: DishRecommendation[] = (foodMatchedDishes.length > 0 ? foodMatchedDishes : curatedDishes)
    .slice(0, 4)
    .map((d, i) => ({ ...d, rank: i + 1 }));

  // 5. Hidden Gems
  const matchedGems = curatedHiddenGems.filter((g) =>
    matchesCity(`${g.region} ${g.title}`, params.city)
  );
  const hiddenGems: HiddenGemSpot[] = (matchedGems.length > 0 ? matchedGems : curatedHiddenGems.slice(0, 3)).map(
    (g, i) => ({ ...g, rank: i + 1 })
  );

  const summary = isAr
    ? `دليل ${params.cityLabel} السريع (${params.foodLabel})${params.notes ? ` · ${params.notes}` : ''}: يجمع بين الحانات اليونانية الأصيلة والمعلومات المباشرة والمعالم الأثرية بالعمل بدون الحاجة لحساب Google.`
    : `Instant ${params.cityLabel} Guide (${params.foodLabel})${params.notes ? ` · ${params.notes}` : ''}: Combines live Wikimedia destination references with curated authentic Greek tavernas, dishes, and scenic spots — ready with zero Google sign-in required.`;

  const groundingSources = [...siteWiki, ...foodWiki, ...hotelWiki]
    .filter((w) => w.url)
    .slice(0, 5)
    .map((w) => ({ title: w.title, uri: w.url }));

  return {
    summary,
    guideCategory: params.guideCategory,
    tavernas,
    hotels,
    archaeologicalSites,
    dishes,
    hiddenGems,
    localPhrases: buildGuestPhrases(isAr),
    groundingSources,
    searchedAt: new Date().toISOString(),
  };
}
